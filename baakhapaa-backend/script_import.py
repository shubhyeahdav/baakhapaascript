"""Bringing an existing screenplay in.

There was no way to do this at all. A writer arriving with a finished script —
which is most writers worth having — had to retype it before the product could
say one word about it. That mattered more than it looks: the thing this system
is actually good at is *reading* a screenplay (the craft linter, the corpus
benchmark, the structural review), and every one of those was gated behind
typing the whole thing in again.

Three formats, in descending order of how much survives the trip:

  * `.fdx`  — Final Draft. XML with typed paragraphs, so nothing is guessed.
              This is the inverse of `export_service.export_script_fdx`.
  * `.fountain` / `.txt` — already plain text, which is how drafts are stored
              here anyway. Fountain's markup is stripped rather than honoured.
  * `.pdf`  — the format writers actually have, and the only lossy one. Text is
              extracted and then *classified*, because a scanned page extracts
              to nothing and a badly-produced one extracts with its line
              structure destroyed. Both still look like a screenplay to a naive
              parser while having nothing it can find.

The classification is the part that earns its place. Importing a scan silently
produces an empty script and a writer who thinks the product is broken; saying
"this looks like a scanned page, there is no text layer to read" is a fact they
can act on.
"""
import io
import re

# defusedxml, not xml.etree. The export BUILDS xml, which is safe; this PARSES
# xml that a user uploaded, which is not. Stock ElementTree will resolve
# external entities, so a crafted .fdx can read files off the server or hang it
# on a billion-laughs expansion. This is the exact case bandit's B405 warns
# about, and the only place in this codebase where it applies.
from defusedxml import ElementTree as SafeET

# Ceiling on an upload. A feature screenplay is well under 200KB of text; a PDF
# of one runs to a few megabytes. Anything past this is not a screenplay, and
# refusing it early keeps a large file from being parsed at all.
MAX_UPLOAD_BYTES = 12 * 1024 * 1024

SUPPORTED_EXTENSIONS = (".fdx", ".fountain", ".txt", ".pdf")

# The inverse of export_service._FDX_TYPE. Final Draft emits types this parser
# does not model (Shot, General, Cast List); they become action, which is where
# a plain line belongs.
_FROM_FDX = {
    "Scene Heading": "scene_heading",
    "Action": "action",
    "Character": "character",
    "Parenthetical": "parenthetical",
    "Dialogue": "dialogue",
    "Transition": "transition",
}

# Indent, in spaces, for each element when rendered back to the editor's plain
# text. These match what the editor's own Tab-cycling produces, so an imported
# script and a typed one look the same on the page.
_INDENT = {
    "scene_heading": 0,
    "action": 0,
    "character": 22,
    "parenthetical": 16,
    "dialogue": 10,
    "transition": 0,
}

SLUG_RE = re.compile(r"^\s*(INT|EXT|I/E)[.\s/]", re.IGNORECASE | re.MULTILINE)
CUE_RE = re.compile(r"^\s{2,}[A-Z][A-Z0-9 .'\-]{1,38}\s*$", re.MULTILINE)


class ImportError_(Exception):
    """Import failed for a reason worth telling the user."""


# ---------------------------------------------------------------------------
# Final Draft
# ---------------------------------------------------------------------------
def from_fdx(data: bytes) -> str:
    """Final Draft XML to the editor's plain text.

    Lossless for the six elements this product models, because .fdx states the
    type of every paragraph rather than leaving it to be inferred from shape.
    """
    try:
        root = SafeET.fromstring(data)
    except Exception as exc:
        raise ImportError_(
            "That .fdx file could not be read. It may be damaged, or not a "
            "Final Draft file."
        ) from exc

    # The script is the FIRST <Content>, not every Paragraph in the file: a
    # .fdx also carries a <TitlePage> with its own <Content>, and a bare
    # `.//Paragraph` sweeps the title in as a line of the screenplay — at the
    # end, because that is where the title page sits in the document order.
    content = root.find("Content")
    paragraphs = content.findall("Paragraph") if content is not None else []
    if not paragraphs:
        raise ImportError_("That Final Draft file contains no script content.")

    lines = []
    previous = None
    for para in paragraphs:
        # Text lives in one or more <Text> children; a paragraph split across
        # several runs (a bolded word mid-line) has more than one.
        text = "".join(node.text or "" for node in para.findall(".//Text")).strip()
        kind = _FROM_FDX.get(para.get("Type", ""), "action")
        if not text:
            continue

        # A blank line before every element except dialogue and its
        # parenthetical, which belong tight under their cue. Getting this wrong
        # is what makes an imported script parse as all action.
        if previous is not None and kind not in ("dialogue", "parenthetical"):
            lines.append("")
        elif previous in (None,) and kind in ("dialogue", "parenthetical"):
            lines.append("")

        lines.append(" " * _INDENT.get(kind, 0) + text)
        previous = kind

    return "\n".join(lines).strip() + "\n"


# ---------------------------------------------------------------------------
# Fountain and plain text
# ---------------------------------------------------------------------------
def from_text(data: bytes) -> str:
    """Plain text or Fountain.

    The editor already stores plain text, so this is mostly a decode. Fountain's
    markup is stripped rather than honoured: a title-page block and a boneyard
    comment would otherwise arrive as dialogue.
    """
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        # Windows-authored files are frequently cp1252, and failing on one is a
        # bad first experience for a format that is meant to be forgiving.
        text = data.decode("cp1252", errors="replace")

    # Fountain boneyard: /* ... */ is an author's note, not script.
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    # Fountain's forced-element and emphasis markers.
    text = re.sub(r"^\s*[.@!~]", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*{1,3}(.+?)\*{1,3}", r"\1", text)
    # A Fountain title page is key: value pairs before the first blank line.
    text = re.sub(r"\A(?:[A-Za-z ]+:.*\n(?:\s+.*\n)*)+\n", "", text)

    return text.replace("\r\n", "\n").replace("\r", "\n").strip() + "\n"


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------
def from_pdf(data: bytes) -> str:
    """Extract a screenplay from a PDF, or refuse with a reason.

    The only lossy path, and the one most writers will use. Quality varies
    enormously and silently: a word-processor PDF extracts cleanly, a scan
    extracts to nothing, and a badly-produced one extracts to text whose line
    structure is gone. The last two both still *look* importable.
    """
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        raise ImportError_("That PDF could not be opened.") from exc

    problem = _pdf_problem(text)
    if problem:
        raise ImportError_(problem)

    return text.replace("\r\n", "\n").strip() + "\n"


def _pdf_problem(text: str) -> str:
    """Why this extraction is not usable, or "" if it is.

    Deliberately returns the reason rather than a boolean. "This looks like a
    scanned page" tells a writer to go and find the original; "import failed"
    tells them the product is broken.
    """
    if len(text.strip()) < 500:
        return (
            "Almost no text came out of that PDF. It is probably a scan — an "
            "image of a page rather than a page — so there is nothing to read. "
            "Try the original file from whatever it was written in."
        )
    if not SLUG_RE.search(text):
        return (
            "That PDF has text, but no scene headings — no INT. or EXT. lines. "
            "It may not be a screenplay, or the layout may not have survived "
            "extraction. A .fdx or Fountain file will import cleanly."
        )
    return ""


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
def import_screenplay(filename: str, data: bytes) -> dict:
    """Turn an uploaded file into draft text plus a note on what came through.

    The summary is returned so the UI can say what happened. An import that
    silently produces something slightly wrong is worse than one that explains
    itself, because the writer only finds out three scenes later.
    """
    if not data:
        raise ImportError_("That file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ImportError_(
            f"That file is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)}MB. "
            "A screenplay is not that big — check it is the right file."
        )

    name = (filename or "").lower()
    if name.endswith(".fdx"):
        text, source = from_fdx(data), "Final Draft"
    elif name.endswith(".pdf"):
        text, source = from_pdf(data), "PDF"
    elif name.endswith((".fountain", ".txt")):
        text, source = from_text(data), "Fountain"
    else:
        raise ImportError_(
            "Unsupported file type. Import a .fdx, .fountain, .txt or .pdf file."
        )

    scenes = len(SLUG_RE.findall(text))
    if not scenes:
        raise ImportError_(
            "No scene headings were found in that file, so there is no "
            "screenplay to import."
        )

    return {
        "content": text,
        "source": source,
        "scenes": scenes,
        "characters": len({c.strip() for c in CUE_RE.findall(text)}),
        "lines": len(text.split("\n")),
    }

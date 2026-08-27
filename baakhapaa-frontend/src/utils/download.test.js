/**
 * Saving an export to disk.
 *
 * `downloadBlob` is four lines of unavoidable browser ceremony, and one of them
 * is load-bearing in a way that leaves no trace when it goes missing:
 * `revokeObjectURL`. Without it every export leaks its blob for the life of the
 * tab — a production package with embedded storyboard frames is megabytes, and
 * a writer exporting repeatedly during a session leaks all of them. That leak
 * has been fixed in this codebase once already, in the editor's export path.
 * Nothing visible fails when it regresses, which is exactly why it is tested.
 *
 * `safeFilename` matters because every export is named after the project, and
 * project titles here are frequently Devanagari. A strip-to-ASCII rule would
 * empty those titles completely, so the fallback is not a rare path — it is what
 * most Nepali-titled projects hit.
 */
import { downloadBlob, safeFilename } from "./download";

describe("downloadBlob", () => {
  let createObjectURL;
  let revokeObjectURL;
  let clicked;

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:fake-url");
    revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    clicked = [];
    // jsdom does not implement navigation, so a real anchor click warns rather
    // than doing anything. Record it instead.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click() {
      clicked.push({
        href: this.getAttribute("href"),
        download: this.getAttribute("download"),
        inDocument: document.body.contains(this),
      });
    });
  });

  it("names the file the caller asked for", () => {
    downloadBlob("content", "Sapana.pdf");

    expect(clicked[0].download).toBe("Sapana.pdf");
  });

  it("points the anchor at the blob", () => {
    downloadBlob("content", "Sapana.pdf");

    expect(createObjectURL).toHaveBeenCalled();
    expect(clicked[0].href).toBe("blob:fake-url");
  });

  it("has the anchor in the document when it is clicked", () => {
    // Firefox ignores a click on a detached anchor, so the append is not
    // decoration — without it the download silently never starts.
    downloadBlob("content", "Sapana.pdf");

    expect(clicked[0].inDocument).toBe(true);
  });

  it("releases the object URL, so exports do not leak for the life of the tab", () => {
    downloadBlob("content", "Sapana.pdf");

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  it("leaves no anchor behind in the document", () => {
    downloadBlob("content", "Sapana.pdf");

    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });

  it("handles a real binary payload", () => {
    downloadBlob(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "Sapana.pdf");

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });
});

describe("safeFilename", () => {
  it("keeps a plain title as it is", () => {
    expect(safeFilename("Sapana")).toBe("Sapana");
  });

  it("keeps spaces, hyphens and underscores", () => {
    expect(safeFilename("Sapana - Draft_2")).toBe("Sapana - Draft_2");
  });

  it("strips what a file system would object to", () => {
    expect(safeFilename("Sapana: The / Final \\ Cut?")).toBe("Sapana The  Final  Cut");
  });

  it("trims the edges", () => {
    expect(safeFilename("  Sapana  ")).toBe("Sapana");
  });

  it("falls back when a title strips to nothing", () => {
    // A Devanagari title empties completely under this rule, which makes the
    // fallback the normal case for a Nepali-titled project rather than an edge.
    expect(safeFilename("सपना")).toBe("script");
  });

  it("falls back on an empty or missing title", () => {
    expect(safeFilename("")).toBe("script");
    expect(safeFilename(null)).toBe("script");
    expect(safeFilename(undefined)).toBe("script");
  });

  it("takes the caller's own fallback", () => {
    expect(safeFilename("सपना", "storyboard")).toBe("storyboard");
  });

  it("keeps the ASCII half of a mixed title", () => {
    expect(safeFilename("सपना Sapana")).toBe("Sapana");
  });
});

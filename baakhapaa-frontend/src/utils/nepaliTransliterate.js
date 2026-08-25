/**
 * Romanised Nepali to Devanagari, as you type.
 *
 * The product asks writers to write in Nepali, checks their Nepali dialogue,
 * and embeds a Devanagari font in the PDF — and offered no way to enter a
 * single Devanagari character. A writer without a Nepali keyboard already
 * installed at the OS level simply could not write the thing this tool exists
 * to help them write. That is the gap this closes.
 *
 * Phonetic, not a keyboard layout: you type `namaste` and get नमस्ते. Nepali
 * writers already type this way to each other in Roman script, so the input
 * habit is one they have, rather than one they would have to learn.
 *
 * Conversion happens per word, on a word boundary, rather than per keystroke.
 * Live per-letter conversion makes the word change shape underneath the cursor
 * while it is still being typed, which is unreadable — you cannot check what
 * you wrote until you have stopped. Converting on space means the writer sees
 * the Roman word they intended, then sees it become Devanagari once.
 *
 * The scheme follows the common ITRANS-style conventions Nepali speakers
 * already use in casual Roman text, with capitals for the retroflex series
 * (`T` `D` `N`) since that is the one distinction Roman Nepali normally drops.
 */

// Longest match first — `chh` has to be tried before `ch`, and `ch` before `c`.
const CONSONANTS = [
  ["kSh", "क्ष"], ["ksh", "क्ष"], ["gy", "ज्ञ"], ["jn", "ज्ञ"],
  ["chh", "छ"], ["Chh", "छ"], ["sh", "श"], ["Sh", "ष"], ["shh", "ष"],
  ["ch", "च"], ["kh", "ख"], ["gh", "घ"], ["ng", "ङ"], ["jh", "झ"],
  ["ny", "ञ"], ["Th", "ठ"], ["Dh", "ढ"], ["th", "थ"], ["dh", "ध"],
  ["ph", "फ"], ["bh", "भ"],
  ["T", "ट"], ["D", "ड"], ["N", "ण"],
  ["k", "क"], ["g", "ग"], ["c", "च"], ["j", "ज"],
  ["t", "त"], ["d", "द"], ["n", "न"],
  ["p", "प"], ["f", "फ"], ["b", "ब"], ["m", "म"],
  ["y", "य"], ["r", "र"], ["l", "ल"], ["w", "व"], ["v", "व"],
  ["s", "स"], ["h", "ह"],
];

// [roman, independent form, matra]. The matra for `a` is empty because every
// consonant already carries an inherent `a` — that is what makes `ram` राम
// rather than र्अम्.
const VOWELS = [
  // Vocalic r. Capitalised because `ri` is र + ि — a different word.
  ["Ri", "ऋ", "ृ"],
  ["aa", "आ", "ा"], ["A", "आ", "ा"],
  ["ai", "ऐ", "ै"], ["au", "औ", "ौ"],
  ["ee", "ई", "ी"], ["ii", "ई", "ी"], ["I", "ई", "ी"],
  ["oo", "ऊ", "ू"], ["uu", "ऊ", "ू"], ["U", "ऊ", "ू"],
  ["a", "अ", ""], ["i", "इ", "ि"], ["u", "उ", "ु"],
  ["e", "ए", "े"], ["o", "ओ", "ो"],
];

const HALANT = "्";

/**
 * Marks that attach to whatever precedes them rather than forming a syllable.
 *
 * The chandrabindu is the one that matters most and was missing entirely.
 * Nepali nasalises constantly — हुँ, छँ, गएँ — and without it a writer cannot
 * spell the first person of the verb "to be". The anusvara is not a substitute:
 * they are different sounds and the language uses both.
 */
const MARKS = [
  ["~", "ँ"],    // chandrabindu — nasalised vowel
  ["M", "ं"],    // anusvara
  ["H", "ः"],    // visarga
  ["_", HALANT], // explicit halant, to kill an inherent vowel: chha_ -> छ्
];

/** Devanagari sentence punctuation. `|` is the ITRANS convention for it. */
export const DANDA = "।";

/**
 * What counts as one romanised word.
 *
 * Must start with a letter and may carry marks inside it. A plain `[A-Za-z]+`
 * was wrong the moment marks existed: `chha~` ends in a non-letter, so the
 * pattern matched nothing and the word silently refused to convert.
 */
export const WORD_PATTERN = "[A-Za-z][A-Za-z~_]*";

const matchAt = (table, text, i) => {
  for (const entry of table) {
    if (text.startsWith(entry[0], i)) return entry;
  }
  return null;
};

/**
 * Convert one romanised word. Returns the word unchanged if it should not be
 * converted — see `shouldConvert`.
 */
export function transliterateWord(word) {
  if (!shouldConvert(word)) return word;

  let out = "";
  let i = 0;

  while (i < word.length) {
    const mark = matchAt(MARKS, word, i);
    if (mark) {
      out += mark[1];
      i += mark[0].length;
      continue;
    }

    const consonant = matchAt(CONSONANTS, word, i);
    if (consonant) {
      out += consonant[1];
      i += consonant[0].length;

      const vowel = matchAt(VOWELS, word, i);
      if (vowel) {
        out += vowel[2];
        i += vowel[0].length;
      } else if (i < word.length && matchAt(CONSONANTS, word, i)) {
        // A consonant followed by another consonant is a conjunct: the first
        // loses its inherent vowel. At the END of a word it keeps it, because
        // that is how Devanagari is written even where the vowel is not
        // pronounced — राम, not राम्.
        out += HALANT;
      }
      continue;
    }

    const vowel = matchAt(VOWELS, word, i);
    if (vowel) {
      out += vowel[1];
      i += vowel[0].length;
      continue;
    }

    out += word[i];
    i += 1;
  }

  return out;
}

/**
 * Whether a token should be converted at all.
 *
 * Three things must survive Nepali mode untouched, because a screenplay is
 * structurally English even when its dialogue is not:
 *
 *   - sluglines: INT. / EXT. and transitions like CUT TO:
 *   - character cues, which are written in capitals
 *   - anything with a digit, which is a scene number or a time
 *
 * Capitalisation is the rule that covers the first two at once, and it is a
 * rule a writer can hold in their head: SHOUTING stays English.
 */
export function shouldConvert(word) {
  if (!word) return false;
  if (/\d/.test(word)) return false;
  // Already Devanagari, or otherwise not Latin script.
  if (!/[A-Za-z]/.test(word)) return false;
  // All-caps is screenplay structure, not dialogue. Single letters included:
  // a lone `A` or `I` is an English word far more often than it is a request
  // for आ, and a writer who wants आ can type `aa`.
  const letters = word.replace(/[^A-Za-z]/g, "");
  if (letters === letters.toUpperCase()) return false;
  return true;
}

/**
 * Convert the word immediately before `caret`, leaving everything else alone.
 *
 * Returns `null` when there is nothing to convert, so the caller can leave the
 * textarea untouched rather than rewriting it with identical content — which
 * would cost the writer their undo stack on every space bar.
 */
export function convertWordBeforeCaret(text, caret) {
  const before = text.slice(0, caret);
  const match = before.match(new RegExp("(" + WORD_PATTERN + ")$"));
  if (!match) return null;

  const word = match[1];
  const converted = transliterateWord(word);
  if (converted === word) return null;

  const start = caret - word.length;
  return {
    text: text.slice(0, start) + converted + text.slice(caret),
    caret: start + converted.length,
  };
}

/** Convert a whole passage — used to preview the scheme, not while typing. */
export function transliterate(text) {
  return (text || "").replace(new RegExp(WORD_PATTERN, "g"), (w) => transliterateWord(w));
}

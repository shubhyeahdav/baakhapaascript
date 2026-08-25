/**
 * The guides — how to actually do each part of this job, taught in the draft.
 *
 * Two things shaped this. The product's own proposal argues that Final Draft
 * and Celtx "give the creator a blank page" and that this one would guide the
 * writer through every decision — and then shipped a blank page with a line of
 * formatting jargon on it. And the fourteen-lesson course, which is good, sits
 * on a separate screen nothing routes anyone to.
 *
 * So these are neither a help menu nor a course. Each guide is a short run of
 * steps performed in the writer's own script, and most steps end by checking
 * the draft rather than by the writer pressing Next. `check` is what makes it
 * teaching rather than reading: the step completes when the thing is actually
 * on the page.
 *
 * Checks are deliberately shallow — a regex over the draft, not a parse. The
 * server already owns the real analysis in `screenplay.py` and the craft
 * linter, and duplicating that here would give the product two definitions of
 * what a slugline is. These only need to answer "has the writer done the thing
 * this step asked for", and for that a cheap client-side test is honest.
 */

const SLUGLINE = /^\s*(INT|EXT|I\/E)[.\s]/im;
const CHARACTER_CUE = /^\s*[A-Z][A-Z0-9 .'\-]{1,38}\s*(\(.*\))?\s*$/m;
const DEVANAGARI = /[ऀ-ॿ]/;

const countSluglines = (text) => (text.match(/^\s*(INT|EXT|I\/E)[.\s]/gim) || []).length;

/** Lines that are neither blank, a slugline, nor a cue — a rough action count. */
function actionLines(text) {
  return (text || "")
    .split("\n")
    .filter((l) => l.trim() && !SLUGLINE.test(l) && l.trim() !== l.trim().toUpperCase());
}

export const GUIDES = [
  // -------------------------------------------------------------------------
  {
    id: "first-scene",
    title: "Write your first scene",
    minutes: 5,
    group: "Start here",
    blurb: "The four elements every screenplay is made of, in one scene of your own.",
    steps: [
      {
        title: "Say where we are",
        body:
          "Every scene opens with a slugline: whether we are inside or outside, " +
          "where, and when. INT. means interior, EXT. means exterior.\n\n" +
          "Type i at the start of an empty line and press Tab — the editor writes INT. for you.",
        does: "INT. CHIYA PASAL, PATAN - MORNING",
        check: (text) => SLUGLINE.test(text),
        checkLabel: "a slugline on the page",
      },
      {
        title: "Show one thing the camera can see",
        body:
          "Leave a blank line, then write action. The camera cannot photograph a " +
          "thought: 'She realises he is lying' gives an actor nothing to play. Ask " +
          "instead what this person would physically do while feeling that.\n\n" +
          "Two or three lines. Action is ruthless because a page is a minute.",
        does: "Steam rises from a glass of chiya. SANJANA wipes the same spot on the counter for the third time.",
        check: (text) => actionLines(text).length >= 1,
        checkLabel: "an action line",
      },
      {
        title: "Name who speaks",
        body:
          "A character cue is the speaker's name in capitals, on its own line. " +
          "Press Tab on an empty line to move to the character column, then type " +
          "the name.\n\nCapitals are not decoration — they are how the parser, the " +
          "storyboard and the cast list find your characters.",
        does: "SANJANA",
        check: (text) => CHARACTER_CUE.test(text),
        checkLabel: "a character cue",
      },
      {
        title: "Give them a line",
        body:
          "Dialogue goes directly under the cue, no blank line between them.\n\n" +
          "Write what the character would actually say — not what the audience " +
          "needs to know. Those are different sentences, and the gap between them " +
          "is most of screenwriting.",
        does: "Timro result aayo?",
        check: (text) => {
          const lines = (text || "").split("\n");
          return lines.some((l, i) => {
            const cue = l.trim();
            const next = (lines[i + 1] || "").trim();
            return (
              cue &&
              cue === cue.toUpperCase() &&
              /[A-Zऀ-ॿ]/.test(cue) &&
              next &&
              next !== next.toUpperCase()
            );
          });
        },
        checkLabel: "a line of dialogue under a cue",
      },
      {
        title: "That is a scene",
        body:
          "You have written a screenplay. Everything else in this product acts on " +
          "what you just did: the Craft tab reads it, the Corkboard shows it as a " +
          "card, the storyboard draws it, and the PDF prints it in the format a " +
          "producer expects.\n\nWrite a second scene and the Outline starts telling " +
          "you about pacing.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "sluglines",
    title: "Sluglines and scene headings",
    minutes: 3,
    group: "The page",
    blurb: "Where and when — the line that makes a scene schedulable.",
    steps: [
      {
        title: "The three parts",
        body:
          "INT. or EXT., the location, then the time of day after a dash.\n\n" +
          "INT. CHIYA PASAL, PATAN - MORNING\n\n" +
          "Each part is read by something: INT/EXT decides the lighting setup, the " +
          "location groups scenes for scheduling, and the time of day drives the " +
          "storyboard's lighting cue.",
        does: "EXT. RIVERSIDE, PATAN - DUSK",
      },
      {
        title: "Type less",
        body:
          "At the start of a line: i gives INT., e gives EXT., and after the dash " +
          "d offers DAY, DAWN and DUSK. Press Tab to take the suggestion.\n\n" +
          "The Formatting menu in the toolbar lists every shortcut.",
      },
      {
        title: "Be consistent about location names",
        body:
          "CHIYA PASAL and THE CHIYA SHOP are two locations as far as this " +
          "product — and a scheduler — is concerned. Reuse the exact name and the " +
          "Outline can tell you how many times you return there.\n\n" +
          "Locations you list in Project Setup are offered as you type.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "action",
    title: "Action lines",
    minutes: 4,
    group: "The page",
    blurb: "Only what a camera could photograph — and how long it costs you.",
    steps: [
      {
        title: "The camera cannot photograph a thought",
        body:
          "'Prerana realises she will never leave this shop' is unfilmable. There " +
          "is nothing for an actor to play and nothing for a director to shoot.\n\n" +
          "Rewrite it as behaviour: what does someone do with their hands while " +
          "feeling that, given where they are?",
        does: "Prerana picks up the shutter key. Puts it down. Wipes the counter again.",
      },
      {
        title: "Small tasks beat big expressions",
        body:
          "'Nervous but determined' tells you less than someone re-taping a hand " +
          "that is already fine. Concrete physical business reads as character; " +
          "adjectives read as stage direction.",
      },
      {
        title: "Length is screen time",
        body:
          "A page is roughly a minute. A four-line action paragraph costs four " +
          "seconds you have to earn. Keep blocks to three lines or fewer and the " +
          "page stays readable at speed — which is how it will be read.\n\n" +
          "The Craft tab flags long action blocks.",
        check: (text) => actionLines(text).length >= 3,
        checkLabel: "some action written",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "dialogue",
    title: "Dialogue that does two jobs",
    minutes: 5,
    group: "The page",
    blurb: "On-the-nose lines, parentheticals, and what characters actually say.",
    steps: [
      {
        title: "People do not say what they mean",
        body:
          "'I am angry at you because you never listen to me' is a character " +
          "reading their own subtitle. Real speech comes at the subject sideways — " +
          "people argue about the small wrong thing.\n\n" +
          "The Craft tab flags on-the-nose lines, and it reads Nepali as well as " +
          "English.",
        does: "Chiya chiso bhayo.",
      },
      {
        title: "Parentheticals, rarely",
        body:
          "(angrily) under a cue tells a trained actor how to do their job. Use a " +
          "parenthetical only for information the line cannot carry — who it is " +
          "aimed at, or that it is a whisper.\n\n" +
          "If the emotion is not already in the words, fix the words.",
      },
      {
        title: "Give each character a different mouth",
        body:
          "Cover the cues. If you cannot tell who is speaking, they are the same " +
          "person twice.\n\n" +
          "Project Setup has a 'voice' field per character for exactly this — one " +
          "sentence on how they speak, which the AI also reads when generating.",
      },
      {
        title: "Cue then line, no gap",
        body:
          "Dialogue sits immediately under its cue. A blank line between them ends " +
          "the block, and the parser will read your dialogue as action.",
        check: (text) => CHARACTER_CUE.test(text),
        checkLabel: "a cue on the page",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "scene-shape",
    title: "What makes a scene a scene",
    minutes: 4,
    group: "Craft",
    blurb: "Enter late, leave early, and change the charge.",
    steps: [
      {
        title: "Something has to change",
        body:
          "A scene that ends on the same emotional charge it started on is not a " +
          "scene — it is an errand. Someone wants something, something is in the " +
          "way, and by the end the situation is different.\n\n" +
          "Ask: what is different on the last line that was not true on the first?",
      },
      {
        title: "Enter late, leave early",
        body:
          "Cut the greeting and the goodbye. Start at the first moment that " +
          "matters and leave on the line that lands — the audience will assemble " +
          "the rest.\n\nThe Craft tab flags greetings for this reason.",
      },
      {
        title: "Crossed purposes",
        body:
          "Two people who want the same thing produce no scene. Give them " +
          "different wants in the same room and the dialogue writes itself.\n\n" +
          "Want and need are separate fields in Project Setup because they are the " +
          "two halves that make an ending land.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "structure",
    title: "Structure and pacing",
    minutes: 5,
    group: "Craft",
    blurb: "The page as a unit of time, three acts, and where you actually are.",
    steps: [
      {
        title: "One page, one minute",
        body:
          "This is the fact everything else rests on. It is why action is short " +
          "and description is ruthless.\n\nThe page indicator in the toolbar shows " +
          "where the cursor is and how long the script runs. It is the same rule " +
          "the PDF prints with, so page 6 here is page 6 there.",
      },
      {
        title: "Three acts, roughly a third each",
        body:
          "Setup, confrontation, resolution — near enough 33/33/34. A first act " +
          "that runs half the script means the story starts late, and an audience " +
          "feels that before they can name it.\n\nThe Outline view measures your " +
          "act balance against it.",
      },
      {
        title: "Rearrange on the Corkboard",
        body:
          "Switch to Corkboard in the toolbar. Every scene is a card; drag one and " +
          "the scene moves in the script itself, not in a separate list.\n\n" +
          "This is where you find out that scene 7 belongs at 3.",
        check: (text) => countSluglines(text) >= 2,
        checkLabel: "two or more scenes to move around",
      },
      {
        title: "Compare against real films",
        body:
          "The Craft tab's benchmark measures your draft's shape — scene lengths, " +
          "dialogue-to-action ratio, how much of the script your lead is in — " +
          "against a library of produced screenplays.\n\nIt opens once there is " +
          "enough script to measure, and it reports percentiles rather than " +
          "verdicts.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "nepali",
    title: "Writing in Nepali",
    minutes: 3,
    group: "Craft",
    blurb: "Type romanised, get Devanagari — without a Nepali keyboard.",
    steps: [
      {
        title: "Switch the script",
        body:
          "The A / अ toggle in the toolbar. With अ selected, type Nepali the way " +
          "you already type it to friends — in Roman letters — and each word " +
          "becomes Devanagari when you press space.\n\nnamaste becomes नमस्ते.",
        check: (text) => DEVANAGARI.test(text),
        checkLabel: "Devanagari on the page",
      },
      {
        title: "Long vowels and hard consonants",
        body:
          "Double a vowel to lengthen it: didi is दिदि, didii is दिदी. Capitalise " +
          "for the retroflex series that Roman Nepali usually drops: T D N, so " +
          "miiTho gives मीठो.",
      },
      {
        title: "The marks",
        body:
          "~ gives the chandrabindu — hu~ is हुँ. M gives anusvara, H gives " +
          "visarga, and | ends a sentence with a danda ।\n\nWithout the " +
          "chandrabindu you cannot spell the verb 'to be', so it is worth the one " +
          "keystroke.",
      },
      {
        title: "Structure stays English",
        body:
          "INT., EXT., CUT TO: and character cues are never converted, because " +
          "they are capitals. A screenplay is structurally English even when every " +
          "word of its dialogue is not — so you can leave Nepali mode on while you " +
          "write sluglines.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "hooks",
    title: "Hooks for short-form",
    minutes: 4,
    group: "Short-form",
    blurb: "The first three seconds decide whether the rest gets seen.",
    steps: [
      {
        title: "The hook is the whole gamble",
        body:
          "In a reel, nothing after the opening line matters if the opening line " +
          "does not land. Write it first and write it hardest — it is not an " +
          "introduction, it is the argument for staying.",
      },
      {
        title: "Pick a shape and commit",
        body:
          "Six that work, and they are not interchangeable:\n\n" +
          "• Relatable pain — name a frustration they own\n" +
          "• Curiosity gap — promise a payoff, withhold its shape\n" +
          "• Bold claim — state something contestable as fact\n" +
          "• Visual shock — lead with the image, not the sentence\n" +
          "• Pattern interrupt — break the rhythm they expected\n" +
          "• Question — ask the gap directly\n\n" +
          "Mixing two produces neither.",
      },
      {
        title: "Be specific, fast",
        body:
          "'Most people struggle with money' is nothing. 'I paid Rs 40,000 for a " +
          "wedding video I never watched' is a hook.\n\nThe measured difference " +
          "between hooks that travel and hooks that do not is almost always " +
          "specificity in the first six words.",
      },
      {
        title: "Then earn it",
        body:
          "A hook that oversells collects a view and loses a follower. Whatever " +
          "the first line promised, the payoff has to be the same size.\n\n" +
          "The beat sheet above the page shows your hook, escalation and payoff " +
          "against the clock.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "notes",
    title: "Reading your craft notes",
    minutes: 3,
    group: "Craft",
    blurb: "What the Craft tab is telling you, and how much to believe it.",
    steps: [
      {
        title: "Three levels of confidence",
        body:
          "Every flag says how sure it is, and they are not equal:\n\n" +
          "• can't be filmed — a property of the medium. A camera cannot " +
          "photograph a realisation. Fix it.\n" +
          "• convention — professional consensus. Break it knowingly.\n" +
          "• a reading — the rule saw a shape that is often a problem and is " +
          "sometimes the point.\n\nWriting is subjective and a tool that pretends " +
          "otherwise gets switched off.",
      },
      {
        title: "Why this matters",
        body:
          "Every flag has a 'Why this matters' link that opens the craft point " +
          "underneath it, in place, without taking you out of your draft.",
      },
      {
        title: "It costs nothing and runs on partial drafts",
        body:
          "The Craft tab is free on every plan and uses no AI — it is a set of " +
          "deterministic checks. Run it on half a scene if you want.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "finish",
    title: "Storyboard and deliver",
    minutes: 4,
    group: "Finishing",
    blurb: "Turning a script into something a crew can shoot.",
    steps: [
      {
        title: "Review before you finalise",
        body:
          "Finalize & Storyboard runs a free check first: near-duplicate character " +
          "names, scenes far off their allotted time, act balance, runtime drift.\n\n" +
          "It reports and never blocks — you can always keep writing or finalise " +
          "anyway.",
      },
      {
        title: "Frames come from the page",
        body:
          "The storyboard reads your scenes: location, time of day, who is in " +
          "shot, and the emotional beat. Each frame gets a shot type and camera " +
          "notes derived from where it sits in the sequence.\n\nYou can override " +
          "the shot type, edit the notes, reorder, and redraw a single frame. " +
          "Redrawing never overwrites a camera note you wrote yourself.",
      },
      {
        title: "Pick the right export",
        body:
          "PDF for reading and sending. Final Draft (.fdx) if someone needs to " +
          "edit it in another screenwriting tool. Word to work outside the app.\n\n" +
          "The production package is the one a crew carries: title page, " +
          "screenplay, shot list with cast and camera notes, and the storyboard " +
          "frames.",
      },
    ],
  },
];

export const GUIDE_GROUPS = ["Start here", "The page", "Craft", "Short-form", "Finishing"];

/** How many of a guide's checkable steps the draft already satisfies. */
export function guideProgress(guide, text) {
  const checkable = guide.steps.filter((s) => s.check);
  if (!checkable.length) return null;
  return {
    done: checkable.filter((s) => s.check(text || "")).length,
    total: checkable.length,
  };
}

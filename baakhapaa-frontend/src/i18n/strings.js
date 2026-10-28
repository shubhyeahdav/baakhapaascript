/**
 * Interface strings, in English and Nepali.
 *
 * The product asks writers to write in Nepali, lints their Nepali dialogue and
 * now lets them type it — while every label around the page stayed English.
 * That is a strange thing to hand a Nepali writer, and it is the one gap that
 * a Nepali-language product cannot argue its way out of.
 *
 * Deliberately a plain object rather than i18next. This needs a lookup and a
 * fallback; it does not need pluralisation rules, interpolation, namespaces,
 * lazy-loaded bundles or a 40KB dependency in a bundle that is 125KB today.
 * When it needs those, swapping this for a library is an afternoon — the call
 * sites are already `t("key")`.
 *
 * Keys are English sentences rather than dotted paths (`nav.projects`). Two
 * reasons: a missing translation falls back to something a person can read
 * rather than to `nav.projects`, and the code stays legible without a second
 * file open beside it.
 *
 * Nepali here is deliberately plain. Software Nepali has a habit of reaching
 * for Sanskritised registers nobody speaks, and a writer should not have to
 * decode their own tools.
 */
export const STRINGS = {
  ne: {
    // --- navigation ------------------------------------------------------
    Projects: "परियोजनाहरू",
    Learn: "सिक्नुहोस्",
    Settings: "सेटिङ",
    "New project": "नयाँ परियोजना",
    Search: "खोज्नुहोस्",
    "Sign out": "साइन आउट",
    "Pricing & plan": "मूल्य र योजना",

    // --- the course ------------------------------------------------------
    "The Pen": "कलम",
    "the script page": "स्क्रिप्टको पाना",
    "The Story": "कथा",
    "what the page is for": "पाना केका लागि हो",
    "Write your first short": "आफ्नो पहिलो छोटो फिल्म लेख्नुहोस्",
    "Two tracks. Every lesson ends in you writing something the app checks.":
      "दुई बाटा। हरेक पाठको अन्त्यमा तपाईं केही लेख्नुहुन्छ, जुन एपले जाँच्छ।",

    // --- sign in / sign up ----------------------------------------------
    "Welcome back": "फेरि स्वागत छ",
    "Sign in to your studio": "आफ्नो स्टुडियोमा साइन इन गर्नुहोस्",
    Email: "इमेल",
    Password: "पासवर्ड",
    "Sign In": "साइन इन",
    "No account?": "खाता छैन?",
    "Create one": "एउटा बनाउनुहोस्",
    "Create Account": "खाता बनाउनुहोस्",
    "Full Name": "पूरा नाम",
    "Confirm Password": "पासवर्ड पुष्टि गर्नुहोस्",
    "Already have an account?": "पहिले नै खाता छ?",
    "By creating an account you agree to our": "खाता बनाएर तपाईं हाम्रो",
    "Terms of Use": "प्रयोगका सर्तहरू",
    "Privacy Policy": "गोपनीयता नीति",
    and: "र",
    "Your script text is not encrypted at the application layer and, on paid plans, is sent to our AI providers when you ask for generation.":
      "तपाईंको स्क्रिप्ट एप-स्तरको इन्क्रिप्सन बिना राखिन्छ, र सशुल्क योजनामा तपाईंले लेखाउन खोज्दा हाम्रा एआई सेवाहरूमा पठाइन्छ मा सहमत हुनुहुन्छ।",
    "Your password is hashed and never stored in plain text.":
      "तपाईंको पासवर्ड ह्यास गरेर राखिन्छ, कहिल्यै सादा अक्षरमा होइन।",
    Show: "देखाउनुहोस्",
    Hide: "लुकाउनुहोस्",
    "Passwords match": "पासवर्ड मिल्यो",
    "Passwords do not match": "पासवर्ड मिलेन",
    "Strong enough.": "पुग्यो।",

    // --- the editor ------------------------------------------------------
    Back: "पछाडि",
    Setup: "सेटअप",
    Script: "स्क्रिप्ट",
    Corkboard: "कर्कबोर्ड",
    Outline: "रूपरेखा",
    Structure: "संरचना",
    Export: "निर्यात",
    Import: "आयात",
    View: "दृश्य",
    Assist: "सहयोग",
    Craft: "शिल्प",
    Guide: "मार्गदर्शन",
    History: "इतिहास",
    Synced: "सुरक्षित",
    "Saving...": "सुरक्षित गर्दै...",
    "Finalize & Storyboard": "अन्तिम रूप र स्टोरीबोर्ड",
    "Focus mode": "एकाग्र मोड",
    Reading: "पढ्दै",

    // --- common ----------------------------------------------------------
    Cancel: "रद्द गर्नुहोस्",
    Delete: "मेट्नुहोस्",
    Save: "सुरक्षित गर्नुहोस्",
    Loading: "लोड हुँदै",
    "Keep writing": "लेख्न जारी राख्नुहोस्",

    // --- the editor toolbar (Month 4, Day 11) -------------------------------
    Share: "सेयर",
    Interface: "इन्टरफेस",
    "The language of menus and labels, not your script": "मेनु र लेबलको भाषा, पटकथाको होइन",
    "Share this project": "यो परियोजना सेयर गर्नुहोस्",
    "Invite a reader or an editor": "पाठक वा सम्पादकलाई निम्त्याउनुहोस्",
    "For reading and sending": "पढ्न र पठाउन",
    "Opens in Final Draft, Celtx, Arc Studio": "Final Draft, Celtx र Arc Studio मा खुल्छ",
    "For editing outside the app": "एपबाहिर सम्पादन गर्न",
    "Production package": "प्रोडक्सन प्याकेज",
    "Script, shot list and storyboard in one PDF": "स्क्रिप्ट, सट सूची र स्टोरीबोर्ड एउटै PDF मा",
    "Nothing on screen but the page": "स्क्रिनमा पानाबाहेक केही छैन",
    Cursor: "कर्सर",
    Pen: "कलम",
    Ring: "घेरा",
    Default: "पूर्वनिर्धारित",
    "Typewriter mode": "टाइपराइटर मोड",
    "Typewriter mode: on": "टाइपराइटर मोड: खुला",
    "Hold the caret at the middle, and fade the rest": "कर्सर बीचमा राख्छ, बाँकी धमिलो पार्छ",
    "Light page": "उज्यालो पाना",
    "Dark page": "अँध्यारो पाना",
    "The colour of the paper, not the app": "पानाको रङ, एपको होइन",
    "Story bible and format": "स्टोरी बाइबल र ढाँचा",
    "Logline, characters, what the story is for": "लगलाइन, पात्र, कथा केका लागि हो",
    "Hide the structure": "संरचना लुकाउनुहोस्",
    "Show the structure": "संरचना देखाउनुहोस्",
    "The suggested three acts": "सुझाइएका तीन अंक",
    Typing: "टाइपिङ",
    "Write ‘namaste’, get नमस्ते": "‘namaste’ लेख्नुहोस्, नमस्ते पाउनुहोस्",
    "Format shortcuts": "ढाँचा सर्टकट",
    "Type the letter, press Tab": "अक्षर टाइप गरेर Tab थिच्नुहोस्",
    "Import a screenplay": "पटकथा आयात गर्नुहोस्",
    "Export PDF": "PDF निर्यात",
    "Export Final Draft (.fdx)": "Final Draft (.fdx) निर्यात",
    "Export Word (.docx)": "Word (.docx) निर्यात",
    "Export production package": "प्रोडक्सन प्याकेज निर्यात",
    "Reviewing…": "जाँच्दै…",
    Finalize: "अन्तिम रूप",
    "Write the page": "पाना लेख्नुहोस्",
    "Move scenes around": "दृश्यहरू सार्नुहोस्",
    "Read the shape": "आकार पढ्नुहोस्",
    "Read one voice at a time": "एक पटकमा एउटा आवाज पढ्नुहोस्",
    Cast: "पात्रहरू",

    // --- the course page (Month 4, Day 12) ----------------------------------
    "Passed.": "पास।",
    "Technique unlocked": "प्रविधि खुल्यो",
    "Not yet.": "अझै भएन।",
    "These are the same checks that run in the editor. Fix and resubmit — there is no penalty for trying.":
      "सम्पादकमा चल्ने जाँच यही हो। सच्याएर फेरि पठाउनुहोस् — प्रयास गर्दा कुनै सजाय छैन।",
    "Could not reach the server.": "सर्भरसम्म पुग्न सकिएन।",
    "Hide the lesson list": "पाठ सूची लुकाउनुहोस्",
    "Show the lesson list": "पाठ सूची देखाउनुहोस्",
    "All lessons": "सबै पाठ",
    completed: "पूरा भयो",
    "From the corpus": "पटकथा संग्रहबाट",
    Exercise: "अभ्यास",
    "Write here…": "यहाँ लेख्नुहोस्…",
    "Your answer to this exercise": "यो अभ्यासको तपाईंको उत्तर",
    "Checking…": "जाँच्दै…",
    "Check my work": "मेरो काम जाँच्नुहोस्",
    Next: "अर्को",

    // Guide panel groups
    "Start here": "यहाँबाट सुरु",
    "The page": "पाना",
    "Short-form": "छोटो भिडियो",
    Finishing: "टुंग्याउने",

    Section: "खण्ड",
    Scene: "दृश्य",

    Sections: "खण्डहरू",
    "Scene Index Cards": "दृश्य कार्डहरू",
    Scenes: "दृश्यहरू",
    "Major beats": "मुख्य बिट",
    "Written runtime": "लेखिएको अवधि",

    // --- the landing page (/) ----------------------------------------------
    Pricing: "मूल्य",
    Terms: "सर्तहरू",
    Privacy: "गोपनीयता",
    Main: "मुख्य",
    Legal: "कानुनी",
    Proof: "प्रमाण",
    High: "उच्च",
    Medium: "मध्यम",
    "Pre-Production Studio": "प्रि-प्रोडक्सन स्टुडियो",
    "Screenwriting software that reads Nepali.": "नेपाली पढ्ने पटकथा सफ्टवेयर।",
    "Write in Devanagari or English. As you type, a craft linter marks the line that says a feeling out loud instead of playing it — with no AI call, on every plan.":
      "देवनागरी वा अंग्रेजीमा लेख्नुहोस्। लेख्दै गर्दा, क्राफ्ट लिन्टरले भावनालाई अभिनयमा देखाउनुको सट्टा सिधै बोलिदिने लाइन चिनाउँछ — एआई प्रयोग नगरी, सबै योजनामा।",
    "Start writing — free": "निःशुल्क लेख्न सुरु गर्नुहोस्",
    "See pricing": "मूल्य हेर्नुहोस्",
    "Real output from the linter on this scene.": "यो दृश्यमा लिन्टरले दिएको वास्तविक नतिजा।",
    "of real writers' problems matched to the right craft technique, Nepali included":
      "लेखकका वास्तविक समस्यामा सही शिल्प-प्रविधि मिल्यो, नेपालीसमेत",
    "graded lessons, free on every plan": "जाँचिने पाठ, सबै योजनामा निःशुल्क",
    "AI calls to check a draft": "ड्राफ्ट जाँच्न एआई कल",
    Write: "लेख्नुहोस्",
    Plan: "योजना",
    "Format as you type. Pages are counted by the same rule the PDF uses, so page six means one thing everywhere.":
      "टाइप गर्दै ढाँचा मिल्छ। पाना PDF कै नियमले गनिन्छ, त्यसैले पाना छ जहाँ पनि एउटै हो।",
    "Nineteen lessons in two tracks — the page and the story — each graded by the linter, not by a Next button.":
      "दुई भागमा उन्नाइस पाठ — पाना र कथा — हरेक पाठ लिन्टरले जाँच्छ, 'अर्को' बटनले होइन।",
    "Corkboard, outline, storyboard frames and a production package, built from the scenes you wrote.":
      "तपाईंले लेखेकै दृश्यबाट कर्कबोर्ड, रूपरेखा, स्टोरीबोर्ड फ्रेम र प्रोडक्सन प्याकेज।",
    "Your next script starts on a blank page.": "तपाईंको अर्को पटकथा खाली पानाबाट सुरु हुन्छ।",
    "Free for three projects. Pro is Rs 999 a month, paid with Khalti or eSewa.":
      "तीन परियोजनासम्म निःशुल्क। प्रो महिनाको रु ९९९ — खल्ती वा इसेवाबाट तिर्न सकिन्छ।",
  },
};

export const LANGUAGES = [
  { code: "en", label: "English" },
  // Endonym, not "Nepali". Someone looking for their own language is looking
  // for the word they call it by.
  { code: "ne", label: "नेपाली" },
];

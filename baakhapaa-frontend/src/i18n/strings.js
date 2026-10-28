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

    // --- feedback on the page --------------------------------------------
    "Notes in the margin: on": "किनारामा टिप्पणी: खुला",
    "Notes in the margin: off": "किनारामा टिप्पणी: बन्द",
    "The linter's notes beside the lines they are about": "लिन्टरका टिप्पणी, सम्बन्धित लाइनकै छेउमा",
    "The linter found something on this page.": "लिन्टरले यो पानामा केही भेट्यो।",
    "They are marked in the page margin. The craft library has no technique to add to them yet.":
      "ती पानाको किनारामा चिनो लगाइएका छन्। शिल्प-संग्रहमा तिनमा थप्ने प्रविधि अहिले छैन।",
    "Read them in Craft": "शिल्पमा पढ्नुहोस्",
    "The craft library has no technique to add to them yet.": "शिल्प-संग्रहमा तिनमा थप्ने प्रविधि अहिले छैन।",
    "Nothing on this page asks for a technique yet. Keep writing, or name the problem above in your own words — the library answers complaints best.":
      "यो पानाले अहिले कुनै प्रविधि माग्दैन। लेख्दै जानुहोस्, वा माथि आफ्नै शब्दमा समस्या लेख्नुहोस् — संग्रहले गुनासोको जवाफ राम्रो दिन्छ।",

    // --- the tour (/tour) -------------------------------------------------
    Tour: "भ्रमण",
    "Take the tour": "भ्रमण गर्नुहोस्",
    "The tour": "भ्रमण",
    "Watch a scene get better.": "एउटा दृश्य राम्रो हुँदै गरेको हेर्नुहोस्।",
    "One scene, written the way first drafts are, and what Baakhapaa does about it — in Devanagari, on the free plan, with no AI call. Then the five rooms the rest of the work happens in.":
      "पहिलो ड्राफ्टजस्तै लेखिएको एउटा दृश्य, र त्यसमा बाखापाले के गर्छ — देवनागरीमा, निःशुल्क योजनामा, एआई बिना। त्यसपछि बाँकी काम हुने पाँच कोठा।",
    "One scene, two drafts": "एउटै दृश्य, दुई ड्राफ्ट",
    "Which draft": "कुन ड्राफ्ट",
    "As written": "लेखिएजस्तै",
    Rewritten: "पुनर्लेखित",
    "notes from the linter.": "लिन्टरका टिप्पणी।",
    "Nobody says the grievance now. Sita leaves the sugar out; Ram pushes the glass back and lets his line trail off. The fight is about tea, which is what the craft asks: let them fight about the small wrong thing.":
      "अब कसैले गुनासो सिधै भन्दैन। सीताले चिनी हाल्दिनन्; रामले गिलास फर्काउँछ र आफ्नो कुरा अधुरै छोड्छ। झगडा चियाको हो — शिल्प यही माग्छ: सानो, गलत कुरामा झगडा गराउनुहोस्।",
    "Press “Rewritten” to see the same scene after taking the notes.": "टिप्पणी मानेपछिको उही दृश्य हेर्न “पुनर्लेखित” थिच्नुहोस्।",
    "Both drafts are run through the real linter by the test suite. The page cannot claim a fix the linter disagrees with.":
      "दुवै ड्राफ्ट परीक्षणमा वास्तविक लिन्टरबाट चलाइन्छन्। लिन्टर असहमत हुने सुधारको दाबी यो पानाले गर्न सक्दैन।",
    "The five rooms": "पाँच कोठा",
    "The margin": "किनारा",
    "The course": "पाठ्यक्रम",
    "The plan": "योजना",
    "Short and long video": "छोटो र लामो भिडियो",
    "Format as you type: a letter and Tab give you the slugline, the cue, the parenthetical. Pages are counted by the PDF's own rule, in English or Devanagari.":
      "टाइप गर्दै ढाँचा: एउटा अक्षर र Tab ले slugline, cue र parenthetical दिन्छ। पाना PDF कै नियमले गनिन्छ, अंग्रेजी वा देवनागरीमा।",
    "The linter reads every pause and leaves a quiet dot beside the line it is about. Open it for what it saw and the technique that answers it. No AI call, on every plan.":
      "हरेक रोकाइमा लिन्टरले पढ्छ र सम्बन्धित लाइनको छेउमा एउटा सानो थोप्लो छोड्छ। त्यसले के देख्यो र कुन प्रविधिले जवाफ दिन्छ, खोलेर हेर्नुहोस्। एआई बिना, सबै योजनामा।",
    "Nineteen lessons in two tracks. Each ends with you writing something, graded by the same checks — and answered in the language you are reading in.":
      "दुई भागमा उन्नाइस पाठ। हरेकको अन्त्यमा तपाईं केही लेख्नुहुन्छ, उही जाँचले जाँचिन्छ — र जवाफ तपाईंले पढिरहेकै भाषामा आउँछ।",
    "Corkboard, outline and cast are three readings of the same scenes. Move a card and the scene moves in the script. Storyboards and a production package come from the page.":
      "कर्कबोर्ड, रूपरेखा र पात्र उही दृश्यका तीन पढाइ हुन्। कार्ड सार्नुहोस्, स्क्रिप्टमा दृश्य सर्छ। स्टोरीबोर्ड र प्रोडक्सन प्याकेज पानाबाटै बन्छन्।",
    "A beat spine with a rehook due every five to eight seconds, a rhythm meter that reads the draft as you type, and sections for essays and courses instead of pretend pages.":
      "हरेक पाँचदेखि आठ सेकेन्डमा rehook चाहिने beat spine, टाइप गर्दै ड्राफ्ट पढ्ने rhythm meter, र नक्कली पानाको सट्टा essay र course का लागि खण्डहरू।",
    "Your pages travel.": "तपाईंका पाना जहाँ पनि जान्छन्।",
    "Write here, and take the script to the software your producer already uses. Nothing is locked in.":
      "यहाँ लेख्नुहोस्, र स्क्रिप्ट तपाईंका प्रोड्युसरले चलाइरहेको सफ्टवेयरमा लैजानुहोस्। केही पनि थुनिँदैन।",
    "Any reader": "जुनसुकै पाठक",
    "A production": "प्रोडक्सन",
    "Product names belong to their owners. They are listed because the file Baakhapaa exports opens in them, not because of any partnership.":
      "उत्पादनका नाम तिनका मालिकका हुन्। बाखापाले निर्यात गर्ने फाइल तिनमा खुल्ने भएकाले मात्र यहाँ राखिएका हुन्, कुनै साझेदारीले होइन।",

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
    Source: "स्रोत",
    "See all five rooms on the tour": "पाँचै कोठा टुरमा हेर्नुहोस्",
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

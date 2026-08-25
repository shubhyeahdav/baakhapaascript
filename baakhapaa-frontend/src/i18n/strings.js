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
  },
};

export const LANGUAGES = [
  { code: "en", label: "English" },
  // Endonym, not "Nepali". Someone looking for their own language is looking
  // for the word they call it by.
  { code: "ne", label: "नेपाली" },
];

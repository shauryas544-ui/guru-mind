export const sampleMistakes = [
  {
    original: "I am go to college.",
    corrected: "I go to college.",
    concept: "Present Simple",
    root_cause: "Mixing 'am' with present simple",
    explanation: "Routine batane ke liye Present Simple mein 'am' ki zaroorat nahi hoti.",
    count: 4,
    status: "Improving",
  },
  {
    original: "Yesterday I go to market.",
    corrected: "Yesterday I went to the market.",
    concept: "Past Simple",
    root_cause: "Not changing the verb for past time",
    explanation: "'Yesterday' past time batata hai, isliye 'go' ki jagah 'went' use hoga.",
    count: 6,
    status: "Repeated",
  },
  {
    original: "He is engineer.",
    corrected: "He is an engineer.",
    concept: "Articles",
    root_cause: "Hindi has no articles",
    explanation: "Profession batate waqt singular noun ke pehle 'a' ya 'an' lagta hai.",
    count: 9,
    status: "Repeated",
  },
  {
    original: "I am waiting since morning.",
    corrected: "I have been waiting since morning.",
    concept: "Present Perfect Continuous",
    root_cause: "Direct Hindi translation",
    explanation: "Subah se chal rahe kaam ke liye 'have been + verb-ing' use hota hai.",
    count: 2,
    status: "Fixed",
  },
];

export const memoryNotes = [
  {
    title: "Present Simple for routines",
    content:
      "Use the base verb for habits: 'I go', 'She goes'. No 'am/is/are' before the main verb.",
    tag: "Grammar",
    date: "Starter note",
  },
  {
    title: "'An' before vowel sounds",
    content: "an engineer, an hour, a university — it depends on the sound, not the letter.",
    tag: "Grammar",
    date: "Starter note",
  },
  {
    title: "Polite requests",
    content: "'Could you please…' sounds softer than 'Give me…'.",
    tag: "Speaking",
    date: "Starter note",
  },
];

// The shelf as it was first written, on 27 October 2026.
// The live copy lives in Netlify Blobs; this is used until the first save,
// and as a fallback when the live copy can't be reached.

const T = Date.parse("2026-10-27T02:00:00.000Z");
const at = (i) => new Date(T - i * 1000).toISOString();

const items = [
  ["shows", "Rick and Morty"],
  ["shows", "Family Guy"],
  ["artists", "Anuv Jain", "My favourite artist"],
  ["music", "Punjabi folk"],
  ["music", "Indie"],
  ["movies", "Five Feet Apart", "My favourite movie"],
  ["stand-up", "Karunesh Talwar"],
  ["stand-up", "Kenny Sebastian"],
  ["fighters", "Khabib Nurmagomedov", "I watch MMA sometimes, mostly for him"],
  ["curious", "AI"],
  ["curious", "Brain–computer interfaces", "Biotech"],
  ["curious", "Space exploration"],
  ["looks-up-to", "Barack Obama", "My political idol"],
  ["routine", "The gym", "Every day"],
  ["routine", "Buying books", "Never reading them"],
  ["wardrobe", "Black, mostly"],
  ["wardrobe", "Oversized tees"],
];

export const SEED = {
  version: 1,
  rev: 0,
  updatedAt: at(0),
  profile: {
    name: "Bal Kishan",
    nickname: "shmshxr",
    intro: "a computer science engineer building a career in full stack development",
    status: "",
    links: {
      github: "https://github.com/shmshxr",
      linkedin: "",
      instagram: "",
      x: "",
      email: "",
    },
  },
  categories: [
    { id: "projects", name: "Projects", color: "sky", sentence: { on: true, before: "building", after: "", lower: false } },
    { id: "shows", name: "Shows", color: "green", sentence: { on: true, before: "watching", after: "", lower: false } },
    { id: "artists", name: "Artists", color: "pink", sentence: { on: true, before: "playing", after: "on repeat", lower: false } },
    { id: "music", name: "Music", color: "violet", sentence: { on: false, before: "listening to", after: "", lower: true } },
    { id: "movies", name: "Movies", color: "coral", sentence: { on: false, before: "rewatching", after: "", lower: false } },
    { id: "stand-up", name: "Stand-up", color: "amber", sentence: { on: false, before: "laughing at", after: "", lower: false } },
    { id: "fighters", name: "Fighters", color: "orange", sentence: { on: false, before: "watching", after: "fight", lower: false } },
    { id: "curious", name: "Curious about", color: "blue", sentence: { on: true, before: "thinking about", after: "", lower: true } },
    { id: "looks-up-to", name: "Looks up to", color: "teal", sentence: { on: false, before: "learning from", after: "", lower: false } },
    { id: "routine", name: "Routine", color: "lime", sentence: { on: false, before: "", after: "", lower: true } },
    { id: "wardrobe", name: "Wardrobe", color: "stone", sentence: { on: false, before: "wearing", after: "", lower: true } },
  ],
  items: items.map(([categoryId, title, note = ""], i) => ({
    id: `seed-${String(i + 1).padStart(2, "0")}`,
    categoryId,
    title,
    note,
    since: "",
    link: "",
    addedAt: at(i),
  })),
};

// The public demo at touchlinetales.club/demo/: a made-up team with a made-up season (demo.js), no database.
// Build it with: python3 tools/package_demo.py
self.TEAM = {
  name: "Sample Town",
  shortName: "Sample Town",
  fullName: "Sample Town Junior Football Club",
  abbr: "STJFC",
  ageGroup: "Under 12s",
  ageShort: "U12s",
  players: "girls",
  tagline: "Junior Football Club · Girls",
  appName: "Sample Town U12s",
  siteUrl: "https://touchlinetales.club/demo",
  supportName: "Touchline Tales",

  league: "County Youth League",
  assistsFrom: "2026-27",
  format: "7v7",
  halfLength: 25,
  publicScores: true,                            // U12s: outside the FA U7-U11 rule. The demo banner can switch this off to show it
  poweredBy: true,

  colours: { club: "#13804A", clubDeep: "#0A5A2D", clubInk: "#FFFFFF", gold: "#F2C230", goldInk: "#1A1A1A",
             accent: "#BFE3CC", accentDeep: "#13804A" },
  crest: "crest.png",
  sponsor: null,
  potm: { sponsor: "", logo: "", icon: "⭐", ribbon: "STFC U12s" },
  kitSponsor: null,
  kits: {
    home: { label: "Green", body: "#13804A", trim: "#F2C230", ink: "#FFFFFF", band: "#F2C230", bandInk: "#111111" },
    away: { label: "White", body: "#FFFFFF", trim: "#13804A", ink: "#13804A", band: "#13804A", bandInk: "#FFFFFF" }
  },
  captain: "",

  hashtags: "#SampleTown #GirlsFootball",
  shortHashtags: "#SampleTown",
  cheer: "💚💛",
  storageKey: "tt-demo"
};

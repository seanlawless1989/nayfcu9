// The rugby union demo at touchlinetales.club/demo-rugby/: a made-up team with a made-up season (demo-season.js), no database.
// Build it with: python3 tools/package_demo.py --team demo-rugby
self.TEAM = {
  sport: "rugby-union",
  name: "Sample Town",
  shortName: "Sample Town",
  fullName: "Sample Town Rugby Union Football Club",
  abbr: "STRUFC",
  ageGroup: "Under 14s",
  ageShort: "U14s",
  players: "boys",
  tagline: "Rugby Union Club · Boys",
  appName: "Sample Town U14s",
  siteUrl: "https://touchlinetales.club/demo-rugby",
  supportName: "Touchline Tales",

  league: "County Rugby Merit Table",
  format: "15s",
  halfLength: 25,
  publicScores: true,                            // U14s play competitive rugby. The demo banner can hide scores to show the option
  poweredBy: true,

  colours: { club: "#1D3A8A", clubDeep: "#12265C", clubInk: "#FFFFFF", gold: "#D62839", goldInk: "#FFFFFF",
             accent: "#C9D4F2", accentDeep: "#1D3A8A" },
  crest: "crest.png",
  sponsor: null,
  potm: { sponsor: "", logo: "", icon: "⭐", ribbon: "STRFC U14s" },
  kitSponsor: null,
  kits: {
    home: { label: "Navy and red hoops", body: "#1D3A8A", trim: "#D62839", ink: "#FFFFFF", band: "#D62839", bandInk: "#FFFFFF" },
    away: { label: "White", body: "#FFFFFF", trim: "#1D3A8A", ink: "#1D3A8A", band: "#1D3A8A", bandInk: "#FFFFFF" }
  },
  captain: "",

  hashtags: "#SampleTown #YouthRugby",
  shortHashtags: "#SampleTown",
  cheer: "💙❤️",
  storageKey: "tt-demo-rugby"
};

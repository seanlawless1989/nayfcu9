// The rugby league demo at touchlinetales.club/demo-rugby-league/: a made-up team with a made-up season, no database.
// It shares the rugby demo season in teams/demo-rugby/demo-season.js. Build it with: python3 tools/package_demo.py --team demo-rugby-league
self.TEAM = {
  sport: "rugby-league",
  name: "Sample Town",
  shortName: "Sample Town",
  fullName: "Sample Town Amateur Rugby League Club",
  abbr: "STARLC",
  ageGroup: "Under 13s",
  ageShort: "U13s",
  players: "boys",
  tagline: "Amateur Rugby League Club · Boys",
  appName: "Sample Town U13s",
  siteUrl: "https://touchlinetales.club/demo-rugby-league",
  supportName: "Touchline Tales",

  league: "County Junior League",
  format: "13s",
  halfLength: 20,
  publicScores: true,
  poweredBy: true,

  colours: { club: "#B5121B", clubDeep: "#7A0B12", clubInk: "#FFFFFF", gold: "#F2B705", goldInk: "#1A1A1A",
             accent: "#F6CDD0", accentDeep: "#B5121B" },
  crest: "crest.png",
  sponsor: null,
  potm: { sponsor: "", logo: "", icon: "⭐", ribbon: "STARLC U13s" },
  kitSponsor: null,
  kits: {
    home: { label: "Red and amber", body: "#B5121B", trim: "#F2B705", ink: "#FFFFFF", band: "#F2B705", bandInk: "#111111" },
    away: { label: "White", body: "#FFFFFF", trim: "#B5121B", ink: "#B5121B", band: "#B5121B", bandInk: "#FFFFFF" }
  },
  captain: "",

  hashtags: "#SampleTown #RugbyLeague",
  shortHashtags: "#SampleTown",
  cheer: "❤️💛",
  storageKey: "tt-demo-league"
};

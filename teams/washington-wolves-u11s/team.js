// Washington Athletic Youth Wolves, Under 11s girls (founding team, 3 Nov 2026). Lives in the NAYFC U9s Supabase project,
// schema washington_wolves_u11s (tools/team_schema_sql.py). Crest is Washington Athletic FC's badge (from the North East badge set); the coach can change crest and colours in Team setup.
self.TEAM = {
  name: "Washington Wolves",                     // used in scores, commentary and posts
  shortName: "Wolves",                           // the GOAL! flash
  fullName: "Washington Athletic Youth Wolves",
  abbr: "WAW",
  ageGroup: "Under 11s",
  ageShort: "U11s",
  players: "girls",
  tagline: "Girls Football",
  appName: "Washington Wolves U11s",
  siteUrl: "https://touchlinetales.club/washington-wolves-u11s/",
  supportName: "Touchline Tales",

  league: "Russell Foster League",
  assistsFrom: "2026-27",
  format: "7v7",
  halfLength: 25,
  publicScores: false,                           // U11s: scores hidden from visitors (FA rule); coaches still see them
  poweredBy: true,

  colours: { club: "#27207A", clubDeep: "#18134D", clubInk: "#FFFFFF", gold: "#D2232A", goldInk: "#FFFFFF",
             accent: "#F7A3D3", accentDeep: "#E5559F" },
  crest: "crest.png",
  sponsor: null,
  potm: { sponsor: "", logo: "", icon: "🏆", ribbon: "WOLVES U11s" },
  kitSponsor: null,
  kits: {
    home: { label: "Home", body: "#27207A", trim: "#D2232A", ink: "#FFFFFF", band: "#D2232A", bandInk: "#FFFFFF" }
  },
  captain: "",

  hashtags: "#WashingtonWolves #GirlsFootball",
  shortHashtags: "#WashingtonWolves",
  cheer: "🐺💙",
  storageKey: "washington-wolves-u11s"
};

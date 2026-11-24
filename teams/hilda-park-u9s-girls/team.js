// Chester-le-Street Hilda Park Youth, Under 9s girls (coach Mark), set up 24 Nov 2026 as a free trial (free for them).
// Lives in the NAYFC U9s Supabase project, schema hilda_park_u9_girls (tools/team_schema_sql.py). Crest is Hilda Park FC's
// badge from docs/badges. 7v7 and 20-minute halves are a best guess; the coach can change them in Team setup.
self.TEAM = {
  name: "Hilda Park",                            // used in scores, commentary and posts
  shortName: "Hilda Park",                       // the GOAL! flash
  fullName: "Chester-le-Street Hilda Park Youth",
  abbr: "HPY",
  ageGroup: "Under 9s",                          // no "Girls" suffix: Team setup's age list must match it
  ageShort: "U9s Girls",
  players: "girls",
  tagline: "Youth Football · Girls",
  appName: "Hilda Park U9s Girls",
  siteUrl: "https://touchlinetales.club/hilda-park-u9s-girls/",
  supportName: "Touchline Tales",

  league: "Russell Foster League",
  assistsFrom: "2026-27",
  format: "7v7",
  halfLength: 20,
  publicScores: false,                           // U9s: scores hidden from visitors (FA rule); coaches still see them
  poweredBy: true,

  colours: { club: "#214F83", clubDeep: "#14335A", clubInk: "#FFFFFF", gold: "#F2C230", goldInk: "#1A1A1A",
             accent: "#F7A3D3", accentDeep: "#E5559F" },
  crest: "crest.png",
  sponsor: null,
  potm: { sponsor: "", logo: "", icon: "🏆", ribbon: "HILDA PARK U9s" },
  kitSponsor: null,
  kits: {
    home: { label: "Home", body: "#214F83", trim: "#F2C230", ink: "#FFFFFF", band: "#F2C230", bandInk: "#1A1A1A" }
  },
  captain: "",

  hashtags: "#HildaPark #GirlsFootball",
  shortHashtags: "#HildaPark",
  cheer: "💙💛",
  storageKey: "hilda-park-u9s-girls"
};

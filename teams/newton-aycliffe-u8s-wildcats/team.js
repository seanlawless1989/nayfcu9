// Newton Aycliffe Under 8s Wildcats (girls), set up 5 Nov 2026 (Newton Aycliffe teams are free). Lives in the NAYFC U9s Supabase project, schema na_u8_wildcats (tools/team_schema_sql.py).
self.TEAM = {
  name: "Newton Aycliffe",                       // used in scores, commentary and posts
  shortName: "Wildcats",                               // the GOAL! flash
  fullName: "Newton Aycliffe Youth Football Club",
  abbr: "NAYFC",
  ageGroup: "Under 8s",                         // no "Wildcats" suffix: Team setup's age list must match it
  ageShort: "U8s Wildcats",
  players: "girls",
  tagline: "Youth Football Club · Girls",
  appName: "NAYFC U8s Wildcats",
  siteUrl: "https://touchlinetales.club/newton-aycliffe-u8s-wildcats/",
  club: { id: "newton-aycliffe", name: "Newton Aycliffe", url: "https://touchlinetales.club/newton-aycliffe/" },
  supportName: "Touchline Tales",

  league: "Russell Foster League",
  assistsFrom: "2026-27",
  format: "5v5",
  halfLength: 20,
  publicScores: true,                            // 5 Nov: scores shown; the coach can switch them off in Team setup
  poweredBy: true,

  colours: { club: "#2235E8", clubDeep: "#16239E", clubInk: "#FFFFFF", gold: "#FFD200", goldInk: "#1A1A1A",
             accent: "#F7A3D3", accentDeep: "#E5559F" },
  crest: "crest.png",
  sponsor: null,
  potm: { sponsor: "", logo: "", icon: "🏆", ribbon: "NAYFC U8 WILDCATS" },
  kitSponsor: null,
  kits: {
    yellow: { label: "Yellow", body: "#FFD200", trim: "#2235E8", ink: "#111111", band: "#2235E8", bandInk: "#FFFFFF" },
    blue:   { label: "Blue",   body: "#2235E8", trim: "#FFD200", ink: "#FFFFFF", band: "#FFD200", bandInk: "#111111" }
  },
  captain: "",

  hashtags: "#NAYFC #NewtonAycliffe #GirlsFootball",
  shortHashtags: "#NAYFC #GirlsFootball",
  cheer: "💙💛",
  storageKey: "nayfc-u8-wildcats"
};

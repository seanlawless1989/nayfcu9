// Newton Aycliffe Under 11s Pumas (girls). Lives in the NAYFC U9s Supabase project, schema na_u11_pumas (tools/team_schema_sql.py).
self.TEAM = {
  name: "Newton Aycliffe",                       // used in scores, commentary and posts
  shortName: "Pumas",                               // the GOAL! flash
  fullName: "Newton Aycliffe Youth Football Club",
  abbr: "NAYFC",
  ageGroup: "Under 11s Pumas",
  ageShort: "U11s Pumas",
  players: "girls",
  tagline: "Youth Football Club · Girls",
  appName: "NAYFC U11s Pumas",
  siteUrl: "https://touchlinetales.club/newton-aycliffe-u11s-pumas/",
  club: { name: "Newton Aycliffe", url: "https://touchlinetales.club/newton-aycliffe/" },
  supportName: "Touchline Tales",

  league: "Russell Foster League",
  assistsFrom: "2026-27",
  format: "9v9",
  halfLength: 25,
  publicScores: false,                           // U11s: scores hidden from visitors (FA rule); coaches still see them
  poweredBy: true,

  colours: { club: "#2235E8", clubDeep: "#16239E", clubInk: "#FFFFFF", gold: "#FFD200", goldInk: "#1A1A1A",
             accent: "#F7A3D3", accentDeep: "#E5559F" },
  crest: "crest.png",
  sponsor: null,
  potm: { sponsor: "", logo: "", icon: "⭐", ribbon: "NAYFC U11 PUMAS" },
  kitSponsor: null,
  kits: {
    yellow: { label: "Yellow", body: "#FFD200", trim: "#2235E8", ink: "#111111", band: "#2235E8", bandInk: "#FFFFFF" },
    blue:   { label: "Blue",   body: "#2235E8", trim: "#FFD200", ink: "#FFFFFF", band: "#FFD200", bandInk: "#111111" }
  },
  captain: "",

  hashtags: "#NAYFC #NewtonAycliffe #GirlsFootball",
  shortHashtags: "#NAYFC #GirlsFootball",
  cheer: "💙💛",
  storageKey: "nayfc-u11-pumas"
};

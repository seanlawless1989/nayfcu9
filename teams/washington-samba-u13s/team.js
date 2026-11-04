// Washington Athletic Samba FC, Under 13s boys (Washington Athletic Youth, set up 4 Nov 2026; club teams free as founding members).
// Lives in the NAYFC U9s Supabase project, schema washington_samba_u13s (tools/team_schema_sql.py). Crest and navy/red are
// Washington Athletic FC's (same as the Wolves); the coach can change crest and colours in Team setup.
self.TEAM = {
  name: "Washington Samba",                      // used in scores, commentary and posts
  shortName: "Samba",                            // the GOAL! flash
  fullName: "Washington Athletic Samba FC",
  abbr: "WAS",
  ageGroup: "Under 13s",
  ageShort: "U13s",
  players: "boys",
  tagline: "Boys Football",
  appName: "Washington Samba U13s",
  siteUrl: "https://touchlinetales.club/washington-samba-u13s/",
  club: { name: "Washington Athletic", url: "https://touchlinetales.club/washington-athletic/" },
  supportName: "Touchline Tales",

  league: "Russell Foster League",
  assistsFrom: "2026-27",
  format: "9v9",
  halfLength: 30,
  publicScores: true,                            // U13s: FA allows results to be published from U12
  poweredBy: true,

  colours: { club: "#27207A", clubDeep: "#18134D", clubInk: "#FFFFFF", gold: "#D2232A", goldInk: "#FFFFFF",
             accent: "#FFD23F", accentDeep: "#E0A800" },
  crest: "crest.png",
  sponsor: null,
  potm: { sponsor: "", logo: "", icon: "🏆", ribbon: "SAMBA U13s" },
  kitSponsor: null,
  kits: {
    home: { label: "Home", body: "#27207A", trim: "#D2232A", ink: "#FFFFFF", band: "#D2232A", bandInk: "#FFFFFF" }
  },
  captain: "",

  hashtags: "#WashingtonSamba #GrassrootsFootball",
  shortHashtags: "#WashingtonSamba",
  cheer: "⚽💃",
  storageKey: "washington-samba-u13s"
};

// Team settings: everything that makes this site Newton Aycliffe's rather than any other team's.
// Loaded by the page and the service worker. Change these to set the site up for another team. Logos sit next to this file in docs/.
self.TEAM = {
  name: "Newton Aycliffe",                       // used in scores, commentary and posts
  shortName: "Aycliffe",                         // the GOAL! flash
  fullName: "Newton Aycliffe Youth Football Club",
  abbr: "NAYFC",
  ageGroup: "Under 9s",
  ageShort: "U9s",
  players: "girls",                              // "the girls", "Come on girls!"; use "players", "boys" etc.
  tagline: "Youth Football Club · Girls",        // under the name in the masthead
  appName: "NAYFC U9s",                          // home-screen app name and calendar name
  siteUrl: "https://nayfootball.club",
  club: { name: "Newton Aycliffe", url: "https://touchlinetales.club/newton-aycliffe/" },   // "All Newton Aycliffe teams" link in the masthead
  supportName: "Sean",                           // who coaches message on matchday (Help page)

  league: "Russell Foster League",               // shown wherever a game's competition is "League"
  assistsFrom: "2026-27",                        // first season assists were recorded
  format: "5v5",                                 // 5v5, 7v7, 9v9 or 11v11: sets Live mode line-ups
  halfLength: 20,                                // minutes
  // Show scores, results and scorers to visitors? FA rules don't allow it for U7-U11, so each club chooses.
  // false: visitors and match alerts get games without scores; signed-in coaches still see everything.
  // Set the PUBLIC_SCORES secret on the edge functions to match.
  publicScores: true,                            // Newton Aycliffe chose to keep scores public (Oct 2026)
  poweredBy: true,                               // small "Powered by Touchline Tales" link in the footer; false hides it

  colours: { club: "#2235E8", clubDeep: "#16239E", clubInk: "#FFFFFF", gold: "#FFD200", goldInk: "#1A1A1A",
             accent: "#F7A3D3", accentDeep: "#E5559F" },   // accent = player of the match graphic background
  crest: "crest.png",

  // Main sponsor, shown in the sticker book and graphics captions. Set to null if there isn't one.
  sponsor: { name: "Grey-Smith Legal", logo: "gsl.png", mark: "gsl" },
  // Player of the match sponsor. Set sponsor and logo to "" to show plain "Player of the match".
  potm: { sponsor: "Coffey Coffee", logo: "coffey.jpg", icon: "☕", ribbon: "NAYFC U9 GIRLS" },
  // Shirt sponsor drawn on a kit that has sponsor: true. Set to null if there isn't one.
  kitSponsor: { name: "Octopus Energy", logo: "octopus.png", word: "octopus" },

  // Kits for the graphics maker (first one is the default).
  kits: {
    yellow: { label: "Yellow", body: "#FFD200", trim: "#2235E8", ink: "#111111", band: "#2235E8", bandInk: "#FFFFFF" },
    blue:   { label: "Blue",   body: "#2235E8", trim: "#FFD200", ink: "#FFFFFF", band: "#FFD200", bandInk: "#111111" },
    purple: { label: "Purple", body: "#4A1D7A", trim: "#F050F8", ink: "#FFFFFF", band: "#FFD200", bandInk: "#111111", sponsor: true }
  },
  captain: "Daisy",                              // default captain's armband in graphics

  hashtags: "#NAYFC #NewtonAycliffe #GirlsFootball",   // match posts
  shortHashtags: "#NAYFC #GirlsFootball",            // fixtures and milestone posts
  cheer: "💙💛",

  // Key prefix for things this site remembers on each phone. Keep it unchanged once a team is live.
  storageKey: "nayfc"
};

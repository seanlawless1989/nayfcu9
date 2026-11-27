#!/usr/bin/env python3
"""Build the public demo site (touchlinetales.club/demo/) from the current template.

    python3 tools/package_demo.py                 # writes dist/demo/
    python3 tools/package_demo.py --to ../touchlinetales-sites/demo
    python3 tools/package_demo.py --team demo-rugby --to ../touchlinetales-sites/demo-rugby
    python3 tools/package_demo.py --team demo-rugby-league --to ../touchlinetales-sites/demo-rugby-league
    python3 tools/package_demo.py --trial --to ../touchlinetales-sites/try

The demo is the made-up Sample Town Under 12s in teams/demo-site. It has no database: teams/demo-site/demo.js
answers the site's Supabase calls from a made-up season kept in the visitor's own browser tab, so visitors can
try everything (coach view included) and nothing is shared or saved anywhere.
The rugby demos (teams/demo-rugby, teams/demo-rugby-league) use the same demo.js with their own made-up season from
teams/demo-rugby/demo-season.js, and their own made-up database address so each demo keeps its data apart.
--trial builds the instant trial (touchlinetales.club/try/): the same demo with teams/demo-site/trial.js in front, which empties
the season and puts it in the visitor's own team name (typed on the home page or on the page's start card), keeps it on their phone,
and sends the start and "Make it my real site" to Touchline Tales through the website's /assets/signup-send.js.
Re-run this (all four builds) after every change to docs/ so the demos keep step with the real sites.
"""
import argparse, re, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import package_team as pt

TEAMS = pt.ROOT / "teams"
DEMO_JS = TEAMS / "demo-site" / "demo.js"
RUGBY_SEASON = TEAMS / "demo-rugby" / "demo-season.js"
CONFIG = """// The demo has no database: demo.js answers every call to this made-up address inside the visitor's browser.
window.TEAM_CONFIG = {
  supabaseUrl: "https://%s.supabase.co",
  supabaseAnonKey: "demo",
  vapidPublicKey: ""   // no match alerts in the demo
};
"""


TRIAL_JS = TEAMS / "demo-site" / "trial.js"


def build(out, team_dir=TEAMS / "demo-site", trial=False):
    team = pt.read_team(team_dir / "team.js")
    # the football demo keeps demo.supabase.co; another demo gets its own made-up address (and so its own coach sign-in)
    host = "trial" if trial else "demo" if team_dir.name == "demo-site" else team_dir.name
    season = team_dir / "demo-season.js"
    if not season.exists() and str(team.get("sport", "")).startswith("rugby"):
        season = RUGBY_SEASON
    if out.exists():
        shutil.rmtree(out)
    pt.build_site(team, team_dir, out, keep_badges=False)
    (out / "CNAME").unlink(missing_ok=True)
    (out / "config.js").write_text(CONFIG % host)
    shutil.copy(DEMO_JS, out / "demo.js")
    scripts = ["demo.js"]
    if trial:
        season = Path("/nonexistent")
        shutil.copy(TRIAL_JS, out / "trial.js")
        scripts.insert(0, "trial.js")
        # its own keys on the phone, so a trial never mixes with the demo; and no made-up team name in the page's first paint
        t = out / "team.js"
        s = t.read_text()
        for a, b in (('storageKey: "tt-demo"', 'storageKey: "tt-trial"'), ('siteUrl: "https://touchlinetales.club/demo"', 'siteUrl: "https://touchlinetales.club/try"')):
            if a not in s:
                sys.exit(f"team.js has changed: couldn't find {a}")
            s = s.replace(a, b)
        t.write_text(s)
        for f in ("index.html", "manifest.webmanifest"):
            p = out / f
            p.write_text(p.read_text().replace("Sample Town Junior Football Club Under 12s", "Your team's").replace("Sample Town Under 12s", "Your team")
                         .replace("Sample Town U12s", "My team").replace("Sample Town <em>Under 12s</em>", "Your team"))
    if season.exists():
        shutil.copy(season, out / "demo-season.js")
        scripts.insert(0, "demo-season.js")
    p = out / "index.html"
    s = p.read_text()
    # the trial sends its sign-ups the way every website form does, and offers paying where that's switched on
    extra = ["/assets/signup-send.js", "/assets/pay.js"] if trial else []
    tags = "".join(f'<script src="{f}"></script>\n' for f in extra + scripts)
    s, n = re.subn(r'(<script src="https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@[^"]+"></script>)',
                   lambda m: tags + m.group(1), s, count=1)
    if n != 1:
        sys.exit("index.html has changed: couldn't find the supabase-js script tag")
    # visitor counts (cookieless GoatCounter, set up in touchlinetales-sites/assets/stats.js): the demo only, never a team site
    s, n = re.subn(r'</head>', '<script src="/assets/stats.js" async></script>\n</head>', s, count=1)
    if n != 1:
        sys.exit("index.html has changed: couldn't find </head>")
    p.write_text(s)
    # the page shell is cached by the service worker, so demo.js has to be in it too
    w = out / "sw.js"
    s, n = re.subn(r'(const SHELL=\["\./","index\.html",)', lambda m: m.group(1) + "".join(f'"{f}",' for f in scripts), w.read_text(), count=1)
    if n != 1:
        sys.exit("sw.js has changed: couldn't find SHELL")
    w.write_text(s)
    for leak in ("elqwksyqwezhkekdqivn", "eyJhbGci", "Lawless"):
        for f in out.rglob("*"):
            if f.is_file() and f.suffix in (".js", ".html", ".webmanifest") and leak in f.read_text(errors="ignore"):
                print(f"Note: '{leak}' appears in {f.relative_to(out)}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--team", default="demo-site", help="the demo team's folder in teams/ (default demo-site, the football demo)")
    ap.add_argument("--trial", action="store_true", help="build the instant trial (/try/) instead of the demo team")
    ap.add_argument("--to", type=Path, help="folder to write the site into (replaced); default dist/demo, or dist/<team>")
    a = ap.parse_args()
    a.to = a.to or pt.ROOT / "dist" / ("try" if a.trial else "demo" if a.team == "demo-site" else a.team)
    build(a.to.resolve(), TEAMS / a.team, trial=a.trial)
    print(f"Built the demo in {a.to}")


if __name__ == "__main__":
    main()

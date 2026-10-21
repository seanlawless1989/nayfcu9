#!/usr/bin/env python3
"""Build the public demo site (touchlinetales.club/demo/) from the current template.

    python3 tools/package_demo.py                 # writes dist/demo/
    python3 tools/package_demo.py --to ../touchlinetales-sites/demo

The demo is the made-up Sample Town Under 12s in teams/demo-site. It has no database: teams/demo-site/demo.js
answers the site's Supabase calls from a made-up season kept in the visitor's own browser tab, so visitors can
try everything (coach view included) and nothing is shared or saved anywhere.
Re-run this after every change to docs/ so the demo keeps step with the real sites.
"""
import argparse, re, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import package_team as pt

TEAM_DIR = pt.ROOT / "teams" / "demo-site"
CONFIG = """// The demo has no database: demo.js answers every call to this made-up address inside the visitor's browser.
window.TEAM_CONFIG = {
  supabaseUrl: "https://demo.supabase.co",
  supabaseAnonKey: "demo",
  vapidPublicKey: ""   // no match alerts in the demo
};
"""


def build(out):
    team = pt.read_team(TEAM_DIR / "team.js")
    if out.exists():
        shutil.rmtree(out)
    pt.build_site(team, TEAM_DIR, out, keep_badges=False)
    (out / "CNAME").unlink(missing_ok=True)
    (out / "config.js").write_text(CONFIG)
    shutil.copy(TEAM_DIR / "demo.js", out / "demo.js")
    p = out / "index.html"
    s = p.read_text()
    s, n = re.subn(r'(<script src="https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@[^"]+"></script>)',
                   r'<script src="demo.js"></script>\n\1', s, count=1)
    if n != 1:
        sys.exit("index.html has changed: couldn't find the supabase-js script tag")
    p.write_text(s)
    # the page shell is cached by the service worker, so demo.js has to be in it too
    w = out / "sw.js"
    s, n = re.subn(r'(const SHELL=\["\./","index\.html",)', r'\1"demo.js",', w.read_text(), count=1)
    if n != 1:
        sys.exit("sw.js has changed: couldn't find SHELL")
    w.write_text(s)
    for leak in ("elqwksyqwezhkekdqivn", "eyJhbGci", "Lawless"):
        for f in out.rglob("*"):
            if f.is_file() and f.suffix in (".js", ".html", ".webmanifest") and leak in f.read_text(errors="ignore"):
                print(f"Note: '{leak}' appears in {f.relative_to(out)}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--to", type=Path, default=pt.ROOT / "dist" / "demo", help="folder to write the site into (replaced)")
    a = ap.parse_args()
    build(a.to.resolve())
    print(f"Built the demo in {a.to}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build a club landing page that links to each of the club's team sites.

    python3 tools/package_club.py clubs/demo        # folder holding club.json and the crest

club.json: name, short, crest, colours {club, clubDeep, ink, second}, intro, contact, siteUrl, and teams
[{name, url, note, group}] in the order they should show (a team with no url shows as "coming soon";
a new "group", e.g. "Girls", starts a heading).
Give each team's team.js  club: {name: "<short>", url: "<siteUrl>"}  so its site links back here.
Output goes to dist/club-<slug>/: index.html and the crest, ready for GitHub Pages or any static host.
The page is kept out of search engines like the team sites; set "index": true in club.json to allow it.
"""
import html, json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def esc(t):
    return html.escape(str(t or ""), quote=True)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1]).resolve()
    club = json.loads((src / "club.json").read_text())
    slug = re.sub(r"[^a-z0-9]+", "-", club.get("short", club["name"]).lower()).strip("-")
    out = ROOT / "dist" / f"club-{slug}"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    crest = club.get("crest") or "crest.png"
    shutil.copy(src / crest, out / crest)
    c = club.get("colours") or {}
    club_c, deep, ink, second = c.get("club", "#13804A"), c.get("clubDeep", c.get("club", "#0E2A1D")), c.get("ink", "#FFFFFF"), c.get("second", "#F2C230")
    cards, group = [], None
    for t in club.get("teams", []):
        if t.get("group") and t["group"] != group:
            group = t["group"]
            cards.append(f"<h2>{esc(group)}</h2>")
        url = t.get("url") or ""
        if url and not re.match(r"^https?://", url):
            sys.exit(f"Team {t.get('name')}: url must start with https://")
        inner = f'<b>{esc(t["name"])}</b><span>{esc(t.get("note") or ("Fixtures, results and match alerts" if url else "Site coming soon"))}</span>'
        cards.append(f'<a class="team" href="{esc(url)}">{inner}<i>→</i></a>' if url else f'<div class="team soon">{inner}</div>')
    robots = "" if club.get("index") else '<meta name="robots" content="noindex,nofollow,noimageindex,noarchive,nosnippet">\n'
    page = f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
{robots}<meta name="description" content="{esc(club['name'])}: every team's website">
<meta name="theme-color" content="{esc(club_c)}">
<title>{esc(club['name'])}</title>
<link rel="icon" href="{esc(crest)}">
<style>
:root{{--club:{club_c};--deep:{deep};--ink:{ink};--second:{second};--bg:#F3F5F4;--card:#fff;--text:#14201A;--muted:#5B6A62}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}}
header{{background:linear-gradient(150deg,var(--club),var(--deep));color:var(--ink);padding:32px 16px 40px;text-align:center}}
header img{{width:110px;height:110px;object-fit:contain;background:#fff;border-radius:50%;padding:6px;border:3px solid var(--second)}}
h1{{font:800 clamp(26px,6vw,40px)/1.15 system-ui,sans-serif;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.02em}}
header p{{max-width:560px;margin:0 auto;opacity:.92}}
main{{max-width:760px;margin:-22px auto 40px;padding:0 16px;display:grid;gap:12px}}
.team{{display:flex;align-items:center;gap:12px;background:var(--card);border-radius:14px;padding:16px 18px;text-decoration:none;color:inherit;box-shadow:0 1px 3px rgb(0 0 0 / .08);border-left:6px solid var(--club)}}
.team b{{font-size:18px;flex:0 0 auto}}.team span{{color:var(--muted);flex:1;font-size:14px}}.team i{{font-style:normal;font-size:22px;color:var(--club)}}
a.team:hover,a.team:focus-visible{{outline:3px solid var(--second);outline-offset:2px}}.team.soon{{opacity:.6;border-left-color:#ccc}}
@media(max-width:520px){{.team{{flex-wrap:wrap}}.team span{{flex-basis:100%;order:3}}}}
h2{{font:800 15px/1.2 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:14px 4px 0}}main h2:first-child{{margin-top:34px}}
footer{{text-align:center;color:var(--muted);font-size:13px;padding:0 16px 32px}}
</style>
</head>
<body>
<header><img src="{esc(crest)}" alt=""><h1>{esc(club['name'])}</h1>{f"<p>{esc(club['intro'])}</p>" if club.get("intro") else ""}</header>
<main>
{chr(10).join(cards)}
</main>
<footer>{esc(club.get("contact") or "")}<br>Team websites use first names only and are kept out of search engines.</footer>
</body>
</html>
"""
    (out / "index.html").write_text(page)
    print(f"Built {out}")


if __name__ == "__main__":
    main()

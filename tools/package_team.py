#!/usr/bin/env python3
"""Build a ready-to-host copy of the site for another team.

    python3 tools/package_team.py teams/demo            # folder holding team.js and the team's logos
    python3 tools/package_team.py teams/demo --zip      # also make <slug>.zip next to the output folder

The team folder needs team.js (copy docs/team.js and change it) and every logo it names
(crest, sponsor, player-of-the-match and shirt-sponsor logos). Optional: badges/ with opponent
logos, and badges.json mapping a cleaned opponent name to a badge file (see BADGE_FILES in index.html).

Output goes to dist/<slug>/:
    site/       upload to the team's GitHub repository as docs/ (or any static host)
    supabase/   setup.sql for a fresh Supabase project, plus the two edge functions
    SETUP.md    the steps, filled in for this team
Nothing here touches Newton Aycliffe's site or database.
"""
import argparse, json, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS, SQL = ROOT / "docs", ROOT / "supabase"
# Newton Aycliffe's own files that never go into another team's copy
NAYFC_ONLY = {"CNAME", "config.js", "team.js", "crest.png", "gsl.png", "coffey.jpg", "octopus.png",
              "icon-192.png", "icon-512.png", "apple-touch-icon.png", "manifest.webmanifest"}
NAYFC_DIRS = {"manager", "badges"}


def read_team(path):
    """team.js is a JavaScript object literal; node turns it into JSON so we read exactly what the browser reads."""
    js = f"global.self=global;require({json.dumps(str(path))});process.stdout.write(JSON.stringify(self.TEAM))"
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True)
    if out.returncode:
        sys.exit(f"Couldn't read {path}:\n{out.stderr}")
    return json.loads(out.stdout)


def slugify(t):
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def logos(team):
    names = [team.get("crest") or "crest.png"]
    for k in ("sponsor", "potm", "kitSponsor"):
        if team.get(k) and team[k].get("logo"):
            names.append(team[k]["logo"])
    return list(dict.fromkeys(names))


def make_icons(crest, site, colour):
    from PIL import Image
    im = Image.open(crest).convert("RGBA")
    for size, name, pad in ((192, "icon-192.png", .08), (512, "icon-512.png", .08), (180, "apple-touch-icon.png", .1)):
        bg = Image.new("RGBA", (size, size), colour)
        inner = int(size * (1 - 2 * pad))
        c = im.copy()
        c.thumbnail((inner, inner), Image.LANCZOS)
        bg.alpha_composite(c, ((size - c.width) // 2, (size - c.height) // 2))
        bg.convert("RGB").save(site / name)


def build_site(team, src, site, keep_badges):
    shutil.copytree(DOCS, site, ignore=lambda d, names: [n for n in names if Path(d) == DOCS and (n in NAYFC_ONLY or n in NAYFC_DIRS)])
    shutil.copy(src / "team.js", site / "team.js")
    for name in logos(team):
        f = src / name
        if not f.exists():
            sys.exit(f"team.js names {name}, but {f} is missing")
        shutil.copy(f, site / name)

    colour = (team.get("colours") or {}).get("club", "#2235E8")
    make_icons(src / (team.get("crest") or "crest.png"), site, colour)
    title = f"{team['name']} {team.get('ageGroup', '')}".strip()
    (site / "manifest.webmanifest").write_text(json.dumps({
        "name": title, "short_name": team.get("appName", title), "start_url": "./", "scope": "./", "display": "standalone",
        "background_color": colour, "theme_color": colour,
        "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                  {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                  {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}, indent=2) + "\n")
    (site / "config.js").write_text(
        "// Supabase project details (Project Settings > API). The anon key is meant to be public;\n"
        "// the database rules decide who can change data.\n"
        "window.TEAM_CONFIG = {\n  supabaseUrl: \"https://YOUR-PROJECT.supabase.co\",\n  supabaseAnonKey: \"YOUR-ANON-KEY\",\n"
        "  // Public half of the match-alerts key pair (npx web-push generate-vapid-keys). The private half goes in the push_keys table.\n"
        "  vapidPublicKey: \"YOUR-VAPID-PUBLIC-KEY\"\n};\n")
    site_url = (team.get("siteUrl") or "").rstrip("/")
    host = re.sub(r"^https?://", "", site_url)
    if host and not host.endswith("github.io") and "/" not in host:
        (site / "CNAME").write_text(host + "\n")

    # The page's static head is what link previews (WhatsApp, Facebook) read, so write the team in.
    p = site / "index.html"
    s = p.read_text()
    age = team.get("ageGroup", "")
    swaps = [
        (r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{team.get("fullName", team["name"])} {age} results and stats">'),
        (r"<title>[^<]*</title>", f"<title>{title}</title>"),
        (r'<meta name="apple-mobile-web-app-title" content="[^"]*">', f'<meta name="apple-mobile-web-app-title" content="{team.get("appName", title)}">'),
        (r'<meta name="theme-color" content="[^"]*">', f'<meta name="theme-color" content="{colour}">'),
        (r'<h1 id="teamTitle">.*?</h1>', f'<h1 id="teamTitle">{team["name"]} <em>{age}</em></h1>'),
        (r'<p id="teamTagline">.*?</p>', f'<p id="teamTagline">{team.get("tagline", "")}</p>'),
        (r'(<img class="crest" src=")crest\.png(")', r"\g<1>" + (team.get("crest") or "crest.png") + r"\2"),
        (r'(<link rel="icon" href=")crest\.png(")', r"\g<1>" + (team.get("crest") or "crest.png") + r"\2"),
    ]
    for pat, rep in swaps:
        s, n = re.subn(pat, rep, s, count=1, flags=re.S)
        if n != 1:
            sys.exit(f"index.html has changed: couldn't find {pat}")

    # Opponent badges: Newton Aycliffe's North East set only if asked, or the team's own.
    badge_map = {}
    if keep_badges:
        shutil.copytree(DOCS / "badges", site / "badges")
        badge_map = None
    elif (src / "badges").is_dir():
        shutil.copytree(src / "badges", site / "badges")
        badge_map = json.loads((src / "badges.json").read_text()) if (src / "badges.json").exists() else {}
    if badge_map is not None:
        s, n = re.subn(r"const BADGE_FILES=\{.*?\};", "const BADGE_FILES=" + json.dumps(badge_map) + ";", s, count=1, flags=re.S)
        if n != 1:
            sys.exit("index.html has changed: couldn't find BADGE_FILES")
    p.write_text(s)


def build_sql(team, out):
    parts = []
    for name in ("1_schema.sql", "3_notifications.sql", "4_gallery_training.sql", "5_help_requests.sql"):
        s = (SQL / name).read_text()
        s = s.replace("-- Newton Aycliffe U9s: ", f"-- {team['name']} {team.get('ageShort', '')}: ")
        if name == "3_notifications.sql":
            s = re.sub(r"https://[a-z0-9]+\.supabase\.co/functions/v1/notify", "https://YOUR-PROJECT.supabase.co/functions/v1/notify", s)
            s = re.sub(r"'Bearer eyJ[^']+'", "'Bearer YOUR-ANON-KEY'", s)
            s = s.replace("'nayfc-notify'", f"'{team.get('storageKey', 'team')}-notify'")
        if name == "4_gallery_training.sql":
            s = re.sub(r"insert into public\.training \(id, day.*?on conflict \(id\) do nothing;\n",
                       "insert into public.training (id) values (1) on conflict (id) do nothing;   -- coaches fill this in on the Training page\n", s, flags=re.S)
        parts.append(f"-- ===================== {name} =====================\n" + s)
    sql = "\n".join(parts)
    for bad in ("elqwksyqwezhkekdqivn", "eyJhbGci", "Greenfield"):
        if bad in sql:
            sys.exit(f"Newton Aycliffe detail '{bad}' leaked into setup.sql")
    (out / "supabase").mkdir()
    (out / "supabase" / "setup.sql").write_text(sql)
    shutil.copytree(SQL / "functions", out / "supabase" / "functions")


SETUP = """# Setting up {title}

This folder is a complete copy of the team site for **{full}**, made from the Newton Aycliffe U9s site.
Allow about an hour. Do the steps in order.

## 1. Database (Supabase)
1. At supabase.com, create a project in the **London** region. Name it `{slug}`.
2. **Database > Extensions**: turn on `pg_cron` and `pg_net`.
3. Open `supabase/setup.sql`. Replace `coach@example.com` with the first coach's email (lower case),
   and `YOUR-PROJECT` and `YOUR-ANON-KEY` with the values from **Project Settings > API**. Paste it all into the
   **SQL Editor** and run it.
4. Make the match-alerts keys: `npx web-push generate-vapid-keys`. Run
   `insert into public.push_keys (public_key, private_key) values ('<public>', '<private>');` in the SQL Editor.
   Keep the private key out of every file you upload.

## 2. Edge functions (match alerts and calendar)
With the Supabase CLI (`supabase link --project-ref <ref>`):
```
supabase secrets set SITE_URL={site}/ TEAM_NAME="{name}" APP_NAME="{app}" TEAM_FULL_NAME="{full}" AGE_GROUP="{age}" PUBLIC_SCORES={scores}
supabase functions deploy notify
supabase functions deploy calendar --no-verify-jwt
```

## 3. Sign-in
**Authentication > URL Configuration**: Site URL `{site}`, and the same under Redirect URLs.
Turn on custom SMTP (**Authentication > Emails**) with a sending service; Supabase's built-in email only sends a few an hour.

## 4. The website
1. Create a GitHub repository and upload everything in `site/` into a `docs` folder.
2. Edit `docs/config.js` with the project URL, anon key and the public VAPID key.
3. **Settings > Pages**: deploy from `main`, `/docs`.{cname}
4. Open `{site}/?coach`, tap **Coach sign in**, and sign in with the coach email from step 1.3.

## 5. Before the team uses it
- Add the squad (first names only) on the Squad page, then fixtures.
- Add more coaches with one insert each: `insert into public.coaches (email) values ('name@example.com');`
- The club's welfare officer should agree what's public. Player photos stay coach-only until the club records
  each parent's consent; the gallery bucket is public, so only upload photos the club has consent for.
- Sign the data processing agreement with the club before any children's details go in.

Settings used for this build: format {format}, halves of {half} minutes, league "{league}".

{scores_note}
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("team_dir", type=Path)
    ap.add_argument("--out", type=Path, default=ROOT / "dist")
    ap.add_argument("--keep-badges", action="store_true", help="include Newton Aycliffe's North East opponent badges")
    ap.add_argument("--zip", action="store_true")
    a = ap.parse_args()
    src = a.team_dir.resolve()
    team = read_team(src / "team.js")
    for k in ("name", "ageGroup", "siteUrl", "storageKey"):
        if not team.get(k):
            sys.exit(f"team.js needs a {k}")
    if "publicScores" not in team:
        sys.exit("team.js needs publicScores: true or false (the club's choice; see docs/team.js)")
    ages = [int(n) for n in re.findall(r"\d+", team["ageGroup"])]
    young = bool(ages) and 7 <= ages[0] <= 11
    if team["publicScores"] and young:
        print(f"Note: {team['ageGroup']} with publicScores on. FA rules don't allow U7-U11 scores, results or scorers "
              "to be published; make sure the club has chosen this.", file=sys.stderr)
    if team["storageKey"] == "nayfc" and team["name"] != "Newton Aycliffe":
        sys.exit("Give this team its own storageKey in team.js")
    slug = slugify(f"{team['name']} {team.get('ageShort', '')}")
    out = a.out / slug
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    build_site(team, src, out / "site", a.keep_badges)
    build_sql(team, out)
    site = team["siteUrl"].rstrip("/")
    host = re.sub(r"^https?://", "", site)
    (out / "SETUP.md").write_text(SETUP.format(
        title=f"{team['name']} {team.get('ageGroup', '')}".strip(), full=team.get("fullName", team["name"]), slug=slug, site=site,
        name=team["name"], app=team.get("appName", ""), age=team.get("ageGroup", ""), format=team.get("format", "5v5"),
        half=team.get("halfLength", 20), league=team.get("league", "League"),
        scores="true" if team["publicScores"] else "false",
        scores_note=("Scores are **public**: visitors see results, scorers and goal alerts."
                     + (" FA rules don't allow this for U7 to U11 teams, so the club has chosen to take that on." if young else ""))
                    if team["publicScores"] else
                    "Scores are **hidden** from visitors (FA rules for U7 to U11): the public site, match alerts and calendar show "
                    "games, line-ups and awards without scores or scorers. Signed-in coaches still see and record everything. "
                    "To change it, set publicScores in docs/team.js and the PUBLIC_SCORES secret.",
        cname="" if host.endswith("github.io") else f"\n   Custom domain: `{host}` (the CNAME file is included; point the domain's DNS at GitHub Pages)."))
    if a.zip:
        shutil.make_archive(str(out), "zip", out)
        print(f"Built {out} and {out}.zip")
    else:
        print(f"Built {out}")


if __name__ == "__main__":
    main()

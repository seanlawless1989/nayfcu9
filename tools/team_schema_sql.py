#!/usr/bin/env python3
"""Database setup for a team that shares another team's Supabase project, in its own schema.

    python3 tools/team_schema_sql.py darlington_u14s            # writes dist/schemas/darlington_u14s.sql
    python3 tools/team_schema_sql.py darlington_u14s --coach peter@example.com

The free Supabase plan runs two projects at a time and each paid project costs extra, so several teams can live in
one project: the project's own team in `public`, every other team in a schema of its own with exactly the same
tables, rules and functions. Each team's coaches can only change their own team's data.

The output is the usual setup (the same files package_team.py uses) with every `public.` moved to the team's schema.
Left out, because the project already has one shared copy: the coaches-only sign-up check on auth.users (it looks in
every team's coaches list, see 10_parent_login.sql), the every-minute match-alerts job (the project's one job covers
every team schema), and anything marked "[project only]".

Match alerts for a team here: the notify function sends them using the project's key pair, so put the project's
vapidPublicKey in the team's config.js, and fill in the team's alert_team row (name, ageGroup, publicScores...).

After running it in the SQL Editor:
  1. Project Settings > Data API > Exposed schemas: add the schema, then Save.
  2. In the team's config.js: the project's URL and anon key, plus  schema: "<schema>".
  3. Authentication > URL Configuration > Redirect URLs: add the team's site address.
For a change to an existing team, --only 16_availability_alerts.sql (for example) makes just that file.
Re-running it behaves like re-running the files it is made from.
"""
import argparse, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / "supabase"
FILES = ("1_schema.sql", "3_notifications.sql", "4_gallery_training.sql", "5_help_requests.sql", "6_match_updated.sql",
         "7_team_setup.sql", "8_multi_day_tournaments.sql", "9_matchday_and_more.sql", "10_parent_login.sql", "11_rugby.sql",
         "12_preview_alert.sql", "13_cheers.sql", "14_tournament_teams.sql", "15_tournament_squad.sql",
         "16_availability_alerts.sql", "17_sponsors.sql", "18_player_ratings.sql", "19_kit_sizes.sql")
PROJECT_ONLY = re.compile(r"-- \[project only\].*?-- \[end project only\]\n", re.S)
SIGN_UP_CHECK = re.compile(r"create or replace function public\.only_coaches_can_sign_up\(\).*?end \$\$;\n"
                           r"revoke execute on function public\.only_coaches_can_sign_up\(\) from public, anon, authenticated;\n", re.S)
SIGN_UP_TRIGGER = ("drop trigger if exists only_coaches_can_sign_up on auth.users;\n"
                   "create trigger only_coaches_can_sign_up before insert on auth.users\n"
                   "  for each row execute function public.only_coaches_can_sign_up();\n")


def header(schema):
    # the same rights Supabase gives the public schema, so the setup files behave exactly as they do there
    return f"""-- Team schema {schema}: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists {schema};
grant usage on schema {schema} to anon, authenticated, service_role;
alter default privileges for role postgres in schema {schema} grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema {schema} grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema {schema} grant all on functions to anon, authenticated, service_role;
"""


def build(schema, coach=None, only=None):
    parts = [header(schema)]
    for name in (only or FILES):
        s = (SQL / name).read_text()
        n = len(SIGN_UP_CHECK.findall(s))
        if name in ("1_schema.sql", "10_parent_login.sql"):
            s = SIGN_UP_CHECK.sub("", s)
            if n != 1:
                sys.exit(f"{name} has changed: couldn't find the sign-up check")
        s = s.replace(SIGN_UP_TRIGGER, "")
        if name == "1_schema.sql":
            s = re.sub(r"insert into public\.coaches \(email\) values \('coach@example\.com'\) on conflict do nothing;\n",
                       f"insert into public.coaches (email) values ('{coach.lower()}') on conflict do nothing;\n" if coach else "", s)
        if name == "3_notifications.sql":
            s, k = re.subn(r"\n-- Every minute: send kick-off reminders.*?\$cron\$\);\n", "\n", s, flags=re.S)
            if k != 1:
                sys.exit("3_notifications.sql has changed: couldn't find the match-alerts job")
        if name == "4_gallery_training.sql":
            s = re.sub(r"insert into public\.training \(id, day.*?on conflict \(id\) do nothing;\n",
                       "insert into public.training (id) values (1) on conflict (id) do nothing;   -- coaches fill this in on the Training page\n", s, flags=re.S)
            # a bucket of the team's own; the site uses <schema>-gallery (galBucket() in app.js)
            s = s.replace("'gallery'", f"'{schema}-gallery'")
            s = re.sub(r'"(coaches (?:upload|see|delete) gallery)"', rf'"{schema} \1"', s)
        s = PROJECT_ONLY.sub("", s)   # shared by the whole project, lives in public only
        if name == "7_team_setup.sql":
            s += "\ninsert into public.team_settings (id, ready) values (1, false) on conflict (id) do nothing;\n"
        s = s.replace("public.", f"{schema}.").replace("search_path = public", f"search_path = {schema}")
        parts.append(f"-- ===================== {name} =====================\n" + s)
    sql = "\n".join(parts)
    for bad in ("elqwksyqwezhkekdqivn", "eyJhbGci", "Greenfield", "insert on auth.users", "only_coaches_can_sign_up", "cron.schedule"):
        if bad in sql:
            sys.exit(f"'{bad}' leaked into the {schema} setup")
    return sql


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("schema", help="lower case letters, numbers and _, e.g. darlington_u14s")
    ap.add_argument("--coach", help="first coach's email")
    ap.add_argument("--only", nargs="+", metavar="FILE", help="just these numbered files (an update for an existing team), e.g. 16_availability_alerts.sql")
    a = ap.parse_args()
    if a.only and not set(a.only) <= set(FILES):
        sys.exit(f"--only takes files from: {', '.join(FILES)}")
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,40}", a.schema) or a.schema in ("public", "auth", "storage", "extensions"):
        sys.exit("The schema name must be lower case letters, numbers and _, and not one of Supabase's own")
    out = ROOT / "dist" / "schemas" / (f"{a.schema}_{'_'.join(f.split('_')[0] for f in a.only)}.sql" if a.only else f"{a.schema}.sql")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(a.schema, a.coach, a.only))
    print(out)


if __name__ == "__main__":
    main()

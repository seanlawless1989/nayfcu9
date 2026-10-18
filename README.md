# Newton Aycliffe Under 9s website

This repository is the club's results, stats and matchday graphics site. It runs on two free services:

- **Supabase** keeps the results and handles coach sign-in.
- **GitHub Pages** hosts the web pages, from the `docs` folder.

Parents can see results and stats without signing in. Only coaches on the list can add matches, edit the squad or use the graphics maker.

## 1. Set up the database (Supabase)

1. Go to supabase.com, sign up, and click **New project**. Name it `nayfc-u9s`, choose the London region, and save the database password somewhere safe.
2. Open **SQL Editor** and click **New query**.
3. Open `supabase/1_schema.sql`. Check the coach email on its last line, add a line for each other coach, paste the whole file in and click **Run**.
4. Start another new query, paste in all of `supabase/2_season_data.sql` and click **Run**. This loads last season and this season so far.

## 2. Connect the site to the database

1. In Supabase, go to **Project Settings**, then **API**.
2. Copy the **Project URL** and the **anon public** key.
3. On GitHub, open `docs/config.js`, click the pencil icon, paste them between the quotes, and click **Commit changes**. The site updates a minute or two later.

## 3. The site on GitHub Pages

The web pages are in the `docs` folder. GitHub Pages serves them at https://seanlawless1989.github.io/nayfcu9/

If the site isn't showing, go to the repository's **Settings**, then **Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/docs`, and click **Save**.

## 4. Let sign-in links come back to the site

1. In Supabase, go to **Authentication**, then **URL Configuration**.
2. Set **Site URL** to https://seanlawless1989.github.io/nayfcu9/
3. Add the same address under **Redirect URLs**.

Then open the site with `?coach` on the end (https://seanlawless1989.github.io/nayfcu9/?coach), tap **Coach sign in**, enter your email, and click the link in the email you're sent.

## Adding coaches later

In Supabase, open **Table Editor**, then **coaches**, click **Insert row** and type their email in lower case.

## Updating the site

Any change committed to the `docs` folder goes live a minute or two later. Your results stay in Supabase and aren't affected.

## Children's details

The public pages show players' first names, goals and awards. Check that parents have agreed to this, in line with the club's safeguarding and photo policy. To make the whole site coaches-only, open `supabase/1_schema.sql`, follow the note above the "read players" and "read matches" rules, and run those lines again.

## The U9s Manager game

`docs/manager` holds Aycliffe U9s Manager, a Football Manager style game for the squad. It lives at https://seanlawless1989.github.io/nayfcu9/manager/ and can be installed from the browser: in Safari use **Share → Add to Home Screen**, or in Chrome use **Install app**. Games save on each device. To move a game to another device, use the backup code under **Home → Your game**.

The game is built from a single source file elsewhere and copied in here. To update it, replace the files in `docs/manager` with the new build.


## Team settings (`docs/team.js`)

Everything that makes this site Newton Aycliffe's lives in `docs/team.js`: the name, age group, colours, crest, sponsors, kits, league name, match format (5v5, 7v7, 9v9 or 11v11), half length and hashtags. Change a value there and the whole site, the graphics maker and the sticker book follow it.

`publicScores` is each club's choice. FA rules don't allow U7 to U11 scores, results or scorers to be published, so with `publicScores: false` visitors see games, line-ups, appearances and awards without scores, and match alerts and the calendar leave scores out (set the `PUBLIC_SCORES=false` secret on the edge functions too). Match alerts name the player of the match sponsor from the `POTM_SPONSOR` (and `POTM_ICON`) secret, which should match `potm` in `team.js`; `POTM_SPONSOR=none` sends a plain "Player of the Match". Signed-in coaches still see and record everything. Newton Aycliffe has it on. Coach-written match reports are shown as written, and the database itself is still readable, so it hides scores from the site rather than locking them away.

## Help and changes

Coaches can send fixes, change requests and questions from **Help and changes** on the home page (coach tiles). Requests are stored in the `help_requests` table (`supabase/5_help_requests.sql`). A scheduled Claude task checks for new ones every hour from 7am to 10pm. It makes small data fixes itself, opens a pull request for code changes (never merging them), and writes its answer back so the coach sees it on the same page. Anything big, unclear or destructive is left waiting for Sean.

## Making a copy for another team

1. Copy `teams/demo` to `teams/<team-name>`, then edit `team.js` and swap in the team's crest and logos.
2. Run `python3 tools/package_team.py teams/<team-name> --zip` (needs Node and Python with Pillow).
3. Everything is written to `dist/<team-name>/`: `site/` is the website, `supabase/setup.sql` and the functions set up a fresh database, and `SETUP.md` lists the steps filled in for that team.

The copy leaves out Newton Aycliffe's data, logos, opponent badges, domain and the U9s Manager game. Add `--keep-badges` to include the North East opponent badges.

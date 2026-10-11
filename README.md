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

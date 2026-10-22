# Team folders

Each folder here holds one team's `team.js` and the logos it names. `demo` is a made-up team (Sample Town Under 11s, 7v7) used to show the packaged site. See "Making a copy for another team" in the main README. `demo-site` is Sample Town Under 12s, the public demo at touchlinetales.club/demo/ (see `tools/package_demo.py`).

`demo-rugby` (Sample Town Under 14s, rugby union 15s) and `demo-rugby-league` (Sample Town Under 13s, rugby league 13s) are the public rugby demos at touchlinetales.club/demo-rugby/ and /demo-rugby-league/. Both use the made-up season in `demo-rugby/demo-season.js`; build them with `python3 tools/package_demo.py --team demo-rugby` (or `demo-rugby-league`).

## Sport

`sport` in team.js is `"football"` (the default when it's missing), `"rugby-union"` or `"rugby-league"`. Rugby teams record tries and kicks instead of goals and assists, have no goalkeeper, and get rugby line-ups, a sin bin and rugby wording everywhere. `format` is the team size: union `"15s"`, `"13s"`, `"12s"`, `"10s"` down to `"4s"`; league `"13s"`, `"11s"`, `"9s"`, `"7s"`, `"6s"`. Which kicks count follows the age group (England Rugby and RFL junior rules); set `kicks: ["con"]` (or `[]`, or `["con","pen","drop"]`) to override. `sinBinMins` overrides the 10-minute sin bin.

# The Touchline Tales app (App Store and Google Play)

One app, "Touchline Tales", for every team. It is a native shell (Capacitor 8) around the team sites on
touchlinetales.club, so a change to the sites reaches the app straight away with no new app release.

- It opens **touchlinetales.club/app/** (in touchlinetales-sites), where a parent types the team code from their coach,
  or pastes the team's link. Codes are in the private list `/mnt/project-files/touchline-tales/app-store/team_codes.csv`;
  `tools/app_codes.py` in touchlinetales-sites turns it into `app/codes.json`. The code `DEMO` opens Sample Town.
- After that the app goes straight to the last team. **Switch team** at the bottom of every team page goes back to the
  list. Teams are never listed or searchable, so nobody can browse children's teams.
- **Match alerts** in the app use Firebase Cloud Messaging (FCM, which also delivers to iPhones through Apple), because
  web push doesn't work inside an app. The page saves the phone's FCM token in `push_subs` as `app:fcm:<token>`
  (`supabase/45_app_push.sql`), and the `notify` edge function sends those through FCM. Everything else about alerts
  (choices, family codes, test alert) is the same code as the website.
- The pitch fundraiser's "buy a square" is hidden for parents in the app, because Apple and Google only allow
  donations in apps for registered charities. Coaches still see it; supporters buy on the website.
- Bundle ID / application ID: `club.touchlinetales.app`. iPhone and iPad, portrait and landscape.

## What's where

| | |
|---|---|
| `capacitor.config.json` | app name and ID, the start address, splash colour |
| `www/` | only the "No connection" page and the icon it shows (the app loads everything else from the website) |
| `assets/` | the icon and splash source images; `npm run assets` remakes every size |
| `ios/` | the Xcode project (`ios/App/App.xcodeproj`) |
| `android/` | the Android Studio project |
| `../.github/workflows/app-android.yml` | builds the Google Play `.aab` in GitHub Actions |
| `../.github/workflows/app-ios.yml` | builds the iPhone app in GitHub Actions and uploads it to TestFlight (no Mac needed) |

## One-off setup (Sean)

1. **Firebase** (free): console.firebase.google.com > Add project "Touchline Tales" (no Google Analytics).
   - Add an **Android app**, package `club.touchlinetales.app`. Download `google-services.json`.
   - Add an **iOS app**, bundle ID `club.touchlinetales.app`. Download `GoogleService-Info.plist`.
   - Project settings > Cloud Messaging > Apple app configuration: upload the **APNs key** (.p8) from
     developer.apple.com > Keys (tick "Apple Push Notifications service"), with its Key ID and your Team ID.
   - Project settings > Service accounts > **Generate new private key**. Put the whole JSON file in Supabase as the
     edge function secret `FCM_SERVICE_ACCOUNT` (Edge Functions > Secrets) on every project that runs `notify`,
     then redeploy `notify`.
2. **GitHub secrets** (nayfcu9 > Settings > Secrets and variables > Actions):
   `GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICE_INFO_PLIST` (paste each file's contents),
   `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_B64` (App Store Connect > Users and Access >
   Integrations > App Store Connect API, role Admin; base64 the .p8 file),
   and for Android signing `TT_UPLOAD_KEYSTORE_B64`, `TT_UPLOAD_KEYSTORE_PASSWORD`, `TT_UPLOAD_KEY_ALIAS`,
   `TT_UPLOAD_KEY_PASSWORD` (make the key once:
   `keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`, keep it safe:
   Play App Signing holds the real signing key, this one only uploads).
3. **SQL**: run `supabase/45_app_push.sql` on every team's database (schemas:
   `python3 tools/team_schema_sql.py <schema> --only 45_app_push.sql`).

## Building a release

- **Android:** Actions > "Build the Android app" > Run workflow, with a version code one higher than last time.
  Download the `.aab` from the run and upload it in Play Console (Testing > Closed testing first).
- **iPhone:** Actions > "Build the iPhone app" > Run workflow, with a build number one higher than last time. It
  appears in App Store Connect > TestFlight after Apple's processing (about 15 minutes).
- On a Mac instead: `cd app && npm ci && npx cap sync`, then `npx cap open ios` (Product > Archive) or
  `npx cap open android` (Build > Generate Signed App Bundle). Put `GoogleService-Info.plist` in `www/` and
  `google-services.json` in `android/app/` first; both are left out of git.

Website changes never need a new build. A new build is only needed for changes in this folder (native settings,
plugins, icon, the offline page).

## Team links opening the app

Once the app is live, two files on touchlinetales.club make team links open the app instead of the browser. They
need IDs that only exist after the store accounts are set up, so they aren't there yet:

- `.well-known/apple-app-site-association` (no file extension, served as JSON):
  `{"applinks":{"details":[{"appIDs":["<TEAMID>.club.touchlinetales.app"],"components":[{"/":"/app/*"},{"/":"/*/","exclude":false}]}]}}`
- `.well-known/assetlinks.json`: the SHA-256 fingerprint from Play Console > Setup > App signing,
  `[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"club.touchlinetales.app","sha256_cert_fingerprints":["<FINGERPRINT>"]}}]`

touchlinetales-sites already has `.nojekyll`, so GitHub Pages serves `.well-known/`.

## Adding a team

`python3 tools/app_codes.py /mnt/project-files/touchline-tales/app-store/team_codes.csv --add <folder> "<Team name>"`
in touchlinetales-sites prints the team's code; commit `app/codes.json`. Give the code to the coach with the site link.

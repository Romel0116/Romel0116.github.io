# Standings setup

The Standings card opens `TopGun-Standings.html`. Owners save a separate standings connection in Team Settings; the existing calendar connection is unaffected.

For the test team **Top Gun FC- Divison 2 (Fall 2026)**, save:

- Division URL: `https://thewoodlandstownship.teamsidelinesite.com/schedule?divisionid=746501`
- League team name: `Top Gun FC`
- Enable weekly standings updates.

After these changes are pushed, the `Sync TeamSideline Standings` workflow can be run manually from GitHub Actions. Its scheduled run is Monday at 13:30 UTC (8:30 a.m. Chicago during daylight saving time; 7:30 a.m. during standard time). It uses the existing `FIREBASE_SERVICE_ACCOUNT` repository secret. No credentials belong in the frontend.

The importer reads the rendered public table with Playwright. Test it without Firebase writes using:

```sh
cd automation
npm install
npx playwright install chromium
node sync-teamsideline-standings.mjs --probe 'https://thewoodlandstownship.teamsidelinesite.com/schedule?divisionid=746501'
```

Successful imports atomically replace `teams/{teamId}/standings/current` and mark `teams/{teamId}/standingsConnection/settings` active. Failed imports only update connection status and keep the previous table. Changing the division URL or league team name hides the old table until a matching import arrives. Unchecking updates pauses the importer.

## Firestore access

`../firestore.rules` contains the user-supplied existing policy plus standings permissions. Members and existing organization admins can read the two standings document paths. Only the team owner can save connection settings; frontend writes to imported standings are forbidden. The importer uses the Admin SDK. This file has not been published or validated by the Firebase compiler/emulator. To apply it, copy its full contents into Firebase Console → Firestore Database → Rules, review the editor diagnostics, and publish. A GitHub commit alone does not deploy these rules.

## Verification status

The public page is readable in the Codex browser. A standalone diagnostic found cross-origin resources blocked, and a direct request for TeamSideline's public widget returned a Cloudflare browser-verification page. Automatic imports remain blocked; no verification protections are disabled.

`TopGun-standings-snapshot.js` contains all 10 official division rows captured on October 6, 2026 at 10:28 p.m. Chicago time. The app shows this explicitly dated snapshot only when the saved URL matches division 746501, the league team name is Top Gun FC, and no matching Firebase table is available. A successful Firebase import takes precedence. This snapshot does not refresh weekly and must not be represented as live data.

Rendering checks verify all 10 rows, the Top Gun FC highlight, capture labeling, Firebase precedence, isolation from other teams, and the error state. Run `node automation/verify-standings.mjs` from the repository root. Firebase writes and the authenticated deployed app have not been tested in this workspace.

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

No Firestore rules file is present in this repository, so deployed rules have not been changed or verified. The rules must permit members (and existing organization admins) to read these two document paths, permit only the team owner to save connection settings, and forbid frontend writes to imported standings. Merge narrowly scoped rules into the existing policy; do not replace it or add public access. The importer uses the Admin SDK.

## Verification status

The public page is readable in the Codex browser, and the standalone standings parser and URL validation pass local checks. The first standalone headless-browser probe downloaded the page but timed out waiting for its dynamic table. Automatic imports are not yet verified; do not treat the workflow as production-ready until the probe or a manual GitHub run succeeds. Firebase writes and authenticated app flows have not been tested in this workspace.

# RouteHeat 4.0.3

RouteHeat is a mobile-first delivery performance tracker for iPhone and Android. It combines large one-tap stop controls, GPS route maps, pace goals, tote tracking, rescue workdays, route history, personal comparisons, reports, replay, achievements, and long-term delivery analysis.

> **Safety:** Only interact with RouteHeat while parked. Never use RouteHeat, Route Tools, Ghost Run details, or route-editing controls while driving.

## RouteHeat 4.0.3 recovery update

- **Recently Deleted:** Finished routes removed or retired from History can appear under **Settings -> Recently Deleted** when a complete recovery copy remains. Compact status labels distinguish a deletion still waiting for cloud sync, a cloud-backed recovery copy, and a copy available only on this device.
- **Safe offline restore:** A complete local recovery copy can return to History immediately while offline or signed out. Cloud reactivation remains pending until the next authenticated online sync, so do not clear website data or remove/reinstall RouteHeat before that sync succeeds.
- **Stale-device protection:** Restoring removes the exact matching deletion queue/tombstone, advances the route's revision and update time, and queues the restored route for sync. Revision-aware conflict handling prevents an older phone or stale cloud copy from winning and deleting the recovered route again.
- **No countdown:** RouteHeat 4.0.3 does not apply a time-based Recently Deleted purge. It can list only tombstones that still contain a complete finished-route recovery copy; the on-device safety ledger retains the newest 500 deletion records.

### Also included from 4.0.2

- **Null Island fix:** Blank, malformed, out-of-range, and exact `(0,0)` GPS points are now ignored across live routes, saved maps, replay, and every All-time map mode. Stops recorded while GPS was unavailable still remain in route totals, reports, awards, and cloud history.
- **Clearer History tab:** The old clock has been replaced with a crisp route-history icon that combines a return trail and map pin for better recognition at phone tab-bar size.

## RouteHeat 4.0 highlights

- **Personal Ghost Run:** When enough history exists, RouteHeat automatically selects a similar saved route and compares today's completed stops with that personal baseline. The compact Drive card reports stops and time ahead or behind; tap it while parked to expand the gold-versus-purple progress chart. Break time is excluded from both routes.
- **Parked Route Tools:** The Drive screen now opens a dedicated tools sheet for setting Amazon's next stop number, correcting the current tote number, adding a missed stop, or beginning a rescue phase.
- **Corrected missed stops:** Enter the Amazon stop number, how many minutes ago it occurred, and its location count. RouteHeat inserts a clearly marked corrected stop, repairs the completed sequence and surrounding timing, and uses a nearby recorded GPS point when one is available. Any reconstructed location is approximate.
- **Separate stop numbering:** RouteHeat keeps its completed-stop sequence separate from Amazon's displayed stop number. Pace, progress, achievements, and totals use actual completed stops, while confirmations, saved maps, details, and replay can show the matching Amazon number. This supports routes that begin at Amazon Stop 2 or 3 without falsely counting extra deliveries.
- **Rescue continuation:** Start a rescue before finishing, from Route Tools, or reopen a finished route from its report. Original and rescue activity stay in one workday with continuous totals, Amazon numbering, totes, GPS history, planned-stop progress, phase markers, and separate phase statistics.
- **Same-day saved-route merge:** Open a saved route's Map & Replay view and choose **Merge** to combine it with another route from the same day. The earlier route remains the workday and the later route becomes a rescue phase. RouteHeat recalculates numbering, totals, timing, XP, and achievements, and securely retires the second local/cloud copy.
- **Historical Pace Trails:** The All-time map's **Pace trails** mode colors recorded road sections by historical delivery pace relative to the selected range's personal average. Repeated samples receive stronger solid trails; preliminary sections appear as faded dashes.
- **Repeat-stop visits:** The All-time map's **Repeat stops** mode groups delivery points from different saved routes within approximately 32 meters. Numbered markers show visit frequency; tap one for route/day counts, first and latest visit, locations, and average segment pace. These are GPS-area estimates, not address matches.
- **Foreground audio recovery:** RouteHeat now detects backgrounding, page changes, and return-to-foreground events, then resumes or recreates browser audio. Mobile operating systems may still require the next parked tap to unlock sound, but confirmation audio should no longer remain disabled for the rest of the route.
- **Safer cloud conflict handling:** Supabase synchronization compares route schema version, revision, route update time, and cloud update time. Deletion tombstones remain authoritative against stale copies until an explicit 4.0.3 recovery clears the exact tombstone and creates a newer route revision.

## Core features

- Polished Dark, high-contrast Sunlight, and Automatic themes
- Live OpenStreetMap that follows the driver's GPS position
- GPS breadcrumb recording that traces the driven street path
- Focused Drive mode with route progress and a large Stop Complete speedometer button
- Manual and optional experimental automatic stop detection
- Multi-location stops that preserve one Amazon stop while recording the actual delivery workload
- Segment and overall stops-per-hour calculations, pace goals, finish projections, pauses, and break tracking
- Numbered stop, tote, correction, and rescue markers on live and saved maps
- Configurable chime, bell, voice, and extra-loud confirmations with volume and vibration controls
- Crash/reload-safe active-route recovery for stops, totes, corrections, rescue phases, and GPS traces
- Saved route history, end-of-day reports, sharing, and chronological map replay at 0.5x, 1x, 2x, or 4x
- Route Load Index, comparable-route insights, tote analytics, full-screen lifetime maps, and smooth density rendering
- Awards & Milestones center with 44 custom achievement designs, lifetime XP, 100 delivery ranks, records, progress, and the Level 100 **RouteHeat GOAT** rank
- Secure Supabase email/password backup, offline retry, and new-device restore
- Recently Deleted recovery for complete finished-route copies, with local/cloud status and restore confirmation
- Installable static PWA shell suitable for GitHub Pages

## Using the new 4.0 tools

### Personal Ghost Run

Start a route normally. If RouteHeat finds a comparable saved route with at least five stops, the Personal Ghost card appears on Drive mode. The saved comparison is selected using planned-stop similarity, start time, recency, and rescue history. Tap the card only while parked to expand or collapse its chart.

Ghost Run is a private comparison against your own saved history. It is not a public leaderboard and does not share another user's data.

### Correct numbering, tote, or a missed stop

1. Park safely and open **Drive -> Route tools**.
2. Set **Amazon's next stop** without changing the number of deliveries RouteHeat has actually completed.
3. Set **Current tote** when the tote sequence needs correction. The next New Tote action continues from that number.
4. To repair a forgotten delivery, enter its Amazon stop number, minutes ago, and number of delivery locations, then choose **Add corrected stop**.

Corrected stops remain visibly labeled in route details and exports. If no suitable recorded GPS point exists, the stop still counts in statistics but may not appear on the map.

### Continue with a rescue

- During an active route, use **Route tools -> Start a rescue phase**, or choose **Start rescue** from the finish confirmation.
- After finishing, open the route's report and choose **Continue with Rescue** to reopen that workday.
- Enter the added planned-stop estimate if known. The estimate extends route progress but does not create completed stops.
- Finish the day normally after the rescue. The report shows the original route and rescue phases separately plus the combined total.

### Merge two saved routes

Use this only when two same-day routes should have been one workday, such as a separately recorded rescue:

1. Open **History -> Map & replay** for either route.
2. Choose **Merge** and select the other saved route from that day.
3. Review the warning and confirm.

The merge replaces two saved records with one, so route-count totals, XP, rank, and achievements can recalculate. Export first if you want a separate archival copy. RouteHeat hides the retired second record from Recently Deleted while its merged survivor remains in History, preventing accidental double-counting. If that survivor is later removed and a complete recovery copy still exists, the retired record can be restored as a separate route; this does not split or undo the merge.

### Recover a deleted route

1. Park safely and open **Settings -> Recently Deleted**.
2. Review the route date, metrics, deletion time, and recovery status.
3. Choose **Restore route**, review the warning, and confirm.

The status explains where the complete recovery copy came from:

- **Cloud pending** means deletion is queued on this device and has not finished syncing to cloud.
- **Cloud protected** means a private Supabase tombstone, or its cached device copy, contains the finished route.
- **On this device** means recovery currently depends on this installation's local copy.

Offline or signed-out recovery returns an eligible route to local History immediately. Keep RouteHeat installed and preserve its website data until an authenticated **Sync now** completes; only then is cloud reactivation confirmed. CSV exports are useful private archives, but RouteHeat does not import CSV, so a CSV alone cannot rebuild History.

A restored route receives newer revision metadata and its matching deletion records are cleared. That lets newer clients reject stale data from an older device. A future intentional deletion still works normally.

## CSV export in 4.0

CSV export still includes stops, tote changes, rescue starts, route starts, and GPS track points. RouteHeat 4.0 adds fields that preserve corrections and workday structure:

- `schema_version` and `revision`
- `phase_id`, `phase_type`, and `phase_label`
- `completed_sequence` and `amazon_stop_number`
- `tote_number`
- `stop_source` and `corrected`
- `after_completed_stop`

Latitude, longitude, GPS accuracy, location count, event time, segment duration, and segment pace remain available where applicable.

CSV is an analysis/archive format, not an app backup format. RouteHeat 4.0.3 does not include CSV or JSON import.

## Publish on GitHub Pages

1. Create a public GitHub repository.
2. Upload the **contents of this folder** to the repository root. Do not upload only the ZIP file.
3. Keep the `assets` folder intact beside `index.html`, `manifest.webmanifest`, and `sw.js`.
4. Open **Settings -> Pages** in the repository.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select the `main` branch and `/ (root)`, then save.

GitHub displays the public site address after deployment. GPS access requires HTTPS, which GitHub Pages provides automatically.

## Update an existing GitHub Pages installation

1. Unzip the new RouteHeat package on your computer.
2. Upload all files and folders from inside the package to the existing repository root.
3. Allow GitHub to overwrite the old files, including `index.html`, `sw.js`, and the files inside `assets`.
4. Wait for the Pages deployment to finish.
5. Open the published URL in Safari or Chrome once so the new app shell can install.
6. Completely close and reopen the Home Screen app.

You do not need to remove the existing Home Screen shortcut for a normal update. Do not delete/reinstall the Home Screen app or clear its website data to force an update: either action can destroy local routes, Recently Deleted recovery copies, settings, and an unfinished-route draft. Keeping the complete versioned app shell together prevents a new interface from loading with older cached JavaScript.

## Install on iPhone

Open the published site in Safari, tap **Share**, choose **Add to Home Screen**, and allow precise location access when prompted. Keep RouteHeat in the foreground during a route for the most reliable GPS and audio behavior. Before changing phones, clearing website data, or removing the Home Screen app, finish the active route, sign in, choose **Sync now**, verify that sync succeeds, and save a CSV as a secondary archive. Reinstalling can restore cloud-synced finished routes after sign-in, but it cannot recover an unfinished local draft or device-only Recently Deleted entry.

## Install on Android

Open the published site in Chrome, open the browser menu, and choose **Install app** or **Add to Home screen**. A separate Android Studio project mirrors the same RouteHeat 4.0 interface and can be used to build an APK.

## Route data, cloud sync, and compatibility

- While a route is running, RouteHeat continuously stores a temporary recovery draft on the device. Finishing saves the completed workday and clears the draft.
- Finished history remains cached locally for offline use. After cloud sign-in, finished routes are also backed up to the user's private Supabase account.
- Removing or retiring a finished route keeps a recoverable full-data entry when one is available. Recently Deleted can combine the newest local recovery records with private Supabase tombstones after sign-in.
- Restoring while offline or signed out succeeds locally and waits for the next authenticated online sync. Until that sync finishes, clearing storage or reinstalling can still erase the only restored copy.
- Existing RouteHeat routes remain compatible. Missing 4.0 fields are normalized when loaded; older routes cannot recreate GPS paths or visit coordinates that were never recorded.
- Each edited or merged route keeps the same logical route ID and receives schema/revision/update metadata. During sync, the newer logical version wins instead of blindly overwriting a correction with a stale device copy.
- Deletion ledgers and Supabase tombstones take priority over stale live copies. A confirmed recovery removes its exact deletion records and advances the route revision before cloud reactivation, preventing an older device from undoing that recovery.
- Complete the one-time instructions in `SUPABASE_SETUP.md` before using Cloud backup.
- For best street history, keep RouteHeat open with precise location enabled. Mobile browsers may reduce or pause GPS updates when the screen is locked or the app is backgrounded.
- The recorded route follows GPS breadcrumbs rather than an external road-snapping service. Weak reception can create drift or gaps.
- Uncached map tiles require an internet connection; the application shell is available offline after a successful first visit.

## Privacy and safety

- RouteHeat does not need street addresses for repeat-stop history. It compares approximate saved GPS areas on the device.
- Ghost Run uses only the signed-in user's own saved routes.
- Cloud GPS history is protected by Supabase Row Level Security and is private to the signed-in account.
- Do not publish a CSV if it contains GPS coordinates you want to keep private.
- Use all controls only while parked. RouteHeat must never encourage speeding or distracted driving.

## Main files

- `index.html` - application interface
- `assets/styles.css` - responsive Dark and Sunlight theme system
- `assets/app.js` - GPS, routes, corrections, rescues, Ghost Run, maps, analytics, reports, and replay
- `assets/cloud.js` - authentication, revision-aware backup, recoverable tombstones, stale-deletion protection, offline retry, and restore
- `assets/supabase-config.js` - Supabase project URL and browser-safe publishable key
- `manifest.webmanifest` - installable app metadata
- `sw.js` - offline application-shell caching
- `supabase-setup.sql` - protected route table and Row Level Security policies
- `SUPABASE_SETUP.md` - one-time Supabase dashboard instructions

Map data is provided by OpenStreetMap and displayed with Leaflet. Smooth density rendering uses Leaflet.heat.

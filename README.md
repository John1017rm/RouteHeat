# RouteHeat 8.1.0

RouteHeat is a mobile-first, private delivery intelligence tracker for iPhone and Android. It records stops, locations, totes, rescues, packages, timing, and GPS breadcrumbs; compares a driver only with their own history; and turns finished workdays into maps, reports, replay, and long-term insights.

> **Safety:** Use every RouteHeat control only while safely parked. Forecasts, Ghost comparisons, coaching, achievements, and historical pace are personal context—not targets or reasons to rush.

## 8.1.0 Drive Focus

- **Optional Drive Pro:** A simpler futuristic active-route layout keeps progress, route pace, the main Stop control, multi-location choices, and the current tote in one glanceable instrument. A restrained edge glow shifts from green through amber to red using the driver's own pace context; it is information, never a reason to rush.
- **Less Drive-page clutter:** Undo is a compact corner control instead of a full-width card. The large after-stop location correction strip no longer covers the speedometer; detailed corrections remain available through parked route tools.
- **Quicker departure-based Auto Stop:** When the phone stays in the van, a verified transition from parked service to vehicle movement can complete the stop promptly. Strong native vehicle speed or repeated derived movement confirms departure, while GPS drift and walking-speed fixes remain excluded.
- **Manual-completion guard:** Tapping Stop Complete consumes the current automatic service event. Driving away from that same stop cannot count it a second time, and a new automatic stop requires a fresh parked-service cycle.
- **Route Moments:** Optional active-route feedback now uses larger, passive, auto-closing cards with meaningful pace, progress, recent-section, milestone, and top-of-the-hour comparisons. An optional sound can announce a Moment, but no popup requires a tap while the van is moving.
- **Clear tote handoffs:** Tote feedback states both sides of the transition—such as **Finished Tote 1 · Opening Tote 2**—and keeps the current tote visible afterward.
- **A more focused Delivery Atlas:** The experimental Watercolor view has been removed. Hotspots, Roads, Pace, Repeats, Recency, Totes, Stop Time, and Connection remain as the useful all-time map views, and automatic Neighborhood Snapshot work no longer throws unrelated global save messages over the Atlas.
- **Stronger Home Screen icon:** New 192 px and 512 px assets give the RouteHeat **R** more presence while preserving iPhone and Android maskable safe areas.
- **Existing data stays compatible:** Routes, active recovery, GPS trails, stops, multi-location counts, totes, rescues, cloud data, Areas, achievements, exports, and backups retain their existing schemas.

## 8.0.0 The Clarity Update

- **One professional visual system:** RouteHeat now uses shared spacing, typography, surface, radius, elevation, focus, control-height, and semantic-color tokens across every screen instead of stacking unrelated presentation styles.
- **Glanceable active route:** Stop count, pace, progress, projected finish, Auto Stop, recent activity, and the fixed Stop/Multi/Tote controls have a clearer information hierarchy. The main action remains reachable while transient route-protection messages sit safely above it.
- **Refined Drive mode:** Route progress reads first, the Stop Complete instrument remains the visual center, supporting controls have more breathing room, and all live values use stable tabular numbers that remain readable into 200+ stops.
- **History built for scanning:** Recent routes, the calendar, weekly summaries, story cards, achievements, tote analytics, the archive, and route actions now share consistent cards and readable metadata. Long Area names and large totals wrap without breaking their containers.
- **Delivery Atlas polish:** Map views and filters are easier to understand, the map receives more usable space, 44 px map controls scroll safely instead of overlapping, status/readout treatments are consistent, and pace legends also use line patterns instead of color alone.
- **Useful data presentation:** Summary tiles, report metrics, route details, finish highlights, tote details, Ghost comparisons, and dynamic story grids reflow intentionally rather than leaving orphan cards or clipped labels.
- **Daylight mode that feels designed:** A cool mist canvas, crisp white and softly tinted surfaces, darker supporting text, restrained elevation, and corrected purple accents replace the plain, low-contrast white presentation.
- **Comfortable controls:** Interactive controls meet a 44 px mobile target wherever practical, iPhone form fields use 16 px text to avoid focus zoom, switches receive visible keyboard focus, and primary, utility, and destructive actions are visually distinct.
- **Polished system states:** Empty panels, loading indicators, wrapped toasts, save/connection/update banners, success confirmations, recovery dialogs, and generic errors now feel like parts of the same app.
- **Responsive and accessible:** Small phones, larger iPhones, tablets, desktop, text zoom, reduced motion, increased contrast, forced colors, safe areas, long labels, and large statistics receive dedicated handling.
- **Compatibility preserved:** This release changes presentation and a few non-data UI behaviors only. Existing routes, active-route recovery, stops, totes, GPS trails, cloud backup, Supabase, Neighborhood Snapshot, imports, exports, achievements, and offline storage remain compatible.

The full visual system is in `assets/routeheat-8.css`, intentionally loaded last so the proven route and storage logic remains isolated from the redesign.

## 7.2.0 Lean saves, quicker auto stops, and a real workday debrief

- **Lean live-route persistence:** GPS updates replace one compact `active-current` record instead of rewriting all finished History. Route actions create a bounded eight-copy checkpoint ring, while routine GPS changes are coalesced to at most one browser-mirror write every 15 seconds and one protected trail checkpoint per minute.
- **Safer reconciliation:** Startup preserves the union of browser-mirror and journal History, restores full GPS/connection detail behind compact mirrors, prefers the newest valid active route, and will not revive a stale active draft after a verified finish. An unfinished rescue phase is never mistaken for its earlier finished route.
- **Storage that tells the truth:** Settings now separates RouteHeat's measured logical records from the browser's approximate origin estimate. **Optimize safely** removes only redundant checkpoint and journal records; it never removes finished routes, the active route, backups, or cloud queues.
- **Finish without the filler movie:** The end-of-day celebration now opens directly into a useful debrief with the best fair stretch, toughest fair stretch, first/second-half momentum, yesterday comparison, achievements, records, and transparent GPS/data-quality context. The normal History replay remains available whenever a map replay is wanted.
- **Richer live insight cards:** Optional parked-only cards can show top-of-hour progress versus the exact previous local day, rare same-place/same-time coincidences, and familiar recorded road sections that have historically run quicker or slower. Every comparison cites its personal-history sample instead of guessing a street name.
- **Faster passenger-seat auto detection:** Candidate dwell adapts between roughly 18 and 32 seconds, departure can confirm on a strong native-speed fix or repeated derived movement, and the saved stop time is anchored to the beginning of departure. An interrupted in-progress stop needs either two fresh parked fixes near its saved anchor or a review suggestion; uncertain motion never becomes a blind automatic stop.
- **Cleaner Drive controls:** The 2–5 location choices are more distinct around the main stop control, their armed state is clearer, and the universal 30-second Undo is a compact centered action instead of a full-width bar.
- **Lower write amplification:** Starting, finishing, history edits, and settings still receive transactional full snapshots, but normal GPS, stop, tote, and Undo-expiry activity no longer serializes every saved route repeatedly.

### If service or device storage is poor

Keep RouteHeat open and continue the active route; stop and GPS checkpoints are device-local and do not require Supabase. If **Route save needs attention** appears, do not start a replacement route, repeatedly force-close RouteHeat, clear Safari/site data, remove the Home Screen app, or reinstall. Free some general device space if iOS reports the phone is full, remain parked, and use **Retry save** once. If Finish pauses, leave that same route active and retry after storage is available; on a later launch, choose the recovery copy with the expected stop and GPS-point totals.

Before clearing any browser or app data, confirm a successful Cloud sync for finished routes and create a `.routeheat` backup. For route-summary intake on iPhone, Apple Live Text copy/paste is the lowest-storage option; the screenshot file itself is temporary and RouteHeat never saves it.

## 7.1.0 Route Vault, auto multistops, and History calendar

- **Offline Route Vault:** An IndexedDB checkpoint ring now stores full unfinished-route copies throughout the day. Retention always protects the checkpoint with the highest stop count and the checkpoint with the richest GPS trail, in addition to recent copies.
- **Durable finish:** Finishing a route commits the finished History record and active-route tombstone to device storage before RouteHeat reports success or starts cloud work. Internet and Supabase are not required to finish safely.
- **Stale-sync protection:** A cloud sync that began from an older local snapshot cannot replace route progress made while the request was in flight. A strict stop superset wins unless a later explicit deletion or undo proves the reduction was intentional.
- **Richer recovery:** Startup compares stop progress, GPS geometry, totes, phases, and save times across the active mirror and protected checkpoints. When compatible copies differ, it can preserve the fullest progress together with the richest recorded trail.
- **Weak-connection instructions:** A prominent banner explains that stops and GPS continue saving locally, cloud sync can wait, and a driver should not start over or repeatedly close RouteHeat after a finish error.
- **Auto multistop arming:** In Suggest or Auto mode, 2, 3, 4, and 5-location buttons surround the Drive stop circle. The armed count survives switching to Flex, attaches to the current Amazon stop, and is consumed by either verified vehicle departure or a manual Stop tap.
- **Walking safeguard:** Pedestrian movement around a multi-location delivery no longer counts as departure. Automatic completion requires repeated vehicle-speed fixes and meaningful distance; a large gap after returning from another app becomes a review suggestion instead of a silent save.
- **Fast correction:** Every saved stop offers a 15-second 1–5 location correction strip that edits the existing stop without advancing Amazon numbering.
- **Connection Experience:** The Delivery Atlas can now show a seamless green-to-red surface of RouteHeat’s own reachability and response time. It is an app-connectivity history—not carrier bars—and the tiny probe receives no GPS coordinates.
- **History rebuilt:** The newest four routes sit above a month calendar. Highlighted dates open saved workdays quickly, while the full sortable/filterable route browser remains available in a collapsible archive.
- **Larger route check-ins:** Optional random feedback cards are easier to read, stay visible for 8.5 seconds, and remain silent, dismissible, and nonblocking.
- **67-award trophy case:** Eight new live multi-location awards cover the first multi, 5/10/20 multis in one route, 3+ location stops, and 3/5/10 consecutive multi-stop streaks. Existing trophies and progress are unchanged.
- **Clearer private route patterns:** Automatic GPS comparisons are labeled as similar route patterns, never as a user-created Delivery Area. Suggested outlines require a deliberate name before saving, so legacy labels such as “Pine Trail Suggested Area” no longer appear.
- **Android lifecycle protection:** The Android wrapper asks the web app for a critical checkpoint whenever the activity pauses or stops, then safely reconciles GPS and armed multistop state on resume.

### What to do with poor data service

Keep the active route open and continue logging stops normally; each stop and periodic GPS trail checkpoint saves on the device. Cloud status may remain Offline, but it does not control local tracking. If Finish ever reports that the route is still active, do not create a replacement route, repeatedly close the app, clear browser data, or reinstall. Leave that route active, move to better service if practical, and retry once. On the next launch, choose the recovery copy with the expected stop count and GPS-point total.

## 7.0.1 Trophy Expansion

- **Original 59-award trophy case:** Fifteen lifetime trophies added in 7.0.1 recognize confirmed package totals, meaningful rescue workdays, extra multi-location doors, repeat work in the same saved Delivery Area, all four seasons, all 12 calendar months, excellent route-map quality, and long-term tote use. RouteHeat 7.1 retains all of them and adds eight active multistop awards.
- **History-based and hard to farm:** New awards count finished routes only. Package awards exclude incomplete or partial totals; rescue workdays require at least one logged rescue stop and either three rescue stops total or 15 active rescue minutes; same-Area awards require a finished 50+ stop workday with at least 70% of stops in one current saved Area; and Clean Cartographer requires 75+ stops with Route Quality 90 or better.
- Same-Area trophies are recalculated from current saved routes and current Delivery Area boundaries, so deliberate history or boundary edits are reflected honestly.
- **Accurate tote ladder:** Tote Veteran and Tote Dynasty count one valid tote-opening checkpoint per stop position, preventing repeated taps at the same stop from inflating progress.
- **New trophy artwork:** Package, rescue, seasonal, Area, map-quality, extra-door, and tote families have distinct medal scenes and premium color treatments in both Dark and Light appearance.
- These additions are calculated from private saved history and do not change XP, active-route coaching, pace targets, or the parked-use safety model.

## 7.0.0 The Story Update

RouteHeat 7.0 adds four expressive tools without changing the route-saving core:

- **Route Atmosphere:** After a finished route is safely stored, RouteHeat can automatically attach modeled temperature, apparent temperature, conditions, precipitation, wind, daylight, sunrise/sunset, and moon phase. A compact chip appears in History and full cards appear in Map & Replay and the end-of-day report. Existing eligible routes are filled gradually in bounded background batches, with a parked-only manual backfill button in Settings.
- **Privacy-bounded weather lookup:** Only one representative route location rounded to `0.01°` (roughly 1 km) and the route date are sent to Open-Meteo. Route IDs, full paths, stops, addresses, package totals, screenshots, Amazon data, and account data are never included. Saved values are aggregates, not raw hourly responses. Cards clearly identify the information as approximate modeled conditions and include Open-Meteo / CC BY 4.0 attribution.
- **Pace Orchestra:** Every saved route can become a deterministic 22–42 second Web Audio composition. Faster sections rise into higher, shorter notes; slower stretches settle lower; multi-location stops add harmony; tote changes ring; rescues shift key; and the route ends on a finish chord. It uses no downloaded audio files, starts only after an explicit parked tap, and stops whenever RouteHeat is hidden, blurred, or closed.
- **Historical Watercolor Atlas:** RouteHeat 7.0 introduced a layered GPS-street painting experiment. RouteHeat 8.1.0 retires that view in favor of the Atlas layers that proved most useful in real delivery work.
- **Private Amazon summary intake:** The pre-route setup can read a screenshot containing Stops, Multi-location stops, Total locations, Total packages, Stops to do, Stops successful, and Packages to deliver. OCR is loaded lazily only when requested, runs on-device, downsizes the temporary image to at most 1600 px, and terminates immediately after the scan. Every result opens as an editable review; nothing is applied until confirmed. The screenshot and OCR text are never saved or uploaded.
- **What’s New:** A polished, once-per-version 7.0 introduction explains the additions without interrupting an active or recovered route. It can always be reopened from Settings.

### About the tabletop AR idea

The coffee-table 3D route replay is intentionally **not** bundled into the 7.0 PWA. A convincing version needs a native iPhone module built with ARKit and RealityKit for reliable plane detection, anchoring, depth, and camera lifecycle behavior. Adding a web-AR runtime here would introduce camera permissions and substantial 3D weight for an experimental feature. RouteHeat’s existing timestamped GPS trails already provide the right source data for a future native AR viewer, so 7.0 stays fast while preserving that path.

### 7.0 network and offline behavior

- Core route tracking, saved history, reports, Pace Orchestra, and previously saved Atmosphere cards continue to work offline.
- The first screenshot scan needs internet access to load the pinned Tesseract.js `7.0.0` reader from jsDelivr. Manual entry and Apple Live Text paste remain available if it cannot load.
- New Atmosphere cards need internet access. Failed or timed-out lookups do not change the route and can be retried later.
- This personal build uses Open-Meteo’s public endpoints. Before operating RouteHeat commercially, review Open-Meteo’s current commercial licensing and move weather requests behind a server-side licensed endpoint rather than placing a commercial API key in this static client.

## 6.5.0 Atlas layers, Stop Time, and App themes

- **Hotspots are now an independent underlay:** Roads, Pace, Repeats, Recency, and Totes each keep their own analysis while a clear **Hotspots On/Off** control optionally places delivery density underneath. The preference stays saved on the device.
- **The lingering-heat bug is fixed:** Every view change hides the heat pane immediately, cancels pending heat redraws, removes the tracked canvas, and clears any orphaned Leaflet heat canvas. Rapid taps, backgrounding, fullscreen, and iPhone WebKit can no longer leave an old heat field stuck behind another view.
- **New Average Stop Time view:** A seventh Atlas view maps normalized local averages from GPS- and motion-based service-time estimates. Nearby sample frequency affects confidence and opacity—not the duration color—so several short stops cannot falsely look like one long stop. It intentionally excludes completed-stop travel intervals, shows the percentage of mapped stops with usable estimates, and reports average, median, and sample count for highlighted areas.
- **Honest heat separation:** Hotspots always represents delivery concentration. Stop Time uses its own shorter-to-longer surface, and the two full-color heat fields cannot be combined into a misleading picture.
- **Appearance is simple:** Settings now offers **Dark**, **Light**, and **Automatic**. Automatic follows the device appearance setting.
- **Four app-wide color themes:** **Default**, **Blue**, **Orange**, and **Purple** recolor primary buttons, selected controls, progress accents, route lines, stop dots, repeats, totes, rescues, and heat surfaces together.
- **Familiar streets in every theme:** App themes color RouteHeat data rather than tinting the entire OpenStreetMap world. Only the Dark/Light appearance applies a restrained tile treatment, keeping street names and roads legible.
- **Upgrade-safe settings:** Existing RouteHeat, Neon, Sunset, Blueprint, and Signal preferences migrate to the closest new App theme. Fresh 6.5.0 application and service-worker keys deliver the map fix and theme system as one consistent installed-app update.

## 6.4.0 Delivery Atlas

- **True seamless Hotspots:** The All-time map now uses one locally bundled Leaflet Heat canvas. Nearby deliveries accumulate into a continuous color surface—never a collection of fake glowing circles—and the canvas is removed completely when another view is selected.
- **Six clear map views:** Hotspots, Road coverage, historical Pace, Repeat Visits, Recency, and Tote Changes each have a plain-language description, truthful legend, focused highlights, and a map-specific readout.
- **Useful map intelligence:** The Atlas adds GPS mapping percentage, repeat-delivery areas, recent new coverage, rescue stops, mapped tote changes, saved Area context, busiest hotspots, route recency, and repeat tote hubs without pretending to know unavailable street names or stop-level package counts.
- **Simpler controls:** The ambiguous Layer-cycle control and user-facing Full/Lite tuning are gone. A descriptive horizontal view picker, 30-day/one-year/all-time range, Refine panel, Fit all, Newest, Areas, and Full screen controls make each action explicit.
- **Stable comparisons:** Switching map views preserves center and zoom. The map is created once and only the active overlay changes, while filter or range changes deliberately refit the matching history.
- **iPhone-safe heat engine:** Stops are outlier-filtered, accuracy-filtered, aggregated into adaptive meter cells, square-root normalized against the 95th percentile, and capped before one dedicated heat canvas is drawn. Road vectors remain SVG, and the heat canvas never uses CSS filters, blend modes, or backdrop blur.
- **Polished map-first design:** Delivery Atlas adds a compact lifetime snapshot, larger map, theme-aware view art, streamlined legends, ranked highlights, a narrative Map Readout, six context cards, improved Light appearance contrast, and safe-area-aware fullscreen controls.
- **Fresh installed-app update:** The 6.4.0 service worker precaches the local heat engine and every application asset with new keys so an iPhone Home Screen installation receives the overhaul as one consistent release.

## 6.3.0 previous map worlds, route feedback, and Delivery Area Cloud

- **Previous map-world system:** RouteHeat, Neon, Sunset, Blueprint, and Signal were introduced here. RouteHeat 6.5.0 replaces this older control with the simpler Appearance + App theme system above.
- **Eight stop sounds:** Chime, Bell, Sparkle, Arcade, Pulse, Beacon, Voice, and Extra loud are available. The six tone-based choices are generated locally with Web Audio and need no downloaded sound files.
- **Optional Delivery Feedback:** A default-off setting enables occasional, metric-based check-ins after manually completed stops. Wording rotates, but every fast, longer, improving, steady, or on-goal assessment comes from the current route's recent comparable intervals. It never counts or judges an automatically detected stop, and it adds no extra sound or vibration.
- **Smooth iPhone-safe density:** Density is again a real continuous-looking heat field instead of hard circles. It uses bounded DOM/CSS radial kernels, keeps exact totals, draws no map canvas, and remains available in both Full and Lite detail.
- **Private Delivery Areas in Cloud:** Named outlines, colors, priorities, edits, and deletions now sync separately per signed-in user with Row Level Security, revision-aware merging, stale-write protection, and durable deletion tombstones. Offline edits remain local until the next successful sync.
- **Fresh installed-app update:** New 6.3.0 service-worker and asset keys prevent an iPhone Home Screen installation from mixing old map code with this release.

> **One-time Cloud upgrade:** Existing Supabase users must run the complete latest `supabase-setup.sql` once in Supabase SQL Editor. It is idempotent and preserves all existing route rows while adding the private Delivery Area table and policies.

## 6.2.2 iPhone All-time map repair and upgrade

- **iPhone-safe renderer:** Streets, repeat visits, pace trails, stop dots, and Delivery Area outlines use Leaflet's SVG renderer instead of depending on a large shared canvas that iOS can fail to allocate.
- **Stable map lifecycle:** Sync and filter updates reuse one map and replace only its overlays, preventing repeated map teardown from exhausting iPhone WebKit drawing resources.
- **Automatic Lite detail:** Auto mode reduces only displayed geometry on iPhone or very large histories; every route, stop, location, distance, and pace total remains exact. Full and Lite can also be selected manually.
- **Hard drawing budgets:** Fragmented GPS trails and pace calculations are bounded while they are processed—not only after drawing—so unusually large histories cannot silently exceed Lite mode's iPhone-safe limits.
- **Recovery instead of a dead map:** A failed detailed layer is skipped independently. If the main renderer cannot continue, RouteHeat retries with lightweight markers and finally provides a saved-coverage preview rather than a blank or black panel.
- **Coverage dashboard:** New mapped-coverage, repeat-area, recent-area, and rescue-coverage insights explain what the map contains for the selected filters.
- **Faster map navigation:** Coverage and Latest controls quickly return to the full history or the newest mapped stop; recent routes open their map and replay, and density/repeat results focus the matching area. The fullscreen Layers control changes views without closing the map.
- **Clearer visual language:** The rebuilt map card adds mode-aware legends, an on-map range/detail summary, improved full-screen controls, polished dark styling, and high-contrast Light styling.
- **Fresh installed-app update:** Every local map, script, style, storage, and service-worker URL has a distinct 6.2.2 cache key so an iPhone home-screen installation cannot retain the older renderer.

## 6.2.1 All-time map hotfix

- **Stops always remain visible:** Streets mode now draws a small mapped-stop dot when a route has no usable GPS trail, while repeat locations keep their numbered markers.
- **GPS trails protected first:** Under phone storage pressure, optional Neighborhood Snapshot detail is compacted before any recorded route trail.
- **Fuller cloud copy wins:** Sync enriches a newer compact copy with the matching protected trail instead of allowing Snapshot metadata or a local mirror to erase street history.
- **Reliable offline map engine:** Leaflet and the heat-map plugin are bundled and precached locally instead of depending on a third-party CDN at startup.
- **No silent black rectangle:** Missing map tiles or a map-engine failure now produces a readable status while saved stop and route overlays remain available.
- **iPhone rendering repair:** The All-time tile surface avoids the large CSS filter that could become black during WebKit compositing or fullscreen changes.
- **Outlier-resistant view:** An isolated ocean/global GPS point no longer zooms genuine delivery history into invisibility.

## 6.2.0 Neighborhood Snapshot

- **Opt-in post-route context:** Finished-route reports and saved-route details can build a polished housing snapshot for the Census tracts containing trusted mapped stops. Nothing was added to the active Drive screen.
- **Neutral aggregate metrics:** The card shows typical delivered-area median owner-occupied value, sampled range, household income, gross rent, owner-occupied share, median construction year, tract count, and mapped-stop coverage.
- **Rescue-aware review:** Multi-phase workdays can show separate Main Route and Rescue summaries so a rescue in another city is not blended invisibly into one number.
- **Never an individual-home price:** Values are 2020–2024 ACS 5-year tract estimates with 90% margins of error where available—not current sale prices, appraisals, customer data, or estimates for a particular address.
- **Server-side privacy boundary:** The signed-in Edge Function reads only the stop/phase fields required from that account's completed cloud route through Row Level Security, uses temporary coordinate processing to identify tracts, and stores only the derived aggregate snapshot and non-reversible input hash. GPS trails, unrelated analytics, and Census secrets never enter the function response, browser bundle, Android bundle, or GitHub Pages files.
- **Safe finish behavior:** A route finishes and clears its active draft before any snapshot request starts. Census, internet, authentication, or function failures cannot keep a route active or roll back a finished workday.
- **Honest freshness:** Stop removal, rescue continuation, merge, checkpoint repair, or map correction changes the local fingerprint and shows **Refresh recommended** instead of presenting an older snapshot as current.
- **Race-safe cloud result:** Each build and cache hit is bound to the exact server generation, route revision, and route update time. A route edit or Snapshot removal that wins while Census work is running cancels the older result instead of recreating it.
- **Bounded Census work:** Stops are clustered before tract matching, ACS rows are fetched once per county, and atomic per-user plus project-wide limits protect the private service and shared Census key.
- **Offline finish queue:** If Snapshot is enabled but the app is offline or signed out when a route finishes, the route ID is queued in protected device storage and resumes after Cloud is ready. Route completion never waits for it.
- **Portable and offline after creation:** A completed aggregate follows the saved route into Supabase and `.routeheat` backups, and remains viewable offline. Building, refreshing, or removing the server cache requires internet and Cloud sign-in.

## 6.1.4 full-history protection

- **Cloud-safe journal reads:** Cloud sync waits for the protected device journal and uploads the complete route copy instead of a space-saving local mirror.
- **Fuller-copy tie breaker:** If two equal-version copies exist, a compact mirror with no trail can no longer replace a copy that still contains the recorded GPS path.
- **Complete portable backups:** `.routeheat` exports wait for journal recovery and include full protected route history, including older map trails.
- **Storage-pressure finish fix retained:** Rescue routes and other long workdays still finish through the compact local mirror fallback introduced in 6.1.1.

## 6.1.3 saved-route checkpoint repair

- **History repair:** Saved-route details now include a Repair action for rebuilding missing completed stops from a screenshot or written checkpoint.
- **Exact totals:** Enter target stops, Amazon's next stop, total active time, checkpoint time, and optional package count.
- **Rescue reconstruction:** RouteHeat creates a recovered rescue phase, distributes only the missing stops across the added active time, and restores the exact total duration.
- **No invented GPS:** Recovered stops are clearly marked corrections with unavailable locations. Existing stops, totes, GPS trail, and timing remain unchanged.
- **Auditable correction:** The repair records its before/after counts, checkpoint, active-time target, and inserted stop IDs.

## 6.1.2 fuller-route recovery

- **Journal snapshot rescue:** Startup now inspects both the current and previous protected device snapshots before they can rotate out.
- **Fuller-copy prompt:** If the journal contains a recent unfinished route with more stops than the local or History copy, RouteHeat offers the exact larger stop count for recovery.
- **Non-destructive choice:** Choosing to keep the current copy does not clear or modify any active-route data.
- **Safe rescue continuation:** Recovering a fuller draft preserves reopened-rescue handling when a shorter saved checkpoint exists in History.

## 6.1.1 finish-storage hotfix

- **Long-route finish repair:** Finishing no longer requires the full accumulated GPS history to fit in the browser's small local-storage mirror.
- **Full journal preservation:** RouteHeat keeps the complete normalized history in the IndexedDB device journal and automatically reloads it when the local mirror is space-limited.
- **Safe mirror fallback:** If needed, only older route trail geometry is removed from the local mirror. Stops, totes, timing, rescues, route metadata, and recorded distance remain available.
- **Smaller GPS format:** Finished-route trail points are stored as compact coordinate arrays while preserving the map path and distance.

## 6.1.0 active-route corrections

- **Recent activity:** The Live view now combines the six most recent completed stops and tote changes in one list.
- **Easy parked removal:** Each recent stop or tote has a clear Remove control and a confirmation that affects only the active route.
- **Automatic repair:** Removing a stop recalculates later Amazon stop numbers, segment timing, phase anchors, and tote positions. Removing a tote recalculates later tote numbers and the current tote.
- **30-second Undo:** A removed stop or tote can be restored with its original numbering and route metadata from the existing protected Undo banner.

## 6.0.1 finish-save hotfix

- Finishing a route now releases the duplicated active-route mirror before writing the same workday into History, preventing local-storage quota failures on installations with substantial route history.
- If the History write still fails, RouteHeat restores both the previous History value and the unfinished active draft, then records that rollback in the device journal.
- The application-shell and service-worker cache versions are synchronized at 6.0.1 so installed PWAs receive the repair as one update.

## Delivery Areas in 6.1

- **Drawn Delivery Areas:** While parked, outline places such as North Star or Middleton directly on the map, name them, choose colors, adjust corners, and set overlap priority.
- **Stop-level classification:** Each mapped stop is matched to its actual boundary. A workday can contain multiple Areas instead of being forced into one route-wide label.
- **Rescue-aware Areas:** Original and rescue phases receive separate Area breakdowns, so a Middleton rescue does not change a North Star original route into one mixed identity.
- **Historic reanalysis:** Adding, editing, reordering, or deleting a boundary immediately reclassifies saved history without changing raw stops, GPS breadcrumbs, route revisions, or cloud rows.
- **Area intelligence:** History, Live, Drive, route detail, finish reports, All-time filters, ETA, Ghost selection, weekly recaps, Moments, Delivery Year, and Area Profile pages use drawn boundaries first.
- **Suggested outlines:** Older automatic GPS route patterns can provide a reviewable starting boundary. They remain unnamed drafts until the driver explicitly checks, names, and saves one as a Delivery Area.
- **Private boundaries:** Names and polygons stay in protected device state and `.routeheat` backups. When Cloud is signed in and the latest setup has been applied, they also sync through that account's RLS-protected `routeheat_delivery_areas` table; they are never published, sent to the map tile provider, or included in privacy-safe shared summaries.

## RouteHeat 6 foundation

- **Pre-route readiness:** Route setup checks fresh GPS, confirmation audio, device storage protection, and optional cloud status before the route starts. A route can still begin when an optional check is unavailable.
- **Route context:** Optional Apartments, Businesses, Rural, Heavy load, New area, and Weather tags help explain a workday without changing its totals. Tags stay in private route data.
- **Learned forecast:** RouteHeat saves forecast snapshots during the workday, shows a finish range with an honest confidence level, and reviews how the estimate performed after the route.
- **Tote Assistant:** Personal route and Delivery Area history estimate a typical tote size and show progress toward a likely tote change. The driver always decides when a new tote actually opens.
- **Auto-stop modes:** Off is manual-only; Suggest asks for a parked confirmation; Auto can count from the learned stop pattern. Accepted, rejected, and undone suggestions train only this installation. Manual Stop Complete and Undo remain available.
- **Appearance + App themes:** Dark, Light, and Automatic control contrast, while Default, Blue, Orange, and Purple recolor RouteHeat controls and map overlays without changing the OpenStreetMap provider.
- **Where Time Went:** Finished-route detail and reports separate recorded time into driving, service, breaks, transitions, and unclassified gaps when the available data supports it.
- **Route quality review:** Mapped-stop coverage, GPS quality and continuity, gaps, ignored jumps, and manual corrections produce a transparent confidence review. Package completeness and forecast coverage remain visible as separate report facts. A limited score never removes completed stops.
- **Private Story Studio:** Moments highlights personal turning points; Ghost Rivalries revisit comparable routes from the same driver's history; Personal Seasons summarize Winter, Spring, Summer, and Fall; and Delivery Year animates saved workdays across one calendar year.
- **Area profiles:** Drawn delivery boundaries receive private maps, trends, aggregate metrics, rescue totals, and route visit lists using only stops inside that Area.
- **Finish celebration and debrief:** A brief celebration leads directly to the full end-of-day review. Active-route achievements use a compact, nonblocking banner; the large celebration is reserved for the finished workday.
- **Reliability controls:** RouteHeat reports save health, offers a universal short-lived Undo, waits for a parked moment before applying an update, and prevents two tabs from writing the same active route unless the driver explicitly takes over.
- **Restorable backups:** Settings can create and preview a portable `.routeheat` backup. Import validates its format and checksum, previews additions and conflicts, and applies the result transactionally.

There is no public leaderboard, cross-driver ranking, team competition, or comparison with another person's route data. Delivery Rank is a private XP progression based only on this driver's own saved history.

## Existing workday tools

RouteHeat 6.1 retains the established workflow:

- Large Live and Drive stop controls, multi-location stops, pace goals, pauses, GPS breadcrumbs, audio, vibration, and tote markers
- Optional package totals and per-stop, per-location, and per-active-hour workload ratios
- Separate completed-stop sequence and Amazon stop number, including routes that begin at Amazon Stop 2 or 3
- Parked Route Tools for correcting the next Amazon stop, current tote, or a missed stop
- Continuous original and rescue phases, rescue workload estimates, finished-route reopening, and same-day route merge
- Real-route Personal Ghost levels: Off, Adaptive, Cruise, Standard, Expert, and Personal Best
- Delivery Areas, finish-range confidence, Smart Coach, History sorting, weekly recaps, achievements, and awards
- Street-following replay with scrubber, chapters, saved breaks and GPS gaps, live metrics, speeds, and optional Ghost delta
- Manual stop-location correction that preserves the original GPS point
- All-time Hotspots, Road coverage, Pace, Repeat Visits, Recency, and Tote Changes maps with advanced filters
- Recently Deleted recovery with revision-aware local and Supabase conflict protection

## Setup

RouteHeat is a static web application. It does not require a build step.

1. Keep `index.html`, `manifest.webmanifest`, `sw.js`, the setup documents, and the complete `assets` directory together.
2. For optional cloud backup, follow `SUPABASE_SETUP.md`, run `supabase-setup.sql` once, and put the project URL and browser-safe publishable key in `assets/supabase-config.js`.
3. For the optional Neighborhood Snapshot, also run `supabase-neighborhood-setup.sql`, add a free Census API key as a Supabase secret, and deploy the included authenticated `neighborhood-snapshot` Edge Function. The Census key never belongs in `assets/supabase-config.js`.
4. Host the files from HTTPS. GPS, installability, service workers, and mobile audio recovery are most reliable from a secure origin.
5. Open RouteHeat once online so the application shell can cache, then install it from the browser if desired.

Existing RouteHeat cloud projects should re-run the complete, latest, idempotent `supabase-setup.sql` once to add private Delivery Area sync. Existing route rows remain unchanged. Run `supabase-neighborhood-setup.sql` only if Neighborhood Snapshot will be used; re-run the whole 6.2 Snapshot script if an earlier preview was tested. Core route data remains schema 4, and Delivery Area definitions stay in their own RLS-protected table instead of being embedded in route rows.

## Delivery Areas

Open **History → Manage Areas** or **Settings → Delivery Areas** while parked. Create a boundary by tapping at least three map corners, optionally drag the corner handles, choose **Finish outline**, then save it. A boundary can contain 3–64 distinct corners and cannot cross itself.

- Stops exactly inside a polygon match that Area. A small 6–35 m accuracy-aware edge allowance helps genuine GPS fixes near a border; manually positioned or unknown-accuracy stops use the smallest allowance.
- When Areas overlap, the higher-priority Area wins. Equal-priority matches prefer the smaller, more specific polygon and then a stable identifier.
- Stops outside every saved boundary remain **Unassigned**. They are never removed from totals or maps.
- Multi-location counts stay attached to their completed stop. Original and rescue phases are summarized independently.
- Editing a stop location or an Area boundary recalculates derived Area analytics. RouteHeat never rewrites the immutable raw route merely to change an Area match.
- Suggested outlines are conservative drafts based on legacy GPS route patterns. Review their shape and deliberately name one before saving it as a Delivery Area.

Area definitions are stored under the private `routeheat.deliveryAreas.v1` device state, included in checksummed transactional snapshots, and included in `.routeheat` backup files. When Cloud is signed in and the latest `supabase-setup.sql` has been run, definitions also merge through the account's private `routeheat_delivery_areas` table. Offline edits and deletions queue safely; revisions and update time select the newer copy without replacing unrelated local Areas.

## Daily use

### Start and run a route

1. Park, choose **Start route**, and enter the pace goal, planned stops, and optional package total.
2. Review readiness, choose optional context tags, and enable or disable a real-route Personal Ghost.
3. Use **Suggest** while training auto-stop behavior. Confirm or dismiss suggestions only while parked. Choose **Auto** only after reviewing how suggestions behave on this device.
4. Complete normal or multi-location stops, open totes, pause breaks, and use Route Tools for corrections or rescue phases. Each trusted stop is assigned to its drawn Area independently.
5. Treat ETA, Smart Coach, Ghost, and Tote Assistant as descriptive estimates. Manual controls remain authoritative.

### Finish and review

Finishing opens a brief celebration and a full debrief with fair best/toughest stretches, day-over-day context, workload, pace, package totals, forecast review, Where Time Went, quality confidence, Ghost result, records, awards, and the optional Neighborhood Snapshot card. The regular History replay remains the place for map animation. When Snapshot is enabled, its separate network request starts only after the route has finished and saved; the report remains usable while it builds.

History contains sortable workdays, Area filters and breakdowns, replay, weekly recaps, Moments, Ghost Rivalries, Personal Seasons, and Delivery Area profiles. **All time → Delivery Year** opens the yearly time-lapse. Shared recap and Area summaries are aggregate text and omit maps, coordinates, route IDs, exact workday times, and private Area names.

## Device storage and recovery

RouteHeat uses several intentionally separate protection layers:

| Layer | What it does | Important limit |
| --- | --- | --- |
| `localStorage` | Fast working mirror for finished routes, the active draft, recovery records, Delivery Area definitions, and selected settings | Clearing website data removes it |
| IndexedDB `routeheat-storage` | Transactionally stores full History and active-route state with checksums and logical clocks | It belongs to this browser installation and can also be cleared or evicted |
| Active-current + Route Vault ring | Replaces one compact live record during normal tracking and keeps up to eight action/trail checkpoints, independently anchoring the highest verified stop progress and richest compatible GPS trail | It protects poor-data and app-switch recovery, but remains device-local |
| IndexedDB commit journal | Keeps bounded metadata such as sequence, time, reason, checksum, logical clock, and changed key names | The journal metadata is separate from the full Route Vault checkpoints |
| Supabase | Mirrors signed-in finished routes, Delivery Area definitions and tombstones, route deletion/restoration state, and any completed aggregate Neighborhood Snapshot with revision-aware conflict handling | It does **not** upload an unfinished active-route draft; Snapshot generation also needs the Edge Function setup |
| `.routeheat` file | Portable, restorable export of finished routes, an eligible active draft, recovery state, private Delivery Area names/boundaries, and selected route/auto settings | The file contains sensitive route data and must be stored securely |

On startup, RouteHeat validates the device snapshots and reconciles them with the localStorage mirror without overwriting a logically newer valid copy. If IndexedDB is unavailable, localStorage remains active and Settings reports degraded protection.

These layers do not make browser storage permanent. Do not clear website data, remove the Home Screen app, reset the browser, or reinstall before confirming that finished routes are synced or a `.routeheat` backup is safely stored elsewhere. An active draft is device-only unless it was deliberately included in a `.routeheat` file.

### `.routeheat` backup versus CSV

Use **Settings → Data protection → Create backup** for recovery:

- The file uses `format: "routeheat-backup"`, format version 1, app schema 4, and an integrity checksum.
- Import first shows new, newer, unchanged, and recovery-record counts. Nothing changes before confirmation.
- Finished routes merge by logical identity and revision/time richness rather than blindly duplicating data.
- Delivery Areas merge by stable identity and newer revision/update time. Existing newer local definitions win, and an oversized combined set is rejected before any mutation.
- A different unfinished route already on the device is preserved; a conflicting imported draft is skipped.
- Import prepares and applies a transactional snapshot. If it fails, RouteHeat rolls back to the prior device state.

A `.routeheat` file is JSON and is **not encrypted by RouteHeat**. Keep it in protected device or cloud storage and never publish it; it can contain GPS coordinates and an active draft.

CSV is the 52-column analysis/archive export for spreadsheets and external tools. The original 44 columns remain in the same order; eight appended fields describe the derived primary, phase, and event Delivery Area matches. It also retains legacy Route Family compatibility fields. RouteHeat does not import CSV, so CSV alone cannot rebuild History, Delivery Area boundaries, or Recently Deleted state.

### Recently Deleted and cloud restore

Recently Deleted lists only entries that still contain a complete finished-route recovery copy. Eligible local recovery works while offline or signed out, then cloud reactivation waits for the next authenticated sync. Keep the installation and its data until **Sync now** confirms success. Stale older revisions and unmarked legacy tombstones cannot silently re-delete a newer restored route; a future intentional deletion still works normally.

## Offline and PWA behavior

- After one successful online load, the service worker caches the application shell for offline route entry and history access.
- GPS stop logging, device snapshots, `.routeheat` export/import, and finished history can work without cloud connectivity.
- Supabase sign-in/sync, Neighborhood Snapshot generation/refresh, new Route Atmosphere lookups, the first screenshot-reader load, application updates, and OpenStreetMap tiles require a network connection.
- An uncached or offline map may be blank while stop totals and GPS data continue recording.
- Mobile operating systems can suspend GPS or audio after backgrounding. Return to RouteHeat and use the next parked tap if the OS requires a fresh audio gesture.

### GitHub Pages deployment and updates

1. Upload the **contents** of the RouteHeat package to the repository root; do not upload only a ZIP or create an extra outer folder.
2. Replace `index.html`, `manifest.webmanifest`, `sw.js`, documentation, and the complete `assets` directory as one release. Cache names and local asset query versions must match that release.
3. In **Settings → Pages**, deploy the `main` branch from `/ (root)` and wait for the deployment to finish.
4. Open the published URL once while online. Fully close and reopen the installed PWA; apply an in-app update only while parked.
5. Never clear website data or uninstall/reinstall merely to force an update. Create a `.routeheat` backup first if removal is unavoidable.

On iPhone, open the published URL in Safari and use **Share → Add to Home Screen**. On Android, use Chrome's **Install app** or **Add to Home screen**.

## Privacy and map tiles

- Delivery Area names and boundary geometry remain device-private while signed out. When Cloud is signed in, they are uploaded only to that account's separate RLS-protected Delivery Area table so another signed-in installation can restore them; they are never embedded in shared summaries or route rows.
- Route history, context tags, automatic-stop training, Moments, Seasons, Ghosts, and forecasts remain on the device unless included in a `.routeheat` file or, for supported finished-route data, synced to the signed-in Supabase account.
- Supabase Row Level Security restricts cloud rows to the signed-in account.
- Neighborhood Snapshot is optional and off by default. When enabled and requested, Supabase reads only the required fields from the already cloud-synced finished route and temporarily sends valid stop coordinates to U.S. Census services to identify Census tracts. The returned route card stores aggregate tract estimates, coverage, and source metadata—not addresses, individual property records, or another copy of stop coordinates.
- Neighborhood values use the 2020–2024 American Community Survey 5-year Detailed Tables. They can lag current market conditions and carry sampling uncertainty. “Typical delivered-area median value” is a stop-weighted median of tract estimates, not a value for any house on the route.
- This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.
- Route Atmosphere uses a date and one representative coordinate rounded to `0.01°` with Open-Meteo; it never sends the full trail, stop list, address, packages, Amazon summary, screenshot, or account identifier. Open-Meteo receives normal network metadata and may apply its own retention policy. Saved weather values are approximate modeled aggregates under CC BY 4.0, not observations from a weather station on the route.
- Amazon summary screenshots and raw OCR text stay ephemeral in the browser. Tesseract.js and its English model are loaded from jsDelivr only after an explicit scan request; they read the temporary downsized canvas on the device. Only user-confirmed numeric summary fields can be saved with the route.
- Shared summaries deliberately omit precise route geometry and private identifiers, but always review generated text before sharing.
- OpenStreetMap tiles are fetched from an external tile service. That provider can receive normal network metadata and the geographic tile coordinates requested for the visible map. RouteHeat does not send stop notes, package counts, Area names/boundaries, or full saved route records to the tile provider.
- Repeat Stops groups approximate GPS areas, not verified street addresses.
- CSV and `.routeheat` files can contain precise location history. Treat them as private.

## Main files

- `index.html` — accessible mobile interface and modal shells
- `assets/styles.css` — established Dark/Light appearance, app-theme accents, responsive, reduced-motion, and map presentation
- `assets/routeheat-7.css` — Route Atmosphere, scanner, Pace Orchestra, and story-feature presentation
- `assets/routeheat-8.css` — shared RouteHeat 8 visual system, Drive Pro, responsive polish, and accessibility layer
- `assets/app.js` — route workflow, 7.0 integration, intelligence, local recovery, backup/import, history, reports, and maps
- `assets/route-atmosphere.js` — coarse-location modeled conditions, aggregation, moon phase, and cards
- `assets/route-intake.js` — editable summary parser and lazy on-device screenshot OCR
- `assets/pace-orchestra.js` — deterministic local Web Audio route compositions
- `assets/routeheat-storage.js` — IndexedDB transactional snapshots and metadata journal
- `assets/cloud.js` — Supabase authentication, finished-route sync, deletion, and restore conflict handling
- `assets/supabase-config.js` — Supabase project URL and browser-safe publishable key
- `manifest.webmanifest` and `sw.js` — installation metadata and offline application-shell cache
- `supabase-setup.sql` and `SUPABASE_SETUP.md` — optional core cloud setup
- `supabase-neighborhood-setup.sql` — aggregate Snapshot cache, protected rate limit, and cleanup migration
- `supabase/functions/neighborhood-snapshot/index.ts` and `supabase/config.toml` — authenticated Census Edge Function source and deployment configuration

Map data is provided by OpenStreetMap and displayed with Leaflet. Density rendering uses Leaflet.heat.

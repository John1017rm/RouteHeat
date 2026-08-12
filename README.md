# RouteHeat

RouteHeat is a mobile-first delivery performance tracker for iPhone and Android. It combines one-tap stop logging, GPS route maps, pace goals, tote tracking, route history, reports, replay, and long-term delivery-density analysis.

> **Safety:** Only interact with RouteHeat while parked. Never use the app while driving.

## Features

- RouteHeat 3.0 Settings center with Dark, high-contrast Sunlight, and Automatic themes
- Crash/reload-safe active-route recovery for stops, totes, multi-locations, and GPS traces
- Configurable chime, bell, voice, and extra-loud stop confirmations with volume and vibration controls
- Live GPS freshness, accuracy, battery availability, and local-storage health indicators
- Route Load Index, comparable-route performance insights, and progress/lifetime milestones
- Permanent Awards & Milestones center with 28 collectible badges, including 200-stop and 300-location routes, time-of-day achievements, locked-goal progress, delivery levels, lifetime XP, personal records, totals, closest goals, recent achievements, and sharing
- Fast branded launch experience that preserves immediate access to route controls
- Live OpenStreetMap that follows the driver's GPS position
- iPhone safe-area-aware status header with crisp logo, sync, and GPS indicators
- GPS breadcrumb recording that traces the vehicle's driven street path
- Focused Drive mode with a large stops-per-hour speedometer
- Live Drive-mode stop-goal progress with percentage and stops remaining
- Large sticky **Stop Complete** action and compact **New Tote** action
- Manual and optional experimental automatic stop detection
- Segment and overall stops-per-hour calculations
- Louder three-note stop confirmation with visual and vibration feedback
- Pace goal, planned stop count, and projected finish time
- Pause and break tracking excluded from active pace
- Numbered stop and tote markers on live and saved maps
- Numbered New Tote confirmation with distinct purple visual feedback
- Multi-location stop tracking that preserves Amazon stop pace while recording actual delivery locations
- Orange-ring multi-stop markers, workload-aware density maps, reports, and CSV location counts
- Saved route history with CSV export
- Confirmed route deletion with an app-level local deletion ledger and legacy-cloud fingerprint cleanup
- Animated chronological route replay along the recorded street path with 0.5×, 1×, 2×, and 4× speed controls
- End-of-day report card with route highlights and sharing
- Tote analytics including stops per tote, average tote time, and recent performance
- Tappable full tote-performance history with per-tote time, stop range, and pace
- Smooth delivery-density heat map with 7-day, 30-day, and all-time filters
- Lifetime street-coverage map with recorded mileage and every mapped delivery
- Full-screen lifetime street, density, and pace maps
- Alternate neighborhood pace map
- Secure Supabase cloud backup with email/password sign-in, automatic sync, offline retry, and new-device restore
- Installable PWA shell and device-local history

## Publish on GitHub Pages

1. Create a public GitHub repository.
2. Upload the **contents of this folder** to the repository root. Do not upload only the ZIP file.
3. Open **Settings → Pages** in the repository.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then save.

GitHub will show the public site address after deployment. GPS access requires HTTPS, which GitHub Pages provides automatically.

## Install on iPhone

Open the published site in Safari, tap **Share**, choose **Add to Home Screen**, and allow precise location access when prompted.

## Install on Android

Open the published site in Chrome, open the browser menu, and choose **Install app** or **Add to Home screen**. A separate Android Studio wrapper project is also available for building an APK.

## How route data works

- While a route is running, RouteHeat continuously keeps a temporary recovery draft on the device. If the page reloads or the app closes unexpectedly, the next launch offers to resume or discard it. Finishing the route clears the draft and saves the completed route normally.
- History remains cached in the installed app for offline use. After cloud sign-in, finished routes are also backed up to the signed-in Supabase account.
- Existing local routes upload during the first successful cloud sync. A new device can restore cloud routes by signing in with the same email and password.
- Complete the one-time instructions in `SUPABASE_SETUP.md` before using the Cloud button.
- Stops without GPS coordinates remain in route statistics but cannot appear on maps or heat layers.
- Street traces are recorded for routes completed after the street-recording update; older routes retain their stop markers but cannot recreate a road path that was never captured.
- For best street coverage, keep RouteHeat open with precise location enabled. Mobile browsers can reduce or pause GPS updates when the screen is locked or the app is backgrounded.
- The recorded line follows frequent GPS breadcrumbs rather than calling an external road-snapping service. It should closely follow the driven street when GPS reception is good, but weak reception can create drift or gaps.
- Tote analytics begin when **New Tote** is used during a route.
- Density colors show where deliveries overlap most; pace colors show relative neighborhood performance.
- The app shell is cached after the first successful visit. Uncached map tiles still require internet access.

## Main files

- `index.html` — application interface
- `assets/styles.css` — responsive Dark and Sunlight theme system
- `assets/app.js` — GPS, route, history, analytics, report, and replay behavior
- `assets/cloud.js` — secure authentication, automatic backup, offline retry, and restore behavior
- `assets/supabase-config.js` — Supabase project URL and browser-safe publishable key
- `manifest.webmanifest` — installable app metadata
- `sw.js` — offline application-shell caching
- `supabase-setup.sql` — protected database table and Row Level Security policies
- `SUPABASE_SETUP.md` — one-time Supabase dashboard instructions

Map data is provided by OpenStreetMap and displayed with Leaflet. Smooth density rendering uses Leaflet.heat.

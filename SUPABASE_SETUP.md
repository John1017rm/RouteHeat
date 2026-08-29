# RouteHeat 6.5.0 Supabase setup

Complete these steps once before using the **Cloud** button in RouteHeat. Custom SMTP is not required.

## 1. Create the protected cloud tables

1. Open your Supabase project.
2. Open **SQL Editor**.
3. Choose **New query**.
4. Copy all of `supabase-setup.sql` into the query.
5. Click **Run**.

The script creates the `routeheat_routes` and `routeheat_delivery_areas` tables, grants access only to signed-in users, and adds Row Level Security policies that limit every account to its own rows. The Delivery Area table stores private names, colors, priorities, and boundary coordinates separately from finished routes. Compact deletion tombstones prevent an older offline device from recreating an Area that was intentionally deleted.

If cloud backup was configured for an earlier RouteHeat release, run the complete latest `supabase-setup.sql` again. It is idempotent: existing route rows stay in place while the Delivery Area table, policies, indexes, and stale-write guard are added.

## 2. Add Neighborhood Snapshot (optional)

Skip this section if you only want cloud route backup. RouteHeat tracking, finishing, history, and sync do not depend on Census.

### A. Create the aggregate-only tables

1. In **SQL Editor**, create another query.
2. Copy all of `supabase-neighborhood-setup.sql` into it.
3. Click **Run**.

This idempotent script creates a private per-route aggregate snapshot cache, a service-only Census tract cache, narrow Row-Level-Security route-input RPC, generation/version locks, atomic per-user and project-wide rate limits, and cleanup for deleted routes. It stores no stop-coordinate list. If you tested a pre-release 6.2 script, run the complete latest file again before deploying the function.

### B. Request a free Census API key

Request a key from the official [U.S. Census Data API key page](https://api.census.gov/data/key_signup.html). Keep the key private. It belongs only in Supabase Edge Function secrets—never in GitHub, `index.html`, `assets/supabase-config.js`, Android files, screenshots, or chat messages.

### C. Link and configure Supabase

Open a terminal in the unzipped RouteHeat folder, then run these commands one at a time:

```text
npx supabase@latest login
npx supabase@latest link --project-ref wuhirhbqodkbwqjwpjyl
npx supabase@latest secrets set CENSUS_API_KEY=PASTE_YOUR_PRIVATE_CENSUS_KEY_HERE
npx supabase@latest secrets set CENSUS_ACS_YEAR=2024
npx supabase@latest secrets set CENSUS_GEOGRAPHY_VINTAGE=ACS2024_Current
npx supabase@latest secrets set CENSUS_BENCHMARK=Public_AR_Current
npx supabase@latest secrets set ROUTEHEAT_ALLOWED_ORIGINS=https://john1017rm.github.io,https://appassets.androidplatform.net
npx supabase@latest functions deploy neighborhood-snapshot
```

The included `supabase/config.toml` keeps JWT verification enabled. Only a signed-in RouteHeat user can invoke the function, and the function reads a minimized stop/phase projection of that user's finished route through the existing Row Level Security policy. Route revision, update time, and server generation must still match when a cache hit is returned or a new result is stored. Do not deploy it with `--no-verify-jwt`.

The 2024 ACS 5-year release represents data collected during 2020–2024. Keep `CENSUS_ACS_YEAR=2024` paired with `CENSUS_GEOGRAPHY_VINTAGE=ACS2024_Current`; do not switch only one value.

### D. Turn it on in RouteHeat

After publishing 6.5.0, open **Settings → Neighborhood Snapshot**, review the disclosure, and enable **Build after finished routes**. The first build requires:

- a finished route with trusted mapped stops;
- a successful Cloud sign-in and sync;
- internet access; and
- the SQL, secrets, and Edge Function above.

The route finishes first. Snapshot work runs separately and cannot keep a rescue or normal route active. If Cloud is unavailable at finish, the build is queued in protected device storage and resumes later. A completed aggregate card remains available offline and follows the route into `.routeheat` backups.

## 3. Temporarily allow account creation without email

1. Open **Authentication -> Sign In / Providers**.
2. Open the **Email** provider.
3. Keep **Enable Email provider** turned on.
4. Turn on **Allow new users to sign up** temporarily.
5. Turn off **Confirm Email**.
6. Save the changes.

Turning off Confirm Email lets RouteHeat create your password account immediately, so no email template, magic link, or SMTP service is needed.

## 4. Publish the updated app

Upload the contents of this RouteHeat package to the root of the GitHub repository. Keep the existing installed iPhone app; do not delete it. Opening the published app again will install the update while preserving its device-local route data.

## 5. Create your RouteHeat account once

1. Open RouteHeat from the existing Home Screen icon.
2. Tap **Cloud off** in the header.
3. Enter your email address.
4. Create a strong, unique password with at least 8 characters and save it in your password manager.
5. Tap **First time? Create account**.
6. Wait for the status to say that the cloud backup is complete.

The first sync uploads existing local history and saved Delivery Areas. Keep RouteHeat open until it reports both the route and Area counts are protected. Area changes made offline remain on the device and sync after connectivity returns; revision-aware merging keeps the newer edit, and an intentional deletion wins an exact version tie.

## 6. Close public account creation

After your account is working:

1. Return to **Authentication -> Sign In / Providers -> Email** in Supabase.
2. Turn off **Allow new users to sign up**.
3. Save the change.

Leave **Enable Email provider** on. Leave **Confirm Email** off unless you later connect custom SMTP and intentionally add email verification.

The app's Create account button can remain visible; Supabase will reject new accounts after signups are disabled. On another device, use **Sign in and sync** with the same email and password.

## 7. Site address

Under **Authentication -> URL Configuration**, use:

- **Site URL:** `https://john1017rm.github.io/RouteHeat/`
- **Redirect URL:** `https://john1017rm.github.io/RouteHeat/`

Password sign-in does not depend on an emailed redirect, but keeping the correct site address makes the project ready for future recovery-email support.

## Security notes

- The GitHub app contains only the Supabase publishable key, which is intended for browser clients.
- Never put a `service_role` key, secret key, database password, or JWT secret in GitHub.
- Never put `CENSUS_API_KEY` in the static app. The Edge Function reads it from Supabase secrets.
- The Neighborhood Function accepts only a route ID. It reads the caller's own non-deleted finished route through RLS, uses Census services to match valid stop coordinates to tracts, and returns aggregate ACS estimates. It does not return coordinates or addresses.
- Census tract values are statistical estimates with 90% margins of error, not appraisals or current individual-home prices.
- This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.
- RouteHeat continues recording locally when offline.
- Delivery Areas remain available locally while offline. When signed in, their names and boundary coordinates are copied to the account's private RLS-protected table so they can return on another signed-in installation.
- Signing out does not erase local routes from the device.
- Without custom SMTP, RouteHeat cannot send password-reset emails. Save the password in a password manager.
- Export your route history before deliberately changing to a different cloud account.

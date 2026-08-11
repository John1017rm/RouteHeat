# RouteHeat Supabase setup

Complete these steps once before using the **Cloud** button in RouteHeat. Custom SMTP is not required.

## 1. Create the protected route table

1. Open your Supabase project.
2. Open **SQL Editor**.
3. Choose **New query**.
4. Copy all of `supabase-setup.sql` into the query.
5. Click **Run**.

The script creates the `routeheat_routes` table, grants access only to signed-in users, and adds Row Level Security policies that limit every account to its own rows.

## 2. Temporarily allow account creation without email

1. Open **Authentication -> Sign In / Providers**.
2. Open the **Email** provider.
3. Keep **Enable Email provider** turned on.
4. Turn on **Allow new users to sign up** temporarily.
5. Turn off **Confirm Email**.
6. Save the changes.

Turning off Confirm Email lets RouteHeat create your password account immediately, so no email template, magic link, or SMTP service is needed.

## 3. Publish the updated app

Upload the contents of this RouteHeat package to the root of the GitHub repository. Keep the existing installed iPhone app; do not delete it. Opening the published app again will install the update while preserving its device-local route data.

## 4. Create your RouteHeat account once

1. Open RouteHeat from the existing Home Screen icon.
2. Tap **Cloud off** in the header.
3. Enter your email address.
4. Create a strong, unique password with at least 8 characters and save it in your password manager.
5. Tap **First time? Create account**.
6. Wait for the status to say that the cloud backup is complete.

The first sync uploads existing local history. Keep RouteHeat open until it reports success.

## 5. Close public account creation

After your account is working:

1. Return to **Authentication -> Sign In / Providers -> Email** in Supabase.
2. Turn off **Allow new users to sign up**.
3. Save the change.

Leave **Enable Email provider** on. Leave **Confirm Email** off unless you later connect custom SMTP and intentionally add email verification.

The app's Create account button can remain visible; Supabase will reject new accounts after signups are disabled. On another device, use **Sign in and sync** with the same email and password.

## 6. Site address

Under **Authentication -> URL Configuration**, use:

- **Site URL:** `https://john1017rm.github.io/RouteHeat/`
- **Redirect URL:** `https://john1017rm.github.io/RouteHeat/`

Password sign-in does not depend on an emailed redirect, but keeping the correct site address makes the project ready for future recovery-email support.

## Security notes

- The GitHub app contains only the Supabase publishable key, which is intended for browser clients.
- Never put a `service_role` key, secret key, database password, or JWT secret in GitHub.
- RouteHeat continues recording locally when offline.
- Signing out does not erase local routes from the device.
- Without custom SMTP, RouteHeat cannot send password-reset emails. Save the password in a password manager.
- Export your route history before deliberately changing to a different cloud account.

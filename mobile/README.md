# Vows & Vibe mobile

The mobile app bundles the original React fitting, dress, colour, suggestion, and lineup components with Vite and Capacitor. Fonts, palette, imagery, and styling remain shared with the web app. Home, login, dashboard, navigation, and touch controls are adapted for phones. It is not an exact copy of every web screen.

This is a separate worktree. The original web worktree and deployment have not been changed. A live mobile build needs this updated backend on a reachable HTTPS deployment or a tunnel to the local server.

The existing live debug APK is [artifacts/vowsvibe-live-debug.apk](artifacts/vowsvibe-live-debug.apk). It was built on 2026-09-16 and connects to the local backend on port 3184 through `https://race-reliable-mumble.ngrok-free.dev`. It predates the source-only One-Time Wedding Pass wording and one-wedding enforcement described below; no replacement APK was built for that change. Keep the computer, local Next server, and ngrok running during phone testing. The public-only `mobile/.env.local` is configured; backend secrets remain in the root environment. Changing the tunnel URL requires a rebuild. Its SHA-256 is recorded in [artifacts/vowsvibe-live-debug.apk.sha256](artifacts/vowsvibe-live-debug.apk.sha256).

## First-time setup and checks

Use Node 22 or later. From the `mobile` directory:

```sh
npm ci --ignore-scripts
# First setup only; do not overwrite an existing live configuration.
cp .env.example .env.local
npm run dev
npm run typecheck
npm run typecheck:backend
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npm run test:browser
npm run build
npm run android:sync
```

Browser checks use local demo and live-mode servers, simulated touch input, three viewport sizes, and controlled HTTP/auth/realtime responses. They do not contact production services or prove device behavior. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an installed Chromium browser.

## After an edit: rebuild the APK

An APK contains a snapshot of the mobile frontend and every `VITE_*` value. After editing `mobile/src`, a shared component imported by mobile, native Android configuration, a Capacitor dependency, or `mobile/.env.local`, run this from the repository root:

```sh
cd /home/huzaifa-aqeel/vowsvibe-mobile
npm run typecheck

cd mobile
npm run typecheck
npm run typecheck:backend
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npm run test:browser
npm run android:sync

cd android
ANDROID_HOME=/home/huzaifa-aqeel/Android/Sdk ./gradlew assembleDebug --console=plain

cd ../..
cp mobile/android/app/build/outputs/apk/debug/app-debug.apk mobile/artifacts/vowsvibe-live-debug.apk
/home/huzaifa-aqeel/Android/Sdk/build-tools/36.1.0/apksigner verify mobile/artifacts/vowsvibe-live-debug.apk
sha256sum mobile/artifacts/vowsvibe-live-debug.apk > mobile/artifacts/vowsvibe-live-debug.apk.sha256
```

Use the checks that cover the edit while working; run the complete sequence before sharing an APK. `npm run android:sync` is required because it builds the Vite frontend, copies it into Android, and refreshes native plugins. The final APK is `mobile/artifacts/vowsvibe-live-debug.apk`.

Different changes require different follow-up work:

| Change | Required action |
| --- | --- |
| Mobile/shared UI or mobile behavior | Type-check, relevant tests, browser checks, `android:sync`, and APK rebuild. |
| `mobile/.env.local`, API URL, invitation URL, or public SDK key | `android:sync` and APK rebuild; these values are compiled into the app. |
| Capacitor/native dependency, manifest, or Gradle file | Install dependencies if changed, then `android:sync` and APK rebuild. |
| Backend route or private root environment value only | Restart/redeploy the backend and run backend checks. Rebuild the APK only if its public URL or mobile contract changed. |
| `supabase/schema.sql` | Run the updated SQL in the Supabase SQL Editor before testing the affected feature, then run the backend checks. |
| New ngrok session | Put its HTTPS URL in both `VITE_API_BASE_URL` and `VITE_INVITE_BASE_URL`, then rebuild the APK. |

For local phone testing, keep these running in separate terminals from the repository root:

```sh
MOBILE_ALLOWED_ORIGINS=https://localhost npm run dev -- --port 3184
ngrok http 3184
```

After ngrok starts, confirm its HTTPS URL matches `VITE_API_BASE_URL` and `VITE_INVITE_BASE_URL` in `mobile/.env.local`. A changed URL requires another APK build. Backend-only edits require a Next server restart when the development server does not reload them automatically.

## Connect the live app

Set `VITE_APP_MODE=live` in `mobile/.env.local`, plus:

- `VITE_API_BASE_URL`: the HTTPS deployment or development tunnel of the backend from this worktree.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: the same project's public URL and anon/publishable key as the backend.
- `VITE_INVITE_BASE_URL`: the HTTPS site that serves web invitations. This defaults to the API deployment. Invites remain usable in a browser when the app is not installed.

Rebuild and sync after changing settings. Missing/invalid live settings show a setup error. Live requests never silently use demo weddings or AI results. The app refreshes sessions, attaches bearer tokens to its configured API only, and keeps anonymous bridesmaid requests authorized with their invitation session token.

Keep Supabase service-role, YouCam, Groq, DashScope, and RevenueCat secret keys on the backend. Every `VITE_*` value is public build configuration. The mobile build does not load the original web app's environment file.

Configure the root backend using its `.env.example` and existing Supabase schema/migrations, storage bucket (`vto-renders`), RLS policies, and `lineup_updates`/suggestion realtime setup. The existing root README describes the AI providers and schema. New API routes provide owner-only event/lookbook data, public invitation styling, and optional server-verified billing access. The backend continues to support the original web cookie sessions.

Set backend `MOBILE_ALLOWED_ORIGINS` to exact allowed origins, including `https://localhost` for the bundled Android app. For local browser development add `http://127.0.0.1:5174` and any other port you use. A development mobile browser can use HTTP localhost API URLs; a physical phone cannot reach your computer through its own localhost. Use an HTTPS development deployment/tunnel for that check.

For the current local test setup, run the root backend with `MOBILE_ALLOWED_ORIGINS=https://localhost npm run dev -- --port 3184` and `ngrok http 3184`. The transport bypasses the free tunnel's browser warning for backend API requests, and backend CORS permits that header.

## Google sign-in and invitation links

Enable Google in Supabase Auth. Google's authorized redirect URI is the Supabase project's `/auth/v1/callback`. Add these permitted redirects in Supabase:

- `com.vowsvibe.mobile://auth/callback` for Android PKCE login.
- The exact browser origin plus `/auth/callback`, for example `http://127.0.0.1:5174/auth/callback` during development.

The app opens the provider through Capacitor Browser and exchanges the returned code. Native auth sessions and the PKCE verifier use Capacitor Preferences; sessions are removed on sign-out. Preferences is persistent app storage, not hardware-backed encrypted storage.

Android supports `com.vowsvibe.mobile://invite/CODE` and HTTPS `/invite/CODE`. Android builds derive the App Link hostname from `VITE_INVITE_BASE_URL` in `mobile/.env.local`; `VOWSVIBE_APP_LINK_HOST` can override it for CI or a one-off build, and the fallback is `vowsvibe-one.vercel.app`. Serve `/.well-known/assetlinks.json` on that host and set backend `ANDROID_APP_LINK_SHA256` to the signing certificate fingerprints (include Play App Signing's certificate for Play releases; debug certificates are separate). The added route emits the association for `com.vowsvibe.mobile`. Without a deployed valid association, HTTPS invitations still open the website.

The current live configuration claims `vowsvibe-one.vercel.app` from `VITE_INVITE_BASE_URL`. The Vercel deployment must serve the installed APK's signing fingerprint from `/.well-known/assetlinks.json`; Android can retain an older per-app “Open supported links” preference, so confirm that setting when a previously installed debug build still opens the browser.

Bridesmaids can reopen their fitting room using the stored private invitation session on the original app/browser. Knowing an existing guest's name does not grant her token or photos; a different device needs a distinct guest name. Cross-device guest account recovery is not implemented. Existing source-photo storage uses public URLs; invitation/account authorization does not turn those URLs into private signed links.

## Camera and AI

The default native selfie button uses Capacitor Camera, returns a resized image to the existing skin-tone endpoint, and offers file upload after permission/camera failures. Cancelling capture leaves the fitting room usable. Selfies are not saved to the gallery or app storage by this capture flow. Full-body and dress files use the existing resized upload workflow.

`VITE_CAMERA_KIT_ENABLED=true` enables the original guided browser camera instead. It needs the web app's Perfect Corp Camera Kit project/domain configuration. Real tone analysis and try-ons require the backend's YouCam credentials; colour resolution needs Groq; group preview generation needs DashScope. Credential probes reached YouCam/DashScope validation, but real image generation was not run. The selected `qwen/qwen3.8-27b` is configured in the root environment and server default. A real colour request through the tunnel returned HTTP 200 with Dusty Rose `#C08081`, family `pink`, after the user enabled permission. No APK rebuild is needed for this backend model change. Exact palette matches do not call Groq.

## One-Time Wedding Pass

Set `VITE_REVENUECAT_API_KEY` to a public Test Store `test_` key for development or an Android `goog_` key for a live build. In RevenueCat, create the non-consumable product `vows_vibes_pro_wedding_pass` with display name `Vows & Vibe Pro Wedding Pass` and customer-facing title `Vows & Vibe Pro — One-Time Wedding Pass`. Attach it to the existing `vows_vibes_pro` entitlement, then replace the old product in the `default` offering with a custom `wedding_pass` package. Empty `VITE_REVENUECAT_OFFERING` selects the current offering. The custom purchase screen loads the package and localized price, reconciles completed purchases with the backend, refreshes access automatically, and uses the signed-in Supabase bride ID as the customer ID. RevenueCat dashboard paywall templates are not displayed by this custom screen.

Set backend `REVENUECAT_PRO_ENTITLEMENT=vows_vibes_pro`, `REVENUECAT_PRO_PRODUCT_IDS=vows_vibes_pro_lifetime,vows_vibes_pro_wedding_pass`, and `REVENUECAT_SECRET_API_KEY` to a RevenueCat confidential `sk_` API key. Access is verified by the backend against the authenticated bride. The product allowlist recognizes the intended one-time pass if RevenueCat's entitlement mapping is briefly delayed, but each product must still be attached to `vows_vibes_pro` so the client SDK reports the same access. Invited bridesmaids share the bride's verified pass; they never purchase separately. The free bride plan remains available when RevenueCat is unconfigured, while pass-only functions remain locked. `REVENUECAT_ALLOW_SANDBOX=true` is required for Test Store validation. Apply the latest `supabase/schema.sql`, or at minimum `supabase/migrations/20260928000000_revenuecat_webhooks.sql` on an existing database, so the server-only RevenueCat tables are available.

Set `REVENUECAT_WEBHOOK_AUTHORIZATION` on the backend to a private value such as `Bearer <strong-random-secret>`. In RevenueCat, add `https://vowsvibe-one.vercel.app/api/webhooks/revenuecat` as the webhook URL and enter that exact value as its Authorization header. The webhook authenticates with a timing-safe comparison, records event IDs idempotently, and fetches the current subscriber before updating the server-only entitlement snapshot. The purchase screen polls the authenticated billing endpoint briefly after checkout, so either the direct RevenueCat check or the webhook makes Pro appear without a manual refresh. Protected paid operations still verify RevenueCat directly and do not trust a stale cache.

The pass covers one wedding per bride account. It grants eight total successful AI try-ons and one saved skin-tone analysis per participant, plus group previews, collaboration, and exports. These AI allowances never reset, and no credit top-up is currently offered. When one participant uses all eight try-ons, only that participant's new generations are blocked; her saved looks and the rest of the wedding remain available. RevenueCat keeps a non-consumable entitlement active permanently, while this app treats it as the fixed allowance for the account's single wedding.

The SDK, bride-only purchase screen, automatic account-based access checks, server verification, shared bridesmaid access, free/paid limits, and pass feature gates are implemented in source. Local development currently uses a RevenueCat Test Store public key, a confidential backend `sk_` key and sandbox entitlement acceptance. Replace the public key with the Android `goog_` key and disable `REVENUECAT_ALLOW_SANDBOX` for a production release. Confirm the current offering points to the intended non-consumable Wedding Pass before the next purchase test.

Actual purchases and Android payment transitions require final device/store testing. No transaction was performed here.

## Final Android validation

The Android project is synced with the live frontend and all seven native plugins. The live debug APK was compiled and its signature verified; it is available at `artifacts/vowsvibe-live-debug.apk`. Packaged settings were checked for the expected local tunnel URL and absence of the configured backend secret values. Physical-device validation remains for the user.

After configuring the live environment and installing the Android SDK/JDK required by the project's Gradle configuration:

```sh
npm run android:build
```

Set `ANDROID_HOME` to your SDK path if needed. Install the generated debug APK, then verify Google login (including returning from the browser and a cold start), invitation links, sign-out/account switching, camera permissions/cancellation, photo uploads, real AI generation/confirmation, party updates/suggestions, lineup save/export/share, rotation/safe areas, offline recovery, and the Test Store Wedding Pass purchase/cancellation. A release needs your signing configuration and store setup. An APK build alone is not proof those integrations work.

Official references: [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Capacitor Camera](https://capacitorjs.com/docs/apis/camera), [RevenueCat Capacitor setup](https://www.revenuecat.com/docs/getting-started/installation/capacitor).

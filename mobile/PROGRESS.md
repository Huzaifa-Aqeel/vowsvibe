# Mobile implementation status

Updated 2026-09-16, Asia/Karachi. Separate vowsvibe-mobile worktree; changes are uncommitted. The original web worktree and deployment have not been changed.

## Implemented

| Area | Current state |
| --- | --- |
| Original UI | Shared fitting, dress analysis, palette, lineup, and suggestion components retained. The bride entry uses the same split-layout language as the web/bridesmaid entry, while mobile dashboard/navigation and touch layouts are adapted. |
| Runtime | Explicit offline demo and configurable live mode; invalid live settings show setup errors. Live requests never substitute demo responses. |
| Auth | Supabase PKCE Google sign-in, native browser/callback and cold-start links, persistent native session/verifier storage, refresh, private route guards, sign-out. |
| Weddings | Account-scoped listing and creation/editing; one wedding per bride account; owner-only event/lookbook API. Dashboard cards omit style guidance, destructive controls, and a second-event action; the protected deletion API remains available. |
| Bride | Photo/dress persistence, tone analysis, backend try-on/polling/confirmation/lookbook. Failed saves report errors. |
| Bridesmaids | Real invitations, anonymous join, token-authorized uploads/dresses/tone/try-on/confirmation; original-device session restoration and service failure retry. Duplicate names do not disclose guests' credentials. |
| Lineup | Cloud save, sanitized realtime party updates, participant image reconciliation preserving local edits, movement/undo/layers/hide, export and native file/share adapters. Group preview, PNG export, and save actions hide in landscape to maximize canvas space. |
| Suggestions | Original HTTP/Supabase realtime components use live account/participant authorization. Local demo delivery/isolation separately tested. |
| Group preview | Backend AI generation, venue upload and preview save connected; transport permits long server work. |
| Wedding Pass | RevenueCat Capacitor SDK, bride-only one-time purchase screen, automatic account-based access checks, server-authoritative `vows_vibes_pro` verification, shared bridesmaid access, fixed free/paid quotas, dashboard status, and paid feature gates are implemented. RevenueCat product replacement, a server secret, and a real test purchase remain. |
| Native | Capacitor Android app/browser/camera/preferences/filesystem/share/purchases plugins; native back, custom auth/invite links, configurable verified HTTPS App Links. |
| Backend | Public settings separated from secrets; exact-origin CORS; verified bearer auth preserving RLS and web cookie sessions. |

## Verification

- 46 unit/backend tests passed: demo persistence, config/key guards, token routing, multipart/cancellation/timeouts, tunnel warning bypass, OAuth callbacks, purchase identity retry/serialization, entitlement rules, actual Supabase bearer transport, CORS, owner-only data, invitation privacy, guest upload authorization, and colour resolver validation/permission errors.
- 69 browser checks passed at 390×844, 360×740, and 844×390, including dashboard cleanup, bride entry, landscape canvas controls, and saved-room service failure recovery.
- The previous mobile TypeScript/Vite production build, Capacitor sync, Android `assembleDebug`, signature validation, manifest inspection, and bundle-integrity checks passed. All seven native plugins are registered. The existing APK is `mobile/artifacts/vowsvibe-live-debug.apk` (12,562,321 bytes, SHA-256 `1301d92c16dfdf78b724cca24eea43bb9ba5f0d226944c508a4bdd78b91d1d19`), but it predates the source-only One-Time Wedding Pass changes. No replacement APK was built at the user's request.
- Shared backend TypeScript and full Next production build passed using placeholder build settings. The existing local sharp native dependency was rebuilt successfully.
- Targeted lint passed: no errors; six image warnings in Vite adapters/shared UI.
- Mobile dependency audit: zero known vulnerabilities. The xcode UUID override was checked for API compatibility.

Live browser regression checks use controlled HTTP/auth/realtime responses. Real Google authentication, cloud suggestion delivery, AI image generation results, native SDK behavior, and store transactions are not validated. No wedding database writes, deployments, purchases, or device testing were performed.

## Checks after the root environment was supplied

- Root Supabase credentials work: all seven required tables/column sets are accessible, the public vto-renders bucket exists, Google is enabled, and the anonymous participant probe exposed no private rows.
- YouCam accepts the supplied key: a nonexistent-task check reached task validation; an invalid key control returned 401. No image generation was run.
- DashScope generation reached invalid-input validation (400 InvalidParameter), indicating that the generation endpoint accepts the credentials. Model listing separately returned 403 Workspace.AccessDenied; this is not evidence that image generation credentials are invalid. Actual generation remains untested.
- At the user's request, backend settings, the code default, and example settings now use qwen/qwen3.8-27b after its permission was enabled. A real colour request through the current tunnel returned HTTP 200, Dusty Rose #C08081, family pink. The four colour resolver regression tests also passed. The existing live APK uses this server setting without a rebuild. Exact wedding-palette matches still avoid a provider call.
- The existing deployed website returned 404 for the new mobile event endpoint. At the user's request, the updated backend now runs locally on port 3184, reached through https://race-reliable-mumble.ngrok-free.dev. Public-only live mobile settings are configured from the root Supabase credentials. The local server and ngrok must remain running; changing the tunnel URL requires another frontend sync/APK build.
- The live APK was rebuilt after the App Link hostname fix. Its processed manifest claims HTTPS invitations on `race-reliable-mumble.ngrok-free.dev` and the native `com.vowsvibe.mobile://auth/callback`; its debug signature was verified.
- Android-style API GETs initially received ngrok's HTML warning. The transport now sends ngrok-skip-browser-warning only to the configured ngrok-free.dev backend API; CORS permits it. The real request with that header returned JSON 401 and the correct native origin, rather than HTML.
- Local backend CORS is configured for https://localhost. The current APK's processed manifest matches the tunnel hostname, and its debug signing certificate association route is present in the local backend. Native OAuth redirect acceptance, Android link verification, and payments setup remain unverified on a device.
- RevenueCat returned HTTP 200 for the configured Test Store key: `default` is the current offering and its old `$rc_lifetime` package contains `vows_vibes_pro_lifetime`. Replace it with the new non-consumable `vows_vibes_pro_wedding_pass` in a custom `wedding_pass` package. The APK contains the public key. The root backend variable currently duplicates the public `test_` key; a confidential `sk_` key is still required for server-side verification.

## Work left

1. Install the live debug APK and validate on the user's Android device with real services: OAuth return/cold start, invitation links, permissions, uploads, tone/try-on/confirmation, suggestions/realtime, cloud save, export/share, rotation and offline recovery. Fix issues those checks reveal. No device validation was performed here.
2. Add com.vowsvibe.mobile://auth/callback to Supabase Authentication URL Configuration's redirect allowlist and confirm Google login returns to the APK. Full real AI image generation and realtime delivery still need validation.
3. In RevenueCat, create the non-consumable `vows_vibes_pro_wedding_pass`, attach it to `vows_vibes_pro`, and place it in the `default` offering as custom package `wedding_pass`; then detach/archive the old lifetime product. Replace root `REVENUECAT_SECRET_API_KEY` with a confidential RevenueCat `sk_` key, restart the backend, and validate a Test Store purchase. Guided Camera Kit is optional; ordinary native capture/upload is wired.
4. Apply the latest `supabase/schema.sql` in the Supabase SQL Editor before testing the new atomic try-on quota flow.
5. For independent use beyond the computer/tunnel, deploy this backend and rebuild with a stable HTTPS API/invitation URL and the release signing association.
6. Prepare release signing, final launcher/splash assets and store packaging. Android generated assets remain Capacitor defaults.

Cross-device guest account recovery and private signed source-photo storage are not implemented. Native Preferences is persistent storage, not hardware-backed encryption.

The existing live APK includes the earlier corrected dashboard, bride entry, landscape canvas controls, App Link hostname, and membership integration. The One-Time Wedding Pass source changes still need a future APK rebuild. Database schema application, RevenueCat account configuration, real-service/device acceptance, and production release remain. See README for the exact edit, rebuild, and validation commands.

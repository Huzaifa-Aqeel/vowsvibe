# Vows & Vibe for Android

This directory contains the Vows & Vibe Android application, its native project and mobile build configuration. The application connects to the deployed services included in the repository and does not require a local development server.

## Install the app

[Download the latest Android APK](https://github.com/Huzaifa-Aqeel/vowsvibe/releases/latest/download/vowsvibe-android-debug.apk)

Open the downloaded APK on an Android device and approve installation from the browser or file manager if Android requests it.

- **App name:** Vows & Vibe
- **Package ID:** `com.vowsvibe.mobile`
- **Minimum Android version:** Android 7.0 (API 24)
- **Distribution:** Direct APK through GitHub Releases

## What the mobile app includes

- Native Google sign-in return flow
- Android App Links for wedding invitations
- Bride event creation and deletion
- Bridesmaid invite entry without a separate account
- Camera and photo selection for fitting photos and color guidance
- Full-body dress virtual try-on
- Saved try-on history and confirmed looks
- Bride-to-bridesmaid and bridesmaid-to-bride suggestion conversations
- Shared lineup with palette-relationship filters
- Qwen-powered group previews and lineup export
- RevenueCat Wedding Pass purchase and entitlement restoration

## Mobile source map

```text
mobile/
├── src/                     # Mobile UI, navigation and native service adapters
│   ├── compat/              # Compatibility layer for shared application code
│   └── platform/            # Android/mobile platform integrations
├── android/                 # Native Gradle project and Android manifest
├── capacitor.config.ts      # Capacitor package and bundle configuration
├── package.json             # Mobile dependencies and APK build command
└── .env.example             # Public mobile build configuration template
```

Capacitor packages the compiled frontend inside the APK. The app communicates with the deployed HTTPS backend at runtime; it does not load the application UI from a remote website.

## Services

The Android app uses the repository’s deployed Next.js service for operations that must remain server-side, including:

- Authenticated event and participant operations
- Perfect Corp virtual try-on and skin-tone requests
- Qwen group-preview generation
- Supabase service-role operations
- RevenueCat entitlement verification and webhook handling
- Android App Link association and browser fallback invitations

Supabase provides authentication, database storage, image storage and realtime updates. Private provider keys remain on the deployed backend. Only public mobile configuration is bundled into the APK.

## RevenueCat subscription access

The app offers a one-time **Vows & Vibe Pro Wedding Pass**. RevenueCat identifies the signed-in bride by her Supabase user ID, while the backend verifies access before paid operations. Invited bridesmaids inherit the bride’s verified wedding access and do not purchase separately.

The current APK uses RevenueCat’s Test Store, allowing the purchase flow to run without a Play Store release or real charge. RevenueCat webhooks update the server-side entitlement snapshot, and the app refreshes access directly after a completed purchase.

## Build the APK

Requirements:

- Node.js 22 or newer
- Java 21
- Android SDK Platform 36 and Android build tools
- Public mobile configuration in `mobile/.env.local`

From this directory:

```bash
npm install
npm run android:build
```

The APK is generated at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Every `VITE_*` variable is compiled into the APK and must therefore contain public values only. Supabase service-role keys, provider secrets, RevenueCat secret keys and webhook authorization values belong exclusively in the deployed backend environment.

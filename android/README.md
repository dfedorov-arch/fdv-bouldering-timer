# Android application

The APK offers a native launcher with a remembered HTTP/HTTPS server address and
two modes: **Connect to server** and **Standalone timer**. Older published APKs
only offer standalone operation. The application ID remains
`ru.fdv.boulderingtimer.standalone` so a correctly signed new APK updates an
existing installation. The release asset's historical `android-standalone.apk`
suffix is retained for compatibility.

Network mode loads the server page directly in WebView. It does not embed a
second copy of the network clock/audio implementation or start Node.js on the
device. The server supplies the current interface, lists, sounds, calibration
and Secondary server support. HTTP is deliberately allowed for local servers; HTTPS certificate
errors are rejected, never bypassed or silently downgraded. The app has no
JavaScript/native bridge and disables arbitrary file/content access.

While the timer Activity is visible, native `FLAG_KEEP_SCREEN_ON` prevents
inactivity-based screen-off, including over HTTP. There is **no background
service or background audio guarantee**. Do not lock the device or switch apps
during a competition. Enable this screen's audio in the primary browser and tap
the timer page to unlock sound. Use external power. Back requires confirmation
before stopping this client and returning to mode selection. Rotation preserves
the live WebView. Neither mode changes the server timer when leaving the app.

## Build

Use JDK 17, Gradle 8.11.1, Android platform 35 and the build tools required by
Android Gradle Plugin 8.7.3. Set `ANDROID_HOME` to the SDK. From the repository
root:

```powershell
node scripts/build-standalone-html.js android/app/src/main/assets/timer.html --android
$env:FDV_ANDROID_VERSION_NAME = '2.3.0-dev-android-client'
$env:FDV_ANDROID_VERSION_CODE = '20300'
gradle -p android --no-daemon :app:assembleRelease :app:lintRelease
```

For a real update, configure the **existing release key**, not a new/debug key.
The release workflow uses ignored `android/keystore.properties` with `storeFile`,
`storePassword`, `keyAlias`, `keyPassword`. Local builds may instead provide
`FDV_ANDROID_KEYSTORE_PATH`, `FDV_ANDROID_KEYSTORE_PASSWORD`,
`FDV_ANDROID_KEY_ALIAS`, `FDV_ANDROID_KEY_PASSWORD` in the process environment.
Never commit or print secrets. Without release signing configuration the
existing Gradle fallback produces a debug-signed package, which cannot update
the published application.

Verify the APK with `apksigner verify --verbose --print-certs` and compare its
certificate with a published APK before delivering an update. Generated assets,
build output, SDK caches under `dist/`, and signing files are not sources.
APK-only native changes do not require changing the cached HTML/server build.

## Verification

`node --test test/android-insets.test.js test/installer-assets.test.js` compiles
the real Java activities/address validator against JVM API doubles. It covers
address validation/persistence, both launch modes, native screen-on, lifecycle,
modern Back, TLS cancellation, failed loads without an automatic standalone run,
and safe-area changes without repeated equal padding writes. It does not run a
WebView, Android window manager or actual audio device.

Before using the APK for competition sound, test a real tablet:

1. Update the existing APK without uninstalling; verify the icon/name and both
   native languages. Connect over LAN HTTP and trusted HTTPS, restart the app
   and check the saved address. Invalid addresses/certificates must not connect.
2. Select the main browser on another device, permit this screen's audio and tap
   its timer page. Verify initial measured-clock waiting, lists and AUDIO/SYNC.
3. With the normal inactivity timeout set short, leave the timer untouched across
   multiple rotations and long gaps. The screen must stay on, and minute,
   five-second and transition signals must use the actual connected speakers.
4. Rotate both ways with three-button and gesture navigation: controls must stay
   clear of bars, the page must not restart, and sound must not duplicate.
5. Test short Wi-Fi loss/recovery and Secondary server support, then manual lock/unlock and switching
   apps. Background sound is not supported; after returning, existing clock
   verification/audio-unlock rules must apply, with no replay of old signals.
6. Back must offer cancellation; confirm a mode change and check that this
   device stops while the server and other displays continue. Explicitly select
   standalone and check offline operation.

Do not describe browser screenshots or JVM tests as physical Android validation.

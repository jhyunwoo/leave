---
name: testing-watch-sim
description: Test the Apple Watch companion app + watch-face complications end-to-end on paired simulators (build, install, chronod registration quirk, face editor GUI driving, standalone-refresh proof, evidence capture).
---

# Testing the watchOS companion app on paired simulators

The repo ships an Apple Watch companion app (`app.leave.mobile.watch`) plus a WidgetKit
complication extension (`app.leave.mobile.watch.watch-widget`) under
`apps/native/targets/watch{,-widget}`. These notes cover running and verifying it on the
paired iPhone/Watch simulators.

## Devices

- Paired pair used for this feature: iPhone 17 `D0B64A8A-D5F1-4668-8FFC-A86B400AF527` ↔
  Watch Series 11 46mm `47B9FB46-2366-4CF0-AF62-BD584444B5BB` (verify with
  `xcrun simctl list devices` — other similarly-named sims may exist and are not paired).
- Check pairing: `xcrun simctl list pairs`. If unpaired or the pair is broken, create a
  pair with `xcrun simctl pair <watchUDID> <phoneUDID>`.

## Build & install

One `xcodebuild` produces everything (phone app embeds the watch app, which embeds the
widget appex):

```bash
cd /Users/devin/repos/leave
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 SENTRY_DISABLE_AUTO_UPLOAD=true \
  xcodebuild -workspace apps/native/ios/app.xcworkspace -scheme app \
  -configuration Debug -destination 'id=<paired iPhone UDID>' \
  -derivedDataPath /tmp/leave-build build
```

Products:

- `…/Debug-iphonesimulator/app.app` (embeds `Watch/watch.app`)
- `…/Debug-watchsimulator/watch.app` and `watch-widget.appex`

Install both:

```bash
xcrun simctl install <phoneUDID> /tmp/leave-build/Build/Products/Debug-iphonesimulator/app.app
xcrun simctl install <watchUDID> /tmp/leave-build/Build/Products/Debug-watchsimulator/watch.app
xcrun simctl launch <watchUDID> app.leave.mobile.watch
```

## API/data path

- The previous test user lives on the PRODUCTION API `https://api.leave.moveto.kr`
  (reachable; the local dev D1 is empty). Start Metro so the dev-client app talks to prod:

  ```bash
  cd apps/native && EXPO_PUBLIC_API_URL=https://api.leave.moveto.kr npx expo start --port 8081
  ```

- The phone app auto-logs in from a stored SecureStore token and pushes the watch envelope
  via WCSession (`updateApplicationContext`). If the phone sim is powered off, the watch
  app refreshes standalone using its own keychain token → prod API (proof: App Group
  `face.progress` ticks to a real-time value while the phone is off).
- If the app instead needs the local API, `pnpm dev` binds loopback only — run
  `wrangler dev --ip 0.0.0.0 --port 8787` per the `api-dev` blueprint note.

## chronod quirk — complications don't appear in the picker right away

After `simctl install`, the complication extension registers with chronod only after a
watch-sim RESTART plus one watch-app launch:

```bash
xcrun simctl shutdown <watchUDID> && xcrun simctl boot <watchUDID>
xcrun simctl launch <watchUDID> app.leave.mobile.watch
```

Only then does "리브" show in the face editor's complication picker.

## Driving the watch face editor (GUI)

- Watch sim window focus matters: `cmd+shift+h` = digital crown (exits picker/editor,
  commits face). Bring the window forward via Simulator → Window menu if another sim is
  frontmost — a stray `cmd+shift+h` goes to whatever window has focus.
- Long-press the watch face center → face carousel; tap Edit under a face → editor pages
  (STYLE/DIAL/COLOR → COMPLICATIONS — swipe left to reach it).
- Tap a complication slot → app list. **"리브" sorts between "Hearing Devices" and
  "Maps"** (Hangul collation puts it after most Latin names) — scroll slowly or you'll
  overshoot. Tapping 리브 opens per-complication previews (전역 / 다음 휴가 / 다음 외출).
- Families ↔ faces that work: circular → Modular Duo top corners / California subdials;
  rectangular → Modular Duo center slots; corner → Metropolitan (4 corners); inline →
  Solar Graph top slot ("FRI, 25 SEP" strip) or Utility center pill.
- **California's top bezel slot is restricted to built-ins** (Date/Personalization/Time/
  Off) — third-party inline complications are never listed there. Use Solar Graph to
  verify accessoryInline.
- Face gallery (New +) faces download in ~2–3 s; the GET button becomes ADD.

## Evidence & state inspection

- Device-frame screenshots: `xcrun simctl io <watchUDID> screenshot /tmp/out.png` — far
  cleaner than window captures for complication detail.
- Envelope (sanitized — auth stripped, token lives only in keychain):
  `~/Library/Developer/CoreSimulator/Devices/<watchUDID>/data/Containers/Data/Application/<id>/Library/Preferences/app.leave.mobile.watch.plist` → key `leave.watchEnvelope`.
- Face data for complications:
  `~/Library/Developer/CoreSimulator/Devices/<watchUDID>/data/Containers/Shared/AppGroup/<id>/Library/Preferences/group.app.leave.mobile.plist` → key `leave.watchFace`
  (JSON — has `face.progress`, `face.nextLeave/nextOuting.date` used by countdowns).
- `defaults read` inside the sim hits a DIFFERENT domain and shows stale legacy keys —
  always read the container plist files directly.
- cfprefsd defers standard-domain plist writes; a plist mtime that lags a known write is
  not proof the write didn't happen — check the App Group plist (suite domain flushes
  promptly) or values instead of mtime.

## Expected values (prod test user, KST 2026-09-26 baseline)

전역 D-452 (2027-12-22), 복무율 ~29.3% (ServiceProgressView shows 5 decimals, live-ticking),
일과 231일, 다음 휴가 D-50 "ㅇㅅㅁ & GDGoC Yonsei 홈커밍 휴가" 11/15–11/18,
다음 외출 D-6 "구뽄과 함께하는 평일 외출" 10/2. Outings are intentionally excluded from
"다음 휴가".

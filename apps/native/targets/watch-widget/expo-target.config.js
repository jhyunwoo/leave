/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "watch-widget",
  name: "watch-widget",
  displayName: "리브",
  // 워치 앱(app.leave.mobile.watch) 안에 심기는 익스텐션 — id가 그 접두로 시작해야 설치된다.
  bundleIdentifier: "app.leave.mobile.watch.watch-widget",
  deploymentTarget: "10.0",
  frameworks: ["WidgetKit", "SwiftUI"],
  entitlements: {
    "com.apple.security.application-groups": ["group.app.leave.mobile"],
  },
};

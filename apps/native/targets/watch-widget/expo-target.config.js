/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "watch-widget",
  // 영숫자만 쓴다 — apple-targets가 Xcode 타깃 이름은 그대로, EAS 자격 증명 targetName은 영숫자만 남겨 넘겨서
  // 둘이 다르면 EAS 빌드가 "Could not find target 'watchwidget'"으로 죽는다.
  name: "watchwidget",
  displayName: "리브",
  // 워치 앱(app.leave.mobile.watch) 안에 심기는 익스텐션 — id가 그 접두로 시작해야 설치된다.
  bundleIdentifier: "app.leave.mobile.watch.watch-widget",
  deploymentTarget: "10.0",
  frameworks: ["WidgetKit", "SwiftUI"],
  entitlements: {
    "com.apple.security.application-groups": ["group.app.leave.mobile"],
  },
};

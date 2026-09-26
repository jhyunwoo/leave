/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "watch",
  name: "watch",
  displayName: "리브",
  icon: "../../assets/images/leave-icon.png",
  deploymentTarget: "10.0",
  frameworks: ["WatchConnectivity"],
  entitlements: {
    "com.apple.security.application-groups": ["group.app.leave.mobile"],
  },
};

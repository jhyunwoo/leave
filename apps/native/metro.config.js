const { getSentryExpoConfig } = require("@sentry/react-native/metro");

// Start from Expo's SDK-aware configuration so its built-in pnpm/monorepo
// resolution remains authoritative. Sentry only adds Debug IDs/source-map
// serialization; it does not add watch folders or resolver aliases that could
// create second React or React Native instances.
module.exports = getSentryExpoConfig(__dirname, {
  annotateReactComponents: false,
  includeWebReplay: false,
});

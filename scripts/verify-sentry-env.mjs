const required = [
  "EXPO_PUBLIC_APP_ENV",
  "EXPO_PUBLIC_SENTRY_DSN",
  "SENTRY_AUTH_TOKEN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(
    `Missing required Sentry variables in this EAS environment: ${missing.join(
      ", ",
    )}`,
  );
  process.exit(1);
}

const expectedEnvironment = process.argv[2];
if (
  expectedEnvironment &&
  process.env.EXPO_PUBLIC_APP_ENV !== expectedEnvironment
) {
  console.error(
    `EXPO_PUBLIC_APP_ENV must be ${expectedEnvironment} in this EAS environment (received ${process.env.EXPO_PUBLIC_APP_ENV ?? "unset"}).`,
  );
  process.exit(1);
}

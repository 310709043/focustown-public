import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // If you wish to increase the default value of 50%, uncomment:
  // profilesSampleRate: 0.1,

  // See https://docs.sentry.io/platform/javascript/configuration/options/#environment
  environment: process.env.NODE_ENV ?? "development",

  // Setting this option to true will print useful information to the console
  // while setting up Sentry.
  debug: false,
});

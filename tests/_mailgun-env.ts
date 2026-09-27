/**
 * Imported FIRST by a suite that sends through the real lib/mailgun.ts with
 * a stubbed fetch: lib/mailgun reads its key and domain when it loads, so
 * they must be set before anything imports it. Test values only; nothing
 * leaves the process because the suite replaces fetch.
 */
process.env.MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || "key-test-only"
process.env.MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "storelib.com"
process.env.MAILGUN_BASE_URL = "https://mailgun.test"
process.env.EMAIL_FROM = "Storelib <noreply@storelib.com>"
process.env.EMAIL_REPLY_TO = "support@storelib.com"

export {}

/**
 * Imported FIRST by a journey suite: the environment the server code reads
 * when it loads (Supabase, Stripe, Mailgun, the platform's own address).
 * Test values only; ./net.ts answers every host named here and refuses the
 * rest, so nothing leaves the process.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://journey.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-journey"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-journey"
process.env.STRIPE_SECRET_KEY = "sk_test_journey_only"
process.env.STRIPE_WEBHOOK_SECRET = "whsec_journey_platform"
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_journey_connect"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
process.env.NEXT_PUBLIC_SITE_URL = "https://storelib.com"
process.env.MAILGUN_API_KEY = "key-journey-only"
process.env.MAILGUN_DOMAIN = "storelib.com"
process.env.MAILGUN_BASE_URL = "https://mailgun.test"
process.env.EMAIL_FROM = "Storelib <noreply@storelib.com>"
process.env.EMAIL_REPLY_TO = "support@storelib.com"
process.env.NEXT_PUBLIC_APP_URL = "https://storelib.com"
process.env.ORDER_LINK_SECRET = "order-link-journey"
process.env.EMAIL_LINK_SECRET = "email-link-journey"
process.env.NOTIFY_UNSUBSCRIBE_SECRET = "notify-journey"
process.env.CRON_SECRET = "cron-journey"
process.env.COMMERCE_SECRETS_KEY = "a".repeat(64)
process.env.UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || "unsubscribe-journey"
process.env.RECEIPT_TOKEN_SECRET = process.env.RECEIPT_TOKEN_SECRET || "receipt-journey"
;(process.env as Record<string, string>).NODE_ENV = "test"

export {}

/**
 * ===========================================================================
 *  THE TABLES AND COLUMNS /admin READS, CHECKED AGAINST THE LIVE DATABASE
 * ===========================================================================
 * The System view asks the database, read-only, whether each of these is
 * there: the same question supabase/sql/CHECK_WHAT_IS_MISSING.sql asks from
 * the SQL editor, answered from the admin instead.
 *
 * tests/admin-queries.test.ts keeps this list honest in both directions:
 * every column an admin query names must be listed here, and every column
 * listed here must exist in the repository's SQL. A query that names a
 * column nobody created (the old `orders.creator_id`) fails the suite
 * before it reaches the owner.
 *
 * `later` marks what arrives with supabase/sql/RUN_ADMIN_CONSOLE.sql, so the
 * view can say "run the admin SQL" rather than "something is broken".
 */
export const EXPECTED_SCHEMA: Record<string, { columns: string[]; later?: boolean; laterColumns?: string[] }> = {
  orders: {
    columns: [
      "id", "created_at", "status", "amount_cents", "fee_cents", "currency", "buyer_email", "customer_email",
      "product_id", "buyer_id", "variant_id", "refund_amount_cents", "refund_reason", "refunded_at", "stripe_refund_id",
      "stripe_payment_intent_id", "stripe_session_id", "payment_method", "buyer_country", "buyer_country_code",
    ],
  },
  products: { columns: ["id", "title", "slug", "status", "archived", "type", "price_cents", "sales_count", "created_at", "creator_id"] },
  creators: {
    columns: [
      "id", "user_id", "slug", "username", "display_name", "created_at", "store_published", "stripe_account_id",
      "charges_enabled", "payouts_enabled", "details_submitted", "stripe_onboarding_status", "subscription_status",
    ],
    laterColumns: ["banned_at", "banned_reason"],
  },
  profiles: { columns: ["id", "username", "display_name", "email", "role", "is_creator", "spam_state", "created_at"] },
  entitlements: { columns: ["id", "buyer_id", "product_id", "variant_id"] },
  payouts: { columns: ["id", "created_at", "arrival_date", "status", "amount_cents", "currency", "method", "failure_message", "failure_code", "creator_id"] },
  seller_ledger: { columns: ["creator_id", "pending_amount", "available_amount", "in_transit_amount", "negative_balance", "lifetime_paid_out"] },
  ledger_events: { columns: ["id", "created_at", "event_type", "amount_cents", "net_seller_cents", "creator_id", "description", "released_at", "hold_until"] },
  subscriptions: { columns: ["id", "status", "creator_id"] },
  sites: { columns: ["id", "name", "slug", "status", "published_at", "updated_at", "creator_id"] },
  custom_domains: { columns: ["id", "domain", "status", "ssl_status", "verified_at", "created_at", "creator_id"] },
  site_deployments: { columns: ["id", "created_at", "error", "status", "site_id"] },
  site_web_vitals: { columns: ["lcp_ms", "day"] },
  analytics_events: { columns: ["id", "created_at", "visitor_id", "source_category", "country_code", "country_name", "event_type", "referrer_domain", "utm_source"] },
  /* Part 346: where Storelib's own accounts came from (the Audience view's AI assistants). */
  account_attribution: { columns: ["user_id", "first_ai_source", "last_ai_source", "created_at"], later: true },
  /* Part 350: visits to storelib.com's own pages from an AI assistant, counted by Storelib (the same group). */
  platform_ai_visits: { columns: ["day", "ai_source", "landing_path", "visits"], later: true },
  analytics_daily_rollups: { columns: ["id", "updated_at"] },
  email_events: { columns: ["id", "created_at", "event_type", "email", "metadata"] },
  email_campaigns: { columns: ["id", "subject", "status", "audience_count", "scheduled_at", "created_at", "sent_at"] },
  scheduled_flow_emails: { columns: ["id", "status", "scheduled_for", "created_at", "sent_at"] },
  email_logs: { columns: ["id", "status", "created_at"] },
  subscribers: { columns: ["id", "status"] },
  storelib_newsletter: { columns: ["id", "unsubscribed_at"] },
  conversation_reports: { columns: ["id", "created_at", "reason", "status"] },
  rate_limit_hits: { columns: ["id", "created_at"] },
  admin_actions: { columns: ["id", "created_at", "action", "target_type", "target_id", "target_label", "reason", "detail", "actor"], later: true },
  admin_moderation_log: { columns: ["id", "action", "creator_id", "user_id", "username", "reason", "products_affected", "created_at"], later: true },
  /* Read by the Operations view (lib/admin/views/ops.ts). */
  error_events: { columns: ["fingerprint", "source", "location", "message", "count", "first_seen", "last_seen"], later: true },
  commerce_jobs: { columns: ["id", "status", "run_after"], later: true },
  commerce_integrations: { columns: ["id", "status"], later: true },
}

/** The database functions the admin calls, all from RUN_ADMIN_CONSOLE.sql. */
export const EXPECTED_FUNCTIONS = ["admin_order_totals", "admin_creator_sales", "admin_daily_sales"]

/**
 * The scheduled jobs in vercel.json, with where each leaves a trace. None of
 * them writes a "last ran" row, so the check reads the work they do.
 */
export const CRON_JOBS = [
  { path: "/api/cron/process-scheduled-emails", schedule: "0 * * * *", what: "Sends email flow steps that are due" },
  { path: "/api/cron/release-holds", schedule: "0 6 * * *", what: "Moves held sale money to available" },
  { path: "/api/cron/rollup-daily", schedule: "0 1 * * *", what: "Adds up yesterday's analytics" },
  { path: "/api/cron/purge-chat-attachments", schedule: "20 3 * * *", what: "Deletes chat pictures after 30 days" },
  { path: "/api/cron/storage-cleanup", schedule: "40 3 * * *", what: "Removes files nothing refers to, checks older product files and trims the security log" },
  { path: "/api/cron/strip-image-metadata", schedule: "10 * * * *", what: "Removes location data from new public photos" },
  { path: "/api/cron/notifications", schedule: "25 * * * *", what: "Works out every creator's notifications and pushes the urgent ones" },
  { path: "/api/cron/notify", schedule: "*/5 * * * *", what: "Sends due notification emails and bell notices, and retries the ones that failed" },
  { path: "/api/cron/memberships", schedule: "7,22,37,52 * * * *", what: "Membership renewal reminders, half started checkouts closed, and creators' updates emailed to members" },
  { path: "/api/cron/physical", schedule: "3,13,23,33,43,53 * * * *", what: "Physical commerce: unpaid stock holds released, order emails, supplier emails and webhooks sent or retried" },
  { path: "/api/cron/fx-rates", schedule: "35 15 * * 1-5", what: "Keeps the European Central Bank's exchange rates for the day (Markets and languages)" },
  { path: "/api/cron/community", schedule: "*/5 * * * *", what: "Community jobs: announcement and event fan outs, reminders, recounts, the daily rollup and trending" },
  { path: "/api/cron/translations", schedule: "47 * * * *", what: "Translate changes automatically, the safety sweep: queues a store nothing has queued for a day (store_localization.translate_dirty_at); before part 186, translates the stores itself" },
  { path: "/api/cron/translation-jobs", schedule: "*/5 * * * *", what: "Translate with AI in the background: carries on a language's translation that a run let go of or was cut off from (store_translation_jobs), and translates the stores whose website changed a few minutes ago (Translate changes automatically)" },
  { path: "/api/cron/warm-sites", schedule: "*/5 * * * *", what: "After a deploy, loads the home page (and products page where it is used) of each website visited in the last 7 days once, so the first visitor gets it from the cache (lib/website-builder/warm-sites.ts); does nothing once a deploy is warmed" },
  { path: "/api/cron/seo-index", schedule: "*/10 * * * *", what: "SEO status in /admin/seo: reads the next sitemap files into the inventory, asks Google's URL Inspection API about this run's share of the daily quota (never checked first, then the stalest), and scores the pages checked longest ago" },
  { path: "/api/cron/ai-jobs", schedule: "*/5 * * * *", what: "Start with AI's safety net: asks for the next turn of any AI website build whose hand over was lost (a live ai_site_jobs row whose lease ran out), and once an hour deletes build progress events older than 30 days" },
] as const

/**
 * Environment variables, reported as set or not set. Never their values:
 * the answer leaves the server as a boolean and nothing else.
 */
export const ENV_CHECKS: { name: string; group: string; optional?: boolean }[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", group: "Database" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", group: "Database" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", group: "Database" },
  { name: "STRIPE_SECRET_KEY", group: "Payments" },
  { name: "STRIPE_WEBHOOK_SECRET", group: "Payments" },
  { name: "STRIPE_CONNECT_WEBHOOK_SECRET", group: "Payments" },
  { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", group: "Payments" },
  { name: "PRICE_PRO_MONTHLY", group: "Payments" },
  { name: "PRICE_GROWTH_MONTHLY", group: "Payments" },
  { name: "MAILGUN_API_KEY", group: "Email" },
  { name: "MAILGUN_DOMAIN", group: "Email" },
  { name: "MAILGUN_WEBHOOK_SIGNING_KEY", group: "Email" },
  { name: "EMAIL_FROM", group: "Email" },
  { name: "CRON_SECRET", group: "Jobs and admin" },
  { name: "ADMIN_SECRET", group: "Jobs and admin" },
  { name: "BLOG_ADMIN_SECRET", group: "Jobs and admin" },
  { name: "RECEIPT_TOKEN_SECRET", group: "Jobs and admin" },
  { name: "ORDER_LINK_SECRET", group: "Jobs and admin" },
  { name: "COMMERCE_SECRETS_KEY", group: "Jobs and admin", optional: true },
  { name: "NEXT_PUBLIC_SITE_URL", group: "Addresses" },
  { name: "NEXT_PUBLIC_APP_URL", group: "Addresses" },
  { name: "NEXT_PUBLIC_MAIN_DOMAIN", group: "Addresses" },
  { name: "NEXT_PUBLIC_SITES_HOST", group: "Addresses" },
  { name: "VERCEL_TOKEN", group: "Domains" },
  { name: "VERCEL_PROJECT_ID", group: "Domains" },
  { name: "VERCEL_TEAM_ID", group: "Domains" },
  /* Storelib AI runs on ChatGPT only for now (lib/sites/agent/provider.ts): the Anthropic key is read by nothing a creator reaches. */
  { name: "ANTHROPIC_API_KEY", group: "Website agent", optional: true },
  { name: "OPENAI_API_KEY", group: "Website agent" },
  { name: "FIREBASE_PROJECT_ID", group: "Push" },
  { name: "FIREBASE_CLIENT_EMAIL", group: "Push" },
  { name: "FIREBASE_PRIVATE_KEY", group: "Push" },
  { name: "GITHUB_APP_ID", group: "GitHub sync" },
  { name: "GITHUB_APP_PRIVATE_KEY", group: "GitHub sync" },
  { name: "GITHUB_WEBHOOK_SECRET", group: "GitHub sync" },
  /* Connect Supabase by signing in (Website settings › Connections): off until an OAuth app is made. */
  { name: "SUPABASE_OAUTH_CLIENT_ID", group: "Supabase sign in (optional)", optional: true },
  { name: "SUPABASE_OAUTH_CLIENT_SECRET", group: "Supabase sign in (optional)", optional: true },
  /* Optional: Storelib's built-in file checks need nothing. "Not set" here is
     the normal state and reads as Off, not as a problem (lib/security/uploads). */
  { name: "SECURITY_MALWARE_PROVIDER", group: "Malware engine (optional)", optional: true },
  { name: "CLAMAV_SERVICE_URL", group: "Malware engine (optional)", optional: true },
  { name: "CLAMAV_SERVICE_SECRET", group: "Malware engine (optional)", optional: true },
  { name: "ALERT_EMAIL", group: "Alerts when something breaks", optional: true },
  { name: "ALERT_WEBHOOK_URL", group: "Alerts when something breaks", optional: true },
  { name: "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL", group: "Google Search Console, /admin/seo (optional)", optional: true },
  { name: "GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY", group: "Google Search Console, /admin/seo (optional)", optional: true },
]

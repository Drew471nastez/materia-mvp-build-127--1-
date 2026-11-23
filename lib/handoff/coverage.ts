/**
 * ===========================================================================
 *  EVERY TABLE, AND WHAT A HANDOFF DOES TO IT
 * ===========================================================================
 * tests/business-handoff.test.ts finds every table with a creator_id or a
 * user_id in the SQL the repository holds (supabase/migrations, supabase/
 * sql/run-now, the base scripts/*.sql and the tables the dashboard made,
 * scripts/sql-harness/dashboard-made.sql) and fails until each one is named
 * here exactly once, with its reason. A new table keyed by a creator or a
 * person cannot reach production without somebody deciding whether a
 * handoff should touch it.
 *
 * A business is its own account (lib/handoff/rules.ts). Handing it over
 * moves one row in business_links, so most tables need nothing at all: their
 * rows are keyed by the business's account or creator row, and that account
 * is what changes hands. The function names only the tables in DETACHED and
 * CHECKED, and the suite holds it to that: a table in the other groups
 * named in business_handoff_accept is a failure.
 */

/** Rows that go with the business unchanged: they are keyed by its account or creator id, which stay the same. */
const WITH_THE_BUSINESS = "The business's own rows, keyed by its account or creator id. That account is what changes hands, so they go with it unchanged, at the same ids and addresses."
const MONEY_HISTORY = "The business's sales and money history. Each row keeps the payout account it was paid with, so money already paid stays where it went; new sales wait for the new owner's payout account."
const CONNECTIONS = "Services the business is connected to (pixels, analytics, email sending, shipping, fulfilment). They are the business's settings and go with it; the new owner can reconnect them with their own accounts."
const PEOPLE = "One person's own row (a member, a buyer, a reader), keyed by their user id. The business account's own rows go with it; nobody else's row is touched."
const RECORDS = "Storelib's own record of something that happened. Kept exactly as written."

export const BUSINESS_TABLES: Readonly<Record<string, string>> = Object.fromEntries(
  [
    "ai_memories", "ai_site_job_events", "ai_site_jobs", "analytics_daily_rollups", "analytics_events", "analytics_events_partitioned", "analytics_forward_jobs", "analytics_property_daily", "analytics_report_layouts",
    "campaign_recipients", "cart_uploads", "checkout_attempts", "checkout_starts", "checkout_text_overrides",
    "commerce_checkouts", "commerce_jobs", "commerce_order_events", "commerce_reasons", "commerce_returns", "commerce_settings", "commerce_tax_overrides", "commerce_tax_rates",
    "communities", "community_posts", "coupons", "creator_contacts", "creator_plan_overrides", "custom_domains", "customers", "default_collections_given", "domain_redirects",
    "email_campaigns", "email_events", "email_flow_jobs", "email_flow_runs", "email_flow_sends", "email_flows", "email_recipients", "email_segments", "email_templates", "email_usage",
    "file_details", "fulfillments", "fulfilment_variant_links", "inventory_levels", "inventory_locations", "inventory_movements", "inventory_reservations", "inventory_transfers",
    "media_videos", "membership_plans", "membership_posts", "notification_creator_state", "notification_events", "notification_jobs", "notification_preferences", "notifications",
    "onepages", "order_cases", "orders", "external_bookings", "physical_carrier_prefs", "physical_readiness_state",
    "product_channel_listings", "product_collections", "product_import_links", "product_page_configs", "product_size_charts", "product_slug_history", "product_translation_settings", "product_variant_costs", "products",
    "review_authors", "review_drafts", "review_imports", "review_reports", "review_requests", "review_uploads", "review_widget_configs", "reviews",
    "sales_channels", "scheduled_flow_emails", "seller_notifications", "shipping_labels", "shipping_packages", "shipping_profiles", "shipping_rates", "shipping_zones",
    "site_access", "site_account_codes", "site_agent_runs", "site_blog_authors", "site_blog_categories", "site_blog_post_revisions", "site_blog_posts", "site_blog_redirects", "site_blog_settings",
    "site_contact_messages", "site_customer_codes", "site_customers", "site_lab_tests", "site_live_releases", "site_releases", "site_rum_counters", "site_rum_daily", "site_rum_events", "site_translations", "site_web_vitals",
    "sites", "size_charts", "store_activity_log", "store_builder_configs", "store_credit_notes", "store_currency_changes", "store_invoice_numbers", "store_invoice_series", "store_localization", "store_menus", "store_offers", "store_settings",
    "store_theme_installs", "store_translation_jobs", "subscribers", "support_tickets", "theme_chat_reports", "theme_publish_history", "theme_publish_jobs",
    "user_notifications", "username_history", "website_address_history", "website_addresses",
  ].map((t) => [t, WITH_THE_BUSINESS]),
)

export const MONEY_TABLES: Readonly<Record<string, string>> = Object.fromEntries(
  ["ledger_events", "onepage_tips", "payment_disputes", "payment_fee_records", "payment_payouts", "payouts", "refunds", "seller_ledger"].map((t) => [t, MONEY_HISTORY]),
)

export const CONNECTION_TABLES: Readonly<Record<string, string>> = Object.fromEntries(
  ["analytics_destinations", "commerce_integrations", "commerce_tracking_accounts", "email_sending_domains", "integration_requests", "marketing_sync_items", "onepage_integrations", "discord_connections", "discord_role_mappings", "telegram_chats", "telegram_chat_mappings", "telegram_link_codes", "external_booking_connections"].map((t) => [t, CONNECTIONS]),
)

export const PEOPLE_TABLES: Readonly<Record<string, string>> = Object.fromEntries(
  [
    "account_attribution", "community_activity", "community_bookmarks", "community_cancellations", "community_chat_automation_deliveries", "community_chat_group_members", "community_chat_prefs",
    "community_event_rsvps", "community_event_tickets", "community_invite_uses", "community_join_answers", "community_leave_reasons", "community_library_activity", "community_library_purchases",
    "community_member_badges", "community_member_blocks", "community_member_days", "community_member_hours", "community_member_link_clicks", "community_members", "community_module_access",
    "community_notifications", "community_onboarding_progress", "community_point_events", "community_poll_votes", "community_program_access", "community_reactions", "community_setup_progress",
    "community_space_reads", "discord_access_grants", "discord_member_links", "entitlements", "library_items", "membership_post_reads", "telegram_access_grants", "wishlist_items",
  ].map((t) => [t, PEOPLE]),
)

export const RECORD_TABLES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(["account_deletions", "admin_moderation_log", "file_security_events", "payment_audit_log", "payment_connection_events", "upload_events", "discord_access_log", "telegram_access_log", "creator_activity_events", "creator_presence"].map((t) => [t, RECORDS])),
  plan_cancellations: "Why the founder once cancelled a plan. Storelib's record of the founder's billing, kept as written and never shown to the new owner.",
  invoices: "The founder's plan invoices. Billing reads them through the business's billing customer, which the handoff detaches, so the new owner never sees them; the rows are kept for the founder's records.",
  business_handoffs: "The handoff itself. The function marks it accepted, with who took it and what was detached, and it stays as the record.",
}

/** Rows the transfer function changes or removes, and why. Each is named in business_handoff_accept. */
export const DETACHED_TABLES: Readonly<Record<string, string>> = {
  creators: "Stays the business's (same id, user id, slug and username). The founder's Stripe Connect account, PayPal merchant id and billing customer are taken off it, so checkout cannot pay the founder; the old Stripe account id is kept in stripe_previous_account_id and the handoff's record.",
  payment_accounts: "The founder's older payout account (the payment_accounts row). Removed from the business, and written into the handoff's record.",
  payment_balances: "That payout account's cached balances. Removed with it.",
  payment_methods: "The founder's saved cards for Storelib's plan. Removed.",
  creator_ai_keys: "The founder's own AI provider keys. Removed, so the new owner never spends the founder's credits.",
  theme_agent_tokens: "Agent keys the founder made. Revoked, so nothing the founder runs can still write to the business.",
  analytics_api_tokens: "Analytics API tokens the founder made. Revoked.",
  theme_github_links: "The founder's GitHub repository link for the theme. Removed; the theme itself stays.",
  store_team_members: "The business's team is cleared, and the business's own memberships of other stores. The founder is added back with the access they chose only when they asked to stay.",
  push_tokens: "Phones that were signed into the business (the founder's). Removed, so they stop getting its notifications.",
  account_delete_codes: "Pending codes sent to the founder. Removed.",
  email_change_codes: "Pending codes sent to the founder. Removed.",
  password_reset_requests: "Unused reset links sent to the founder. Removed.",
  verification_codes: "Unused codes sent to the founder. Removed; used ones stay as the proof they are.",
}

/** Read by the function and never changed: a running one refuses the handoff. */
export const CHECKED_TABLES: Readonly<Record<string, string>> = {
  subscriptions: "A Storelib plan that is still running is billed to the founder's card, so the handoff is refused until it ends. The ended plan's row, which names the founder's billing customer, is removed once the transfer commits (lib/handoff/server finishHandoff), so the new owner's billing starts fresh.",
  memberships: "Live paid memberships are billed into the founder's payout account, so the handoff is refused until they end.",
}

export const HANDOFF_COVERAGE: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> = [
  ["with the business", BUSINESS_TABLES],
  ["money history", MONEY_TABLES],
  ["connections", CONNECTION_TABLES],
  ["people", PEOPLE_TABLES],
  ["records", RECORD_TABLES],
  ["detached", DETACHED_TABLES],
  ["checked", CHECKED_TABLES],
]

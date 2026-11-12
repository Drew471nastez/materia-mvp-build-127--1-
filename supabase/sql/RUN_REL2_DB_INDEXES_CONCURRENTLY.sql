-- ###########################################################################
--  STORELIB: THE INDEXES OF RUN-NOW PART 443, BUILT WITHOUT STOPPING WRITES
-- ###########################################################################
--
--  The same indexes as supabase/sql/run-now/443_database_load_round_two.sql,
--  with the same names and definitions, built with CREATE INDEX CONCURRENTLY.
--
--  WHY. A plain CREATE INDEX takes a SHARE lock on its table: reads go on,
--  but every insert, update and delete waits until the index is built. The
--  SQL editor runs a paste as one transaction and keeps every lock until the
--  paste ends, so on a large orders, entitlements, notifications,
--  library_items or community_point_events table part 443 would hold up
--  every checkout, purchase and notification for as long as the rest of the
--  file takes. CONCURRENTLY builds the index while writes continue.
--
--  HOW. CONCURRENTLY refuses to run inside a transaction, and the SQL editor
--  turns a paste of several statements into one. So:
--    - in the Supabase SQL editor, run ONE LINE AT A TIME: select a single
--      CREATE INDEX line below, press Run, wait for Success, then the next;
--    - or with psql, which runs each statement on its own:
--        psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/sql/RUN_REL2_DB_INDEXES_CONCURRENTLY.sql
--  Then run part 443 as usual. It finds every index already made and takes
--  no lock for it.
--
--  A LINE WHOSE TABLE OR COLUMN IS NOT THERE fails with "does not exist",
--  which changes nothing: skip it (part 443 skips it too, with a notice). With
--  psql, leave out -v ON_ERROR_STOP=1 to go past such a line.
--
--  IF A LINE FAILS PART WAY (a timeout, a cancelled query), Postgres leaves an
--  INVALID index of that name behind, and IF NOT EXISTS would then skip it.
--  Drop it and run the line again:
--    DROP INDEX CONCURRENTLY IF EXISTS public.<the index name>;
--  To see any invalid one:
--    select indexrelid::regclass from pg_index where not indisvalid;
--
--  A COLUMN THAT ALREADY HAS AN INDEX OF ITS OWN under another name gets a
--  second one from its line here; part 443 skips such a column with a notice.
--  The part's notices name them, or:
--    select indexrelid::regclass, pg_get_indexdef(indexrelid) from pg_index where indrelid = 'public.<table>'::regclass;
--
--  Safe to run again: each line is IF NOT EXISTS.
-- ###########################################################################

CREATE INDEX CONCURRENTLY IF NOT EXISTS library_items_user_id_idx ON public.library_items (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_comments_author_id_idx ON public.community_comments (author_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_actor_id_idx ON public.notifications (actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_poll_votes_user_id_idx ON public.community_poll_votes (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_point_events_user_id_idx ON public.community_point_events (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_member_days_user_id_idx ON public.community_member_days (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_member_hours_user_id_idx ON public.community_member_hours (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_conversations_user_a_idx ON public.community_conversations (user_a);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_conversations_user_b_idx ON public.community_conversations (user_b);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_invite_uses_user_id_idx ON public.community_invite_uses (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_member_badges_user_id_idx ON public.community_member_badges (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_join_answers_user_id_idx ON public.community_join_answers (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_onboarding_progress_user_id_idx ON public.community_onboarding_progress (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_library_activity_user_id_idx ON public.community_library_activity (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_library_purchases_user_id_idx ON public.community_library_purchases (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_chat_automation_deliveries_user_id_idx ON public.community_chat_automation_deliveries (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_leave_reasons_user_id_idx ON public.community_leave_reasons (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_cancellations_user_id_idx ON public.community_cancellations (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_contact_messages_sender_id_idx ON public.community_contact_messages (sender_id) WHERE sender_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS username_history_user_id_idx ON public.username_history (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_template_purchases_buyer_id_idx ON public.site_template_purchases (buyer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS creator_contacts_user_id_idx ON public.creator_contacts (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS store_activity_log_actor_user_id_idx ON public.store_activity_log (actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_versions_created_by_idx ON public.site_versions (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS entitlements_creator_id_idx ON public.entitlements (creator_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS theme_publish_history_creator_id_idx ON public.theme_publish_history (creator_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS theme_chat_reports_creator_id_idx ON public.theme_chat_reports (creator_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS email_flow_jobs_creator_id_idx ON public.email_flow_jobs (creator_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS membership_posts_creator_id_idx ON public.membership_posts (creator_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS review_drafts_creator_id_idx ON public.review_drafts (creator_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS review_uploads_creator_id_idx ON public.review_uploads (creator_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_blog_post_revisions_creator_id_idx ON public.site_blog_post_revisions (creator_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_reservations_creator_id_idx ON public.inventory_reservations (creator_id) WHERE creator_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS store_theme_installs_parent_install_id_idx ON public.store_theme_installs (parent_install_id) WHERE parent_install_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS theme_publish_history_install_id_idx ON public.theme_publish_history (install_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS theme_chat_reports_install_id_idx ON public.theme_chat_reports (install_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_forms_site_id_idx ON public.site_forms (site_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_collection_items_site_id_idx ON public.site_collection_items (site_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_form_submissions_form_id_idx ON public.site_form_submissions (form_id) WHERE form_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_deployments_version_id_idx ON public.site_deployments (version_id) WHERE version_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_agent_runs_version_id_idx ON public.site_agent_runs (version_id) WHERE version_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_chat_messages_version_id_idx ON public.site_chat_messages (version_id) WHERE version_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_chat_messages_run_id_idx ON public.site_chat_messages (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS flow_execution_log_product_id_idx ON public.flow_execution_log (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_listing_id_idx ON public.notifications (listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS review_drafts_product_id_idx ON public.review_drafts (product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS fulfilment_variant_links_product_id_idx ON public.fulfilment_variant_links (product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS fulfilment_variant_links_variant_id_idx ON public.fulfilment_variant_links (variant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_library_purchases_product_id_idx ON public.community_library_purchases (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS product_bundles_variant_id_idx ON public.product_bundles (variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_transfer_items_variant_id_idx ON public.inventory_transfer_items (variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS course_progress_course_id_idx ON public.course_progress (course_id) WHERE course_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS course_enrollments_course_id_idx ON public.course_enrollments (course_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS course_enrollments_last_lesson_id_idx ON public.course_enrollments (last_lesson_id) WHERE last_lesson_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS refunds_order_id_idx ON public.refunds (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS refunds_entitlement_id_idx ON public.refunds (entitlement_id) WHERE entitlement_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS flow_execution_log_order_id_idx ON public.flow_execution_log (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_library_purchases_order_id_idx ON public.community_library_purchases (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS review_requests_review_id_idx ON public.review_requests (review_id) WHERE review_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS review_drafts_review_id_idx ON public.review_drafts (review_id) WHERE review_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS membership_post_emails_membership_id_idx ON public.membership_post_emails (membership_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS site_contact_messages_subscriber_id_idx ON public.site_contact_messages (subscriber_id) WHERE subscriber_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_conversation_id_idx ON public.notifications (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS onepage_lead_magnets_onepage_id_idx ON public.onepage_lead_magnets (onepage_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS onepage_slug_history_onepage_id_idx ON public.onepage_slug_history (onepage_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscriber_digital_products_onepage_id_idx ON public.subscriber_digital_products (onepage_id) WHERE onepage_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_spaces_pinned_message_id_idx ON public.community_spaces (pinned_message_id) WHERE pinned_message_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_bookmarks_community_id_idx ON public.community_bookmarks (community_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_polls_community_id_idx ON public.community_polls (community_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_event_rsvps_community_id_idx ON public.community_event_rsvps (community_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_program_access_community_id_idx ON public.community_program_access (community_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_module_access_community_id_idx ON public.community_module_access (community_id) WHERE community_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_chat_group_members_community_id_idx ON public.community_chat_group_members (community_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_chat_prefs_community_id_idx ON public.community_chat_prefs (community_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_chat_automation_deliveries_community_id_idx ON public.community_chat_automation_deliveries (community_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_members_tier_id_idx ON public.community_members (tier_id) WHERE tier_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_fulfillment_location_id_idx ON public.orders (fulfillment_location_id) WHERE fulfillment_location_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_fulfillment_location_id_idx ON public.products (fulfillment_location_id) WHERE fulfillment_location_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS product_variants_fulfillment_location_id_idx ON public.product_variants (fulfillment_location_id) WHERE fulfillment_location_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_movements_location_id_idx ON public.inventory_movements (location_id) WHERE location_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_reservations_location_id_idx ON public.inventory_reservations (location_id) WHERE location_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS fulfillments_location_id_idx ON public.fulfillments (location_id) WHERE location_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS fulfillments_package_id_idx ON public.fulfillments (package_id) WHERE package_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS commerce_return_items_restock_location_id_idx ON public.commerce_return_items (restock_location_id) WHERE restock_location_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_transfers_origin_location_id_idx ON public.inventory_transfers (origin_location_id) WHERE origin_location_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_transfers_destination_location_id_idx ON public.inventory_transfers (destination_location_id) WHERE destination_location_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS commerce_checkouts_pickup_location_id_idx ON public.commerce_checkouts (pickup_location_id) WHERE pickup_location_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_shipping_profile_id_idx ON public.products (shipping_profile_id) WHERE shipping_profile_id IS NOT NULL;

# Database changes to run now

Everything the app is waiting on from the last two weeks, in small parts for
the Supabase SQL editor. This replaces `RUN_NOW.sql`.

Why it looks like this: every line is one whole statement. A copy that stops
at the end of any line cannot cut a statement in half, which is what broke the
last two pastes. Each part is small enough to copy in one go, is complete on
its own, and is safe to run again: a second run changes nothing.

## How to run a part

1. Open the file, select all, copy.
2. In the SQL editor open a new query tab, paste, press Run.
3. Wait for "Success. No rows returned", then go to the next file.

The editor runs a paste as one transaction. If a part fails, nothing in that
part changed. Stop there and send the error; the parts after it expect it.

## Order

| File | What it does | Lines | Bytes |
| --- | --- | ---: | ---: |
| `00_check_first.sql` | Read only. The audit: everything the app needs, whether it is there, and which file creates what is not. | 3 | 45,056 |
| `01_rate_limits_and_newsletter.sql` | Rate limit counter for the open forms, and the storelib.com footer newsletter table. Server only. | 9 | 1,116 |
| `02_agent_connections_and_github.sql` | Agent connections (Claude Code, Codex), their activity log, GitHub sync, and the indexes on them. | 33 | 4,852 |
| `03_refund_recorded_once.sql` | A Stripe refund is recorded on an order once. If the same refund was recorded twice, it skips itself with a warning; see README. | 2 | 931 |
| `04_event_and_email_types.sql` | Tracking events and receipt email records the database was refusing. Old rows are not rechecked. | 5 | 718 |
| `05_order_source.sql` | Where an order came from (Storelib or a website) and the detail. Marks old basket orders as website. | 7 | 697 |
| `06_site_vitals.sql` | Website speed as visitors measured it: the table and its two functions. | 15 | 3,671 |
| `07_website_addresses.sql` | A website's own storelib.com address, apart from the username, and the names it used before. | 14 | 1,973 |
| `08_coupons_admin_archive.sql` | Coupon minimums, the admin console tables and totals, then archived products taken off the page. | 33 | 5,371 |
| `09_email_automation_tables.sql` | Email automations: runs, jobs and sends tables, their checks, indexes and read policies. | 39 | 5,588 |
| `10_email_automation_functions.sql` | Email automations: enrolling, claiming jobs, health and per step numbers. Needs part 09. | 17 | 5,453 |
| `11_agent_mcp.sql` | MCP page tools: page actions in the agent log and the builder's selected section. Needs part 02. | 10 | 1,401 |
| `12_library_limit_and_privacy.sql` | Five websites per library, enforced by the database; the privacy switch and code attempt counters. | 9 | 1,342 |
| `13_checkout_contacts.sql` | Buyers kept as contacts, one contact per address, and started checkouts for the checkout reminder. | 18 | 2,441 |
| `14_product_bundles.sql` | The product_bundles table the download ZIPs are cached in (missing in production). | 16 | 2,498 |
| `15_upload_functions.sql` | Storage safety, functions: the two open functions closed, path ownership checks, usage counts pending uploads. | 17 | 3,023 |
| `16_storage_buckets.sql` | Storage safety, buckets: paid file buckets private, picture buckets take pictures only, size limits. | 2 | 2,641 |
| `17_digital_assets_server_only.sql` | Storage safety: digital_assets written by the server only (reading unchanged), and its indexes. | 3 | 2,631 |
| `18_storage_cleanup_functions.sql` | Storage cleanup: what no row refers to any more, and recent browser uploads for the metadata sweep. | 11 | 8,257 |
| `19_variant_policies.sql` | Product variants read policies split so a visitor skips the creator check. Same access, faster product page. | 18 | 3,349 |
| `20_saved_cards_bounces_and_exec_sql.sql` | Saved cards land, the bounce list reads, `exec_sql` is closed to the public key, and search ranks without a general SQL runner. | 7 | 6,075 |
| `21_email_sending.sql` | Email campaigns: the send pipeline statuses and audience types, send bookkeeping, one row per address sent, and private reads. | 42 | 4,683 |
| `22_custom_domain_purposes.sql` | Connected domains: website or creator page, one primary of each, the records Vercel recommended, and written by the server only. | 15 | 1,846 |
| `23_browser_push_and_time_zone.sql` | Browser notifications save (push_tokens takes platform `web`), and the account's time zone column. | 4 | 887 |
| `24_theme_chat_conversations.sql` | Ask Storelib conversations: new chat and history. Each message is filed under a conversation on its own website; only its creator can read them. | 15 | 2,794 |
| `25_analytics_speed.sql` | Analytics that load quickly: indexes in the order the reports read, and the counting done in the database, run by the server only. The page works without it. Can take a minute on a large events table. | 13 | 9,648 |
| `26_business_accounts.sql` | A second business on the same login: the link between the two accounts (one per login, read by those two, written by the server only) and a server only log of every switch. | 13 | 2,278 |
| `27_creator_badges.sql` | Badges Storelib grants a creator (the Veteran mark), kept out of reach of the public API by a trigger. Changes nothing on the page. | 8 | 1,270 |
| `28_theme_chat_reports.sql` | Ask Storelib reports: a creator flags one answer; the question, the reply and an optional reason are kept, written by the server only. Until it runs, Report says it turns on after this update. Needs nothing else. | 7 | 1,246 |
| `29_notification_rules.sql` | Notifications that decide for themselves: the columns a rule writes on its row, one row per creator and dedupe key, and the leased claim the hourly run takes creators with. Server only. Until it runs the engine does nothing and the panel reads as before. | 31 | 5,139 |
| `30_site_accounts_contact.sql` | Contact forms: the contact form messages a creator reads in Emails, and the `wrote` contact status. Also the code table of the first website sign in, which went through storelib.com; signing in to a website is part `33` now and nothing reads that table, but the part is left as it ran. Run after `13`. Before it runs, a contact message is emailed to the creator but not kept, and its sender is added only if they ticked the box. | 24 | 3,085 |
| `31_coupon_holds.sql` | Discount code limits that two buyers paying at once cannot pass: a started payment holds a place under the limit, the order uses it, an abandoned one gives it back or it expires. Server only. Until it runs, uses are counted as before. | 21 | 3,773 |
| `32_orders_keep_sales.sql` | Sales kept when a product is deleted: each order carries its creator (filled for every order already there, and by a trigger from then on), deleting a product leaves its orders with no product rather than deleting them, a disputed payment can be written, and the all time line under Analytics counts by the creator. Run after `25`. Until it runs, the app reads orders through their product as before, and deleting a product still deletes its orders. | 16 | 4,776 |
| `33_site_customers.sql` | Customer accounts on websites, as a Shopify store has them: an email and a six digit code sign a visitor in, and a new email makes the account. The customers (one per website and email), the codes (kept only as a keyed hash, ten minutes, five tries, used once) and each customer's saved products. Not a Storelib login: nothing here touches auth.users, profiles or creators. Server only. Needs nothing else. Until it runs, Sign in on a website says it is not available yet. | 18 | 3,051 |
| `34_theme_chat_attachments.sql` | Ask Storelib pictures: the private bucket a conversation's pictures are kept in for thirty days, and a row per picture naming its message, read only by the creator who owns the website and written by the server only. Run after `24`. Until it runs, a picture shows while the chat is open and reads back as "Picture no longer available", and the chat says pictures are not kept yet. | 10 | 2,031 |
| `35_product_variants_columns.sql` | Product variants: the compare at price and purchase limit columns the editor saves, the old one variant per position rule removed so variants can be moved up and down, and the indexes the product page and checkout read them by. Changes nothing where there is no variants table. Until it runs, a variant with a compare at price can fail to save, and moving a variant can fail. | 7 | 1,429 |
| `36_order_business_details.sql` | The company a buyer bought for, on the order: its legal name, tax number and address, which the buyer's invoice and the creator's copy read. One column and a check on its shape; no rows change. Needs nothing else. Until it runs, orders are made as before and the invoice reads the company from the payment. | 4 | 906 |
| `37_own_ai_keys.sql` | A creator's own AI (their OpenAI key) for Storelib AI to answer on, outside the plan's AI edits. One table of sealed keys, readable by the server only. Needs nothing else. Until it runs, Connections says it is not switched on yet and Storelib AI answers as before. | 5 | 1,125 |
| `38_business_limit_three.sql` | Up to three businesses on one login: the first and two it makes. A trigger counts them (two presses at once cannot pass it), an index reads them by owner, and the old one per login key from `26` goes. Changes no rows. Run after `26`. Until it runs, a third business is refused and the account menu says it cannot be added just yet. | 7 | 1,546 |
| `39_businesses_complete.sql` | Businesses, complete: everything three businesses on one login relies on, in one part, whether `26` and `38` ran or not. The link (read by the two accounts it links, written by the server only), no chains, three a login counted by a trigger under a lock, the index by owner, the server only switch log, and the rate limit table the switch and create routes count in. Also takes the grants a browser never used (truncate on the link, anon's reads, calling the trigger functions). Changes no rows. Needs nothing else; `26` and `38` can be skipped once it has run. Until it runs, the app works as it does now: with `26` alone a third business is refused and the menu says it cannot be added just yet. | 44 | 6,241 |
| `40_notification_engine.sql` | The notification engine (`lib/notify`): the outbox of domain events, the jobs planned from them (a delayed one is a row with a later run time), one delivery row per job and channel, notification preferences (each person reads their own), the email suppression list, the Mailgun webhook ids already handled, and an expiry on the bell's rows. Server only, apart from reading your own preferences. Triggers on products, creators, custom domains and (when this role may) auth.users raise events in the same transaction as the change, and never make that change fail. Run after `29`. Until it runs, nothing is emailed by the engine, the Mailgun webhook handles lists and campaigns as before, and the bell reads as it did. | 98 | 26,781 |
| `41_notification_admin.sql` | Notifications in the admin: one read only function, server only, that counts the notification engine's jobs and deliveries by type and status over 7 or 30 days, why jobs were skipped, and how many people an onboarding reminder reached did the task within three days. `/admin/notifications` reads it. Run after `40`. Changes no data. Until it runs, the Counts view there says it needs this part. | 5 | 4,360 |
| `42_email_logs_rls.sql` | Receipt email records (`email_logs`) made server only: row level security on, nothing for visitors or signed in users, the service role as before. Changes no rows; nothing where the table is missing. Until it runs, any signed in user can read every order's email record. | 3 | 776 |
| `43_onepage_forget_deleted_product.sql` | A deleted product leaves the OnePage that named it. A product block on a OnePage keeps a copy of the product inside the page (its title, price, picture and address), so deleting the product left the row on the page with a button to a page that is now a 404. The live page reads the product row rather than the copy now, so a visitor is right with or without this part; this takes the block out of the creator's own editor and out of the stored page. Deletes no product, no order and no page: only blocks naming a product that no longer exists. Also passes once over the pages that already hold one. Needs nothing else. Until it runs, the public page is right and the editor still shows the deleted product. | 8 | 4,459 |
| `44_profile_identity_follows.sql` | The creator's name and photo have one home, `profiles`, and every copy of them follows it: a trigger moves the OnePage's title, the copy taken when it was published, the SEO card's Meta title, the `creators` columns, the creator page's store name and its header photo, but only where they still hold the old value, so a page title somebody typed is left alone. It can never fail a profile save. A one off pass then clears pictures a sign in provider sent out of every copy but the profile, makes the `creators` copies equal to the profile, drops a Meta title that is only the page's name again, and re-points the reporting account's OnePage name at its profile. Needs nothing else. Until it runs, the app does the same from its own routes, which covers Settings, the storefront's Edit profile and the photo save, but not a name changed any other way. | 23 | 10,621 |
| `45_sites_document_and_questions.sql` | The website builder agent's document and questions: `sites.document` with its revision index, `site_chat_messages.questions`, and the `site_agent_questions` table a blocked run polls. Three changes from 18 to 22 September this list never carried. Each skips itself where its table is not there. Needs nothing else. | 4 | 2523 |
| `46_email_automations_complete.sql` | Emails and automations, complete: every table, column, index, check, policy, grant and function the Emails page, the email composer, the automation builder and the engine read and write, in one part, whether `09`, `10`, `13`, `21` and `30` ran or not. Contacts with every column the app writes (and the old policies that let anyone with the public key add a contact to any creator's list taken off, since sign-ups go through the server), segments, campaigns (read and deleted from the browser, saved and sent only through the server), one row per address sent, open and click events (an automated email's event needs no campaign), the monthly count and its two functions (server only), automations, the older delayed email queue (read only from the browser: a row there is an email Storelib sends), the engine's runs, jobs, sends and five functions, started checkouts, contact form messages, the rate limit table the test and preview routes count in, and the email-images bucket. Changes no rows except giving a contact with no unsubscribe token one. Ends with one row of true or false. Needs nothing else. | 350 | 55,698 |
| `47_products_archived_never_published.sql` | An archived product is never also published. A trigger keeps a product's status and its older `archived` flag in step: status archived sets the flag, publishing a product clears it, and setting the flag on a published product archives it, so the `status = 'published'` every page asks for can never show or sell an archived product. Then one pass over products that are published and flagged now (the same pass `08` made). Changes no other rows; skips itself where products has no archived column. Run after `08`. Until it runs, the app writes both marks as before. | 5 | 2,190 |
| `48_one_review_per_buyer.sql` | One review per buyer per product, kept by the database: a unique index on `reviews (buyer_id, product_id)`, so two presses of Post review at the same moment leave one review and the second gets the same "You already reviewed this product." the receipt shows. Made only when no buyer already has two reviews of one product; otherwise it skips itself with a warning naming the query to see them. Changes no rows. Needs nothing else. Until it runs, reviews work as before. | 3 | 1,269 |
| `49_payouts_table.sql` | The payouts table the Stripe webhook, Cash out and Withdraw write every payout to, and the order timeline, notifications and admin console read. Written in February and never run, so every payout write has been failing quietly. Creators read their own; only the server writes. Needs creators. | 11 | 2297 |
| `50_signup_abuse.sql` | Sign up protection: the attempts table the sign up guard writes, and the spam score and state on profiles the admin console reads (it logs `column profiles.spam_state does not exist`). Written in August and never run. No rows change. | 13 | 2988 |
| `51_email_flows_trigger_rules.sql` | Automations could not be created from the First order or Checkout reminder templates: an old check on `email_flows` that no file here made refused both triggers. Drops every check on `email_flows.trigger_type` or `status`, whatever its name, and adds the two the app writes against (NOT VALID). | 7 | 2059 |
| `52_reviews_replies_reports_guests.sql` | Reviews, complete: a review left from a receipt link without an account (it belongs to its order, one review an order), a seller's one public reply, a report that hides a review until Storelib looks (`review_reports`, server only), and product and creator ratings that count published reviews only, kept by the trigger and counted again once now. The public reads published reviews; reviews are written by the server only. A review request email's unsubscribe gets its own suppression scope where part `40` ran. Changes no review. The one review an order index skips itself with a warning when an order already has two. Needs nothing else. Until it runs, reviews post and show as before and a guest has to sign in to post. | 48 | 9203 |
| `53_one_profile_photo.sql` | One profile photo, everywhere. `profiles.avatar_url` is the creator's face; the OnePage, the creator row and the creator page header each keep a copy. Part `44` moved a copy only while it still held the profile's old value, so the first editor to write a copy made it "chosen" for good and one owner ended up with three different faces at once. Makes every copy of the PHOTO take the profile's, leaves the name rule as it was, and brings the copies already apart back onto one photo. An account with no photo in its profile, a face on its pages and no photo it ever chose or removed keeps that face: it is lifted into the profile first. Needs part `44`. Adds no table. Until it runs, the app does the same from its own routes. | 20 | 7,943 |
| `54_onepage_address_any_case.sql` | One OnePage address in any case. OnePages are served at storelib.me/{address}, and /Mara goes to /mara, so two addresses that differ only in case would be one address with two owners. A unique index on `lower(slug)` for `onepages`, so two saves at the same moment cannot both take it; the app already refuses one another page holds. Made only when no two pages already share an address in different case; otherwise it skips itself with a warning naming the query to see them, and `p54_onepage_address_any_case` reads false. Changes no row. Needs nothing else. Until it runs, the app checks addresses as before. | 3 | 1,463 |
| `55_file_scans.sql` | Malware scanning: the scan log (`file_scans`), one row per file the Storelib file scanner (ClamAV) looked at, with where it came from, the verdict, the threat's name, size, SHA-256 and what was done with the file (kept, removed, refused, pending). Never the file's contents. Server only; `/admin/scanner` reads it. Also adds `digital_assets.scan_status` and `scan_result` where they are missing and indexes the files still waiting for a verdict. Changes no rows. Needs nothing else. Until it runs, scanning works the same and the admin page says the log starts after this part. | 9 | 2,283 |
| `56_email_logs_seller_message.sql` | A buyer's message to the seller from the receipt's Contact seller is recorded in `email_logs` as `seller_message`, sent or failed, like the receipt and the sale email. Rebuilds the check on `email_type` with that fourth name, NOT VALID, so no stored row is read again. Changes no row. Nothing where there is no `email_logs` table. Needs nothing else. Until it runs, the message is sent exactly as before and the row is refused (the route logs that it was not written). | 3 | 1,160 |
| `57_onepage_share_image.sql` | The picture a shared OnePage link shows: the creator's profile photo by default, as a Linktree or Beacons link does, or the share card, or a picture of their own, chosen in the editor (Settings, SEO). One column on `onepages`, `share_image_mode` (`profile`, `card` or `custom`, `profile` unless changed), and a check on the three. The first run sets every OnePage already there to `profile`, as the owner asked; a second run changes nothing, so a choice made after the first run is kept. Needs nothing else. Until it runs, every page shows its profile photo and a choice made in the editor is kept in the page's settings. | 4 | 2,042 |
| `58_onepage_old_addresses.sql` | Old OnePage addresses keep working. A creator can change their OnePage's address in the editor, and the old one then answered 404 although it may be in a bio, a QR code or a post. A trigger on `onepages` keeps each address a page leaves behind in `onepage_slug_history` (lower case, the page, when), and the page and the old links send a visitor from it to the address the page has now, permanently. An address another page holds now is always that page's. Server only. Changes no row. Needs nothing else. Until it runs, a page's old address is not followed, as before; a creator's old username is followed either way. | 6 | 2,596 |
| `59_file_security_events.sql` | The file security log: `file_security_events`, one row for each upload refused (which check, what it found) or accepted with a note (an encrypted ZIP, say), each download refused, each upload or download refused for coming too often, each older file checked for the first time, a malware engine's verdict when one is switched on, and the admin test tool. Never a file's contents, a secret or a whole IP address. Server only; `/admin/security` reads it. Also adds `digital_assets.scan_status`, `scan_result` and `checksum` where missing and indexes the older files the daily storage job checks. Changes no rows. Safe with or without `55`. Needs nothing else. Until it runs, uploads and downloads work the same and the admin page says the log starts after this part. | 10 | 3,107 |
| `60_attribution.sql` | Where a buyer or a sign-up came from: first and last touch (source, referring host, UTM tags, landing page) and the property it happened on (creator page, OnePage or a website, with its id) on orders, subscribers and started checkouts, and when it was written, so the webhook and the buyer's browser write it once. Checks on their shape (NOT VALID) and the indexes the reports group revenue by. Adds columns and indexes only: no rows change and no money column is touched. Run after `32` and `13` (or `46`); without them it skips those pieces with a notice and can be run again. Until it runs, orders and sign-ups are made as before, without attribution. docs/analytics/attribution.md. | 16 | 4,473 |
| `61_analytics_one_pipeline.sql` | Analytics as one pipeline: every event knows the property it happened on (the creator page, the OnePage, or one website by its install id) and the page's path, so a website's pages are counted one by one. Adds those columns and a link's id and destination to `analytics_events`, allows the new `link_click` event (NOT VALID), four indexes for the reports' reads, and places old page views on their property from the address they were recorded on (a second run changes nothing; no other row changes). A daily rollup per creator, property and UTC day (with each day's browsers and the quarter hour each visit began), the days it holds, and the function the daily cron refreshes a day with; server only, creators read their own. `analytics_report` answers the Analytics page, Home and the Website and OnePage summaries for one creator and one property or all of them: unique visitors, page views, link clicks, visits and their sources, top pages, products and links, and started checkouts; `analytics_property_counts` counts the days the rollup does not hold. Both server only. `analytics_visit_tally` and `analytics_all_time` leave OnePage page views out, so the Storelib view counts them once, in the OnePage view, as before. Run after `25` and `32`. Until it runs, page views are recorded as before, OnePage views and link clicks wait for it, and Analytics counts from the rows; docs/analytics/events.md is the contract and lib/analytics/reports.ts says what each figure counts. Can take a minute on a large events table. | 43 | 39,932 |
| `62_money_rows_server_only.sql` | Money rows written by the server only. Signed in users and visitors lose INSERT, UPDATE and DELETE on orders, library entries (entitlements), refunds, the seller ledger and its events, payouts, plan subscriptions and invoices, and every write policy on them is dropped: old rules let anybody write a completed order or a library row for any product and download it without paying. A policy that allowed everything is kept as a read only copy first, so no read is lost; buyers read their own orders and library and creators those of their products, as before. The app already writes all of these with the service role, so nothing it does changes. Safe to run again. | 5 | 3,436 |
| `63_private_columns.sql` | Private columns stay private, and server owned columns stay the server's. Visitors and signed in users read only the public columns of `profiles` and `creators`: no email, role, home address, spam flags or time zone of any account, and no Stripe ids, plan, payout settings, statement descriptor or ban reason of any creator (all of them were readable with the public key). The server reads everything as before; the app reads a person's own private columns through the server (lib/security/public-columns). `storelib_share_public_columns()` grants from one list of private columns, so a column added later is public unless listed; run it again after adding a column to either table. A trigger keeps a signed in user from changing a creator's Stripe account, plan, payouts switch, ban or review counts, or a profile's role, spam state or official, verified and staff marks (the old value on an update, the default on an insert), and `profiles.email` always follows the sign in email. `creators_public` and `profiles_public` are the same tables with the public columns only, for pages that want all of them. Run after `62`. Safe to run again. | 11 | 6,770 |
| `64_ledger_once_and_atomic.sql` | The seller balance changed in one place, once per event. `ledger_post()` locks the creator's balance row, writes the history row under an idempotency key (`ledger_events.idempotency_key`, unique) and moves the balance by the same amounts in one step, so two sales at the same moment no longer lose one and a repeated Stripe event (payout paid, refund, dispute) changes nothing. `ledger_release_due()` releases held sales the same way. Old sale, payout and dispute rows get their keys (the first of each), so nothing already recorded counts again. `stripe_webhook_events` records every Stripe event the webhook finished, so a delivery Stripe repeats is answered without doing anything twice. Server only. Until it runs the app changes balances as before (lib/payments/ledger). Run after `62`. Safe to run again. | 15 | 9,909 |
| `65_account_deletion_keeps_records.sql` | Deleting an account keeps what belongs to other people. A deleted buyer's orders stay as the seller's records (`orders.buyer_id` may be empty and is cleared on delete, where it used to take the order with it). `creators.deleted_at` marks a store retired rather than wiped because buyers or money records hang off it (lib/account/delete-account): closed, products archived, still in every buyer's library. `account_deletions` records every deletion, removed or retired, who asked and every step that failed. Server only. Run after `63`. Safe to run again. | 11 | 3,111 |
| `66_deleted_rows_kept.sql` | A deleted row can be put back. Whatever deletes a row from the tables that hold creators' and buyers' work and money (products and their files, variants and courses, orders, library entries, refunds, payouts, the balance and its history, plans and invoices, creators and profiles, OnePages, store and website settings and pages, domains and addresses, discount codes, email lists, flows and campaigns, reviews), a person, the app, a bug or a cascade, a copy is kept first in `deleted_rows` with the table, the row's id, when and by which role. `storelib_restore_deleted_row(id)` puts one back; `storelib_purge_deleted_rows()` forgets copies older than 90 days (the daily storage cleanup runs it). The first layer under the backups: docs/operations/backups.md. Server and editor only. Safe to run again. | 17 | 4,420 |
| `67_applied_parts.sql` | Which SQL parts this database has run, recorded by the database itself: `storelib_applied_parts` holds each part's number, file, the SHA-256 of the text that ran, when and by which role. The files built from run-now write that row right after each part, so running them is the record; the admin's Health view names any part missing, or changed since it ran (lib/admin/sql-parts.generated.ts). Server and editor only. Safe to run again. | 5 | 1,125 |
| `68_errors_and_job_runs.sql` | Something breaking is written down and told, once. `error_events` keeps one row per kind of error (how often, first and last seen, the newest context); `storelib_note_error()` counts one and says whether to tell the owner now (the first time, then at most hourly while it continues; lib/observability/report.ts sends the email and the webhook). `cron_runs` records every run of every scheduled job, read by the admin's Health view and /api/health. `storelib_purge_ops_logs()` forgets job runs after 30 days and errors unseen for 90. Server only. Safe to run again. | 16 | 3,663 |
| `69_stripe_requirements.sql` | What Stripe is still waiting on for an account: the list, when it is due and when it was last read, on `creators`. The reminder emails about identity and business details read it (lib/notify); without it those reminders are simply not sent and everything else about payouts is unchanged. Three columns, kept private, no rows change. Safe to run again. | 4 | 1,844 |
| `70_public_upload_safety.sql` | The public buckets a browser writes into directly get a size ceiling, and the hourly file pass gets a list of what landed in them. A signed upload URL cannot limit what is sent through it, so `lead-form-files-v2`, `product-videos`, `onepage-assets` and `store-builder-images`, which had no `file_size_limit` at all, now have the one their kind of file needs. Adds `storage_recent_public_objects`, which lists what was written into those buckets lately and is not a picture the metadata pass already reads, so `/api/cron/strip-image-metadata` checks videos, lead magnets and everything else the same way. Server only. Changes no rows in any table; only bucket settings, and only where they were empty or larger. Needs nothing else. Until it runs, uploads and downloads work the same and the hourly pass reads pictures only, as before. | 1 | 4 |
| `74_course_player.sql` | Courses that play and remember where each buyer is. Adds to `course_lessons` a private video (`video_path`, size, type and name, written by the server only: a trigger from part 63 keeps a signed in editor from pointing a lesson at another creator's file), captions, a free preview switch and a running time; downloads per lesson (`lesson_attachments`, server written); each buyer's place per lesson (`course_progress`: `completed_at`, `last_position_seconds`, server written) and per course (`course_enrollments`: last lesson, last opened, percent, finished, and the progress emails sent). One rule for who reads what, `storelib_product_access()`: the creator edits their own course, a buyer (entitlement or completed order) reads its lessons, downloads and their own progress, anybody reads module titles and the free preview lessons of a published course. `course_outline()` gives the product page the lesson titles, times and preview marks. Every earlier policy on these six tables is replaced. No rows change; a buyer with two progress rows for one lesson skips the one-row key with a warning that names the query. Safe to run again. | 60 | 14,367 |
| `75_memberships.sql` | Memberships: a product a buyer pays for every month or year, with posts only its members read. `products.type` takes `membership`; `membership_plans` holds the monthly and yearly price, the free trial, what members get and the included products; `memberships` is each buyer's subscription as Stripe last said it (active, trialing, past due, cancelled until the period ends, expired), kept in step by the Stripe webhook; `membership_invoices` each payment once; `membership_posts`, `membership_post_reads` and `membership_post_emails` the creator's updates, which of them a member has opened and each update's email once per member; `entitlements.membership_id` marks library rows a membership granted. `membership_access(product)` is the one access rule, used by row level security on posts. Members read their own, creators their members; every write is the server's. Needs nothing else. Until it runs the membership pages say memberships are not set up and nothing else changes. Safe to run again. | 39 | 14,491 |
| `76_storelib_payments.sql` | Storelib Payments on Airwallex, switched off until a creator is put on it: their connected account as Airwallex describes it, every webhook event once, a log of every payment and payout change, each payment's fee and share, wallet balances and payouts. Server only. Changes nothing for Stripe creators. | 21 | 7,348 |
| `77_payments_status.sql` | Storelib Payments status cached on the creator (payments_status, last_stripe_sync_at). Private and server only, like the other Stripe columns. The app works without it; it re-reads Stripe anyway. | 6 | 3,306 |
| `78_physical_commerce.sql` | Physical commerce, complete and switched off until /admin turns it on: physical products with units, tax and how each product or variant is fulfilled (by the seller, a warehouse or 3PL, a dropshipping supplier, print on demand), options and variants (price, stock, optional SKU, weight, image), stock per variant and location with a history of every change and holds that cannot oversell, locations with local pickup, shipping profiles with zones of countries or states and flat, free, order price, order weight and item weight rates, physical checkouts (shipped or picked up) whose lines are ordinary orders, orders moving Unfulfilled, Processing, Shipped, Delivered with several shipments, returns, transfers, collections, tax rates, integrations, a job queue with low stock alerts and an order timeline. Only the server writes. Upgrades an earlier run of this part in place. | 822 | 72,028 |
| `79_stripe_account_reset.sql` | When a creator's payments connection is let go and why: the account it was linked to before, when, and whether it was an account the new Stripe Connect platform cannot reach, a creator's Start over, or an unfinished account swapped for one inside Storelib. The live link is cleared so the creator can set up again instead of being stuck. Orders, payouts and the ledger are not touched. Private and server only. The app works without it and writes the old account to the server log instead. Safe to run again. | 6 | 4,213 |
| `80_free_plan_fee_5pct.sql` | The Storelib fee on the Free plan goes from 6% to 5% (and from 12.25% to 11.25% on orders under the small-order line, so the fee never drops as a price goes up). Writes a new fee version and makes it the active one; the old one is retired, not edited, and its currencies, fixed fees and paid plan rates are carried over unchanged. Orders already paid keep the fee they were charged. Stripe's own processing fee is not touched. Nothing happens where the fee tables do not exist (the code already says 5%). Safe to run again, and never overwrites a newer version. | 3 | 3,687 |
| `81_communities.sql` | Storelib Communities, switched off until an admin turns them on: `platform_flags` (seeded with `communities` off), `communities` and everything a community holds (tiers and the products that grant them, members with role, tier, source, points and level, spaces, posts, comments, reactions, bookmarks, polls and votes, reports, invites and their uses, attached courses, events and RSVPs, chat messages and read marks, levels, point events, badges, activity, members' notifications, a job queue, daily stats, videos and video webhook events), and `products.community_id` on a product that sells a tier. Triggers keep the member, post, comment, reaction, going and vote counts; the audit log refuses updates and deletes; votes, RSVPs against a capacity, invite redemption, points and job claims each happen in one locked step and once per key. Server only, except a published community's public columns, chat a signed in member may read (for realtime) and a member's own notifications. Needs parts 66 and 75. Until it runs, community pages say communities are not set up and nothing else changes. Safe to run again. | 163 | 60,411 |
| `82_payment_disputes.sql` | Chargebacks and inquiries, one row per Stripe dispute: the sale, the amount, Stripe's reason, the date evidence is due, how it ended, and what Storelib did about the money (taken back from the creator's share of that sale while the case is open, given back if the creator wins). Creators see their own open cases on Payouts and can add what proves the sale. Inquiries take no money and are only recorded. Private and server only. Safe to run again. | 9 | 3,016 |
| `83_community_direct_messages.sql` | Messages between two members of one community: one conversation per pair, and its messages. Storelib's server writes them after checking both people are active members and chat is on; realtime streams them to the two members only, and stops when either leaves or is banned. Deleted messages have their words blanked. Safe to run again. | 18 | 5,222 |
| `84_seller_payment_state.sql` | What Stripe last said about each creator's payments account, cached on the creator so checkout, Home, reminders and admin read one answer: whether checkout may take money for them, the reason Stripe gave if it switched something off, what is waiting on review, the masked payout bank (never a full number), and the last Stripe event. Only the server writes them. Safe to run again. | 7 | 5,778 |
| `85_profiles_follows_notifications.sql` | Profiles, follows and notifications for everybody: each account's own inbox (`user_notifications`: new followers, new products and communities from creators they follow, new posts in memberships they pay for, new products from creators they bought from), read by its owner only and streamed to the bell, written by the server only, once per dedupe key; `follows` where it is missing, with the indexes its lists read; two privacy switches on `profiles` (show my activity, show my communities) and the private `notifications_seen_at`; a community's about page gallery and each member's last heartbeat; two more kinds of community job, every old kind kept. Run after `81`. Until it runs, the bell shows community notifications only and nothing else changes. Safe to run again. | 30 | 10,048 |
| `86_push_notifications.sql` | Push notifications from communities and people: the community job queue takes `push_digest` (likes, comments and new followers held back during a five minute push window, sent as one push when it closes) and `notification_preferences` takes the category `social`, where each person's push switch is kept (channel `push`, no row means on). Both checks keep every value they had; no rows change, no table is added (the windows are counted in `rate_limit_hits`). Run after `40`, `81` and `85`. Until it runs, the first push of a window still goes and the rest stay in the bell, and the push switch says it is not available yet. | 4 | 1,610 |
| `87_community_views.sql` | Community views: an all time `view_count` on each community (readable like its member count, shown on Explore's cards), the server only `community_view_days` (one row per visitor per community per UTC day, the visitor a hash the server makes, never an address or IP) and `community_record_view(community, visitor)`, service role only, which counts a visitor once a day. Run after `81`. Until it runs, cards show no views and nothing else changes. | 13 | 2,856 |
| `88_download_events_buyer_lookup.sql` | Faster "Recently opened" in the navigator: two partial indexes on `download_events` (by entitlement and by order, newest first) for the read of a buyer's last downloads. No rows change; skips itself with a notice where the table or a column is missing. Until it runs the list works, only slower. | 3 | 1,712 |
| `89_community_feed_activity_index.sql` | Faster community feeds in the Default order: one partial index on published posts by community and newest activity (id as the tie breaker). No rows change; skips itself when part 81 has not run. Until it runs the feed works, only slower on big communities. | 3 | 1,011 |
| `90_storage_policies_needs_owner.sql` | LAST, ON ITS OWN. Replaces the storage.objects policies. Needs the owner of storage.objects; see README if it says "must be owner". | 2 | 3,896 |
| `91_storage_policies_to_remove.sql` | Read only. For the dashboard route: the storage policies to delete. | 2 | 1,242 |
| `92_site_password_and_inbox.sql` | A website's password page and the contact inbox: `site_access` (per creator, whether their website asks for a password, a salted scrypt hash of it and a version that changes with each new password), server only; and `site_contact_messages.read_at`, so the Messages tab in Emails knows which messages are new. Until it runs no website asks for a password and every message reads as read. Safe to run again. | 8 | 1,984 |
| `93_store_menus.sql` | The store's navigation menus, kept once per store like Shopify's Navigation instead of inside each theme: `store_menus` (per creator, every menu as one JSON object keyed by handle, the shape the theme setting had), server only. Every theme reads the same menus and an edit goes live on all of them. Until it runs, each theme keeps its own menus as before. Safe to run again. | 6 | 1,302 |
| `94_community_slug_history.sql` | A community's old addresses keep working: the server only `community_slug_history` (one row per old address and the community it now belongs to), written by a trigger on `communities` in the same step as an address change, so every way of renaming one records it; taking back an old address drops its row. The pages send an old link on to the new address (permanent redirect, the rest of the path and the query kept). Run after `81`. No rows change. Until it runs, an old address answers not found, as now. | 11 | 2,291 |
| `95_navigation_and_collections.sql` | Everything the Navigation page and collections need, in one file: `store_menus` (the same table as part 93, so it does nothing if that ran) and `product_collections` with `product_collection_items` (the same two tables as part 78, for a shop with physical commerce off, since collections now hold every kind of product). Row level security on, visitors granted nothing, the owner reads their own and anybody signed in reads a published collection and its products; only the server writes. Safe to run again. |
| `96_community_comment_media.sql` | Pictures, a GIF and files under a community comment: one column on `community_feed_comments`, `media` (a JSON list, empty by default, at most four things), the shape a post keeps its media in. Only the server writes it, and only with the commenter's own uploads for that community and Giphy GIFs. No rows change. Run after `81`. Until it runs, comments work as before and one carrying a picture, a GIF or a file is refused with a sentence. Safe to run again. | 3 | 1,313 |
| `97_profile_provider_photos.sql` | The photo a person signed in with, for everybody who has none: an account whose sign in provider (Google) sent a picture and whose profile has no photo gets that picture, once, from `auth.users`. Never over a photo that is there, never for somebody who chose or removed one (`storelib_avatar_chosen`). The app does the same on every sign in from now on. Changes only empty `profiles.avatar_url`; no table, column or trigger. Skips itself with a notice where `auth.users` cannot be read. Needs nothing else. | 3 | 2,044 |
| `98_community_leave_reasons_and_location.sql` | Why somebody left a community, and where a person is from: a server only table `community_leave_reasons` (the reason a member picked when leaving, from a short list, and an optional note of at most 500 characters) that the owner and admins read in their dashboard, and two optional public columns on `profiles`, `location_city` and `location_country` (a two letter code), shown in community member lists and profiles. No rows change. Until it runs, leaving asks no reason and the location fields are not offered. Run after 81 and 85. Safe to run again. |
| `100_community_role_permissions.sql` | What a community's admins and moderators may do: one server only column `communities.role_permissions` (a JSON object, empty by default) where the owner keeps the groups of actions they turned on or off for admins and moderators. Money, deleting and handing over the community stay with the owner whatever is stored; empty means the roles as they were. Until it runs every community keeps the default roles. Needs part 81; skips itself with a notice without it. Safe to run again. |
| `101_community_membership_lifecycle.sql` | Paid community memberships: cancelling, refunds and contacting the owner. Three columns on `communities` the owner sets in Settings (`refund_policy`, plain text of at most 2000 characters shown at checkout and on the member's Membership page; `contact_email`, never shown unless `contact_email_public` is on), none readable with the public key; and three server only tables: `community_cancellations` (the reason a member gave when cancelling, from the same six as leaving), `community_refunds` (one row per refund an owner made from the community, so the member is emailed once) and `community_contact_messages` (what members wrote through the contact form, which also caps how many a day). No rows change. Until it runs, cancelling and refunds work as before without keeping a reason, and the contact form and the two settings are not offered. Run after 81. Safe to run again. | 6 | 6,557 |
| `102_community_programs.sql` | Learn: programs in a community. `community_courses` becomes the program row (its own `id`, now the primary key; `title`, `summary`, `cover_url`, `status` draft or published, an optional `price_cents` and `currency` for a program sold on its own, `course_id` for its own modules and lessons, `updated_at`; `product_id` may be empty), `courses.product_id` and `course_enrollments.product_id` may be empty, and a server only table `community_program_access` records who bought or was given a program, one row per person and program, the paying checkout session unique. Existing attached courses keep working unchanged. | 5 | 7,672 |
| `103_profile_display_names.sql` | The name a person goes by, for every account with a made up one: an account whose sign in provider (Google, Apple) sent a name and whose profile name is empty, a placeholder word ("Creator", "Unknown") or just the letters of its email gets the provider's name, from `auth.users`; a name still empty after that gets words from the handle. A name somebody typed is never touched. The app does the same on every sign in from now on, so until it runs names are only fixed as people sign in again. Changes only `profiles.display_name`. Needs nothing else. | 4 | 3,848 |
| `104_community_deleted_rows_kept.sql` | A deleted community row can be put back: the community tables (communities, spaces, tiers, levels, badges, courses, events, access products, posts, comments, members, invite links, and the media library's videos) join part 66's list, so a deleted row is copied to `deleted_rows` for 90 days and `storelib_restore_deleted_row(id)` puts it back. Same trigger and function as part 66. Run after 66 and 81. Safe to run again. |
| `105_community_paid_events.sql` | Paid events: an event can have a price, and then its details are only for ticket holders. New columns on `community_events` (`price_cents`, empty meaning free as every event is today; `currency`; `sales_close_at`, empty meaning tickets stop at the start; `refund_window_hours`, which lets a holder refund themselves until that many hours before; this event's own `refund_policy`; and `tickets_sold`), a server only table `community_event_tickets` (one row per person and event: how it was come by, the unique checkout session, the payment, what was paid and the platform's fee, a held seat while a payment is made, and when it was paid, refunded or cancelled), and five functions that do the counting in one locked statement each the way `community_rsvp` does (hold a seat, turn a paid session into a ticket, give a free one to somebody invited, refund or give up a ticket, tidy holds nobody paid). A paid ticket also writes the person's "going" answer, so reminders, attendee avatars and the calendar work as they do for a free event. No rows change: every event stays free until a price is set. Until it runs, events work exactly as before and no price can be set. Run after 81. Safe to run again. |
| `106_ai_memory.sql` | AI Memory: a table `ai_memories` of what a creator asked Storelib AI to remember, for the whole account or one website, 500 characters each. Each person reads, adds and deletes only their own; nothing is changed in place. No rows change. Until it runs, Storelib AI keeps only each website's own notes. Safe to run again. | 3 | 2,385 |
| `107_product_custom_fields.sql` | Product custom fields: a column `custom_fields` on `products`, up to twenty named plain values (Material, Care) a website section prints as fields.material, an object under 16 KB. No rows change. Until it runs, products save as before and the fields are left unsaved. Safe to run again. | 3 | 989 |
| `108_default_collections.sql` | Two collections for every store, as on Shopify: All products (smart, every product, newest first) and Home page (picked by hand). A server only table `default_collections_given` marks a store that has them, so deleting them is final; every existing store with no collections gets the two now. Until it runs, a store with no collections is given them the first time its collections are opened. Safe to run again. | 30 | 2,088 |
| `109_store_settings.sql` | Store settings, reasons and sales channels: `store_settings` (the name receipts show, the store's phone and country, how checkout behaves), `commerce_reasons` (return and refund reasons; a return accepts any such reason now and keeps its label), `sales_channels` with `product_channel_listings` (a row only records a product taken off a channel), and the physical checkout's news consent. Owner read, server written. Safe to run again. | 27 | 6,680 |
| `110_taxes.sql` | Taxes for every store: `commerce_settings.tax_digital` (off for every store), `commerce_tax_overrides` (one product's own rate in one region), and `orders.tax_cents` and `tax_country` for digital orders. Owner read, server written. Safe to run again. | 7 | 3,001 |
| `111_sales_channel_kinds.sql` | Sales channels by kind: `sales_channels.kind` is `storefront` (the website), `creator_page` (storelib.com/name and the one page), `marketplace` (Explore) or `custom`, one of each built-in kind a store. A product leaves one only when someone takes it off. Safe to run again. | 5 | 1,709 |
| `99_check_after.sql` | Read only. One row of true or false, one column per part. | 2 | 34,416 |

Parts `01` to `61` all run as the editor's normal role. `90` is the one
that may not; see below.

Two of the three `pre-flight` rows in `00` matter to `16` and to Route 1 below:
"does this role bypass row level security" should read yes (it does on Supabase,
where the editor runs as `postgres`), or `16` cannot write bucket settings; and
"storage.objects names the uploader" should read `owner_id`, or Route 1 needs
`owner = (select auth.uid())` in place of `owner_id = (select auth.uid())::text`.

Two parts depend on what is already in your database:

- `03` skips itself with a warning, and `p03_refund_once` reads false, if the
  old webhook once recorded the same refund twice on one order. Nothing after
  it depends on it. Send the result of this before changing any ledger row:
  `select stripe_refund_id, order_id, count(*) from public.ledger_events where event_type = 'refund' and stripe_refund_id is not null group by 1, 2 having count(*) > 1;`
- `48` skips itself with a warning, and `p48_one_review_per_buyer` reads false, if a
  buyer already has two reviews of one product. The warning names the query to
  see them; nothing else depends on it.
- `54` skips itself with a warning, and `p54_onepage_address_any_case` reads
  false, if two OnePages already share an address in different case. The
  warning names the query to see them; rename one address in its editor and
  run `54` again. Nothing else depends on it.
- `19` needs `product_variants`, `product_variant_files`, `reviews` and
  `courses`. If `00` lists any of those four as a missing table, skip `19` and
  say so; nothing else depends on it.

`05`, `08` and `32` are the only parts that change rows you already have:
`05` marks old basket orders as website orders, `08` sets products archived
the old way to status `archived` (there were none of those last time), and
`32` writes each order's creator into its new `creator_id` column, from the
order's product. `32` also changes what deleting a product does: its orders
stay, with no product, where before the database deleted them with it.
`47` makes the same pass as `08` (a product published and flagged archived
becomes status `archived`), and from then on a trigger keeps the two in
step.

## Reading `00_check_first.sql`

This is the whole picture: 659 things the running app needs from the database,
checked against yours. `99_check_after.sql` is the quick one, a single row of
true or false that answers "did the parts land". `00` answers the larger
question, "is anything the app calls missing, whenever it was supposed to
arrive", and for each missing thing names the file that creates it.

Where the list comes from: every table, column and function `app/`, `lib/` and
`components/` name (every `.from("...")` with the columns its `select` and
filters name, every `.rpc("...")`, the curated list in
`lib/admin/schema-expectations.ts`, every `.storage.from("...")` bucket, every
`onConflict` target, and what the cron routes and webhooks read), matched
against the `CREATE` statements in `supabase/migrations/`, `supabase/sql/`,
`sql/` and `scripts/` so each one can name its file.

Run the audit, which is the second line of the file. Its result reads top to
bottom:

| status | what it is |
| --- | --- |
| a count | how many things were checked, how many are missing, how many are worth a look |
| `fact` | three things about the role you are running as, see above |
| `MISSING` | one row per missing thing, with its kind, its name, and the file that creates it |
| `LOOK` | something that is there but wrong in a way the app will not complain about |
| `ok` | one count per kind, then every requirement that is present |

`MISSING` covers tables, columns, functions, constraints, indexes, policies,
unique keys an upsert needs, buckets, and buckets that must be private.

`LOOK` rows are the quiet ones:

- a paid file bucket that is public, so its files download without a signed link
- a picture bucket with no file type limit
- a `storage.objects` policy that reaches a paid bucket as `anon`, or that lets
  any signed in account write with no check on the path
- a function the public key can run that should be service role only
- a table with policies and row level security switched off, so the policies do
  nothing
- a table the app reads with the public key that has row level security and no
  policies, so it reads as empty

Four rows can read `not shipped` in the FIX column, meaning nothing in this
repository creates them. They were all made in the dashboard:

- `public.onepages` and `public.library_items`: tables. Nothing creates them,
  so a fresh project has neither. Their real shape cannot be read off the
  app's queries closely enough to write down here (types, defaults, the unique
  key on a slug and the read policies are all guesses), and a wrong shape is
  worse than a missing file, so no part creates them.
- `public.generate_onepage_slug`: a function the onepage editor calls to pick
  an unused slug. `lib/onepage/ensure-onepage.ts` falls back to the plain slug
  when it is absent, so a guessed one that does not deduplicate would be worse
  than none.
- `public.exec_sql`: a function that runs arbitrary SQL as its definer, and on
  a stock project `anon` can execute it, which makes anyone holding the public
  anon key able to run any statement. Part `20` revokes it from `public`,
  `anon` and `authenticated` and leaves the service role alone; it does not
  drop it, because what else in the dashboard calls it is not known. `00`
  keeps listing the function itself as `not shipped`, which is true, but the
  `LOOK` row about the public key goes away once `20` has run.

The two rows that used to sit in this list and were bugs rather than findings
are fixed at the source: `email_events.recipient_email`, which the admin
bounce panel read and the `20260203` rebuild had removed, and
`payment_methods (creator_id, stripe_payment_method_id)`, the pair the Stripe
webhook upserted on although no unique index matched it. The code now names
the address column and the key that exist, and part `20` pins both.

Anything else that reads `MISSING` has a file next to it. Run that file.

It never fails on a database that is missing things: nothing in it names a
`public` table directly, it asks the catalogue instead. The two exceptions are
`storage.buckets` and `storage.objects`, which every Supabase project has. It
reads catalogue rows only, so it takes about 20 ms and never scans a table of
yours.

## The storage part: `90_storage_policies_needs_owner.sql`

Your pre-flight said "can this role manage storage.objects policies: no".
Creating or
dropping a policy on `storage.objects` needs the owner of that table,
`supabase_storage_admin`, and the SQL editor's role is not it. So this part
is on its own, last.

Run it alone anyway. It either succeeds, or answers
`must be owner of table objects` (on some versions `must be owner of
relation objects`). When it fails, nothing changed.

Until it or the route below is done, the old storage policies are still in
force: anyone with the public key can list and download files in
`digital-products`, and any signed in account can overwrite or delete other
people's files in the picture buckets. Part `16` already made the paid file
buckets private, which stops their public links, but the policies are what
close the rest. Do this the same day.

### Route 1: Storage > Policies in the dashboard

The dashboard's policy editor saves as the storage owner, so it can do what
the SQL editor cannot.

1. Storage > Policies. Under "Other policies under storage.objects" press
   New policy, then "For full customization". Use that section rather than a
   bucket's own: a bucket's form fills in its own bucket, and these name
   several.
2. Create these seven, one form each, one operation ticked per form, target
   role `authenticated`, name as written (the editor may add a suffix, which
   is fine). If the definition box comes filled in, replace all of it. For
   INSERT the box is labelled WITH CHECK; paste the same text.

```
Name:       storelib owner read public buckets
Operation:  SELECT
Roles:      authenticated
Definition: bucket_id = any (array['product-images', 'avatars', 'covers', 'store-builder-images', 'onepage-assets', 'lead-form-files-v2', 'lead-form-files', 'product-videos', 'email-images']) and (public.storage_owns_path(name) or owner_id = (select auth.uid())::text)
```

```
Name:       storelib owner insert public buckets
Operation:  INSERT
Roles:      authenticated
Definition: bucket_id = any (array['product-images', 'avatars', 'covers', 'store-builder-images', 'onepage-assets', 'lead-form-files-v2', 'lead-form-files', 'product-videos', 'email-images']) and public.storage_owns_path(name)
```

```
Name:       storelib owner update public buckets
Operation:  UPDATE
Roles:      authenticated
Definition: bucket_id = any (array['product-images', 'avatars', 'covers', 'store-builder-images', 'onepage-assets', 'lead-form-files-v2', 'lead-form-files', 'product-videos', 'email-images']) and (public.storage_owns_path(name) or owner_id = (select auth.uid())::text)
```

```
Name:       storelib owner delete public buckets
Operation:  DELETE
Roles:      authenticated
Definition: bucket_id = any (array['product-images', 'avatars', 'covers', 'store-builder-images', 'onepage-assets', 'lead-form-files-v2', 'lead-form-files', 'product-videos', 'email-images']) and (public.storage_owns_path(name) or owner_id = (select auth.uid())::text)
```

```
Name:       storelib owner reserved read digital-products
Operation:  SELECT
Roles:      authenticated
Definition: bucket_id = 'digital-products' and public.storage_reserved_upload(bucket_id, name)
```

```
Name:       storelib owner reserved insert digital-products
Operation:  INSERT
Roles:      authenticated
Definition: bucket_id = 'digital-products' and public.storage_reserved_upload(bucket_id, name)
```

```
Name:       storelib owner reserved update digital-products
Operation:  UPDATE
Roles:      authenticated
Definition: bucket_id = 'digital-products' and public.storage_reserved_upload(bucket_id, name)
```

   Public buckets still serve their files by URL without any policy, so there
   is no read policy for anon on purpose.

3. Run `91_storage_policies_to_remove.sql`. It lists, by name, every old
   policy the SQL part would have dropped: ones that let anon or any signed
   in user at the paid or picture buckets, ones with no bucket in them at all,
   and older `storelib owner ...` ones from before. Delete each from the same
   Storage > Policies page (the three dots next to it, Delete). Policies for
   buckets this does not manage (`listings`, `site-assets`,
   `site-deployments`, `theme-chat-attachments`, `site-backups`) and service
   role policies are not listed and stay.
4. Run `91` again: no rows. Then `99`: `p90_storage_policies` reads true.

Create first, delete second, so uploads keep working in between. The
dashboard deletes one policy at a time; if `91` lists more than a dozen or so,
Route 2 is less work.

### Route 2: Supabase support

Open a ticket and ask them to run `90_storage_policies_needs_owner.sql` as
`supabase_storage_admin` on your project. Attach the file. It is one
statement, changes only policies on `storage.objects`, and prints a notice
for each policy it drops.

## After

Run `99_check_after.sql`. Every column should read true. A false column names
the part to look at. Then run `00_check_first.sql` again: the count on the
first row should have dropped to the four `not shipped` rows above, and nothing
with a file next to it should still read `MISSING`.

## Not in here, on purpose

- `RUN_CURRENCY_RON.sql` rewrites every price and has to be timed with a
  deploy. `20260805_storelib_seed.sql` creates an account. Both stay separate
  pastes (see `scripts/build-run-everything-sql.mjs`).
- The site and theme files from before 15 September
  (`RUN_CREATOR_PAGE_AND_SITES.sql`, `RUN_SITES_PUBLISHING.sql`,
  `RUN_THEME_MARKETPLACE.sql`, `RUN_THEME_BACKUPS.sql`,
  `RUN_THEME_FILE_DRAFTS.sql`, `RUN_THEME_PREVIEW_LINK.sql`,
  `RUN_THEME_PUBLISHED_AT.sql`): older than this round.
  `00_check_first.sql` says whether any of their tables, columns or functions
  are absent, and names the file that creates each one.
- `RUN_ALL_PENDING.sql`, `RUN_THIS_ROUND.sql` and `RUN_SAFETY_ROUND.sql`:
  every statement in them is already in these parts. Do not paste them as
  well.

## Where the parts come from

Each part was cut from the `RUN_*.sql` files and migrations it names,
statement by statement, by a tokenizer that knows quotes, dollar quotes and
comments: comments dropped, whitespace joined, literals untouched. Nothing
was retyped. If a source file changes, rebuild the parts from it rather than
editing a part by hand.

`20` is the exception: it was written for the bugs `00` found, and
`supabase/migrations/20260930_saved_cards_bounces_and_exec_sql.sql` holds the
same statements with the reasons above them.

`00_check_first.sql` is generated the same way, from two sides: the table,
column, function, bucket and `onConflict` names read out of `app/`, `lib/` and
`components/`, and the `CREATE` statements read out of every `.sql` file in the
repository. Change the app or add a migration and it wants regenerating, not
editing by hand.

Checked on Postgres 16 with a copy shaped like production (storage owned by
`supabase_storage_admin`, the editor's role not a member): each part as one
query, twice over, and every line as its own query, with no errors except
`90` refusing as described; the result matches running the source files
whole; and storage access for anon and signed in users is the same after `90`
as after Route 1.

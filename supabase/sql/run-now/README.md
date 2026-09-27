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
| `20_saved_cards_bounces_and_exec_sql.sql` | Saved cards land, the bounce list reads, `exec_sql` is closed to the public key, and search ranks without a general SQL runner. | 7 | 5,893 |
| `21_email_sending.sql` | Email campaigns: the send pipeline statuses and audience types, send bookkeeping, one row per address sent, and private reads. | 41 | 4,560 |
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
| `37_own_ai_keys.sql` | A creator's own AI (their Claude key, OpenAI key or OpenRouter account) for Storelib AI to answer on, outside the plan's AI edits. One table of sealed keys, readable by the server only. Needs nothing else. Until it runs, Connections says it is not switched on yet and Storelib AI answers as before. | 5 | 1,125 |
| `38_business_limit_three.sql` | Up to three businesses on one login: the first and two it makes. A trigger counts them (two presses at once cannot pass it), an index reads them by owner, and the old one per login key from `26` goes. Changes no rows. Run after `26`. Until it runs, a third business is refused and the account menu says it cannot be added just yet. | 7 | 1,546 |
| `39_businesses_complete.sql` | Businesses, complete: everything three businesses on one login relies on, in one part, whether `26` and `38` ran or not. The link (read by the two accounts it links, written by the server only), no chains, three a login counted by a trigger under a lock, the index by owner, the server only switch log, and the rate limit table the switch and create routes count in. Also takes the grants a browser never used (truncate on the link, anon's reads, calling the trigger functions). Changes no rows. Needs nothing else; `26` and `38` can be skipped once it has run. Until it runs, the app works as it does now: with `26` alone a third business is refused and the menu says it cannot be added just yet. | 44 | 6,241 |
| `90_storage_policies_needs_owner.sql` | LAST, ON ITS OWN. Replaces the storage.objects policies. Needs the owner of storage.objects; see README if it says "must be owner". | 2 | 3,896 |
| `91_storage_policies_to_remove.sql` | Read only. For the dashboard route: the storage policies to delete. | 2 | 1,242 |
| `40_notification_engine.sql` | The notification engine (`lib/notify`): the outbox of domain events, the jobs planned from them (a delayed one is a row with a later run time), one delivery row per job and channel, notification preferences (each person reads their own), the email suppression list, the Mailgun webhook ids already handled, and an expiry on the bell's rows. Server only, apart from reading your own preferences. Triggers on products, creators, custom domains and (when this role may) auth.users raise events in the same transaction as the change, and never make that change fail. Run after `29`. Until it runs, nothing is emailed by the engine, the Mailgun webhook handles lists and campaigns as before, and the bell reads as it did. | 98 | 26,781 |
| `41_notification_admin.sql` | Notifications in the admin: one read only function, server only, that counts the notification engine's jobs and deliveries by type and status over 7 or 30 days, why jobs were skipped, and how many people an onboarding reminder reached did the task within three days. `/admin/notifications` reads it. Run after `40`. Changes no data. Until it runs, the Counts view there says it needs this part. | 5 | 4,360 |
| `42_email_logs_rls.sql` | Receipt email records (`email_logs`) made server only: row level security on, nothing for visitors or signed in users, the service role as before. Changes no rows; nothing where the table is missing. Until it runs, any signed in user can read every order's email record. | 3 | 776 |
| `43_profile_identity_follows.sql` | The creator's name and photo have one home, `profiles`, and every copy of them follows it: a trigger moves the OnePage's title, the copy taken when it was published, the SEO card's Meta title, the `creators` columns, the creator page's store name and its header photo, but only where they still hold the old value, so a page title somebody typed is left alone. It can never fail a profile save. A one off pass then clears pictures a sign in provider sent out of every copy but the profile, makes the `creators` copies equal to the profile, drops a Meta title that is only the page's name again, and re-points the reporting account's OnePage name at its profile. Needs nothing else. Until it runs, the app does the same from its own routes, which covers Settings, the storefront's Edit profile and the photo save, but not a name changed any other way. | 23 | 10,045 |
| `99_check_after.sql` | Read only. One row of true or false, one column per part. | 2 | 13,317 |

Parts `01` to `43` all run as the editor's normal role. `90` is the one
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
- `19` needs `product_variants`, `product_variant_files`, `reviews` and
  `courses`. If `00` lists any of those four as a missing table, skip `19` and
  say so; nothing else depends on it.

`05`, `08` and `32` are the only parts that change rows you already have:
`05` marks old basket orders as website orders, `08` sets products archived
the old way to status `archived` (there were none of those last time), and
`32` writes each order's creator into its new `creator_id` column, from the
order's product. `32` also changes what deleting a product does: its orders
stay, with no product, where before the database deleted them with it.

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

# Rollback: putting it back the way it was

Four things can be rolled back, and they are independent. Start with the one
that matches what broke, and only go further if that did not fix it.

| What broke | Roll back | How long |
| --- | --- | --- |
| The site, after a deploy | Vercel Instant Rollback | seconds |
| One creator's website, after they published | their release, from Backups | a minute |
| Something a SQL part added | its trigger or switch, below | a minute |
| One feature, behind a variable | its environment variable, then redeploy | a few minutes |

SQL is additive in this repository: no part drops a column or a table, so a
code rollback never needs a database rollback. An older deployment runs
fine against a newer schema. Do not undo a SQL part to go with a code
rollback.

## 1. A bad deploy: Vercel Instant Rollback

1. Open Vercel, the Storelib project, **Deployments**.
2. Filter by **Production**. The top one is live. Find the last one that was
   good (the one before the deploy that broke, usually second in the list).
3. Open its menu (the three dots on the row) and choose **Instant Rollback**,
   or open it and press **Instant Rollback** at the top. Confirm.
4. Vercel points `storelib.com` and every domain at that deployment. Nothing
   is rebuilt; it takes seconds.
5. Check it took: `BASE_URL=https://storelib.com node scripts/smoke-deploy.mjs`
   from a checkout, or run the **Post-deploy smoke** workflow by hand with
   the address.

While a rollback is live, Vercel **stops promoting new production deploys**
automatically: a push to `main` builds but does not go live. That is
deliberate. Fix forward on `main`, then in Deployments open the fixed
deployment and press **Promote** (or **Undo Rollback**) to go live again.

What a rollback does not undo:

- **Environment variables.** A deployment keeps the variables it was built
  with. A variable changed since then is not rolled back with it.
- **The database.** Rows written by the bad deploy stay. See "Who checks
  what" below.
- **The CDN.** Pages held by the CDN are dropped with the rollback, since
  Vercel keys its cache by deployment.
- **Cron jobs** follow the live deployment, so they run the rolled back code.

## 2. One creator's website: their release

Every Publish is kept as a release that never changes (SQL part 180):

- `site_releases`: one row per publish of a website, with a manifest of its
  live settings, pages and files. The newest 20 per website are kept.
- `site_live_releases`: one row per website, `release_id` is the release the
  live website is drawn from now. When it is null the website is drawn from
  its rows, as before releases existed.

### The creator does it (the normal way)

1. Website builder, **Website settings**, **Backups & Versions**.
2. Under **Restore points**, pick the one from before the change, **Restore**.
   This puts it back as the draft and saves the draft it replaces as the
   newest restore point, so it can be undone too.
3. **Publish**. That writes a new release and points the website at it.

This is durable. Use it whenever the creator can.

### Support does it (when the creator cannot, now)

In the Supabase SQL editor. Find the website and its releases:

```sql
-- The creator's published website
SELECT i.id AS install_id, i.status
FROM public.store_theme_installs i
JOIN public.creators c ON c.id = i.creator_id
WHERE c.slug = 'the-creator-slug' AND i.status = 'published';

-- Its releases, newest first, and which one is live
SELECT r.id, r.created_at, r.file_count, r.total_bytes,
       (r.id = l.release_id) AS live
FROM public.site_releases r
LEFT JOIN public.site_live_releases l ON l.install_id = r.install_id
WHERE r.install_id = 'INSTALL_ID'
ORDER BY r.created_at DESC
LIMIT 20;
```

Point the website at an older release:

```sql
UPDATE public.site_live_releases
SET release_id = 'OLDER_RELEASE_ID', rev = rev + 1, updated_at = now()
WHERE install_id = 'INSTALL_ID';
```

The pointer is held for a minute (`POINTER_HOLD_S`), so the website shows
the older release within 60 seconds. This is temporary by design: the next
change to the live files, settings or pages that is not a Publish clears
the pointer (trigger `site_live_release_forget`), and the website is then
drawn from its rows again. Tell the creator to restore and publish as above.

To stop every website being drawn from releases (if releases themselves are
the problem), clear every pointer. Websites are then drawn from their rows
exactly as before part 180. A Publish sets its pointer again until the code
is rolled back:

```sql
UPDATE public.site_live_releases SET release_id = NULL, rev = rev + 1, updated_at = now();
```

## 3. Something a SQL part added

Parts are additive and safe to run again. To stop what one does without
dropping anything, switch it off. Each statement below can be reversed by
the one after it.

### Part 179: cache pings from the database

A trigger on products, variants, inventory and collections posts to
`/api/internal/invalidate` through `pg_net` after a write. If it misbehaves
(too many requests, a slow write), turn it off.

Softest, no DDL: blank the address. The trigger then returns at once.

```sql
-- Note the current address first, to put it back
SELECT url FROM public.storelib_cache_invalidation;

UPDATE public.storelib_cache_invalidation SET url = NULL, updated_at = now();

-- Back on
UPDATE public.storelib_cache_invalidation SET url = 'https://storelib.com/api/internal/invalidate', updated_at = now();
```

Or disable the triggers themselves:

```sql
ALTER TABLE public.products                 DISABLE TRIGGER storelib_cache_ping;
ALTER TABLE public.product_variants         DISABLE TRIGGER storelib_cache_ping;
ALTER TABLE public.inventory_levels         DISABLE TRIGGER storelib_cache_ping;
ALTER TABLE public.product_collections      DISABLE TRIGGER storelib_cache_ping;
ALTER TABLE public.product_collection_items DISABLE TRIGGER storelib_cache_ping;

-- Back on
ALTER TABLE public.products                 ENABLE TRIGGER storelib_cache_ping;
ALTER TABLE public.product_variants         ENABLE TRIGGER storelib_cache_ping;
ALTER TABLE public.inventory_levels         ENABLE TRIGGER storelib_cache_ping;
ALTER TABLE public.product_collections      ENABLE TRIGGER storelib_cache_ping;
ALTER TABLE public.product_collection_items ENABLE TRIGGER storelib_cache_ping;
```

With the pings off, stores still update: their pages are held for a minute
at most and refresh on their own.

### Any other trigger

The same shape works for any trigger a part created. List them first:

```sql
SELECT tgrelid::regclass AS table_name, tgname, tgenabled
FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid::regclass::text LIKE 'public.%'
ORDER BY 1, 2;
```

`tgenabled` is `O` when on and `D` when off. Then
`ALTER TABLE public.<table> DISABLE TRIGGER <name>;` and `ENABLE` to undo.
Do not disable `site_live_release_forget` (part 180): without it a website
can be drawn from a release that no longer matches its rows. Clear the
pointers instead, as in section 2.

## 4. A feature behind a variable

Vercel, Settings, **Environment Variables**, Production. A change applies to
the next deployment only: after saving, open Deployments, the current
production deployment, **Redeploy** (without the build cache is not
needed).

| Variable | Set to | Effect |
| --- | --- | --- |
| `EXPLORE_MARKETPLACE_ENABLED` | `0` | Explore's marketplace off, whatever the admin switch says |
| `PHYSICAL_COMMERCE_ENABLED` | `0` | Physical products off, whatever the admin switch says |
| `CACHE_INVALIDATE_SECRET` | delete it | `/api/internal/invalidate` answers 503 and clears nothing; pages refresh on their minute |
| `ALERT_WEBHOOK_URL` | delete it | Stops alert posts if they flood a channel; errors are still counted |

To stop the scheduled jobs: Vercel, Settings, **Cron Jobs**, **Disable Cron
Jobs**. That takes effect at once, without a redeploy. `/api/health` will
then report the jobs late, which is expected; turn them back on with
**Enable Cron Jobs**.

## Who checks what afterwards

Within ten minutes of any rollback:

| Who | Checks | Where |
| --- | --- | --- |
| Whoever rolled back | The smoke checks pass | `node scripts/smoke-deploy.mjs` against `https://storelib.com`, or the Post-deploy smoke workflow by hand |
| Whoever rolled back | `/api/health` says ok, every job ok or about to run | `https://storelib.com/api/health` |
| The owner | No new kind of error since the rollback | Admin, Health, Errors |
| The owner | Speed and errors back to the week before | `/admin/performance`, 24 hours |
| The owner | Stripe webhooks answered 2xx since | Stripe, Developers, Webhooks, the endpoint, recent deliveries; resend any that failed |
| The owner | Orders taken during the bad window are complete | Admin, Orders, sorted by time; any stuck `pending` past an hour |
| Support | The creators who reported it see it fixed | Reply to each |

Then, before fixing forward: write down in the pull request what broke, when
it was rolled back, and what the fix changes, so the next rollback of the
same thing is quicker.

# Tenant isolation sweep (IDOR)

Round rel2-security2. Base `dd2efa9ab`. Closes the "IDOR coverage" open item
in [SECURITY.md](SECURITY.md) (only about 12 routes had been sampled).

## Result

**No route was found that reads or writes another store's, community's or
person's rows with an id taken from the request.** No code change was needed
for tenant isolation. Three small notes (not cross-tenant) are at the end.

463 route handlers and pages take an id, handle, token or address from the
request and reach the service-role client: 220 call `createAdminClient()`
themselves, 243 get it through a helper (`lib/communities/server/db`
`admin()`, `lib/email-campaigns/route-auth`, `lib/physical/auth`,
`lib/team/*`, `lib/custom-domains/owner`, `lib/website-builder/agent/chat`).
There are no server actions under `app/` that use the service role (the one
`"use server"` file, `app/(storelib)/app/products/new/description-action.ts`, uses the
user's own client).

## Method

1. **List.** Every `route.ts`, `route.tsx` and `page.tsx` under `app/`
   that imports `createAdminClient` / the service role key (394 files), plus
   every one that imports a `lib/` module that does (331 more; files whose
   only such import is infrastructure, such as `lib/api/rate-limit` or
   `lib/perf/server-timing`, are left out because the admin client there
   never touches tenant rows). Kept: those that read `params`,
   `searchParams` or a body and name an id-like input.
2. **Gate.** For each, the first ownership or credential check (the "Check
   found" column, `:line` in that file): an owner or team helper
   (`storeIdFor`, `moneyCaller`, `websiteInstallCaller`, `physicalCaller`,
   `shopCaller`, `creatorFor`, `requireCreator`, `onePageActor`,
   `ownInstall`, `productCreator`, `teamPageStore`, `ownedOrderLines`,
   `resolveSite` ...), a community gate (`requireMember`,
   `requireCreatorCommunity`), the session user's own rows, a token or
   signed link, a provider signature, the admin gate or the cron secret.
3. **Every query.** A script extracted each `.from(table)` chain that filters
   by `id` or `*_id` without an owner column (`creator_id`, `user_id`,
   `buyer_id`, `community_id`, `install_id` ...): 291 chains in the
   directly-using user routes, 48 in the helper-gated ones, 7 in the community
   routes. Each was read by hand: in every case the id had already been proven
   (the row read with the owner filter first, `ownedOrderLines`, the
   install from `websiteInstallCaller`, a membership from the gate, the
   asset's `product.creator_id` compared, a variant's `product_id`
   compared ...), or the read only fed a public answer.
4. **Owner value from the request.** A grep for an owner filter whose value
   comes from the request (`.eq("creator_id", body...)`, `creatorId =
   searchParams.get(...)`) found three: `/api/profile/activity`
   (public activity, hidden when turned off), `/api/reviews` GET (published
   reviews) and the marketing webhook (hashed per-store token plus
   signature). All by design.
5. **Private fields on public routes.** Every public route that selects
   `*` was read: none returns the row (the website subscribe route reads the
   creator row only to check a ban; the review PATCH answers `publicShape`).
   Public product, store and creator reads go through
   `lib/security/public-columns` or name their columns.
6. **Communities.** The 97 community routes all pass `requireMember` /
   `requireCreatorCommunity` before any read, and the community library
   scopes every further id to that community (spot-checked: posts, files,
   member links, complimentary members, chat group messages, library
   products, broadcasts).

Verdicts are by hand for every route without an owner helper and for every
flagged query chain; the rest carry the verdict of the gate they pass, with
the query chains checked by the script in step 3. It is a careful read, not a
proof: a new route needs the same check.

## Notes (not cross-tenant, left for the owner)

| Route | Note | Suggested change |
| --- | --- | --- |
| `app/api/auth/complete-reset-password/route.ts` | the bridge token is marked `used` after the password change, in a second statement; two requests at once could both change the password with one link (both are the link holder) | claim it with `update({used:true}).eq("used", false).select()` first, put it back if the password change fails |
| `lib/reviews/store.ts` `readPublishedReviews` | the oldest fallback (a database before SQL part 52) reads without the `status = published` filter | drop the fallback once every database has part 52 |
| `app/api/onepage/track`, `app/api/blog/track`, `app/api/store/ga-seen` | anonymous counters can be inflated for any page | by design; rate limits per IP exist on some |

## Table

Inputs: `:name` path segment, `?name` query, `body.name` body or form
field (only id-like names are listed). "Admin client": `direct` when the
file calls `createAdminClient()`, `helper` when a helper gives it.

| Route | Admin client | Input ids | Check found | Verdict |
| --- | --- | --- | --- | --- |
| `app/(storelib)/(marketing)/[sellername]/[productSlug]/page.tsx` | direct | :sellername, :productSlug | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/[sellername]/links/photo.jpg/route.ts` | helper | :sellername | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/[sellername]/links/share.png/route.tsx` | helper | :sellername | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/blog/[slug]/page.tsx` | direct | :slug | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/blog/explore/categories/[category]/page.tsx` | helper | :category | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/community/[slug]/(member)/members/[userId]/page.tsx` | helper | :slug, :userId | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/community/[slug]/(member)/post/[postId]/page.tsx` | helper | :slug, :postId | :15 published or public data only | OK by design: public, published data only |
| `app/(storelib)/(marketing)/community/[slug]/about/page.tsx` | helper | :slug | :4 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(storelib)/(marketing)/community/[slug]/cover.jpg/route.ts` | helper | :slug | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/community/[slug]/join/page.tsx` | helper | :slug | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/community/[slug]/page.tsx` | helper | :slug | :6 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(storelib)/(marketing)/community/[slug]/share.png/route.tsx` | helper | :slug | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/community/[slug]/tab-icon.png/route.tsx` | helper | :slug | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/explore/[category]/page.tsx` | direct | :category | :128 published or public data only | OK by design: public, published data only |
| `app/(storelib)/(marketing)/l/[slug]/page.tsx` | direct | :slug | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/member/[username]/page.tsx` | direct | :username | :13 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(storelib)/(marketing)/member/[username]/share.png/route.tsx` | direct | :username | :26 published or public data only | OK by design: public, published data only |
| `app/(storelib)/(marketing)/p/[slug]/page.tsx` | direct | :slug | :94 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(storelib)/(marketing)/themes/[slug]/page.tsx` | helper | :slug | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/u/[username]/page.tsx` | direct | :username | :671 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/(storelib)/(marketing)/u/[username]/robots.txt/route.ts` | helper | :username | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/(marketing)/u/[username]/sitemap.xml/route.ts` | helper | :username | none needed | OK by design: public page or redirect, no private fields |
| `app/(site)/theme-preview/[slug]/page.tsx` | helper | :slug | none needed | OK by design: catalogue theme preview with sample content |
| `app/(site)/w/[username]/account/orders/[id]/page.tsx` | direct | :username, :id | :20 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(site)/w/[username]/account/page.tsx` | direct | :username | :47 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(site)/w/[username]/password/page.tsx` | direct | :username | none needed | OK by design: public page or redirect, no private fields |
| `app/(site)/w/[username]/render-site.tsx` | direct | :username | :412 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/(site)/w/[username]/reviews/page.tsx` | direct | :username | none needed | OK by design: public page or redirect, no private fields |
| `app/(site)/w/[username]/wishlist/page.tsx` | direct | :username | :43 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(sites)/site/[slug]/[[...path]]/route.ts` | direct | :slug, :path | none needed | OK by design: public page or redirect, no private fields |
| `app/(storelib)/access/[orderId]/page.tsx` | direct | :orderId | :7 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(storelib)/account/library/courses/[id]/page.tsx` | direct | :id | :5 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(storelib)/account/library/memberships/[id]/page.tsx` | direct | :id | :3 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(storelib)/account/library/products/[id]/page.tsx` | direct | :id | :60 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/admin/accounts/delete/route.ts` | direct | ?id, body.userId | :4 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/blog/auth/route.ts` | helper | body.username | :112 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/blog/posts/[id]/route.ts` | direct | :id | :6 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/blog/posts/route.ts` | direct | body.slug | :6 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/blog/seo-metrics/route.ts` | direct | ?deleteProduct, ?creatorProducts | :5 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/cases/[id]/route.ts` | direct | :id | :2 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/communities/route.ts` | direct | body.communityId | :3 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/creators/moderate/route.ts` | direct | body.creatorIds | :4 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/creators/plan/route.ts` | direct | ?id, body.creatorId | :4 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/delete-user/route.ts` | direct | body.user_id, body.email | :14 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/integrations/route.ts` | direct | body.id | :3 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/orders/refund/route.ts` | direct | ?id, body.orderId | :3 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/payments/accounts/[id]/refresh/route.ts` | direct | :id | :3 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/payments/accounts/[id]/route.ts` | direct | :id | :3 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/payments/fees/route.ts` | direct | body.versionId | :3 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/payments/simulate/route.ts` | direct | body.refund, body.partialRefundMinor | :3 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/payments/transactions/[id]/route.ts` | direct | :id | :3 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/platform/[section]/route.ts` | helper | :section, ?id | :3 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/products/moderate/route.ts` | direct | body.productId | :3 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/reviews/route.ts` | direct | body.reportId | :3 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/security/route.ts` | direct | ?code | :4 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/support/[id]/route.ts` | direct | :id | :2 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/support/[id]/suggest/route.ts` | direct | :id | :2 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/themes/image/route.ts` | direct | body.listingId | :5 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/themes/package/route.ts` | direct | body.listingId | :4 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/admin/themes/route.ts` | direct | ?id, body.id | :4 admin gate | OK: platform admin only (not tenant scoped by design) |
| `app/api/analytics/api-tokens/route.ts` | helper | ?id | :17 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/analytics/commerce/route.ts` | helper | ?product | :42 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/analytics/export/route.ts` | direct | ?t | :50 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/app/community/[id]/analytics/route.ts` | helper | :id | :38 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/archive/route.ts` | helper | :id | :20 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/audit/route.ts` | helper | :id | :15 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/chat/automations/route.ts` | helper | :id, body.id | :32 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/chat/route.ts` | helper | :id, body.spaceId, body.messageId, body.userId | :37 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/classroom/[productId]/route.ts` | helper | :id, :productId | :22 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/classroom/route.ts` | helper | :id, body.productId | :21 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/delete/route.ts` | helper | :id | :34 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/duplicate/route.ts` | helper | :id | :21 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/emails/preview/route.ts` | helper | :id | :29 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/emails/route.ts` | helper | :id | :30 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/emails/templates/route.ts` | helper | :id | :24 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/emails/test/route.ts` | helper | :id | :29 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/events/[eventId]/route.ts` | helper | :id, :eventId, body.refundAll | :28 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/events/[eventId]/tickets/route.ts` | helper | :id, :eventId, body.ticketId | :37 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/events/route.ts` | helper | :id | :27 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/gamification/badges/[badgeId]/route.ts` | helper | :id, :badgeId, body.userId | :22 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/gamification/badges/route.ts` | helper | :id | :15 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/gamification/points/route.ts` | helper | :id, body.userId | :16 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/gamification/route.ts` | helper | :id | :22 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/invites/[inviteId]/route.ts` | helper | :id, :inviteId | :16 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/invites/bulk/route.ts` | helper | :id, body.tierId | :28 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/invites/route.ts` | helper | :id | :25 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/join-questions/route.ts` | helper | :id | :26 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/join-requests/route.ts` | helper | :id | :38 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/learn/[programId]/route.ts` | helper | :id, :programId | :25 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/learn/members/route.ts` | helper | :id | :23 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/learn/route.ts` | helper | :id, body.productId | :26 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/library/[itemId]/route.ts` | helper | :id, :itemId | :27 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/library/route.ts` | helper | :id, body.productId | :26 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/library/sections/[sectionId]/route.ts` | helper | :id, :sectionId | :23 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/library/sections/route.ts` | helper | :id | :23 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/members/[userId]/route.ts` | helper | :id, :userId | :26 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/members/export/route.ts` | helper | :id | :22 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/members/route.ts` | helper | :id, body.userId, body.email, body.tierId | :26 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/moderation/route.ts` | helper | :id, body.id, body.targetId, body.spaceId | :25 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/onboarding/route.ts` | helper | :id | :27 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/payments/route.ts` | helper | :id, ?userId | :26 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/posts/route.ts` | helper | :id, body.spaceId | :24 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/refunds/route.ts` | helper | :id, body.orderId | :30 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/route.ts` | helper | :id | :31 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/scheduled-posts/[postId]/route.ts` | helper | :id, :postId | :28 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/scheduled-posts/route.ts` | helper | :id | :29 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/setup/route.ts` | helper | :id | :37 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/spaces/[spaceId]/route.ts` | helper | :id, :spaceId | :22 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/spaces/route.ts` | helper | :id | :22 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/tiers/[tierId]/products/route.ts` | helper | :id, :tierId, body.productId | :22 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/tiers/[tierId]/route.ts` | helper | :id, :tierId | :26 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/tiers/route.ts` | helper | :id | :25 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/community/[id]/words/route.ts` | helper | :id | :34 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/memberships/[productId]/posts/[postId]/route.ts` | helper | :productId, :postId | :18 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/app/memberships/[productId]/posts/route.ts` | helper | :productId | :30 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/app/memberships/[productId]/route.ts` | helper | :productId | :23 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/app/orders/[id]/activity/route.ts` | direct | :id | :25 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/app/orders/[id]/email/route.ts` | direct | :id, body.email | :27 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/app/orders/[id]/resend/route.ts` | direct | :id | :21 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/app/orders/export/route.ts` | direct | ?t | :72 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/app/products/[id]/live/route.ts` | direct | :id | :29 published or public data only | OK by design: redirect to a published product's public address only |
| `app/api/app/products/import/gumroad/route.ts` | helper | body.token | :34 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/app/reviews/[id]/route.ts` | direct | :id | :62 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/app/reviews/import/route.ts` | helper | ?id, body.importId, body.productIds | :71 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/app/reviews/requests/route.ts` | helper | body.orderId | :26 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/auth/account-origin/route.ts` | direct | body.email | none needed | OK by design: says which sign-in methods an address has (login form), rate limited per IP and address |
| `app/api/auth/change-email/route.ts` | direct | body.newEmail | :79 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/auth/confirm-email/route.ts` | direct | body.userId, body.code | :19 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/auth/request-password-reset/route.ts` | direct | body.email | :146 creator row of the session | OK: always the same answer; mails only the account address |
| `app/api/auth/signup-guard/route.ts` | direct | body.email, body.handle | :64 published or public data only | OK: no tenant data; writes a hashed IP attempt row |
| `app/api/auth/unconfirmed-account/route.ts` | direct | body.email | :41 published or public data only | OK: the password must sign in (Supabase says "not confirmed") before the id is given |
| `app/api/auth/verify-email-change/route.ts` | direct | body.code, body.currentCode | :46 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/auth/verify-email/route.ts` | direct | body.userId, body.email | :30 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/automations/flows/[id]/preview/route.ts` | direct | :id, body.product | :22 owner/team helper | OK: flow read with creator_id of the session |
| `app/api/automations/flows/[id]/retry/route.ts` | helper | :id | :11 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/automations/flows/[id]/route.ts` | helper | :id | :19 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/automations/flows/[id]/status/route.ts` | helper | :id | :21 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/automations/flows/[id]/test/route.ts` | helper | :id, body.product | :15 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/automations/t/c/route.ts` | direct | ?k | :26 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/automations/t/o/route.ts` | direct | ?k | :18 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/billing/checkout/status/route.ts` | helper | ?session_id | :9 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/billing/payment-method/route.ts` | direct | body.paymentMethodId | :12 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/cart/prices/route.ts` | direct | body.shopId | :46 published or public data only | OK by design: published prices of that shop |
| `app/api/cart/uploads/[ref]/[name]/route.ts` | direct | :ref, :name | :26 token or signed link is the credential | OK: signed reference |
| `app/api/cart/uploads/route.ts` | direct | ?product | :42 published or public data only | OK: upload for a published product of the host's store |
| `app/api/checkout/access-link/route.ts` | direct | body.email, body.productId | none needed | OK: same answer for any address; links go only to that address |
| `app/api/checkout/cart/complete/route.ts` | direct | ?session_id | :48 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/checkout/cart/route.ts` | direct | body.couponCode | :172 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/checkout/confirm-payment/route.ts` | direct | body.paymentIntentId | :10 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/checkout/credit-note/route.ts` | direct | ?token, ?id | :4 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/checkout/invoice/route.ts` | direct | ?token | :4 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/checkout/process/route.ts` | direct | body.email, body.productId, body.variantId, body.couponCode, body.emailOptIn | :71 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/checkout/site/route.ts` | direct | body.email, body.emailOptIn, body.deliveryOptionId, body.couponCode, body.paymentIntentId | :525 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/checkout/site/track/route.ts` | direct | body.email | :10 token or signed link is the credential | OK: website's own form; the link goes only to the order's address |
| `app/api/checkout/stripe-session/route.ts` | direct | body.email, body.productId, body.variantId, body.couponCode, body.emailOptIn | :95 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/collections/[id]/route.ts` | helper | :id | :11 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/collections/product/route.ts` | helper | ?productId, body.productId | :27 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/community/[communityId]/bookmarks/route.ts` | helper | :communityId, body.postId | :22 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/chat/blocks/route.ts` | helper | :communityId, ?userId, body.userId | :20 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/chat/files/route.ts` | helper | :communityId | :41 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/chat/people/route.ts` | helper | :communityId | :26 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/chat/prefs/route.ts` | helper | :communityId, body.id | :34 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/chat/route.ts` | helper | :communityId | :21 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/chat/share/route.ts` | helper | :communityId | :20 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/chat/unfurl/route.ts` | helper | :communityId | :27 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/checkout/route.ts` | helper | :communityId | :40 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/community/[communityId]/classroom/route.ts` | helper | :communityId | :27 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/comments/[commentId]/files/[assetId]/route.ts` | helper | :communityId, :commentId, :assetId | :34 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/comments/[commentId]/route.ts` | helper | :communityId, :commentId | :26 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/contact/route.ts` | helper | :communityId | :35 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/dms/[conversationId]/messages/[messageId]/route.ts` | helper | :communityId, :conversationId, :messageId | :21 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/dms/[conversationId]/read/route.ts` | helper | :communityId, :conversationId | :21 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/dms/[conversationId]/route.ts` | helper | :communityId, :conversationId | :21 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/dms/route.ts` | helper | :communityId, body.userId | :27 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/events/[eventId]/checkout/confirm/route.ts` | helper | :communityId, :eventId, body.sessionId | :32 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/events/[eventId]/checkout/route.ts` | helper | :communityId, :eventId | :38 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/events/[eventId]/ics/route.ts` | helper | :communityId, :eventId | :29 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/events/[eventId]/invite/route.ts` | helper | :communityId, :eventId | :39 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/events/[eventId]/route.ts` | helper | :communityId, :eventId | :25 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/events/[eventId]/rsvp/route.ts` | helper | :communityId, :eventId | :31 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/events/[eventId]/ticket/route.ts` | helper | :communityId, :eventId | :39 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/events/route.ts` | helper | :communityId | :28 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/files/route.ts` | helper | :communityId, body.fileId | :33 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/get-started/route.ts` | helper | :communityId | :27 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/gifs/route.ts` | helper | :communityId | :24 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/groups/[groupId]/messages/[messageId]/route.ts` | helper | :communityId, :groupId, :messageId | :20 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/groups/[groupId]/read/route.ts` | helper | :communityId, :groupId | :20 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/groups/[groupId]/route.ts` | helper | :communityId, :groupId | :20 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/groups/route.ts` | helper | :communityId | :20 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/invite/redeem/route.ts` | helper | :communityId, body.token | :47 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/community/[communityId]/invites/route.ts` | helper | :communityId | :36 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/join-questions/route.ts` | helper | :communityId | :29 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/community/[communityId]/join/route.ts` | helper | :communityId, body.tierId | :32 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/community/[communityId]/leaderboard/route.ts` | helper | :communityId | :20 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/learn/[programId]/checkout/confirm/route.ts` | helper | :communityId, :programId, body.sessionId | :32 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/learn/[programId]/checkout/route.ts` | helper | :communityId, :programId, body.moduleId | :37 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/learn/route.ts` | helper | :communityId | :27 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/leave/route.ts` | helper | :communityId | :37 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/community/[communityId]/library/[itemId]/checkout/confirm/route.ts` | helper | :communityId, :itemId, body.sessionId | :33 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/library/[itemId]/checkout/route.ts` | helper | :communityId, :itemId | :36 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/library/[itemId]/files/[fileId]/route.ts` | helper | :communityId, :itemId, :fileId | :33 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/library/[itemId]/links/[index]/route.ts` | helper | :communityId, :itemId, :index | :30 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/library/[itemId]/route.ts` | helper | :communityId, :itemId | :27 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/library/route.ts` | helper | :communityId | :25 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/links/[linkId]/click/route.ts` | helper | :communityId, :linkId | :33 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/community/[communityId]/live/route.ts` | helper | :communityId | :27 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/me/route.ts` | helper | :communityId | :24 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/member-profile/route.ts` | helper | :communityId, ?ref | :30 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/members/[userId]/route.ts` | helper | :communityId, :userId | :20 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/members/route.ts` | helper | :communityId | :27 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/membership/plan/route.ts` | helper | :communityId, body.tierId | :37 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/community/[communityId]/membership/route.ts` | helper | :communityId | :37 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/community/[communityId]/messages/[messageId]/route.ts` | helper | :communityId, :messageId | :21 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/moderation/act/route.ts` | helper | :communityId, body.targetId, body.spaceId | :36 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/moderation/members/route.ts` | helper | :communityId, body.userId | :33 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/moderation/reports/route.ts` | helper | :communityId, body.id | :33 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/notifications/route.ts` | helper | :communityId | :21 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/onboarding/route.ts` | helper | :communityId | :29 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/people/[userId]/card/route.ts` | helper | :communityId, :userId | :30 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/place/route.ts` | helper | :communityId | :28 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/polls/[pollId]/vote/route.ts` | helper | :communityId, :pollId | :20 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/posts/[postId]/comments/route.ts` | helper | :communityId, :postId | :23 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/posts/[postId]/files/[assetId]/route.ts` | helper | :communityId, :postId, :assetId | :36 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/posts/[postId]/route.ts` | helper | :communityId, :postId | :22 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/posts/link-preview/route.ts` | helper | :communityId | :26 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/posts/route.ts` | helper | :communityId | :30 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/presence/route.ts` | helper | :communityId | :32 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/reactions/route.ts` | helper | :communityId, body.targetId | :25 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/reports/route.ts` | helper | :communityId | :24 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/search/route.ts` | helper | :communityId | :31 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/spaces/[spaceId]/messages/route.ts` | helper | :communityId, :spaceId | :24 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/spaces/[spaceId]/read/route.ts` | helper | :communityId, :spaceId | :21 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/videos/[videoId]/captions/route.ts` | helper | :communityId, :videoId | :35 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/videos/[videoId]/play/route.ts` | helper | :communityId, :videoId | :64 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/videos/[videoId]/poster/route.ts` | helper | :communityId, :videoId | :32 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/videos/[videoId]/route.ts` | helper | :communityId, :videoId | :32 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/videos/route.ts` | helper | :communityId, body.videoId | :35 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/community/[communityId]/visit/route.ts` | helper | :communityId | :36 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/community/by-slug/[slug]/member-chrome/route.ts` | helper | :slug | :23 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/coupons/validate/route.ts` | direct | body.code, body.productId, body.variantId | none needed | OK by design: prices a cart, returns no private fields |
| `app/api/courses/attachments/[id]/route.ts` | direct | :id | :22 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/courses/contact/route.ts` | direct | body.productId | :27 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/courses/lessons/[id]/captions/route.ts` | direct | :id | :24 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/courses/lessons/[id]/play/route.ts` | direct | :id | :30 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/courses/manage/route.ts` | direct | ?productId, body.productId | :32 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/courses/progress/route.ts` | direct | body.lessonId | :32 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/courses/reminders/route.ts` | direct | ?e, body.productId, body.emailsOff | :63 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/creator-profile/route.ts` | helper | body.contactEmail, body.productsOrder | :95 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/cron/translation-jobs/route.ts` | helper | body.creatorId | :2 cron secret | OK: cron secret, no request ids from users |
| `app/api/domains/route.ts` | helper | body.communityId, body.domainId | :66 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/download/[assetId]/route.ts` | direct | :assetId, ?receipt | :49 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/email/area/route.ts` | helper | ?email, body.id | :236 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/email/campaigns/[id]/duplicate/route.ts` | helper | :id, body.id | :22 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/email/campaigns/[id]/report/route.ts` | helper | :id | :73 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/email/campaigns/[id]/route.ts` | helper | :id | :29 owner/team helper | OK: campaign read with creator_id first; the 409 path reads status only after that |
| `app/api/email/campaigns/[id]/schedule/route.ts` | helper | :id | :24 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/email/campaigns/[id]/stop/route.ts` | helper | :id | :16 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/email/campaigns/route.ts` | helper | body.id | :18 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/email/click/route.ts` | direct | ?t | :44 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/email/messages/[id]/reply/route.ts` | direct | :id | :40 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/email/messages/[id]/route.ts` | direct | :id | :33 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/email/segments/[id]/route.ts` | helper | :id | :17 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/email/stats/route.ts` | direct | ?campaignId | :20 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/email/track/route.ts` | direct | ?t | :40 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/email/unsubscribe/route.ts` | direct | ?token, body.token | :80 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/email/view/route.ts` | direct | ?t | :15 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/follow/route.ts` | helper | body.userId, body.creatorUserId | :48 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/github/setup/route.ts` | direct | ?installation_id, ?code | :39 owner/team helper | OK: signed state, then ownInstall for the session |
| `app/api/integrations/shipstation/[token]/route.ts` | direct | :token | :5 signed webhook | OK: signed by the provider; ids come from the signed payload |
| `app/api/integrations/webhooks/[provider]/[token]/route.ts` | direct | :provider, :token | :5 signed webhook | OK: signed by the provider; ids come from the signed payload |
| `app/api/invoice/route.ts` | direct | ?t, ?orderId, body.orderId | :54 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/memberships/[id]/contact/route.ts` | direct | :id | :26 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/memberships/[id]/manage/route.ts` | direct | :id | :32 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/memberships/[id]/portal/route.ts` | direct | :id | :28 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/memberships/[id]/posts/route.ts` | direct | :id | :20 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/memberships/[id]/read/route.ts` | direct | :id | :3 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/memberships/checkout/route.ts` | direct | body.productId, body.email, body.paymentMethodId, body.previousMembershipId, body.emailOptIn | :76 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/memberships/confirm/route.ts` | direct | body.subscriptionId, body.paymentMethodId | :16 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/memberships/files/[postId]/[assetId]/route.ts` | direct | :postId, :assetId | :6 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/memberships/tax-quote/route.ts` | direct | ?productId | :34 published or public data only | OK by design: published membership's tax quote |
| `app/api/memberships/unsubscribe/route.ts` | direct | ?t, body.t | :30 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/native/checkout-status/route.ts` | direct | ?productId | :27 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/newsletter/route.ts` | direct | body.email | none needed | OK: storelib.com's own newsletter, no tenant data |
| `app/api/notify/unsubscribe/route.ts` | direct | ?token | :66 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/offers/bundles/route.ts` | direct | ?product | :3 published or public data only | OK by design: public, published data only |
| `app/api/offers/cart/route.ts` | direct | body.shopId | :51 published or public data only | OK by design: published prices of that shop |
| `app/api/offers/quantity-breaks/route.ts` | direct | ?product | :3 published or public data only | OK by design: public, published data only |
| `app/api/offers/route.ts` | direct | ?product | :3 published or public data only | OK by design: public, published data only |
| `app/api/onepage/blocks-live/route.ts` | direct | body.seller_id | none needed | OK by design: published products of that seller only |
| `app/api/onepage/download/[token]/route.ts` | direct | :token | :2 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/onepage/download/route.ts` | direct | ?token | :3 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/onepage/lead-magnet/route.ts` | direct | body.onepage_id, body.block_id, body.email, body.referrer | :58 published or public data only | OK: page must be published; coupon read with the page's creator_id |
| `app/api/onepage/product/route.ts` | direct | ?id | :60 own rows of the signed-in user or visitor | OK by design: published product; response picks public fields |
| `app/api/onepage/stats/route.ts` | direct | ?onepage_id, ?block_id | :43 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/onepage/track/route.ts` | direct | body.onepage_id, body.href, body.block_id, body.session_id, body.visitor_id | none needed | OK by design: anonymous view and click counter |
| `app/api/order-help/[id]/route.ts` | direct | :id, ?k, body.k | :7 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/payments/[action]/route.ts` | helper | :action | :71 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/payments/disputes/route.ts` | direct | body.id | :51 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/payouts-sheet/route.ts` | direct | body.token | :13 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/physical/checkout/complete/route.ts` | direct | ?session_id | :5 token or signed link is the credential | OK: the Stripe Checkout session id (only in the buyer's return URL) is the credential |
| `app/api/physical/coupons/[id]/route.ts` | helper | :id | :14 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/integrations/[provider]/links/route.ts` | helper | :provider, body.productId | :25 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/integrations/[provider]/route.ts` | helper | :provider | :14 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/integrations/[provider]/search/route.ts` | helper | :provider, ?pid | :21 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/integrations/[provider]/shipment-methods/route.ts` | helper | :provider | :13 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/integrations/[provider]/test/route.ts` | helper | :provider | :21 signed webhook | OK: signed by the provider; ids come from the signed payload |
| `app/api/physical/inventory/export/route.ts` | helper | ?locationId | :17 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/inventory/movements/route.ts` | helper | ?variantId, ?locationId | :17 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/locations/[id]/route.ts` | helper | :id | :11 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/order-status/[token]/cancel/route.ts` | direct | :token | :4 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/order-status/[token]/return/route.ts` | direct | :token | :4 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/order-status/[token]/route.ts` | direct | :token | :4 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/orders/[id]/label/route.ts` | helper | :id, ?locationId, body.locationId, body.packageId, body.shipmentId, body.rateId | :45 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/orders/[id]/packing-slip/route.ts` | helper | :id | :46 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/orders/[id]/route.ts` | helper | :id, body.locationId, body.fulfillmentId, body.returnId | :19 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/packages/[id]/route.ts` | helper | :id | :10 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/partner-tracking/route.ts` | direct | body.order_id, body.checkout_id, body.location_id, body.token | :7 signed webhook | OK: signed by the provider; ids come from the signed payload |
| `app/api/physical/products/[id]/route.ts` | helper | :id | :14 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/readiness/route.ts` | helper | ?product | :24 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/shipping/profiles/[id]/route.ts` | helper | :id, body.addProductIds, body.removeProductIds | :10 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/shipping/rates/[id]/route.ts` | helper | :id | :10 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/shipping/zones/[id]/route.ts` | helper | :id | :10 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/storefront/product/route.ts` | direct | ?productId | :3 owner/team helper | OK by design: published physical product, no costs or stock levels |
| `app/api/physical/storefront/shop/route.ts` | direct | ?shopId | :3 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/tax-rates/[id]/route.ts` | helper | :id | :10 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/physical/transfers/[id]/route.ts` | helper | :id | :11 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/product-analytics/route.ts` | direct | ?productId | :31 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/products/delete/route.ts` | direct | ?productId, body.productId | :30 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/products/files/[assetId]/download/route.ts` | direct | :assetId | :36 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/products/forget/route.ts` | direct | body.productId, body.productSlug | :34 community membership | OK: membership gate; every further id checked against this community (lib/communities/server) |
| `app/api/products/marketplace-price/route.ts` | helper | ?productId, body.productId | :48 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/profile/activity/route.ts` | direct | ?userId | :9 own rows of the signed-in user or visitor | OK by design: public activity, hidden when the person turned it off |
| `app/api/profile/contributions/route.ts` | direct | ?userId | :35 own rows of the signed-in user or visitor | OK: only communities both people are in, spaces the viewer may read |
| `app/api/profile/shared-posts/route.ts` | direct | ?communityId, ?userId | :25 own rows of the signed-in user or visitor | OK: requireMember for the viewer, readable spaces only |
| `app/api/profile/username/route.ts` | direct | ?handle, body.username | :81 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/purchases/claim/route.ts` | direct | body.receiptToken, body.orderId | :47 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/purchases/verify/route.ts` | direct | body.productId, body.receiptTokens | :92 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/receipt/[token]/assets/route.ts` | direct | :token | :3 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/receipt/open/route.ts` | direct | ?order | :5 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/receipt/remember/route.ts` | direct | ?receipt, body.receiptToken | :4 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/receipt/send-copy/route.ts` | direct | body.email | :52 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/receipt/update-email/route.ts` | direct | body.newEmail | :82 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/receipt/view/route.ts` | direct | ?orderId, ?receiptToken | :3 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/reviews/[id]/reply/route.ts` | direct | :id | :47 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/reviews/[id]/report/route.ts` | direct | :id | :40 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/reviews/[id]/route.ts` | direct | :id, ?receiptToken, body.receiptToken | :27 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/reviews/breakdown/route.ts` | direct | ?productId | none needed | OK by design: published rating counts |
| `app/api/reviews/check/route.ts` | direct | ?productId, ?receiptToken | :50 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/reviews/confirm/route.ts` | direct | body.token | :43 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/reviews/photo/route.ts` | direct | body.token, body.productId | :53 token or signed link is the credential | OK: signed request token, or a published product of a store that takes photos from anyone |
| `app/api/reviews/request/route.ts` | direct | body.token | :53 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/reviews/route.ts` | direct | ?productId, ?creatorId, body.receiptToken, body.productId, body.orderId | :61 own rows of the signed-in user or visitor | OK by design (GET): published reviews only. Note: on a database before part 52 the oldest fallback reads without the status filter |
| `app/api/reviews/site/route.ts` | direct | body.email, body.productId | :140 published or public data only | OK: published product; the review waits for the emailed confirm link |
| `app/api/reviews/stats/route.ts` | direct | ?productId | none needed | OK by design: public rating summary columns |
| `app/api/reviews/storefront/route.ts` | helper | ?productId | :16 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/reviews/widgets/[id]/route.ts` | helper | :id | :17 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/security/confirm-device/route.ts` | direct | body.orderId, body.code | :10 published or public data only | OK by design: public, published data only |
| `app/api/security/verify-email/route.ts` | direct | body.orderId, body.email | :12 published or public data only | OK: code sent only to the order's own buyer address after it matches |
| `app/api/seo/indexnow/route.ts` | direct | body.product, body.removedProduct | :39 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/site-account/code/route.ts` | direct | body.email | none needed | OK: a website visitor's sign-in code, sent only to the typed address, rate limited |
| `app/api/site-account/download/route.ts` | direct | ?order | :13 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/site-account/verify/route.ts` | direct | body.code | none needed | OK: the emailed code proves the address; session scoped to this host's store |
| `app/api/site-account/wishlist/route.ts` | direct | body.productId | :40 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts` | direct | :installId, :version, :name | :82 published or public data only | OK: published files; drafts need the install's signed pass (SITE-9, rel-sites) |
| `app/api/site-theme/site/[username]/[[...path]]/route.ts` | direct | :username, :path | :40 published or public data only | OK by design: public, published data only |
| `app/api/sites/[siteId]/agent/answer/route.ts` | helper | :siteId, body.questionId | :29 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/sites/[siteId]/agent/route.ts` | direct | :siteId | :45 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/sites/[siteId]/assets/route.ts` | helper | :siteId, ?id | :34 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/sites/[siteId]/chat/route.ts` | helper | :siteId | none needed | OK: read through the user's own client; RLS proves the site is theirs |
| `app/api/sites/[siteId]/cover/route.ts` | helper | :siteId | :103 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/sites/[siteId]/publish/route.ts` | helper | :siteId | :28 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/sites/[siteId]/restore/route.ts` | helper | :siteId, body.versionId | none needed | OK: the version is read through the user's own client (RLS) before the admin client writes (lib/sites/agent/run.ts restoreVersion) |
| `app/api/sites/[siteId]/run/route.ts` | direct | :siteId | :39 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/sites/route.ts` | helper | body.templateId | :26 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/size-charts/[id]/route.ts` | helper | :id | :11 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/size-charts/product/route.ts` | helper | ?productId, body.productId, body.chartId | :16 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/storage/upload-file/route.ts` | direct | ?assetId | :43 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/store-builder/communities/route.ts` | helper | ?id | :38 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/store-builder/preview/route.ts` | helper | ?creatorId | :20 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/store-builder/route.ts` | helper | ?productId | :29 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/store/cases/[id]/route.ts` | helper | :id | :20 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/store/cases/route.ts` | helper | ?order | :10 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/store/channels/product/route.ts` | helper | ?productId, body.productId | :20 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/store/emails/preview/route.ts` | helper | ?id | :33 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/store/emails/route.ts` | helper | body.id | :43 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/store/ga-check/route.ts` | helper | ?id, body.id | :29 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/store/taxes/overrides/[id]/route.ts` | helper | :id | :9 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/store/taxes/regions/[id]/route.ts` | helper | :id | :11 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/store/translations/product/route.ts` | helper | ?id, body.id | :26 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/stripe/invoice/route.ts` | direct | ?orderId | :27 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/stripe/order-timeline/route.ts` | direct | ?orderId | :40 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/support/tickets/[id]/route.ts` | helper | :id | :17 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/team/[memberId]/route.ts` | direct | :memberId | :19 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/team/accept/route.ts` | direct | body.token | :14 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/team/act/route.ts` | direct | body.store | :22 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/team/home/route.ts` | direct | ?store | :28 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/team/join/route.ts` | direct | ?token, body.token | :63 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/team/join/sign-in/route.ts` | direct | ?token | :4 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/team/join/switch/route.ts` | direct | body.token | :8 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/api/team/leave/route.ts` | direct | body.store | :13 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/team/route.ts` | direct | body.email | :25 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/themes/marketplace/add/route.ts` | direct | body.slug | :45 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/tracking/webhooks/[provider]/[token]/route.ts` | direct | :provider, :token | :49 signed webhook | OK: signed by the provider; ids come from the signed payload |
| `app/api/v2/download/[token]/route.ts` | direct | :token, ?receipt | :57 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/api/v2/upload/cancel/route.ts` | direct | body.assetId | :70 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/v2/upload/complete/route.ts` | direct | body.assetId | :85 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/v2/upload/prepare/route.ts` | direct | body.productId, body.assetId | :68 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/v2/upload/scan/route.ts` | direct | body.assetId | :51 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/v2/upload/server-upload/route.ts` | direct | body.productId, body.assetId | :65 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/webhooks/marketing/[provider]/route.ts` | direct | :provider, ?store, ?token | :32 signed webhook | OK: signed by the provider; ids come from the signed payload |
| `app/api/webhooks/video/[provider]/route.ts` | helper | :provider | :44 signed webhook | OK: signed by the provider; ids come from the signed payload |
| `app/api/website-address/route.ts` | direct | body.handle | :29 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/website-builder/products/route.ts` | direct | ?id | :16 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/search/route.ts` | direct | ?creator | :71 published or public data only | OK by design: published products of that store |
| `app/api/website-builder/subscribe/route.ts` | direct | body.creator_id, body.email | :139 token or signed link is the credential | OK by design: public sign-up form; the creator row is read but not returned |
| `app/api/website-builder/themes/[installId]/agent-connections/route.ts` | direct | :installId, ?id | :33 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/agent/decide/route.ts` | helper | :installId, body.selectedSectionId, body.selectedBlockId | :55 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/website-builder/themes/[installId]/agent/route.ts` | helper | :installId, body.conversationId, body.codeFocus, body.selectedSectionId, body.selectedBlockId | :204 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/website-builder/themes/[installId]/backups/[backupId]/restore/route.ts` | helper | :installId, :backupId | :1 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/backups/route.ts` | helper | :installId | :1 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/chat/conversations/[conversationId]/route.ts` | helper | :installId, :conversationId | :25 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/chat/conversations/route.ts` | helper | :installId | :28 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/chat/report/route.ts` | helper | :installId | :37 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/chat/route.ts` | helper | :installId | :34 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/cover/route.ts` | helper | :installId | :1 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/duplicate/route.ts` | direct | :installId | :19 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/export/route.ts` | direct | :installId | :125 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/website-builder/themes/[installId]/files/route.ts` | helper | :installId | :1 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/focus/route.ts` | direct | :installId, body.section_id, body.block_id | :14 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/github/route.ts` | direct | :installId, body.installationId | :119 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/performance/lab/route.ts` | direct | :installId | :1 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/performance/route.ts` | direct | :installId | :1 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/preview/route.ts` | helper | :installId | :19 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/publish/route.ts` | direct | :installId | :1 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/releases/[releaseId]/restore/route.ts` | direct | :installId, :releaseId | :1 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/releases/route.ts` | direct | :installId | :1 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/route.ts` | direct | :installId | :4 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/sections/code/route.ts` | helper | :installId | :95 creator row of the session | OK: the creator row comes from the session; ids filtered by it |
| `app/api/website-builder/themes/[installId]/sections/route.ts` | helper | :installId | :1 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/sections/sync-global/route.ts` | helper | :installId | :1 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/security/route.ts` | helper | :installId | :15 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/settings/route.ts` | helper | :installId | :2 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/[installId]/sync-status/route.ts` | direct | :installId | :28 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/website-builder/themes/add/route.ts` | direct | body.theme_id | :34 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/api/wishlist/check/route.ts` | direct | ?productId | :49 creator row of the session | OK: the session user, or the guest cookie id |
| `app/api/wishlist/route.ts` | direct | ?productId | :100 creator row of the session | OK: the session user, or the guest cookie id |
| `app/(storelib)/app/auth/callback/route.ts` | direct | ?bridge_token | :47 published or public data only | OK by design: public, published data only |
| `app/(storelib)/app/coupons/[id]/page.tsx` | helper | :id | :33 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/(storelib)/app/emails/flow/[id]/page.tsx` | direct | :id | :45 owner/team helper | OK: flow.creator_id checked against the acting store before anything is drawn |
| `app/(storelib)/app/memberships/[id]/page.tsx` | direct | :id | :31 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/(storelib)/app/offers/[id]/page.tsx` | helper | :id | :26 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/(storelib)/app/products/collections/[id]/page.tsx` | helper | :id | :22 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/(storelib)/app/products/size-charts/[id]/page.tsx` | helper | :id | :22 owner/team helper | OK: ids resolved inside the acting store (owner or team member with the area) |
| `app/(storelib)/auth/callback/route.ts` | direct | ?code, ?error_code | :94 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(storelib)/checkout/physical/order/[token]/page.tsx` | direct | :token | :28 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/(storelib)/checkout/physical/partner/[token]/page.tsx` | direct | :token | :6 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/(storelib)/checkout/site/thanks/[token]/page.tsx` | direct | :token | :6 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/(storelib)/dashboard/products/[id]/page.tsx` | direct | :id | :32 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(storelib)/order-help/[id]/page.tsx` | direct | :id | :4 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/(storelib)/receipt/[token]/page.tsx` | direct | :token | :18 own rows of the signed-in user or visitor | OK: rows of the signed-in user (or the website's visitor session) only |
| `app/(storelib)/receipt/cart/[sessionId]/page.tsx` | direct | :sessionId | :5 token or signed link is the credential | OK: the Stripe Checkout session id is the credential |
| `app/(storelib)/review/[token]/page.tsx` | direct | :token | :50 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |
| `app/(storelib)/review/confirm/[token]/page.tsx` | direct | :token | :35 token or signed link is the credential | OK: an unguessable token or a signed link in the request is the credential |

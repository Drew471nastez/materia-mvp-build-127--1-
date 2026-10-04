import "server-only"

/**
 * ===========================================================================
 *  WHAT THE BUYER'S MEMBERSHIP PAGES SHOW, READ IN ONE PLACE
 * ===========================================================================
 * /library/memberships lists every membership the person has with any
 * creator: where it stands, when it renews and for how much, and how many
 * posts they have not opened. /library/memberships/<id> is one membership:
 * the creator's posts newest first, what members get, the products it
 * includes, the creator, and its payments.
 *
 * SERVER ENFORCED. A member without access now (ended, or past due beyond
 * its grace) is sent the posts' titles and dates only, never their text,
 * pictures or files; the files have their own check as well
 * (app/api/memberships/files). Row level security says the same for the
 * tables (part 75).
 *
 * NEW means published after the member joined and not yet opened by them.
 * Posts from before they joined are all there to read, without a dot.
 */
import { viewerMembership, viewerMemberships } from "./access"
import { POST_COLUMNS, descriptionText, type PostRow } from "./creator"
import { describeStatus, grantsAccess, graceEndsAt } from "./state"
import type { CreatorCard, FeedPost, IncludedItem, MembershipCard, MembershipPage } from "./view-types"
import type { Db, MembershipRow, Viewer } from "./server"



async function creatorsOf(admin: Db, ids: string[]): Promise<Map<string, CreatorCard>> {
  const out = new Map<string, CreatorCard>()
  if (ids.length === 0) return out
  const { data: creators } = await admin.from("creators").select("id, user_id, slug").in("id", ids)
  const rows = (creators as { id: string; user_id: string | null; slug: string | null }[] | null) ?? []
  const users = rows.map((c) => c.user_id).filter((u): u is string => !!u)
  const { data: profiles } = users.length ? await admin.from("profiles").select("id, display_name, username, avatar_url").in("id", users) : { data: [] }
  const byUser = new Map(((profiles as { id: string; display_name: string | null; username: string | null; avatar_url: string | null }[] | null) ?? []).map((p) => [p.id, p]))
  for (const c of rows) {
    const p = c.user_id ? byUser.get(c.user_id) : undefined
    out.set(c.id, { id: c.id, name: (p?.display_name || p?.username || c.slug || "Creator").trim(), avatarUrl: p?.avatar_url ?? null, handle: p?.username || c.slug || null })
  }
  return out
}

/** Unread posts per product for this person: published after they joined, not opened. */
async function unreadCounts(admin: Db, viewer: Viewer, rows: MembershipRow[]): Promise<Map<string, { unread: number; last: string | null }>> {
  const out = new Map<string, { unread: number; last: string | null }>()
  const products = [...new Set(rows.map((r) => r.product_id).filter((p): p is string => !!p))]
  if (products.length === 0) return out
  const { data: posts } = await admin.from("membership_posts").select("id, product_id, published_at").in("product_id", products).is("deleted_at", null).order("published_at", { ascending: false }).limit(1000)
  const list = (posts as { id: string; product_id: string; published_at: string }[] | null) ?? []
  const { data: reads } = list.length ? await admin.from("membership_post_reads").select("post_id").eq("user_id", viewer.id).in("post_id", list.map((p) => p.id)) : { data: [] }
  const seen = new Set(((reads as { post_id: string }[] | null) ?? []).map((r) => r.post_id))
  for (const row of rows) {
    if (!row.product_id) continue
    const joined = Date.parse(row.started_at || row.created_at)
    const mine = list.filter((p) => p.product_id === row.product_id)
    const unread = grantsAccess(row) ? mine.filter((p) => Date.parse(p.published_at) > joined && !seen.has(p.id)).length : 0
    out.set(row.id, { unread, last: mine[0]?.published_at ?? null })
  }
  return out
}

export type LibraryList = { available: false } | { available: true; current: MembershipCard[]; ended: MembershipCard[] }

export async function loadLibraryMemberships(admin: Db, viewer: Viewer): Promise<LibraryList> {
  const read = await viewerMemberships(admin, viewer)
  if (!read.ok) return { available: false }
  const rows = read.value
  const products = [...new Set(rows.map((r) => r.product_id).filter((p): p is string => !!p))]
  const [creators, counts, productRows] = await Promise.all([
    creatorsOf(admin, [...new Set(rows.map((r) => r.creator_id).filter((c): c is string => !!c))]),
    unreadCounts(admin, viewer, rows),
    products.length ? admin.from("products").select("id, title, thumbnail_url").in("id", products) : Promise.resolve({ data: [] }),
  ])
  const byProduct = new Map(((productRows.data as { id: string; title: string | null; thumbnail_url: string | null }[] | null) ?? []).map((p) => [p.id, p]))
  const cards = rows.map((r): MembershipCard => {
    const product = r.product_id ? byProduct.get(r.product_id) : undefined
    const c = counts.get(r.id)
    return {
      id: r.id,
      title: product?.title || r.title || "Membership",
      cover: product?.thumbnail_url ?? null,
      creator: (r.creator_id && creators.get(r.creator_id)) || { id: r.creator_id, name: "Creator", avatarUrl: null, handle: null },
      status: r.status,
      view: describeStatus(r),
      access: grantsAccess(r),
      unread: c?.unread ?? 0,
      lastPostAt: c?.last ?? null,
      billingInterval: r.billing_interval,
      amountCents: r.amount_cents,
      currency: r.currency,
    }
  })
  /* What needs doing first (a failed payment), then the newest post, then the name. */
  const current = cards
    .filter((c) => c.access)
    .sort((a, b) => Number(b.status === "past_due") - Number(a.status === "past_due") || (Date.parse(b.lastPostAt || "") || 0) - (Date.parse(a.lastPostAt || "") || 0) || a.title.localeCompare(b.title))
  const ended = cards.filter((c) => !c.access)
  return { available: true, current, ended }
}





export type { CreatorCard, FeedPost, IncludedItem, InvoiceItem, MembershipCard, MembershipPage } from "./view-types"

export const PAGE_SIZE = 20

function libraryHref(p: { id: string; type: string }): string {
  return p.type === "course" ? `/account/library/courses/${p.id}` : `/account/library/products/${p.id}`
}

/** The feed's posts for this member, as the page draws them. Text, pictures and files only with access. */
export async function feedPosts(admin: Db, viewer: Viewer, row: MembershipRow, opts: { before?: string | null; access: boolean }): Promise<{ posts: FeedPost[]; hasOlder: boolean }> {
  if (!row.product_id) return { posts: [], hasOlder: false }
  let q = admin.from("membership_posts").select(POST_COLUMNS).eq("product_id", row.product_id).is("deleted_at", null).order("published_at", { ascending: false }).limit(PAGE_SIZE + 1)
  if (opts.before) q = q.lt("published_at", opts.before)
  const { data } = await q
  const rows = (data as PostRow[] | null) ?? []
  const page = rows.slice(0, PAGE_SIZE)
  const ids = page.map((p) => p.id)
  const { data: reads } = ids.length ? await admin.from("membership_post_reads").select("post_id").eq("user_id", viewer.id).in("post_id", ids) : { data: [] }
  const seen = new Set(((reads as { post_id: string }[] | null) ?? []).map((r) => r.post_id))
  const joined = Date.parse(row.started_at || row.created_at)
  const linkIds = opts.access ? [...new Set(page.flatMap((p) => p.linked_product_ids ?? []))] : []
  const { data: linked } = linkIds.length ? await admin.from("products").select("id, title, slug, type, thumbnail_url, status, creator_id").in("id", linkIds) : { data: [] }
  const { data: owned } = linkIds.length ? await admin.from("entitlements").select("product_id").eq("buyer_id", viewer.id).in("product_id", linkIds) : { data: [] }
  const mine = new Set(((owned as { product_id: string }[] | null) ?? []).map((e) => e.product_id))
  const handle = row.creator_id ? (await creatorsOf(admin, [row.creator_id])).get(row.creator_id)?.handle ?? null : null
  const byId = new Map(((linked as { id: string; title: string; slug: string | null; type: string; thumbnail_url: string | null; status: string }[] | null) ?? []).map((p) => [p.id, p]))
  const posts = page.map((p): FeedPost => {
    const locked = !opts.access
    return {
      id: p.id,
      title: p.title,
      body: locked ? null : p.body,
      images: locked ? [] : p.images ?? [],
      attachments: locked ? [] : p.attachments ?? [],
      links: locked
        ? []
        : (p.linked_product_ids ?? [])
            .map((id) => byId.get(id))
            .filter((l): l is NonNullable<typeof l> => !!l && (l.status === "published" || mine.has(l.id)))
            .map((l) => ({ id: l.id, title: l.title, cover: l.thumbnail_url, href: mine.has(l.id) ? libraryHref(l) : handle && l.slug ? `/${handle}/${l.slug}` : `/p/${l.slug}` })),
      publishedAt: p.published_at,
      unread: !locked && Date.parse(p.published_at) > joined && !seen.has(p.id),
    }
  })
  return { posts, hasOlder: rows.length > PAGE_SIZE }
}

export type PageRead = { state: "missing-tables" } | { state: "not-found" } | { state: "ok"; page: MembershipPage }

export async function loadMembershipPage(admin: Db, viewer: Viewer, id: string): Promise<PageRead> {
  const read = await viewerMembership(admin, viewer, id)
  if (!read.ok) return { state: "missing-tables" }
  const row = read.value
  if (!row || row.status === "incomplete") return { state: "not-found" }
  const access = grantsAccess(row)
  const [productRead, planRead, creators, invoicesRead, feed] = await Promise.all([
    row.product_id ? admin.from("products").select("id, slug, description, thumbnail_url, title").eq("id", row.product_id).maybeSingle() : Promise.resolve({ data: null }),
    row.product_id ? admin.from("membership_plans").select("benefits, included_product_ids").eq("product_id", row.product_id).maybeSingle() : Promise.resolve({ data: null }),
    creatorsOf(admin, row.creator_id ? [row.creator_id] : []),
    admin.from("membership_invoices").select("stripe_invoice_id, amount_cents, currency, status, paid_at, created_at, hosted_invoice_url").eq("membership_id", row.id).order("created_at", { ascending: false }).limit(12),
    feedPosts(admin, viewer, row, { access }),
  ])
  const product = productRead.data as { id: string; slug: string | null; description: string | null; thumbnail_url: string | null; title: string | null } | null
  const plan = planRead.data as { benefits: string[] | null; included_product_ids: string[] | null } | null
  const includedIds = plan?.included_product_ids ?? []
  const { data: includedRows } = includedIds.length ? await admin.from("products").select("id, title, type, thumbnail_url").in("id", includedIds) : { data: [] }
  const included = ((includedRows as { id: string; title: string; type: string; thumbnail_url: string | null }[] | null) ?? []).map((p) => ({ id: p.id, title: p.title, type: p.type, cover: p.thumbnail_url, href: libraryHref(p) }))
  return {
    state: "ok",
    page: {
      membership: {
        id: row.id,
        title: product?.title || row.title || "Membership",
        status: row.status,
        view: describeStatus(row),
        access,
        graceEndsAt: graceEndsAt(row),
        billingInterval: row.billing_interval,
        amountCents: row.amount_cents,
        currency: row.currency,
        currentPeriodEnd: row.current_period_end,
        trialEnd: row.trial_end,
        cardLast4: row.card_last4,
        cardBrand: row.card_brand,
        emailUpdates: row.email_updates,
        startedAt: row.started_at,
      },
      product: { id: product?.id ?? null, slug: product?.slug ?? null, description: descriptionText(product?.description ?? null), cover: product?.thumbnail_url ?? null },
      benefits: Array.isArray(plan?.benefits) ? plan!.benefits!.filter((b) => typeof b === "string" && b.trim()) : [],
      included,
      creator: (row.creator_id && creators.get(row.creator_id)) || { id: row.creator_id, name: "Creator", avatarUrl: null, handle: null },
      posts: feed.posts,
      hasOlder: feed.hasOlder,
      invoices: ((invoicesRead.data as { stripe_invoice_id: string; amount_cents: number; currency: string; status: string; paid_at: string | null; created_at: string; hosted_invoice_url: string | null }[] | null) ?? []).map((i) => ({
        id: i.stripe_invoice_id,
        amountCents: i.amount_cents,
        currency: i.currency,
        status: i.status,
        paidAt: i.paid_at,
        createdAt: i.created_at,
        url: i.hosted_invoice_url,
      })),
    },
  }
}

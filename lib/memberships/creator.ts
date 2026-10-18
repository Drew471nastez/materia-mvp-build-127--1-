import "server-only"
import { PLAN_CURRENCY } from "@/lib/money/product-currency"
import { trialDaysOf } from "./plan"

/**
 * ===========================================================================
 *  THE CREATOR'S SIDE OF A MEMBERSHIP, ON THE SERVER
 * ===========================================================================
 * A membership is a product (type "membership") so it has a page, a
 * checkout, a place on the creator's page and website, reviews, analytics
 * and orders like any product, plus a plan (membership_plans) with what is
 * particular to it. The /app/memberships screens read and write both through
 * here, with the service role, after checking the product is the signed in
 * creator's.
 *
 * What the product row carries from the plan, so every surface that lists
 * products shows a membership sensibly without knowing about plans:
 *   price_cents      the monthly price, or the yearly one when there is no
 *                    monthly (the product page adds "/month" or "/year")
 *   whats_included   the benefits, which the product page lists
 *   call_to_action   "Join"
 */
import { avoidReservedProductSlug } from "@/lib/commerce/reserved-slugs"
import { sanitizeDescription } from "@/lib/rich-text/sanitize"
import { grantsAccess, monthlyValue } from "./state"
import { grantIncluded, revokeIncluded } from "./sync"
import { MEMBERSHIP_COLUMNS, PLAN_COLUMNS, tableMissing, type Db, type MembershipRow, type PlanRow } from "./server"
import type { PlanValue } from "./plan"
import type { CreatorMembershipProduct, CreatorMembershipRow, CreatorMembershipScreen, MemberView, MembershipStats, PickableProduct, PostRow } from "./view-types"

export type { CreatorMembershipProduct, CreatorMembershipRow, CreatorMembershipScreen, MemberView, MembershipStats, PickableProduct, PostRow }



export const POST_COLUMNS = "id, title, body, images, attachments, linked_product_ids, published_at, email_status, emailed_count"

/** A slug from a title: lower case words joined by hyphens, never empty. */
export function slugFrom(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return base || "membership"
}

async function freeSlug(admin: Db, creatorId: string, title: string, exceptId?: string): Promise<string> {
  const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
  let slug = slugFrom(title)
  let q = admin.from("products").select("id").eq("creator_id", creatorId).eq("slug", slug)
  if (exceptId) q = q.neq("id", exceptId)
  const { data } = await q.limit(1)
  if (data && data.length > 0) slug = `${slug}-${suffix()}`
  return avoidReservedProductSlug(slug, suffix)
}

/** Plain text as the creator typed it, as the paragraphs a product description is stored as. */
export function descriptionHtml(text: string): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const html = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split("\n").map(escape).join("<br>")}</p>`)
    .join("")
  return sanitizeDescription(html)
}

/** The description as the form shows it: paragraphs back to text, tags out. */
export function descriptionText(html: string | null): string {
  if (!html) return ""
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|div)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function createMembershipProduct(admin: Db, creatorId: string, title: string): Promise<{ ok: true; productId: string } | { ok: false; error: string; status: number }> {
  const name = title.trim().slice(0, 120) || "Membership"
  const { error: planCheck } = await admin.from("membership_plans").select("product_id").limit(1)
  if (tableMissing(planCheck)) return { ok: false, status: 503, error: "Memberships are not set up on Storelib yet." }
  const slug = await freeSlug(admin, creatorId, name)
  const { data: product, error } = await admin
    .from("products")
    .insert({ creator_id: creatorId, type: "membership", title: name, slug, status: "draft", price_cents: 0, description: "", call_to_action: "Join", whats_included: [] })
    .select("id")
    .single()
  if (error || !product) {
    const refused = error?.code === "23514"
    return { ok: false, status: refused ? 503 : 500, error: refused ? "Memberships are not set up on Storelib yet." : "The membership could not be made. Try again." }
  }
  const { error: planError } = await admin.from("membership_plans").insert({ product_id: product.id, creator_id: creatorId, trial_days: 0, benefits: [], included_product_ids: [], /* Plans are priced and billed in US dollars (lib/money/product-currency), written down rather than left to the column default. */ currency: PLAN_CURRENCY.toLowerCase() })
  if (planError) {
    await admin.from("products").delete().eq("id", product.id)
    return { ok: false, status: 500, error: "The membership could not be made. Try again." }
  }
  return { ok: true, productId: product.id }
}

export async function ownedMembership(admin: Db, creatorId: string, productId: string): Promise<CreatorMembershipProduct | null> {
  const { data } = await admin
    .from("products")
    .select("id, title, slug, description, status, thumbnail_url, created_at, creator_id, type")
    .eq("id", productId)
    .maybeSingle()
  if (!data || data.creator_id !== creatorId || data.type !== "membership") return null
  return data as CreatorMembershipProduct
}

export interface SaveInput {
  title: string
  description: string
  thumbnailUrl: string | null
  plan: PlanValue
  publish: boolean | null
}

export async function saveMembership(admin: Db, creatorId: string, product: CreatorMembershipProduct, input: SaveInput): Promise<{ ok: true; status: string; slug: string | null } | { ok: false; error: string; field?: string; status: number }> {
  /* Included products: this creator's own, and not memberships (a membership inside a membership has no meaning). */
  let included = input.plan.includedProductIds.filter((id) => id !== product.id)
  if (included.length > 0) {
    const { data: mine } = await admin.from("products").select("id, type").eq("creator_id", creatorId).in("id", included)
    const allowed = new Set(((mine as { id: string; type: string }[] | null) ?? []).filter((p) => p.type !== "membership").map((p) => p.id))
    included = included.filter((id) => allowed.has(id))
  }
  const { data: before } = await admin.from("membership_plans").select(PLAN_COLUMNS).eq("product_id", product.id).maybeSingle()
  const status = input.publish === null ? product.status : input.publish ? "published" : "draft"
  const title = input.title.trim().slice(0, 120) || product.title || "Membership"
  const slug = product.status === "published" || !product.slug ? product.slug || (await freeSlug(admin, creatorId, title, product.id)) : await freeSlug(admin, creatorId, title, product.id)

  const planRow = {
    product_id: product.id,
    creator_id: creatorId,
    monthly_price_cents: input.plan.monthlyPriceCents,
    yearly_price_cents: input.plan.yearlyPriceCents,
    trial_days: input.plan.trialDays,
    benefits: input.plan.benefits,
    included_product_ids: included,
    updated_at: new Date().toISOString(),
  }
  const { error: planError } = await admin.from("membership_plans").upsert(planRow, { onConflict: "product_id" })
  if (planError) return { ok: false, status: tableMissing(planError) ? 503 : 500, error: tableMissing(planError) ? "Memberships are not set up on Storelib yet." : "The membership could not be saved. Try again." }

  const { error } = await admin
    .from("products")
    .update({
      title,
      slug,
      description: descriptionHtml(input.description),
      thumbnail_url: input.thumbnailUrl,
      gallery_urls: input.thumbnailUrl ? [input.thumbnailUrl] : [],
      status,
      price_cents: input.plan.monthlyPriceCents ?? input.plan.yearlyPriceCents ?? 0,
      whats_included: input.plan.benefits,
      call_to_action: "Join",
    })
    .eq("id", product.id)
  if (error) return { ok: false, status: 500, error: "The membership could not be saved. Try again." }

  /* Members who can read now get what was added, and lose what was taken out. */
  const was: string[] = Array.isArray((before as PlanRow | null)?.included_product_ids) ? (before as PlanRow).included_product_ids : []
  const added = included.filter((id) => !was.includes(id))
  const removed = was.filter((id) => !included.includes(id))
  if (added.length || removed.length) {
    const { data: members } = await admin.from("memberships").select(MEMBERSHIP_COLUMNS).eq("product_id", product.id).in("status", ["active", "trialing", "past_due", "canceled"]).limit(5000)
    for (const m of ((members as MembershipRow[] | null) ?? []).filter((r) => grantsAccess(r))) {
      try {
        if (removed.length) await revokeIncluded(admin, m.id, removed)
        if (added.length) await grantIncluded(admin, m)
      } catch (e) {
        console.error("[memberships] included products not updated for a member:", e instanceof Error ? e.message : e)
      }
    }
  }
  return { ok: true, status, slug }
}



export function statsOf(rows: Pick<MembershipRow, "status" | "billing_interval" | "amount_cents" | "current_period_end" | "past_due_since">[]): MembershipStats {
  const live = rows.filter((r) => grantsAccess(r))
  return {
    members: live.length,
    trialing: live.filter((r) => r.status === "trialing").length,
    pastDue: live.filter((r) => r.status === "past_due").length,
    cancelling: live.filter((r) => r.status === "canceled").length,
    monthlyCents: rows.reduce((sum, r) => sum + monthlyValue(r), 0),
  }
}

/* ── What the creator's screens read ────────────────────────────────────── */


export type CreatorList = { available: false } | { available: true; rows: CreatorMembershipRow[] }

const STAT_COLUMNS = "product_id, status, billing_interval, amount_cents, current_period_end, past_due_since"

export async function loadCreatorMemberships(admin: Db, creatorId: string): Promise<CreatorList> {
  /* A membership that sells a community's access is managed in Community
     settings, so it is left out here. Before the communities part has run there
     is no community_id column, and the list is read without it. */
  const read = (columns: string) => admin.from("products").select(columns).eq("creator_id", creatorId).eq("type", "membership").neq("status", "archived").order("created_at", { ascending: false })
  let { data: products, error } = await read("id, title, status, thumbnail_url, created_at, community_id")
  if (error && tableMissing(error)) ({ data: products, error } = await read("id, title, status, thumbnail_url, created_at"))
  if (error) return { available: false }
  products = ((products as { community_id?: string | null }[] | null) ?? []).filter((p) => !p.community_id)
  const ids = ((products as { id: string }[] | null) ?? []).map((p) => p.id)
  const [plans, members] = await Promise.all([
    ids.length ? admin.from("membership_plans").select("product_id, monthly_price_cents, yearly_price_cents").in("product_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from("memberships").select(STAT_COLUMNS).in("product_id", ids).neq("status", "incomplete").limit(20000) : Promise.resolve({ data: [], error: null }),
  ])
  if (tableMissing(plans.error) || tableMissing(members.error)) return { available: false }
  const planOf = new Map(((plans.data as { product_id: string; monthly_price_cents: number | null; yearly_price_cents: number | null }[] | null) ?? []).map((p) => [p.product_id, p]))
  const all = (members.data as (Pick<MembershipRow, "status" | "billing_interval" | "amount_cents" | "current_period_end" | "past_due_since"> & { product_id: string })[] | null) ?? []
  return {
    available: true,
    rows: ((products as { id: string; title: string; status: string; thumbnail_url: string | null }[] | null) ?? []).map((p) => ({
      id: p.id,
      title: p.title || "Membership",
      status: p.status,
      cover: p.thumbnail_url,
      monthlyPriceCents: planOf.get(p.id)?.monthly_price_cents ?? null,
      yearlyPriceCents: planOf.get(p.id)?.yearly_price_cents ?? null,
      stats: statsOf(all.filter((m) => m.product_id === p.id)),
    })),
  }
}



export type ScreenRead = { state: "missing-tables" } | { state: "not-found" } | { state: "ok"; screen: CreatorMembershipScreen }

export async function loadCreatorMembership(admin: Db, creatorId: string, productId: string, handle: string | null): Promise<ScreenRead> {
  const product = await ownedMembership(admin, creatorId, productId)
  if (!product) return { state: "not-found" }
  const [planRead, postsRead, membersRead, productsRead, creatorRead] = await Promise.all([
    admin.from("membership_plans").select(PLAN_COLUMNS).eq("product_id", productId).maybeSingle(),
    admin.from("membership_posts").select(POST_COLUMNS).eq("product_id", productId).is("deleted_at", null).order("published_at", { ascending: false }).limit(50),
    admin.from("memberships").select(MEMBERSHIP_COLUMNS).eq("product_id", productId).neq("status", "incomplete").order("created_at", { ascending: false }).limit(2000),
    admin.from("products").select("id, title, type, status, thumbnail_url").eq("creator_id", creatorId).neq("type", "membership").neq("status", "archived").order("created_at", { ascending: false }).limit(200),
    admin.from("creators").select("stripe_account_id, stripe_onboarding_status, charges_enabled").eq("id", creatorId).maybeSingle(),
  ])
  if (tableMissing(planRead.error) || tableMissing(postsRead.error) || tableMissing(membersRead.error)) return { state: "missing-tables" }
  const plan = planRead.data as PlanRow | null
  const members = (membersRead.data as MembershipRow[] | null) ?? []
  const c = creatorRead.data as { stripe_account_id: string | null; stripe_onboarding_status: string | null; charges_enabled: boolean | null } | null
  return {
    state: "ok",
    screen: {
      product: { ...product, descriptionText: descriptionText(product.description) },
      plan: {
        monthlyPriceCents: plan?.monthly_price_cents ?? null,
        yearlyPriceCents: plan?.yearly_price_cents ?? null,
        trialDays: trialDaysOf(plan?.trial_days),
        benefits: Array.isArray(plan?.benefits) ? plan!.benefits : [],
        includedProductIds: Array.isArray(plan?.included_product_ids) ? plan!.included_product_ids : [],
      },
      posts: (postsRead.data as PostRow[] | null) ?? [],
      members: members.map((m) => ({
        id: m.id,
        name: m.buyer_name,
        email: m.buyer_email,
        status: m.status,
        billing_interval: m.billing_interval,
        amount_cents: m.amount_cents,
        currency: m.currency,
        current_period_end: m.current_period_end,
        trial_end: m.trial_end,
        past_due_since: m.past_due_since,
        started_at: m.started_at,
        created_at: m.created_at,
      })),
      stats: statsOf(members),
      products: ((productsRead.data as { id: string; title: string; type: string; status: string; thumbnail_url: string | null }[] | null) ?? []).map((p) => ({ id: p.id, title: p.title || "Untitled", type: p.type, status: p.status, cover: p.thumbnail_url })),
      handle,
      paymentsReady: !!c?.stripe_account_id && c.stripe_onboarding_status === "connected" && c.charges_enabled !== false,
    },
  }
}

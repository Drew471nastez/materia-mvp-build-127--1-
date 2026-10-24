import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPubliclyVisible, publicOnly } from "@/lib/products/visibility"
import { sellsCommunity } from "@/lib/communities/listing"
import { detectedCountry, loadCheckoutConfig, loadStoreName } from "@/lib/store/settings-server"
import { loadTaxForCheckout } from "@/lib/tax/server"
import { checkoutTaxFor, type CheckoutTax } from "@/lib/tax/rules"
import { readStoreCurrency } from "@/lib/store/selling-currency-server"
import { productPriceCurrency } from "@/lib/money/product-currency"
import { providerFor } from "@/lib/payments/service"
import { rowsOwn } from "@/lib/checkout/owned"
import { salesStanding } from "@/lib/products/sales-standings"
import { copiesLeft } from "@/lib/products/sales-limit"
import { sanitizeRichText } from "@/lib/website-builder/sanitize"
import { personName } from "@/lib/profile/display-name"
import { productCheckoutUrl, productPageUrl, sellsInstantly, shipsProduct } from "@/lib/onepage/product-block"

/**
 * GET /api/onepage/product?id=<productId>
 *
 * What a OnePage needs to show one product in a sheet over the page, and to
 * sell it there (components/onepage/product-sheet.tsx and
 * components/checkout/instant-checkout.tsx): its pictures, its description,
 * its price and options, whether it is sold out, and whether it can be paid
 * for in the checkout window.
 *
 * READ ONLY. Nothing is paid for here. The window pays through the checkout's
 * own routes (/api/checkout/stripe-session, /api/checkout/confirm-payment,
 * /api/checkout/process), which price the order again from the database. The
 * figures here are what those routes will charge, for showing.
 *
 * Only a published product answers (lib/products/visibility): a draft, an
 * archived or a deleted one is a 404, as its page is.
 *
 * `instant` says whether the window can take this product. It cannot when the
 * product ships, is a membership or a community plan, is pay what you want
 * (its amount is chosen on the checkout page), or when the store asks for
 * an account first and nobody is signed in. Then `checkoutUrl` is where the
 * buyer continues.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = Record<string, unknown>

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? ""
  if (!UUID.test(id)) return NextResponse.json({ error: "This product is not available." }, { status: 400 })

  const admin = createAdminClient()
  const { data: product } = await publicOnly(admin.from("products").select("*").eq("id", id)).maybeSingle()
  if (!product || !isPubliclyVisible(product as Row)) return NextResponse.json({ error: "This product is not for sale right now." }, { status: 404 })
  const p = product as Row
  const creatorId = String(p.creator_id ?? "")

  const supabase = await createClient()
  const [userRead, variantsRead, creatorRead, store, config, taxSetup, provider, storeName, standing] = await Promise.all([
    supabase.auth.getUser().catch(() => ({ data: { user: null } })),
    admin.from("product_variants").select("id, name, description, price_cents, pay_what_you_want, pwyw_min_price_cents").eq("product_id", id).order("price_cents", { ascending: true }),
    admin.from("creators").select("id, user_id, slug").eq("id", creatorId).maybeSingle(),
    readStoreCurrency(admin, creatorId),
    loadCheckoutConfig(admin, creatorId),
    loadTaxForCheckout(admin, creatorId),
    providerFor(creatorId).catch(() => "stripe" as const),
    loadStoreName(admin, creatorId).catch(() => null),
    salesStanding(admin, id),
  ])
  const user = userRead.data.user
  const creator = creatorRead.data as { id: string; user_id: string; slug: string | null } | null
  const { data: profile } = creator ? await admin.from("profiles").select("display_name, avatar_url, username").eq("id", creator.user_id).maybeSingle() : { data: null }
  const prof = profile as { display_name?: string | null; avatar_url?: string | null; username?: string | null } | null

  const variants = ((variantsRead.data ?? []) as Row[]).map((v) => ({
    id: String(v.id),
    name: String(v.name ?? ""),
    description: typeof v.description === "string" ? v.description : null,
    priceCents: v.pay_what_you_want ? Number(v.pwyw_min_price_cents) || 0 : Number(v.price_cents) || 0,
    pwyw: v.pay_what_you_want === true,
  }))

  /* Owned per option, the rule every checkout uses (lib/checkout/owned): the whole product, or these options. */
  let owned = false
  let ownedVariants: string[] = []
  if (user) {
    const { data } = await admin.from("entitlements").select("product_id, variant_id").eq("buyer_id", user.id).eq("product_id", id).limit(50)
    const rows = (data ?? []) as { product_id: string; variant_id: string | null }[]
    owned = rowsOwn(rows, id, null)
    ownedVariants = variants.filter((v) => rowsOwn(rows, id, v.id)).map((v) => v.id)
  }

  const type = typeof p.type === "string" ? p.type : null
  const pwyw = p.pay_what_you_want === true || variants.some((v) => v.pwyw)
  const left = standing ? copiesLeft(standing) : null
  const soldOut = left === 0
  const tax: CheckoutTax | null = checkoutTaxFor(taxSetup, id, detectedCountry(request.headers))

  /* Why the window cannot take it, when it cannot: said to the buyer with a way on. */
  const reason = !sellsInstantly(type)
    ? "This one is bought on its checkout page."
    : sellsCommunity(p)
      ? "This one is bought on its checkout page."
      : pwyw
        ? "You choose what to pay on the checkout page."
        : provider === "airwallex"
          ? "This one is bought on its checkout page."
          : (config.requireAccount || config.requireConfirmedEmail) && !user
            ? "Sign in or create an account to buy this."
            : config.requireConfirmedEmail && !user?.email_confirmed_at
              ? "Confirm your email address to buy this."
              : null

  const gallery = Array.isArray(p.gallery_urls) ? (p.gallery_urls as unknown[]).filter((u): u is string => typeof u === "string" && !!u && !/ytimg\.com|youtube\.com|youtu\.be/i.test(u)) : []
  const thumb = typeof p.thumbnail_url === "string" && p.thumbnail_url ? p.thumbnail_url : null
  const images = [...new Set([...(thumb ? [thumb] : []), ...gallery])].slice(0, 12)
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string }

  return NextResponse.json(
    {
      product: {
        id,
        title: String(p.title ?? ""),
        slug: typeof p.slug === "string" ? p.slug : null,
        type,
        descriptionHtml: sanitizeRichText(p.description),
        priceCents: Number(p.price_cents) || 0,
        compareAtCents: typeof p.compare_at_cents === "number" && p.compare_at_cents > (Number(p.price_cents) || 0) ? p.compare_at_cents : null,
        pwyw: p.pay_what_you_want === true,
        pwywMinCents: Number(p.pwyw_min_price_cents) || 0,
        currency: productPriceCurrency(p as { type?: string | null; community_id?: string | null }, store.currency),
        images,
        variants,
        soldOut,
        left: left !== null && left > 0 && left < 10 ? left : null,
        pageUrl: productPageUrl(typeof p.slug === "string" ? p.slug : null),
        ships: shipsProduct(type),
      },
      seller: {
        name: storeName || personName({ name: prof?.display_name, username: prof?.username, slug: creator?.slug }),
        avatarUrl: prof?.avatar_url || null,
      },
      checkout: {
        instant: reason === null && !soldOut,
        reason: soldOut ? "Sold out" : reason,
        url: productCheckoutUrl(id),
        tax,
        marketingOptIn: config.marketingOptIn === true,
        lastNameRequired: config.nameFields === "first_and_last",
      },
      buyer: user ? { email: user.email ?? "", name: (meta.full_name || meta.name || "").trim(), owned, ownedVariants, library: `/account/library/products/${encodeURIComponent(id)}` } : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}

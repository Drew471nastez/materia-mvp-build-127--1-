import { cookies } from "next/headers"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { siteHostsFor } from "@/lib/checkout/site-hosts"
import { cleanOrigin } from "@/lib/orders/order-source"
import { attributionForCheckout } from "@/lib/attribution/server"
import { physicalApiGate } from "@/lib/physical/gate"
import { physicalJson, readBody } from "@/lib/physical/auth"
import { abandonCheckout, startCheckout } from "@/lib/physical/checkout-server"
import { loadCheckoutConfig, loadStoreName } from "@/lib/store/settings-server"
import { cartVisitorOf, visitorHash } from "@/lib/cart-uploads/sign"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Pay for a physical or mixed cart: priced, stock held, Stripe page made
 * (lib/physical/checkout-server.ts). The browser's numbers are never read;
 * a delivery option that has changed since the page showed it is refused
 * so the buyer sees the new price before paying it.
 */
export async function POST(request: Request) {
  const off = await physicalApiGate()
  if (off) return off
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  /* Back from the payment form to change something: this tab's checkout lets go of its stock (abandonCheckout). */
  if (body.action === "abandon") {
    const done = await abandonCheckout(createAdminClient(), { shopId: typeof body.shopId === "string" ? body.shopId : null, clientKey: body.clientKey })
    return physicalJson({ ok: done })
  }
  const limited = await rateLimit({
    bucket: "payment",
    subjects: [addressSubject(request), emailSubject(body.email)],
    windows: LIMITS.payment,
    message: "Too many checkouts started just now. Wait a few minutes and try again.",
  })
  if (limited) return limited

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const db = createAdminClient()
  const platformOrigin = `https://${getMainDomain()}`
  const shopId = typeof body.shopId === "string" ? body.shopId : null

  /* Back to the checkout page, or to the shop's own site when it is one of this shop's addresses. */
  let backUrl = `${platformOrigin}/checkout/physical${shopId ? `?shop=${encodeURIComponent(shopId)}` : ""}`
  if (typeof body.returnUrl === "string" && shopId) {
    try {
      const u = new URL(body.returnUrl)
      const own = await siteHostsFor(shopId)
      if (u.protocol === "https:" && (u.hostname === getMainDomain() || own.includes(u.hostname.toLowerCase()))) backUrl = u.toString()
    } catch {
      /* The checkout page it is. */
    }
  }
  const sent = cleanOrigin(body.origin)
  const origin = { ...(sent ?? {}), surface: "website" as const }
  const attribution = shopId ? await attributionForCheckout(db, { creatorId: shopId, source: "website", origin, sent: body.origin }) : null

  /* The store's Settings › Checkout: what is asked for, and whether an account comes first. */
  const config = await loadCheckoutConfig(db, shopId)

  const started = await startCheckout(db, {
    shopId,
    items: body.items,
    couponCode: body.couponCode,
    email: body.email ?? user?.email,
    name: body.name,
    phone: body.phone,
    address: body.address,
    deliveryOptionId: body.deliveryOptionId,
    buyerNote: body.buyerNote,
    clientKey: body.clientKey,
    origin,
    attribution,
    buyerId: user?.id ?? null,
    platformOrigin,
    backUrl,
    config,
    buyerEmailConfirmed: !!user?.email_confirmed_at,
    emailOptIn: body.emailOptIn,
    embedded: body.ui === "embedded",
    shopName: body.ui === "embedded" && shopId ? await loadStoreName(db, shopId) : null,
    /* Paid in cash when it arrives (lib/physical/cash-on-delivery.ts), when the shop takes it. */
    cashOnDelivery: body.cashOnDelivery === true,
    /* This browser's cart cookie, so a buyer's photo uploaded on storelib.com's product page (lib/cart-uploads) is theirs to send. */
    cartVisitor: (() => {
      const v = cartVisitorOf(request.headers.get("cookie"))
      return v ? visitorHash(v) : null
    })(),
  })
  if (started.ok === false) return physicalJson({ error: started.error, field: started.field ?? null, stock: started.stock ?? null }, started.status)
  /* Written at once, with no payment form: the buyer's session sees the order. */
  if (started.free || started.cod) {
    const { data: co } = await db.from("commerce_checkouts").select("session_fingerprint").eq("id", started.checkoutId).maybeSingle()
    if (co?.session_fingerprint) {
      const main = getMainDomain()
      const local = main.includes("localhost")
      ;(await cookies()).set("materia_session", co.session_fingerprint, { httpOnly: true, secure: !local, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/", domain: local ? undefined : `.${main}` })
    }
  }
  return physicalJson({ url: started.url, free: started.free, ...(started.cod ? { cod: true } : {}), ...(started.clientSecret ? { clientSecret: started.clientSecret } : {}) })
}

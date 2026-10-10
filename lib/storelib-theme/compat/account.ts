/**
 * ===========================================================================
 *  THE VISITOR'S ACCOUNT ON A WEBSITE WITH AN IMPORTED SHOPIFY THEME
 * ===========================================================================
 * Signing in, the account page and the addresses, drawn on the website's own
 * host, inside the theme's own header and footer (./site.ts accountPage).
 * Nothing here is framed: an earlier version showed Storelib's account page
 * in an iframe, and every response carries `X-Frame-Options: DENY`
 * (vercel.json), so on the live site the frame was a blank rectangle.
 *
 * Two halves, both pure:
 *
 *   themeCustomer   the signed-in customer (lib/site-accounts/account-data)
 *                   as a Shopify theme reads `customer`: first_name, orders
 *                   with `name`, `created_at`, `total_price` in cents and
 *                   the status labels, addresses, default_address. What the
 *                   theme's own customers/account template draws, and what
 *                   its header reads to say Account rather than Log in.
 *
 *   the pages       Storelib's own sign in (an email, then the code sent to
 *                   it), account and addresses markup, for a theme without
 *                   those templates (Dawn and Horizon have none: Shopify
 *                   moved them to its hosted accounts) and for the code
 *                   step, which no Shopify theme has. They take the theme's
 *                   fonts and colours and its own button class, so they read
 *                   as part of the site.
 *
 * The forms post to the routes every Storelib website uses
 * (app/api/site-account/*): same host, same checks, same rate limits.
 */
import { escapeHtml } from "./filters"

type O = Record<string, unknown>

/** The customer as lib/site-accounts/account-data.ts writes it (siteCustomer). */
export interface StorelibCustomer {
  name: string
  first_name: string
  email: string
  orders: StorelibOrder[]
  orders_count: number
  addresses?: { lines: string[] }[]
}

export interface StorelibOrder {
  id: string
  number: string
  date: string
  created_at?: string
  status: string
  state: string
  total: string
  total_cents?: number
  currency?: string
  items: { title: string; image: string; url: string; variant: string }[]
  item_count: number
  action_label: string
  action_url: string
}

/** What a request knows about who is visiting (the route reads it from the website's own session cookie). */
export interface SiteAccount {
  /** Signed in: the customer and their orders. Null for a guest. */
  customer: StorelibCustomer | null
  /** A guest part way through signing in: the email a code went to. */
  pending?: { email: string } | null
}

const FINANCIAL: Record<string, [string, string]> = {
  open: ["paid", "Paid"],
  pending: ["pending", "Pending"],
  refunded: ["refunded", "Refunded"],
  held: ["pending", "On hold"],
  failed: ["voided", "Voided"],
}

function addressDrop(lines: string[], i: number): O {
  /* Lines as a parcel's label reads (name, street, [street 2], city line, country): Shopify's fields, as near as lines allow. */
  const [name = "", address1 = "", ...rest] = lines
  const country = rest.length ? rest[rest.length - 1] : ""
  const city = rest.length > 1 ? rest[rest.length - 2] : ""
  const address2 = rest.length > 2 ? rest.slice(0, rest.length - 2).join(", ") : ""
  const [first_name = "", ...last] = name.split(/\s+/)
  return { id: `a${i + 1}`, name, first_name, last_name: last.join(" "), company: "", address1, address2, street: [address1, address2].filter(Boolean).join(", "), city, province: "", province_code: "", zip: "", country, country_code: "", phone: "", summary: lines.join(", "), url: "/account/addresses" }
}

/** `customer`, as a Shopify theme reads it. */
export function themeCustomer(c: StorelibCustomer): O {
  const name = (c.name ?? "").trim()
  const [first, ...rest] = name ? name.split(/\s+/) : [""]
  const orders = (c.orders ?? []).map((o) => {
    const [financial_status, financial_status_label] = /refund/i.test(o.status) && o.state === "open" ? ["partially_refunded", "Partially refunded"] : (FINANCIAL[o.state] ?? ["paid", "Paid"])
    const shipped = /shipped|delivered|complete/i.test(o.status)
    const cents = Number.isFinite(o.total_cents) ? Number(o.total_cents) : 0
    const line_items = o.items.map((it, i) => ({ id: `${o.id}-${i}`, title: it.title, product_title: it.title, variant_title: it.variant || null, quantity: 1, image: it.image || null, url: it.url, product: { title: it.title, url: it.url, featured_image: it.image || null } }))
    return {
      id: o.id,
      name: `#${o.number}`,
      order_number: o.number,
      created_at: o.created_at || o.date,
      /* An order's own page is its receipt, which is also where its files are (lib/receipts). */
      customer_url: o.action_url || "/account",
      financial_status,
      financial_status_label,
      fulfillment_status: shipped ? "fulfilled" : "unfulfilled",
      fulfillment_status_label: o.status,
      total_price: cents,
      total_net_amount: cents,
      subtotal_price: cents,
      currency: o.currency ?? "USD",
      line_items,
      line_items_count: line_items.length,
      item_count: o.item_count,
      cancelled: false,
      cancelled_at: null,
      storelib_total: o.total,
      storelib_action_label: o.action_label,
    }
  })
  const addresses = (c.addresses ?? []).map((a, i) => addressDrop(a.lines, i))
  return {
    id: "",
    email: c.email,
    name: name || c.email,
    first_name: first ?? "",
    last_name: rest.join(" "),
    phone: "",
    has_account: true,
    accepts_marketing: false,
    tags: [],
    orders,
    orders_count: orders.length,
    last_order: orders[0] ?? null,
    total_spent: orders.reduce((n, o) => n + (o.total_price as number), 0),
    addresses,
    addresses_count: addresses.length,
    default_address: addresses[0] ?? null,
  }
}

// ── Storelib's own pages, in the theme ──────────────────────────────────────

const esc = (v: unknown) => escapeHtml(String(v ?? ""))

/*
  Scoped to .sl-acc, and quiet on purpose: the theme's fonts, colours and
  headings come through untouched; borders are the text colour, faint.
  The primary button wears the theme's own button classes; when the theme
  styles none of them, the small script below gives it an outline of the
  text colour instead, which reads on a light or a dark theme.
*/
export const ACCOUNT_STYLE = `<style data-storelib-account>
.sl-acc{box-sizing:border-box;width:100%;max-width:var(--sl-acc-w,460px);margin:0 auto;padding:56px 20px 72px;color:inherit;font:inherit}
.sl-acc--wide{--sl-acc-w:760px}
.sl-acc *{box-sizing:border-box}
.sl-acc h1{margin:0 0 8px;overflow-wrap:anywhere}
.sl-acc h2{margin:0;padding-bottom:12px;font-size:1.15em;border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.sl-acc p{margin:0}
.sl-acc .sl-acc__lead{margin:0 0 24px;opacity:.75}
.sl-acc .sl-acc__notice{margin:0 0 16px;padding:12px 14px;border-radius:6px;background:color-mix(in srgb,currentColor 7%,transparent)}
.sl-acc form{margin:0}
.sl-acc .sl-acc__label{display:block;margin:0 0 6px;font-size:.9em;opacity:.8}
.sl-acc .sl-acc__input{display:block;width:100%;min-height:48px;margin:0 0 16px;padding:0 14px;font:inherit;font-size:16px;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 35%,transparent);border-radius:6px;-webkit-appearance:none;appearance:none}
.sl-acc .sl-acc__input:focus{outline:2px solid currentColor;outline-offset:1px}
.sl-acc .sl-acc__btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;margin:0;cursor:pointer;text-decoration:none}
.sl-acc .sl-acc__btn--own{padding:0 24px;font:inherit;font-weight:600;color:inherit;background:transparent;border:1px solid currentColor;border-radius:6px}
.sl-acc .sl-acc__btn--own:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.sl-acc .sl-acc__link{display:inline-flex;align-items:center;min-height:44px;padding:0;font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-decoration:underline;text-underline-offset:4px}
.sl-acc .sl-acc__row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 16px;margin-top:12px}
.sl-acc .sl-acc__note{margin-top:20px;font-size:.9em;opacity:.7}
.sl-acc .sl-acc__top{display:flex;align-items:center;justify-content:space-between;gap:16px}
.sl-acc .sl-acc__block{margin-top:40px}
.sl-acc .sl-acc__empty{margin-top:16px;opacity:.75}
.sl-acc .sl-acc__orders{list-style:none;margin:0;padding:0}
.sl-acc .sl-acc__order{padding:20px 0;border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.sl-acc .sl-acc__order-head,.sl-acc .sl-acc__order-foot{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.sl-acc .sl-acc__order-foot{align-items:center;margin-top:12px}
.sl-acc .sl-acc__muted{font-size:.9em;opacity:.7}
.sl-acc .sl-acc__items{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.sl-acc .sl-acc__item{display:flex;align-items:center;gap:12px;min-width:0;color:inherit;text-decoration:none}
.sl-acc .sl-acc__thumb{flex:none;width:48px;height:48px;border-radius:4px;overflow:hidden;background:color-mix(in srgb,currentColor 8%,transparent)}
.sl-acc .sl-acc__thumb img{display:block;width:100%;height:100%;object-fit:cover}
.sl-acc .sl-acc__go{flex:none;width:auto}
.sl-acc .sl-acc__rows{display:flex;flex-direction:column}
.sl-acc .sl-acc__prow{display:grid;grid-template-columns:88px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:56px;border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.sl-acc .sl-acc__prow .sl-acc__input{margin:0}
.sl-acc .sl-acc__addrs{list-style:none;margin:0;padding:0}
.sl-acc .sl-acc__addr{display:flex;flex-direction:column;padding:16px 0;border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.sl-acc details>summary{list-style:none;opacity:.75}
.sl-acc details>summary::-webkit-details-marker{display:none}
.sl-acc .sl-acc__danger{margin-top:16px;max-width:320px}
@media (max-width:480px){.sl-acc{padding:40px 16px 56px}.sl-acc .sl-acc__prow{grid-template-columns:72px minmax(0,1fr) auto}}
</style>`

/* The theme styles none of its button classes: the outline of the text colour, which reads on any ground. */
const BUTTON_CHECK = `<script>(function(){document.querySelectorAll(".sl-acc .sl-acc__btn").forEach(function(b){var s=getComputedStyle(b);var bg=s.backgroundColor;var none=(bg==="rgba(0, 0, 0, 0)"||bg==="transparent")&&s.backgroundImage==="none"&&parseFloat(s.borderTopWidth)===0;if(none)b.classList.add("sl-acc__btn--own")})})();</script>`

const BUTTON_CLASS = "button button--primary btn btn-primary sl-acc__btn"

function page(inner: string, wide = false): string {
  return `${ACCOUNT_STYLE}<div class="sl-acc${wide ? " sl-acc--wide" : ""}">${inner}</div>${BUTTON_CHECK}`
}

const notice = (text: string | null | undefined, alert = true) => (text ? `<p class="sl-acc__notice" role="${alert ? "alert" : "status"}">${esc(text)}</p>` : "")

export interface SignInView {
  step: "email" | "code"
  /** On the code step: where the code went. */
  email?: string
  /** A path on this website to land on once signed in. */
  returnTo: string
  notice?: string | null
  /** /account/register: the same email and code, worded for a new account. */
  register?: boolean
}

/** Sign in, the way every Storelib website does it: an email, then the six digit code sent to it. A new email makes the account. */
export function signInContent(v: SignInView): string {
  const back = esc(v.returnTo || "/account")
  if (v.step === "code") {
    return page(`<h1>Check your email</h1>
<p class="sl-acc__lead">We sent a 6 digit code to <strong>${esc(v.email)}</strong>. It works for 10 minutes.</p>
${notice(v.notice)}
<form method="post" action="/api/site-account/verify" data-storelib-form="native">
<label class="sl-acc__label" for="sl-acc-code">Code</label>
<input class="sl-acc__input" id="sl-acc-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="6 digit code" required autofocus>
<button class="${BUTTON_CLASS}" type="submit">Sign in</button>
</form>
<div class="sl-acc__row">
<form method="post" action="/api/site-account/code" data-storelib-form="native"><input type="hidden" name="email" value="${esc(v.email)}"><input type="hidden" name="return" value="${back}"><input type="hidden" name="again" value="1"><button class="sl-acc__link" type="submit">Send a new code</button></form>
<a class="sl-acc__link" href="/account/login?step=email">Use a different email</a>
</div>`)
  }
  return page(`<h1>${v.register ? "Create account" : "Sign in"}</h1>
<p class="sl-acc__lead">Enter your email and we'll send you a code.</p>
${notice(v.notice)}
<form method="post" action="/api/site-account/code" data-storelib-form="native">
<input type="hidden" name="return" value="${back}">
<label class="sl-acc__label" for="sl-acc-email">Email</label>
<input class="sl-acc__input" id="sl-acc-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="you@example.com" required autofocus>
<button class="${BUTTON_CLASS}" type="submit">Continue</button>
</form>
<p class="sl-acc__note">${v.register ? "Already have an account? Use the same email to sign in." : "New here? Signing in makes your account."}</p>`)
}

export interface AccountView {
  notice?: string | null
  /** "name" while the name is open for editing (?edit=name). */
  edit?: string | null
}

/** The signed-in customer's page: orders, profile, addresses, saved items, signing out and deleting the account. */
export function accountContent(c: StorelibCustomer, v: AccountView = {}): string {
  const orders = c.orders ?? []
  const list = orders.length
    ? `<ol class="sl-acc__orders">${orders
        .map((o) => {
          const items = o.items
            .map((it) => {
              const inner = `<span class="sl-acc__thumb">${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" decoding="async">` : ""}</span><span><span>${esc(it.title)}</span>${it.variant ? `<br><span class="sl-acc__muted">${esc(it.variant)}</span>` : ""}</span>`
              return `<li>${it.url ? `<a class="sl-acc__item" href="${esc(it.url)}">${inner}</a>` : `<div class="sl-acc__item">${inner}</div>`}</li>`
            })
            .join("")
          return `<li class="sl-acc__order"><div class="sl-acc__order-head"><div><p><strong>${esc(o.date)}</strong></p><p class="sl-acc__muted">Order #${esc(o.number)}</p></div><p>${esc(o.status)}</p></div><ul class="sl-acc__items">${items}</ul><div class="sl-acc__order-foot"><p><span class="sl-acc__muted">Total</span> <strong>${esc(o.total)}</strong></p>${o.action_url ? `<a class="sl-acc__link" href="${esc(o.action_url)}">${esc(o.action_label)}</a>` : ""}</div></li>`
        })
        .join("")}</ol>`
    : `<p class="sl-acc__empty">No orders yet. <a class="sl-acc__link" href="/collections/all">Browse the shop</a></p>`
  const name = (c.name ?? "").trim()
  const nameRow =
    v.edit === "name"
      ? `<form class="sl-acc__prow" method="post" action="/api/site-account/profile" data-storelib-form="native"><label class="sl-acc__muted" for="sl-acc-name">Name</label><input class="sl-acc__input" id="sl-acc-name" name="name" type="text" value="${esc(name)}" maxlength="120" autocomplete="name" placeholder="Your name" autofocus><span><button class="sl-acc__link" type="submit">Save</button> <a class="sl-acc__link" href="/account#profile">Cancel</a></span></form>`
      : `<div class="sl-acc__prow"><p class="sl-acc__muted">Name</p><p>${name ? esc(name) : `<span class="sl-acc__muted">Not added</span>`}</p><a class="sl-acc__link" href="/account?edit=name#profile">Edit</a></div>`
  const addresses = c.addresses ?? []
  return page(
    `<div class="sl-acc__top"><h1>Account</h1><form method="post" action="/account/logout" data-storelib-form="native"><button class="sl-acc__link" type="submit">Sign out</button></form></div>
<div class="sl-acc__block"><h2>Orders</h2>${list}</div>
<div class="sl-acc__block" id="profile"><h2>Profile</h2>${notice(v.notice, false)}<div class="sl-acc__rows">${nameRow}<div class="sl-acc__prow"><p class="sl-acc__muted">Email</p><p>${esc(c.email)}</p><span></span></div></div></div>
${addresses.length ? `<div class="sl-acc__block" id="addresses"><h2>Addresses</h2>${addressList(addresses)}</div>` : ""}
<div class="sl-acc__block"><h2>Wishlist</h2><p class="sl-acc__empty"><a class="sl-acc__link" href="/wishlist">See what you saved</a></p></div>
${deleteBlock(v.edit === "delete")}`,
    true,
  )
}

function addressList(addresses: { lines: string[] }[]): string {
  return `<ul class="sl-acc__addrs">${addresses.map((a) => `<li class="sl-acc__addr">${a.lines.map((l) => `<span>${esc(l)}</span>`).join("")}</li>`).join("")}</ul>`
}

function deleteBlock(open: boolean): string {
  return `<details class="sl-acc__block" id="delete"${open ? " open" : ""}><summary class="sl-acc__link">Delete account</summary><p class="sl-acc__empty">This deletes your account and saved items on this website. Your past orders stay with the store.</p><form class="sl-acc__danger" method="post" action="/api/site-account/delete" data-storelib-form="native"><input type="hidden" name="confirm" value="delete"><button class="${BUTTON_CLASS}" type="submit">Delete my account</button></form></details>`
}

/** /account/addresses: where this customer's orders from the shop were sent. Saved by checkout, so there is nothing to type here. */
export function addressesContent(c: StorelibCustomer): string {
  const addresses = c.addresses ?? []
  return page(
    `<div class="sl-acc__top"><h1>Addresses</h1><a class="sl-acc__link" href="/account">Back to account</a></div>
<div class="sl-acc__block">${addresses.length ? addressList(addresses) : `<p class="sl-acc__empty">No addresses yet. The address you ship an order to is saved here.</p>`}</div>`,
    true,
  )
}

/**
 * A theme's own sign in or Create account form, posted to /account/login,
 * /account or /account/recover, as the fields Storelib's code route reads.
 * Every one of them is "email me a code": there are no passwords, so a
 * password a theme's form still asks for is never read, and Forgot password
 * is the same code.
 */
export function themeSignInFields(body: O | null): { email: string; returnPath: string; name: string } {
  const b = body ?? {}
  const pick = (...keys: string[]) => {
    for (const k of keys) if (typeof b[k] === "string" && b[k]) return String(b[k])
    return ""
  }
  const email = pick("customer[email]", "email", "contact[email]").slice(0, 254)
  const back = pick("return_to", "return", "checkout_url")
  const returnPath = back.startsWith("/") && !back.startsWith("//") && !back.startsWith("/\\") ? back.slice(0, 512) : "/account"
  const name = [pick("customer[first_name]", "first_name"), pick("customer[last_name]", "last_name")].map((s) => s.trim()).filter(Boolean).join(" ").slice(0, 120)
  return { email, returnPath, name }
}

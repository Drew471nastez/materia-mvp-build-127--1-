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
import { wordsOf, type Words } from "@/lib/site-accounts/words"
import { inLang, langOfRoot } from "@/lib/site-accounts/lang-path"
import { ACCOUNT_FORMS_SCRIPT, ACCOUNT_FORMS_STYLE } from "@/lib/site-accounts/forms-script"
import type { UiWord } from "@/lib/markets/ui-words"

type O = Record<string, unknown>

/** The customer as lib/site-accounts/account-data.ts writes it (siteCustomer). */
export interface StorelibCustomer {
  name: string
  first_name: string
  email: string
  orders: StorelibOrder[]
  orders_count: number
  phone?: string
  addresses?: StorelibAddress[]
  /** The shop sells something that ships: the address book is offered even while empty. */
  ships?: boolean
}

/** One address of the customer's book (lib/site-accounts/account-data addressObject). Only `lines` is there for an older caller. */
export interface StorelibAddress {
  lines: string[]
  id?: string
  default?: boolean
  name?: string
  company?: string
  line1?: string
  line2?: string
  city?: string
  region?: string
  postal_code?: string
  country_code?: string
  country?: string
  phone?: string
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
  /** Something that ships (lib/site-accounts/account-data): where it is, its parcels and its order page on this website. */
  fulfillment_status?: string
  tracking?: { company: string; number: string; url: string; status: string }[]
  order_url?: string
}

/** Shopify's three fulfilment words, from the order page's own (lib/physical/status). */
function shopifyFulfillment(o: StorelibOrder): string {
  switch (o.fulfillment_status) {
    case "fulfilled":
    case "delivered":
      return "fulfilled"
    case "partially_fulfilled":
      return "partial"
    case undefined:
      return /shipped|delivered|complete/i.test(o.status) ? "fulfilled" : "unfulfilled"
    default:
      return "unfulfilled"
  }
}

/** One order with its files, as lib/site-accounts/order-files.ts reads it for /account/orders/<id>. */
export interface StorelibOrderDetail {
  id: string
  number: string
  date: string
  total: string
  lines: { orderId: string; title: string; variant: string; image: string; url: string; files: { id: string; name: string; size: string; url: string }[]; note: string }[]
}

/** What a request knows about who is visiting (the route reads it from the website's own session cookie). */
export interface SiteAccount {
  /** Signed in: the customer and their orders. Null for a guest. */
  customer: StorelibCustomer | null
  /** A guest part way through signing in: the email a code went to, and where the sign in was going (the note's own path, lib/site-accounts/token PendingClaims.r). */
  pending?: { email: string; returnTo?: string } | null
  /** On /account/orders/<id>: that order of this customer's, with its files. Null when it is not theirs. */
  order?: StorelibOrderDetail | null
}

const FINANCIAL: Record<string, [string, string]> = {
  open: ["paid", "Paid"],
  pending: ["pending", "Pending"],
  refunded: ["refunded", "Refunded"],
  held: ["pending", "On hold"],
  failed: ["voided", "Voided"],
}

function addressDrop(a: StorelibAddress, i: number): O {
  /* The book's own fields (lib/site-accounts/addresses.ts); an address with only lines (an older caller) is read as a parcel's label reads. */
  if (a.line1) {
    const name = (a.name ?? "").trim()
    const [first_name = "", ...last] = name.split(/\s+/)
    const id = a.id || `a${i + 1}`
    return { id, name, first_name, last_name: last.join(" "), company: a.company ?? "", address1: a.line1, address2: a.line2 ?? "", street: [a.line1, a.line2].filter(Boolean).join(", "), city: a.city ?? "", province: a.region ?? "", province_code: a.region ?? "", zip: a.postal_code ?? "", country: a.country ?? "", country_code: a.country_code ?? "", phone: a.phone ?? "", summary: a.lines.join(", "), url: `/account/addresses/${encodeURIComponent(id)}`, default: a.default === true }
  }
  const lines = a.lines
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
    const cents = Number.isFinite(o.total_cents) ? Number(o.total_cents) : 0
    /* line_item.fulfillment, as Shopify's order templates read it: the parcels' carrier, numbers and links. */
    const parcels = o.tracking ?? []
    const fulfillment = parcels.length
      ? {
          tracking_company: parcels[0].company || null,
          tracking_number: parcels[0].number,
          tracking_url: parcels[0].url || null,
          tracking_numbers: parcels.map((t) => t.number),
          tracking_urls: parcels.map((t) => t.url).filter(Boolean),
          fulfillment_status: shopifyFulfillment(o),
        }
      : null
    const line_items = o.items.map((it, i) => ({ id: `${o.id}-${i}`, title: it.title, product_title: it.title, variant_title: it.variant || null, quantity: 1, image: it.image || null, url: it.url, product: { title: it.title, url: it.url, featured_image: it.image || null }, fulfillment }))
    const cancelled = o.fulfillment_status === "cancelled"
    return {
      id: o.id,
      name: `#${o.number}`,
      order_number: o.number,
      created_at: o.created_at || o.date,
      /* An order's own page: for something that ships its order page here (status and tracking), else its receipt, which is also where its files are (lib/receipts). */
      customer_url: o.order_url || o.action_url || "/account",
      financial_status,
      financial_status_label,
      fulfillment_status: shopifyFulfillment(o),
      fulfillment_status_label: o.status,
      total_price: cents,
      total_net_amount: cents,
      subtotal_price: cents,
      currency: o.currency ?? "USD",
      line_items,
      line_items_count: line_items.length,
      item_count: o.item_count,
      cancelled,
      cancelled_at: null,
      storelib_total: o.total,
      storelib_action_label: o.action_label,
    }
  })
  const addresses = (c.addresses ?? []).map((a, i) => addressDrop(a, i))
  return {
    id: "",
    email: c.email,
    name: name || c.email,
    first_name: first ?? "",
    last_name: rest.join(" "),
    phone: c.phone ?? "",
    has_account: true,
    accepts_marketing: false,
    tags: [],
    orders,
    orders_count: orders.length,
    last_order: orders[0] ?? null,
    total_spent: orders.reduce((n, o) => n + (o.total_price as number), 0),
    addresses,
    addresses_count: addresses.length,
    default_address: addresses.find((a) => a.default === true) ?? addresses[0] ?? null,
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
.sl-acc .sl-acc__track{list-style:none;margin:12px 0 0;padding:0;font-size:.9em;overflow-wrap:anywhere}
.sl-acc .sl-acc__track .sl-acc__link{min-height:32px}
.sl-acc .sl-acc__rows{display:flex;flex-direction:column}
.sl-acc .sl-acc__prow{display:grid;grid-template-columns:88px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:56px;border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.sl-acc .sl-acc__prow .sl-acc__input{margin:0}
.sl-acc .sl-acc__addrs{list-style:none;margin:0;padding:0}
.sl-acc .sl-acc__addr{display:flex;flex-direction:column;padding:16px 0;border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.sl-acc details>summary{list-style:none;opacity:.75}
.sl-acc details>summary::-webkit-details-marker{display:none}
.sl-acc .sl-acc__danger{margin-top:16px;max-width:320px}
.sl-acc .sl-acc__notice--error{background:color-mix(in srgb,#c0392b 9%,transparent)}
.sl-acc .sl-acc__input--code{font-size:22px;letter-spacing:.3em;font-variant-numeric:tabular-nums}
.sl-acc .sl-acc__status{flex:none;text-align:right}
.sl-acc .sl-acc__h2row{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.sl-acc .sl-acc__h2row h2{border-bottom:0}
.sl-acc .sl-acc__h2row .sl-acc__link{margin-top:-12px}
.sl-acc .sl-acc__prow--edit{grid-template-columns:88px minmax(0,1fr);padding:10px 0}
.sl-acc .sl-acc__prow--edit .sl-acc__acts{grid-column:2}
.sl-acc .sl-acc__acts{display:flex;flex-wrap:wrap;align-items:center;gap:0 20px}
.sl-acc .sl-acc__acts form{display:inline-flex;flex-wrap:wrap;align-items:center;gap:0 12px}
.sl-acc .sl-acc__acts--form{gap:8px 20px;margin-top:16px}
.sl-acc .sl-acc__link--quiet{opacity:.7}
.sl-acc .sl-acc__error{grid-column:1/-1;flex-basis:100%;margin:4px 0 0;font-size:.9em;color:#b42318}
.sl-acc .sl-acc__error[hidden]{display:none}
.sl-acc .sl-acc__badge{align-self:flex-start;margin-bottom:6px;padding:1px 8px;font-size:.8em;font-weight:600;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:999px}
.sl-acc .sl-acc__form{margin-top:24px;padding:20px;border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:8px}
.sl-acc .sl-acc__form h2{padding:0;border:0}
.sl-acc .sl-acc__fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 16px;margin-top:16px}
.sl-acc .sl-acc__field{display:block;min-width:0}
.sl-acc .sl-acc__field--full{grid-column:1/-1}
.sl-acc select.sl-acc__input{padding-right:36px;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 18px) 50%,calc(100% - 13px) 50%;background-size:5px 5px;background-repeat:no-repeat}
.sl-acc select.sl-acc__input option{color:#111;background:#fff}
.sl-acc .sl-acc__check{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer}
.sl-acc .sl-acc__check input{width:18px;height:18px;margin:0}
@media (max-width:480px){.sl-acc{padding:40px 16px 56px}.sl-acc .sl-acc__prow{grid-template-columns:72px minmax(0,1fr) auto}.sl-acc .sl-acc__prow--edit{grid-template-columns:minmax(0,1fr)}.sl-acc .sl-acc__prow--edit .sl-acc__acts{grid-column:1}.sl-acc .sl-acc__fields{grid-template-columns:minmax(0,1fr)}}
</style>`

/* The theme styles none of its button classes: the outline of the text colour, which reads on any ground. */
const BUTTON_CHECK = `<script>(function(){document.querySelectorAll(".sl-acc .sl-acc__btn").forEach(function(b){var s=getComputedStyle(b);var bg=s.backgroundColor;var none=(bg==="rgba(0, 0, 0, 0)"||bg==="transparent")&&s.backgroundImage==="none"&&parseFloat(s.borderTopWidth)===0;if(none)b.classList.add("sl-acc__btn--own")})})();</script>`

const BUTTON_CLASS = "button button--primary btn btn-primary sl-acc__btn"

function page(inner: string, wide = false): string {
  return `${ACCOUNT_STYLE}<div class="sl-acc${wide ? " sl-acc--wide" : ""}">${inner}</div>${BUTTON_CHECK}${FORMS}`
}

/* Pressing a form shows it was heard, and the address book says a refused field beside it (lib/site-accounts/forms-script.ts). */
const FORMS = `<style data-storelib-account-forms>${ACCOUNT_FORMS_STYLE}</style><script>${ACCOUNT_FORMS_SCRIPT}</script>`

const notice = (text: string | null | undefined, alert = true) => (text ? `<p class="sl-acc__notice sl-acc-in${alert ? " sl-acc__notice--error" : ""}" role="${alert ? "alert" : "status"}">${esc(text)}</p>` : "")

/**
 * WHAT EVERY PAGE HERE IS DRAWN IN: the shop's own words in the page's
 * language (lib/site-accounts/words.ts; English where a word has no
 * approved translation) and the language's prefix ("/fr"), which every
 * link carries and every form sends back as `lang`, so the routes answer
 * under it (lib/site-accounts/lang.ts). Both empty: the website's own
 * language, exactly as before.
 */
export interface PageLanguage {
  words?: Words
  root?: string
}

const langField = (root: string | undefined) => (root ? `<input type="hidden" name="lang" value="${esc(langOfRoot(root))}">` : "")
const href = (root: string | undefined, path: string) => esc(inLang(root ?? "", path))

export interface SignInView extends PageLanguage {
  step: "email" | "code"
  /** On the code step: where the code went. */
  email?: string
  /** A path on this website to land on once signed in. */
  returnTo: string
  notice?: string | null
  /** /account/register: the same email and code, worded for a new account. */
  register?: boolean
  /** False for good news ("A new code is on its way"), said as a status rather than an alert. */
  noticeError?: boolean
}

/** Sign in, the way every Storelib website does it: an email, then the six digit code sent to it. A new email makes the account. */
export function signInContent(v: SignInView): string {
  const w = wordsOf(v.words)
  const back = esc(v.returnTo || "/account")
  const lang = langField(v.root)
  /*
    "Use a different email" goes through a route rather than to
    /account/login?step=email: only a route can end the code this browser is
    waiting on, which otherwise came back on the next visit to sign in
    (app/api/site-account/restart, which keeps where the visitor was going).
  */
  if (v.step === "code") {
    /* The sentence escaped as a whole, then the email put in its place, bold. */
    const lead = esc(w("acct_code_sent", { email: "\u0000" })).replace("\u0000", `<strong>${esc(v.email)}</strong>`)
    return page(`<h1>${esc(w("acct_check_email"))}</h1>
<p class="sl-acc__lead">${lead}</p>
${notice(v.notice, v.noticeError ?? true)}
<form method="post" action="/api/site-account/verify" data-storelib-form="native">${lang}
<label class="sl-acc__label" for="sl-acc-code">${esc(w("acct_code"))}</label>
<input class="sl-acc__input sl-acc__input--code" id="sl-acc-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="${esc(w("acct_code_placeholder"))}" required autofocus>
<button class="${BUTTON_CLASS}" type="submit">${esc(w("sign_in"))}</button>
</form>
<div class="sl-acc__row">
<form method="post" action="/api/site-account/code" data-storelib-form="native"><input type="hidden" name="email" value="${esc(v.email)}"><input type="hidden" name="return" value="${back}"><input type="hidden" name="again" value="1">${lang}<button class="sl-acc__link" type="submit">${esc(w("acct_send_new_code"))}</button></form>
<a class="sl-acc__link" href="/api/site-account/restart">${esc(w("acct_different_email"))}</a>
</div>`)
  }
  return page(`<h1>${esc(v.register ? w("acct_create_account") : w("sign_in"))}</h1>
<p class="sl-acc__lead">${esc(w("acct_email_lead"))}</p>
${notice(v.notice)}
<form method="post" action="/api/site-account/code" data-storelib-form="native">
<input type="hidden" name="return" value="${back}">${lang}
<label class="sl-acc__label" for="sl-acc-email">${esc(w("email"))}</label>
<input class="sl-acc__input" id="sl-acc-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="you@example.com" required autofocus>
<button class="${BUTTON_CLASS}" type="submit">${esc(w("acct_continue"))}</button>
</form>
<p class="sl-acc__note">${esc(v.register ? w("acct_have_account") : w("acct_new_here"))}</p>
<p><a class="sl-acc__link" href="/checkout/track${v.root ? `?lang=${esc(langOfRoot(v.root))}` : ""}">${esc(w("acct_track_link"))}</a></p>`)
}

export interface AccountView extends PageLanguage {
  notice?: string | null
  /** The notice is a refusal (an alert), not good news (a status). */
  noticeError?: boolean
  /** "name" or "phone" while that field is open for editing (?edit=name), "delete" with the delete box open. */
  edit?: string | null
}

/** The signed-in customer's page: orders, profile, addresses, saved items, signing out and deleting the account. */
export function accountContent(c: StorelibCustomer, v: AccountView = {}): string {
  const w = wordsOf(v.words)
  const root = v.root
  const lang = langField(root)
  const orders = c.orders ?? []
  const list = orders.length
    ? `<ol class="sl-acc__orders">${orders
        .map((o) => {
          const items = o.items
            .map((it) => {
              const inner = `<span class="sl-acc__thumb">${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" decoding="async">` : ""}</span><span><span>${esc(it.title)}</span>${it.variant ? `<br><span class="sl-acc__muted">${esc(it.variant)}</span>` : ""}</span>`
              return `<li>${it.url ? `<a class="sl-acc__item" href="${href(root, it.url)}">${inner}</a>` : `<div class="sl-acc__item">${inner}</div>`}</li>`
            })
            .join("")
          const parcels = (o.tracking ?? [])
            .map((t) => {
              const label = `${t.company ? `${esc(t.company)} ` : ""}${esc(t.number)}`
              return `<li><strong>${esc(t.status)}</strong> ${t.url ? `<a class="sl-acc__link" href="${esc(t.url)}" target="_blank" rel="noopener">${label}</a>` : label}</li>`
            })
            .join("")
          return `<li class="sl-acc__order"><div class="sl-acc__order-head"><div><p><strong>${esc(o.date)}</strong></p><p class="sl-acc__muted">${esc(w("acct_order"))} #${esc(o.number)}</p></div><p class="sl-acc__status">${esc(o.status)}</p></div><ul class="sl-acc__items">${items}</ul>${parcels ? `<ul class="sl-acc__track">${parcels}</ul>` : ""}<div class="sl-acc__order-foot"><p><span class="sl-acc__muted">${esc(w("total"))}</span> <strong>${esc(o.total)}</strong></p>${o.action_url ? `<a class="sl-acc__link" href="${href(root, o.action_url)}">${esc(o.action_label)}</a>` : ""}</div></li>`
        })
        .join("")}</ol>`
    : `<p class="sl-acc__empty">${esc(w("acct_no_orders"))} <a class="sl-acc__link" href="${href(root, "/collections/all")}">${esc(w("acct_browse"))}</a></p>`
  const name = (c.name ?? "").trim()
  const phone = (c.phone ?? "").trim()
  const editRow = (field: "name" | "phone", label: string, input: string, msgs: string) =>
    `<form class="sl-acc__prow sl-acc__prow--edit" method="post" action="/api/site-account/profile" data-storelib-form="native" data-sl-async ${msgs}>${lang}<label class="sl-acc__muted" for="sl-acc-${field}">${esc(label)}</label>${input}<span class="sl-acc__acts"><button class="sl-acc__link" type="submit">${esc(w("save"))}</button> <a class="sl-acc__link" href="${href(root, "/account")}#profile">${esc(w("acct_cancel"))}</a></span><p class="sl-acc__error" data-sl-error role="alert" hidden></p></form>`
  const showRow = (field: "name" | "phone", label: string, value: string) =>
    `<div class="sl-acc__prow"><p class="sl-acc__muted">${esc(label)}</p><p>${value ? esc(value) : `<span class="sl-acc__muted">${esc(w("acct_not_added"))}</span>`}</p><a class="sl-acc__link" href="${href(root, `/account?edit=${field}`)}#profile">${esc(w("acct_edit"))}</a></div>`
  const nameRow =
    v.edit === "name"
      ? editRow("name", w("your_name"), `<input class="sl-acc__input" id="sl-acc-name" name="name" type="text" value="${esc(name)}" maxlength="120" autocomplete="name" placeholder="${esc(w("your_name"))}" data-sl-field="error" autofocus>`, `data-sl-msg-error="${esc(w("acct_name_error"))}" data-sl-msg-failed="${esc(w("acct_name_error"))}" data-sl-msg-network="${esc(w("acct_err_network"))}"`)
      : showRow("name", w("your_name"), name)
  const phoneRow =
    v.edit === "phone"
      ? editRow("phone", w("acct_phone"), `<input class="sl-acc__input" id="sl-acc-phone" name="phone" type="tel" value="${esc(phone)}" maxlength="40" autocomplete="tel" inputmode="tel" placeholder="${esc(w("acct_phone_placeholder"))}" data-sl-field="phone" autofocus>`, `data-sl-msg-phone="${esc(w("acct_phone_error"))}" data-sl-msg-unavailable="${esc(w("acct_profile_unavailable"))}" data-sl-msg-failed="${esc(w("acct_err_failed"))}" data-sl-msg-network="${esc(w("acct_err_network"))}"`)
      : showRow("phone", w("acct_phone"), phone)
  const addresses = c.addresses ?? []
  return page(
    `<div class="sl-acc__top"><h1>${esc(w("account"))}</h1><form method="post" action="/account/logout" data-storelib-form="native">${lang}<button class="sl-acc__link" type="submit">${esc(w("acct_sign_out"))}</button></form></div>
<div class="sl-acc__block"><h2>${esc(w("acct_orders"))}</h2>${list}</div>
<div class="sl-acc__block" id="profile"><h2>${esc(w("acct_profile"))}</h2>${notice(v.notice, v.noticeError ?? false)}<div class="sl-acc__rows">${nameRow}<div class="sl-acc__prow"><p class="sl-acc__muted">${esc(w("email"))}</p><p>${esc(c.email)}</p><span></span></div>${phoneRow}</div></div>
${addresses.length || c.ships ? `<div class="sl-acc__block" id="addresses"><div class="sl-acc__h2row"><h2>${esc(w("acct_addresses"))}</h2><a class="sl-acc__link" href="${href(root, "/account/addresses")}">${esc(addresses.length ? w("acct_edit") : w("acct_add_address"))}</a></div>${addresses.length ? addressList(addresses.filter((a) => a.default).concat(addresses.filter((a) => !a.default)).slice(0, 2), v) : `<p class="sl-acc__empty">${esc(w("acct_no_addresses"))}</p>`}</div>` : ""}
<div class="sl-acc__block"><h2>${esc(w("wishlist"))}</h2><p class="sl-acc__empty"><a class="sl-acc__link" href="${href(root, "/wishlist")}">${esc(w("acct_wishlist_link"))}</a></p></div>
${deleteBlock(v.edit === "delete", v)}`,
    true,
  )
}

/** The book's addresses, each with its lines; with `actions`, Edit, Set as default and Delete under each (/account/addresses). */
function addressList(addresses: StorelibAddress[], v: PageLanguage, actions = false): string {
  const w = wordsOf(v.words)
  const lang = langField(v.root)
  const action = (a: StorelibAddress, kind: "default" | "delete", label: string, extra = "") =>
    `<form method="post" action="/api/site-account/addresses" data-storelib-form="native" data-sl-async data-sl-msg-missing="${esc(w("acct_err_missing"))}" data-sl-msg-failed="${esc(w("acct_err_failed"))}" data-sl-msg-network="${esc(w("acct_err_network"))}"${extra}>${lang}<input type="hidden" name="action" value="${kind}"><input type="hidden" name="id" value="${esc(a.id)}"><input type="hidden" name="return" value="/account/addresses"><button class="sl-acc__link${kind === "delete" ? " sl-acc__link--quiet" : ""}" type="submit">${esc(label)}</button><span class="sl-acc__error" data-sl-error role="alert" hidden></span></form>`
  return `<ul class="sl-acc__addrs">${addresses
    .map((a) => {
      const badge = a.default ? `<span class="sl-acc__badge">${esc(w("acct_default"))}</span>` : ""
      const lines = a.lines.map((l) => `<span>${esc(l)}</span>`).join("") + (a.phone ? `<span class="sl-acc__muted">${esc(a.phone)}</span>` : "")
      const acts =
        actions && a.id
          ? `<div class="sl-acc__acts">${`<a class="sl-acc__link" href="${href(v.root, `/account/addresses?edit=${encodeURIComponent(a.id)}`)}#address-form">${esc(w("acct_edit"))}</a>`}${a.default ? "" : action(a, "default", w("acct_make_default"))}${action(a, "delete", w("acct_delete"), ` data-sl-confirm="${esc(w("acct_delete_address_q"))}"`)}</div>`
          : ""
      return `<li class="sl-acc__addr">${badge}${lines}${acts}</li>`
    })
    .join("")}</ul>`
}

function deleteBlock(open: boolean, v: PageLanguage): string {
  const w = wordsOf(v.words)
  return `<details class="sl-acc__block" id="delete"${open ? " open" : ""}><summary class="sl-acc__link">${esc(w("acct_delete_account"))}</summary><p class="sl-acc__empty">${esc(w("acct_delete_text"))}</p><form class="sl-acc__danger" method="post" action="/api/site-account/delete" data-storelib-form="native"><input type="hidden" name="confirm" value="delete">${langField(v.root)}<button class="${BUTTON_CLASS}" type="submit">${esc(w("acct_delete_mine"))}</button></form></details>`
}

/** Why a download went back to the order's page (/api/site-account/download), as a fixed sentence. */
const DOWNLOAD_NOTICES: Record<string, string> = {
  limit: "That is a lot of downloads at once. Try again in a few minutes.",
  refunded: "This order was refunded, so its files are closed.",
  pending: "The payment has not cleared yet. Files open as soon as it does.",
  held: "This order is on hold while the payment is reviewed.",
  failed: "This payment did not go through, so there is nothing to download.",
  variant: "That file is not part of the option you bought.",
  denied: "That file could not be found in this order.",
  unavailable: "That file could not be downloaded right now. Try again in a moment.",
}

export function downloadNotice(why: string | null | undefined): string | null {
  return why && Object.prototype.hasOwnProperty.call(DOWNLOAD_NOTICES, why) ? DOWNLOAD_NOTICES[why] : null
}

/** /account/orders/<id>: one order and its files, each downloaded here, on the website. */
export function orderContent(o: StorelibOrderDetail, v: { notice?: string | null } & PageLanguage = {}): string {
  const w = wordsOf(v.words)
  const lines = o.lines
    .map((l) => {
      const thumb = `<span class="sl-acc__thumb">${l.image ? `<img src="${esc(l.image)}" alt="" loading="lazy" decoding="async">` : ""}</span>`
      const head = `<div class="sl-acc__item">${thumb}<span><span>${l.url ? `<a href="${href(v.root, l.url)}" style="color:inherit">${esc(l.title)}</a>` : esc(l.title)}</span>${l.variant ? `<br><span class="sl-acc__muted">${esc(l.variant)}</span>` : ""}</span></div>`
      const files = l.files.length
        ? `<ul class="sl-acc__files">${l.files.map((f) => `<li class="sl-acc__file"><span class="sl-acc__file-name">${esc(f.name)}${f.size ? ` <span class="sl-acc__muted">${esc(f.size)}</span>` : ""}</span><a class="sl-acc__link" href="${esc(f.url)}" download>${esc(w("acct_download"))}</a></li>`).join("")}</ul>`
        : `<p class="sl-acc__muted" style="margin-top:8px">${esc(l.note || w("acct_nothing_to_download"))}</p>`
      return `<li class="sl-acc__order">${head}${files}</li>`
    })
    .join("")
  return page(
    `<style>.sl-acc .sl-acc__files{list-style:none;margin:12px 0 0;padding:0}.sl-acc .sl-acc__file{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:48px;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)}.sl-acc .sl-acc__file-name{min-width:0;overflow-wrap:anywhere}</style>
<div class="sl-acc__top"><h1>${esc(w("acct_order"))} #${esc(o.number)}</h1><a class="sl-acc__link" href="${href(v.root, "/account")}">${esc(w("acct_back"))}</a></div>
<p class="sl-acc__muted">${esc(o.date)} · ${esc(o.total)}</p>
${v.notice ? `<div style="margin-top:20px">${notice(v.notice)}</div>` : ""}
<div class="sl-acc__block"><h2>${esc(w("acct_downloads"))}</h2><ol class="sl-acc__orders">${lines}</ol></div>`,
    true,
  )
}

export interface AddressesView extends PageLanguage {
  /** The form open: "new" to add one, "edit" for `address`. */
  mode?: "new" | "edit" | null
  address?: StorelibAddress | null
  /** What the last change said (?address=), and whether it was a refusal. */
  notice?: string | null
  noticeError?: boolean
  /** The countries the form offers, in the page's language (lib/site-accounts/countries). */
  countries?: { code: string; name: string }[]
}

/** The refusal codes an address form can be answered with, and the word each says (lib/site-accounts/words.ts). */
const ADDRESS_MSGS: [string, UiWord][] = [
  ["name", "acct_err_name"],
  ["line1", "acct_err_street"],
  ["city", "acct_err_city"],
  ["country", "acct_err_country"],
  ["postal", "acct_err_postal"],
  ["region", "acct_err_region"],
  ["phone", "acct_err_phone"],
  ["full", "acct_err_full"],
  ["missing", "acct_err_missing"],
  ["unavailable", "acct_err_unavailable"],
  ["failed", "acct_err_failed"],
  ["network", "acct_err_network"],
]

/** The form that adds or changes one address: the fields checkout asks for, posted to the address book route. */
function addressForm(v: AddressesView, count: number): string {
  const w = wordsOf(v.words)
  const a = v.address ?? null
  const val = (x: string | undefined) => esc(x ?? "")
  const msgs = ADDRESS_MSGS.map(([code, word]) => `data-sl-msg-${code}="${esc(w(word))}"`).join(" ")
  const countries = (v.countries ?? []).map((c) => `<option value="${esc(c.code)}"${c.code === a?.country_code ? " selected" : ""}>${esc(c.name)}</option>`).join("")
  const field = (name: string, label: string, value: string | undefined, attrs: string, full = false, code = "") =>
    `<label class="sl-acc__field${full ? " sl-acc__field--full" : ""}"><span class="sl-acc__label">${esc(label)}</span><input class="sl-acc__input" name="${name}" value="${val(value)}" placeholder="${esc(label)}" ${attrs}${code ? ` data-sl-field="${code}"` : ""}></label>`
  return `<form class="sl-acc__form sl-acc-in" id="address-form" method="post" action="/api/site-account/addresses" data-storelib-form="native" data-sl-async ${msgs}>${langField(v.root)}<input type="hidden" name="action" value="save"><input type="hidden" name="return" value="/account/addresses">${a?.id ? `<input type="hidden" name="id" value="${esc(a.id)}">` : ""}
<h2>${esc(a?.id ? w("acct_edit_address") : w("acct_add_address"))}</h2>
<p class="sl-acc__error" data-sl-error role="alert" hidden></p>
<div class="sl-acc__fields">
${field("name", w("acct_full_name"), a?.name, `type="text" maxlength="120" autocomplete="name" required`, true, "name")}
${field("company", w("acct_company"), a?.company, `type="text" maxlength="120" autocomplete="organization"`, true)}
<label class="sl-acc__field sl-acc__field--full"><span class="sl-acc__label">${esc(w("acct_country"))}</span><select class="sl-acc__input" name="country" autocomplete="country" required data-sl-field="country"><option value="">${esc(w("acct_choose_country"))}</option>${countries}</select></label>
${field("line1", w("acct_street"), a?.line1, `type="text" maxlength="200" autocomplete="address-line1" required`, true, "line1")}
${field("line2", w("acct_apartment"), a?.line2, `type="text" maxlength="200" autocomplete="address-line2"`, true)}
${field("city", w("acct_city"), a?.city, `type="text" maxlength="120" autocomplete="address-level2" required`, false, "city")}
${field("region", w("acct_region"), a?.region, `type="text" maxlength="120" autocomplete="address-level1"`, false, "region")}
${field("postal_code", w("acct_postal"), a?.postal_code, `type="text" maxlength="20" autocomplete="postal-code" autocapitalize="characters"`, false, "postal")}
${field("phone", w("acct_phone_optional"), a?.phone, `type="tel" maxlength="40" autocomplete="tel" inputmode="tel"`, false, "phone")}
</div>
${a?.default ? "" : `<label class="sl-acc__check"><input type="checkbox" name="default" value="1"${count === 0 ? " checked" : ""}> <span>${esc(w("acct_use_as_default"))}</span></label>`}
<div class="sl-acc__acts sl-acc__acts--form"><button class="${BUTTON_CLASS} sl-acc__go" type="submit">${esc(w("acct_save_address"))}</button><a class="sl-acc__link" href="${href(v.root, "/account/addresses")}">${esc(w("acct_cancel"))}</a></div>
</form>`
}

/** /account/addresses: the customer's address book, which they add to, change and delete from, and its default, which checkout fills in. */
export function addressesContent(c: StorelibCustomer, v: AddressesView = {}): string {
  const w = wordsOf(v.words)
  const addresses = c.addresses ?? []
  const full = addresses.length >= MAX_SHOWN_ADDRESSES
  const add = v.mode || full ? "" : `<a class="sl-acc__link" href="${href(v.root, "/account/addresses?edit=new")}#address-form">${esc(w("acct_add_address"))}</a>`
  return page(
    `<div class="sl-acc__top"><h1>${esc(w("acct_addresses"))}</h1><a class="sl-acc__link" href="${href(v.root, "/account")}">${esc(w("acct_back"))}</a></div>
<p class="sl-acc__lead" style="margin-top:8px">${esc(w("acct_addresses_lead"))}</p>
${notice(v.notice, v.noticeError ?? false)}
${v.mode ? addressForm(v, addresses.length) : ""}
<div class="sl-acc__block" style="margin-top:24px">${addresses.length ? addressList(addresses, v, true) : v.mode ? "" : `<p class="sl-acc__empty">${esc(w("acct_no_addresses"))}</p>`}${add ? `<div class="sl-acc__row">${add}</div>` : ""}</div>`,
    true,
  )
}

/** As many as the book keeps (lib/site-accounts/addresses MAX_ADDRESSES). */
const MAX_SHOWN_ADDRESSES = 10

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

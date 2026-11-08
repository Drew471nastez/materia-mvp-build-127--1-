"use client"

/**
 * ===========================================================================
 *  THE CHECKOUT, IN THE CHECKOUT TEXT EDITOR'S FRAME
 * ===========================================================================
 * What a buyer of this store gets, drawn by the components that draw it for
 * them: the website's checkout (../site/site-checkout.tsx), its thank you
 * page (../site/thanks/[token]/thanks-view.tsx) and the order page of an
 * order that ships (../physical/order/[token]/order-status-view.tsx), in
 * the store's words as they are being typed (lib/checkout-text/preview.ts
 * says what crosses between the editor and this frame, and why).
 *
 * WHAT THE PREVIEW ADDS, AND ONLY THAT:
 *
 *   nothing leaves    every request the page makes to this origin is
 *                     answered here: the quote with the store's own,
 *                     priced by the server for the editor; a payment, a
 *                     cart change, a page view or a funnel step is never
 *                     sent. What the page keeps in the browser stays in
 *                     this frame. A link goes nowhere.
 *   words to press    a word of the checkout a store may change is a
 *                     button here: pressing it opens its field in the
 *                     editor ("pick"). A pointer over one rings it.
 *   the text edited   is ringed, brought into view, and the editor is told
 *                     whether it is on this page at all ("shown"). A
 *                     message that only shows once Pay was pressed with a
 *                     field left wrong is shown that way: the field is
 *                     filled as a buyer would leave it and Pay is pressed,
 *                     so the page says it itself.
 *
 * The ring is one layer, moved with transform and faded with opacity, so a
 * change of text never lays out the page for it.
 */

import * as React from "react"
import { SiteCheckout } from "../site/site-checkout"
import { ThanksView } from "../site/thanks/[token]/thanks-view"
import { OrderStatusView } from "../physical/order/[token]/order-status-view"
import { ShopBar } from "../parts/shop-bar"
import { CheckoutCurrency } from "@/components/checkout/parts/ui"
import { CheckoutWords } from "@/components/checkout/parts/words"
import { PaidOverlay } from "../parts/success"
import { optimisticQuote } from "@/lib/checkout/optimistic-quote"
import { CHECKOUT_PREVIEW_CHANNEL, placeOf, textAt, textsOnPage, type PreviewState, type ToEditor, type ToFrame } from "@/lib/checkout-text/preview"

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))

/** The state the page answers from: the latest the editor sent. */
const live: { state: PreviewState | null } = { state: null }

/** Every request to this origin answered here; Stripe, fonts and pictures go where they go. */
function sandbox() {
  const w = window as Window & { __checkoutPreviewSandbox?: boolean }
  if (w.__checkoutPreviewSandbox) return
  w.__checkoutPreviewSandbox = true
  const realFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL | null = null
    try {
      url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href)
    } catch {
      url = null
    }
    if (!url || url.origin !== window.location.origin) return realFetch(input as RequestInfo, init)
    if (url.pathname === "/api/checkout/site") {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
      } catch {
        body = {}
      }
      const s = live.state
      const kase = s ? (s.mode === "shipped" ? s.data.shipped : s.data.digital) : null
      if (body.action === "quote" && kase) {
        const items = Array.isArray(body.items) ? (body.items as { productId: string; variantId: string | null; quantity: number }[]) : kase.items
        return json(optimisticQuote(kase.quote, items) ?? kase.quote)
      }
      if (body.action === "cart" || body.action === "forget") return json({ ok: true })
      return json({ error: "This is a preview. Nothing is sent and nothing is charged." }, 400)
    }
    /* The order page asks whether its order changed: never, here. Anything else is answered empty. */
    return json({})
  }
  if (typeof navigator.sendBeacon === "function") navigator.sendBeacon = () => true
  /* What the page keeps in the browser stays in this frame. */
  for (const key of ["localStorage", "sessionStorage"] as const) {
    try {
      const mine = new Map<string, string>()
      const memory: Storage = {
        get length() {
          return mine.size
        },
        clear: () => mine.clear(),
        getItem: (k) => (mine.has(k) ? (mine.get(k) as string) : null),
        key: (i) => [...mine.keys()][i] ?? null,
        removeItem: (k) => {
          mine.delete(k)
        },
        setItem: (k, v) => {
          mine.set(k, String(v))
        },
      }
      Object.defineProperty(window, key, { configurable: true, get: () => memory })
    } catch {
      /* a browser that will not let it be replaced keeps its own */
    }
  }
}

/* ── Finding a text on the page ───────────────────────────────────────── */

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim()

/** On screen for a buyer: has a size, is not faded out, hidden or inert. */
function visible(el: Element): boolean {
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return false
  if (el.closest("[inert]")) return false
  let node: Element | null = el
  for (let i = 0; node && i < 6; i++, node = node.parentElement) {
    const cs = getComputedStyle(node)
    if (cs.visibility === "hidden" || Number(cs.opacity) < 0.1) return false
  }
  return true
}

/** What a piece of the page reads as: its text, its label for a screen reader, its placeholder, its title. */
function readings(el: Element): string[] {
  const out = [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("title")]
  /* A short element's own text; a long one is a container, not a word. */
  const text = el.textContent ?? ""
  if (text.length <= 160) out.unshift(text)
  return out.filter((s): s is string => !!s)
}

/** The deepest elements whose text, label or placeholder is this text, visible ones first. */
function findText(id: string, words: Record<string, string>): HTMLElement | null {
  const texts = textsOnPage(words).filter((t) => t.id === id)
  if (!texts.length) return null
  const all = Array.from(document.body.querySelectorAll<HTMLElement>("body *")).filter((el) => !el.closest("[data-preview-layer]"))
  const hits = all.filter((el) => textAt(readings(el), texts) === id)
  /* An element whose child says the same is not the one: the child is. */
  const deepest = hits.filter((el) => !hits.some((h) => h !== el && el.contains(h)))
  return deepest.find(visible) ?? deepest.find((el) => !!el.closest("details:not([open])")) ?? null
}

/** The registry text under the pointer, and the element that reads it. */
function pickAt(target: EventTarget | null, texts: ReturnType<typeof textsOnPage>): { id: string; el: HTMLElement } | null {
  let el = target instanceof Element ? (target as HTMLElement) : null
  for (let i = 0; el && i < 5 && el !== document.body; i++, el = el.parentElement) {
    if (el.closest("[data-preview-layer]")) return null
    const id = textAt(readings(el), texts)
    if (id) return { id, el }
  }
  return null
}

/* ── The rings ────────────────────────────────────────────────────────── */

function layer(kind: "focus" | "hover"): HTMLDivElement {
  const found = document.querySelector<HTMLDivElement>(`[data-preview-layer="${kind}"]`)
  if (found) return found
  const d = document.createElement("div")
  d.setAttribute("data-preview-layer", kind)
  d.setAttribute("aria-hidden", "true")
  Object.assign(d.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "0",
    height: "0",
    pointerEvents: "none",
    zIndex: "2147483000",
    borderRadius: "7px",
    opacity: "0",
    willChange: "transform, opacity",
    transition: "transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 160ms ease-out",
    boxShadow: kind === "focus" ? "0 0 0 2px #8b5cf6, 0 0 0 6px rgba(139,92,246,0.18)" : "0 0 0 1.5px rgba(139,92,246,0.55)",
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(d)
  return d
}

function fixedWithin(el: Element): boolean {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true
  return false
}

/** The ring around `el`: placed with transform, sized once, faded in. */
function ring(kind: "focus" | "hover", el: HTMLElement | null, animate = true) {
  const d = layer(kind)
  if (!el) {
    d.style.opacity = "0"
    return
  }
  const r = el.getBoundingClientRect()
  const fixed = fixedWithin(el)
  const pad = 4
  const x = r.left - pad + (fixed ? 0 : window.scrollX)
  const y = r.top - pad + (fixed ? 0 : window.scrollY)
  const wasHidden = d.style.opacity === "0"
  /* Arriving from nowhere: placed where it lands, then faded in, so it never sweeps across the page. */
  d.style.transition = animate && !wasHidden ? "transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 160ms ease-out" : "opacity 160ms ease-out"
  d.style.position = fixed ? "fixed" : "absolute"
  d.style.width = `${Math.round(r.width + pad * 2)}px`
  d.style.height = `${Math.round(r.height + pad * 2)}px`
  d.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
  d.style.opacity = "1"
}

/** Brought into view when it is not, with room above for the bar, and below for the pay dock or the editor's sheet over the frame (`cover`, a share of the height). */
function bringIntoView(el: HTMLElement, cover: number) {
  if (fixedWithin(el)) return
  const r = el.getBoundingClientRect()
  const top = 72
  const bottom = window.innerHeight - Math.max(96, Math.round(window.innerHeight * cover) + 24)
  if (r.top >= top && r.bottom <= bottom) return
  /* A third of the way down the room there is, or as low as still shows all of it. */
  const at = Math.max(top, Math.min(top + (bottom - top) * 0.3, bottom - r.height))
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  window.scrollTo({ top: Math.max(0, window.scrollY + r.top - at), behavior: reduce ? "auto" : "smooth" })
}

/* ── A buyer's hand, for the messages that need one ───────────────────── */

/** The preview's own presses under way: they are not a store owner's picks. */
let hands = 0
const realFocus = typeof HTMLElement !== "undefined" ? HTMLElement.prototype.focus : null
const realIntoView = typeof Element !== "undefined" ? Element.prototype.scrollIntoView : null

/** The page's own focus and scrolling held still while the hand works: the editor's field keeps the keyboard. */
function stillHands<T>(run: () => T): T {
  hands++
  HTMLElement.prototype.focus = function () {}
  Element.prototype.scrollIntoView = function () {}
  try {
    return run()
  } finally {
    hands--
    window.setTimeout(() => {
      if (hands > 0) return
      if (realFocus) HTMLElement.prototype.focus = realFocus
      if (realIntoView) Element.prototype.scrollIntoView = realIntoView
    }, 400)
  }
}

/** Typed into a field the way a person types: React hears it. */
function type(selector: string, value: string): boolean {
  const el = document.querySelector<HTMLInputElement>(selector)
  if (!el) return false
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
  return true
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

/** Leaves the fields as a buyer who gets this message would, and presses Pay. */
async function pressPayWith(action: "email" | "name" | "street" | "city" | "phone"): Promise<boolean> {
  /* Pay is pressable once the card form's script is in (a phone with no connection never gets here). */
  let pay: HTMLButtonElement | null = null
  for (let i = 0; i < 40; i++) {
    pay = document.querySelector<HTMLButtonElement>("[data-pay]")
    if (pay && !pay.disabled) break
    await sleep(150)
  }
  if (!pay || pay.disabled) return false
  const order = ["email", "name", "phone", "street", "city"] as const
  const upTo = order.indexOf(action)
  stillHands(() => {
    type("[data-checkout-email]", action === "email" ? "alex@" : "alex@example.com")
    if (upTo >= 1) {
      const name = action === "name" ? "" : "Alex Morgan"
      if (!type("#checkout-name", name)) {
        type("#checkout-first", action === "name" ? "" : "Alex")
        type("#checkout-last", action === "name" ? "" : "Morgan")
      }
    }
    /* Fields a store requires come before the address in the checks: filled, so the one meant is the one said. */
    type("#checkout-company", "Morgan Studio")
    type("#checkout-line2", "Apt 4")
    /* A number that reads as one wherever the shop is, or one that does not, for "Check the phone number." */
    if (upTo >= 2) type("#checkout-phone", action === "phone" ? "12" : "+44 20 7946 0958")
    if (upTo >= 3) type("#checkout-line1", action === "street" ? "" : "1 Main Street")
    if (upTo >= 4) type("#checkout-city", "")
  })
  /* The page settles first: a quote asked again on arrival says "being updated" to a press made during it. */
  await sleep(450)
  stillHands(() => pay!.click())
  return true
}

/* ── The document ─────────────────────────────────────────────────────── */

export function CheckoutPreviewDocument() {
  const [state, setState] = React.useState<PreviewState | null>(null)
  /* A fresh checkout (nothing typed) each time a message that needs a hand is chosen, and once it is left. */
  const [round, setRound] = React.useState(0)
  const handled = React.useRef<string | null>(null)
  const drawn = React.useRef(false)

  React.useLayoutEffect(() => sandbox(), [])

  const post = React.useCallback((m: ToEditor) => {
    window.parent?.postMessage(m, window.location.origin)
  }, [])

  React.useEffect(() => {
    const parent = window.parent
    if (!parent || parent === window) return
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== parent) return
      const data = e.data as ToFrame | null
      if (!data || data.channel !== CHECKOUT_PREVIEW_CHANNEL || data.kind !== "state") return
      live.state = data.state
      setState(data.state)
    }
    window.addEventListener("message", onMessage)
    post({ channel: CHECKOUT_PREVIEW_CHANNEL, kind: "ready" })
    return () => window.removeEventListener("message", onMessage)
  }, [post])

  /* Drawn once, with its fonts: the editor's loader can go. */
  React.useEffect(() => {
    if (!state || drawn.current) return
    drawn.current = true
    let done = false
    const say = () => {
      if (done) return
      done = true
      post({ channel: CHECKOUT_PREVIEW_CHANNEL, kind: "drawn" })
    }
    const cap = window.setTimeout(say, 1200)
    void (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(say)))
    return () => window.clearTimeout(cap)
  }, [state, post])

  /* Pressing a word opens its field in the editor; a pointer over one rings it. */
  React.useEffect(() => {
    if (!state) return
    const texts = textsOnPage(state.words)
    const onClick = (e: MouseEvent) => {
      /* The preview's own hand (Pay pressed for a message, the code field opened) is not a pick. */
      if (hands > 0) return
      const hit = pickAt(e.target, texts)
      if (!hit) {
        /* A link that would move this frame goes nowhere. */
        if ((e.target as Element | null)?.closest?.("a[href]")) e.preventDefault()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      post({ channel: CHECKOUT_PREVIEW_CHANNEL, kind: "pick", id: hit.id })
    }
    /* A button the page keeps off (Pay while the card form loads) takes no click, so its press is read as the finger lifts. */
    const onUp = (e: PointerEvent) => {
      if (hands > 0 || !(e.target as Element | null)?.closest?.("button:disabled")) return
      const hit = pickAt(e.target, texts)
      if (hit) post({ channel: CHECKOUT_PREVIEW_CHANNEL, kind: "pick", id: hit.id })
    }
    let frame = 0
    let last: EventTarget | null = null
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      last = e.target
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const hit = pickAt(last, texts)
        document.documentElement.style.cursor = hit ? "pointer" : ""
        ring("hover", hit && hit.id !== state.focus ? hit.el : null, false)
      })
    }
    const onLeave = () => ring("hover", null)
    document.addEventListener("click", onClick, true)
    document.addEventListener("pointerup", onUp, true)
    document.addEventListener("pointermove", onMove, { passive: true })
    document.documentElement.addEventListener("pointerleave", onLeave)
    return () => {
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("pointerup", onUp, true)
      document.removeEventListener("pointermove", onMove)
      document.documentElement.removeEventListener("pointerleave", onLeave)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [state, post])

  const focus = state?.focus ?? null
  const place = focus ? placeOf(focus) : null
  const action = place?.action && place.action !== "paid-cash" ? place.action : null
  const key = `${state?.mode ?? ""}:${state?.data.lang ?? ""}:${round}`

  /* A message that needs a hand: a fresh checkout, the fields left as such a buyer leaves them, and Pay. */
  React.useEffect(() => {
    if (!state || !focus) return
    const wanted = action ? `${focus}:${state.mode}` : null
    if (wanted === handled.current) return
    const was = handled.current
    handled.current = wanted
    if (wanted || was) setRound((r) => r + 1)
  }, [state, focus, action])
  /* Whether the hand could press Pay: a card form whose script never came (no connection) leaves the message unknown, never "not shown". */
  const pressed = React.useRef<{ id: string; ok: boolean | null } | null>(null)
  React.useEffect(() => {
    if (!action || !state) return
    let gone = false
    const id = focus!
    pressed.current = { id, ok: null }
    void (async () => {
      await sleep(120)
      if (gone) return
      const ok = await pressPayWith(action)
      if (!gone) pressed.current = { id, ok }
    })()
    return () => {
      gone = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  /* The text being edited: found, opened if it is folded away, ringed and brought into view; the editor is told. */
  React.useEffect(() => {
    if (!state) return
    let tries = 0
    let timer = 0
    let said: boolean | null = null
    const look = () => {
      if (!focus) {
        ring("focus", null)
        return
      }
      let el = findText(focus, state.words)
      /* Folded away: a closed note, the discount code behind Add promotion code. */
      if (el && !visible(el)) {
        const folded = el.closest("details:not([open])") as HTMLDetailsElement | null
        if (folded) folded.open = true
      }
      if (!el && (focus === "buttons.apply" || focus === "summary.enter_code" || focus === "summary.discount_code") && tries === 0) {
        const add = document.querySelector<HTMLButtonElement>('[data-promo="add"]')
        if (add) stillHands(() => add.click())
      }
      el = el && visible(el) ? el : null
      if (el) {
        ring("focus", el)
        bringIntoView(el, state.cover)
      } else ring("focus", null)
      const shown = !!el
      /* A page still drawing (a message after Pay, a sheet opening) is looked at again for a moment before it is called absent. */
      if (!shown && tries < 12) {
        tries++
        timer = window.setTimeout(look, 160)
        return
      }
      /* A message that needs Pay pressed: said once the press is known to have happened, and not at all when it could not be. */
      if (!shown && action && pressed.current?.id === focus && pressed.current.ok !== true) {
        if (pressed.current.ok === null && tries < 40) {
          tries++
          timer = window.setTimeout(look, 160)
        }
        return
      }
      if (said !== shown) {
        said = shown
        post({ channel: CHECKOUT_PREVIEW_CHANNEL, kind: "shown", id: focus, shown })
      }
    }
    const raf = requestAnimationFrame(look)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [state, focus, round, post, action])

  /* The ring stays on its text while the page scrolls under a sticky summary, or the window changes size. */
  React.useEffect(() => {
    if (!focus || !state) return
    let frame = 0
    const again = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const el = findText(focus, state.words)
        if (el && visible(el)) ring("focus", el, false)
      })
    }
    window.addEventListener("resize", again)
    window.addEventListener("scroll", again, { passive: true })
    return () => {
      window.removeEventListener("resize", again)
      window.removeEventListener("scroll", again)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [focus, state])

  if (!state) return null
  const { data, words, mode, view } = state
  const kase = mode === "shipped" && data.shipped ? data.shipped : data.digital
  const noName = !!place?.noName

  let page: React.ReactNode
  if (view === "thanks") {
    page = (
      <div data-page="checkout-thanks" data-preview-view="thanks" className="min-h-dvh bg-[#f8f9fa]">
        <ShopBar brand={data.brand} backTo={null} shopUrl={data.shopUrl} />
        <ThanksView order={{ ...kase.thanks, firstName: noName ? null : kase.thanks.firstName }} shopUrl={data.shopUrl} lang={data.lang} words={words} map={null} />
      </div>
    )
  } else if (view === "order" && kase.orderPage) {
    const o = kase.orderPage
    page = (
      <div data-preview-view="order">
        <OrderStatusView token="preview" justPaid={place?.justPaid ?? true} shop={o.shop} order={{ ...o.order, name: noName ? null : o.order.name }} canReturn={false} />
      </div>
    )
  } else {
    page = (
      <div data-preview-view="checkout">
        <SiteCheckout
          key={key}
          shopId={kase.quote.creatorId}
          brand={data.brand}
          shopUrl={data.shopUrl}
          backTo={data.backTo}
          items={kase.items}
          wholeCart={false}
          couponCode={null}
          initialQuote={kase.quote}
          initialError={null}
          config={data.config}
          buyer={null}
          lockedEmail={null}
          needsSignIn={data.config.requireAccount}
          initialCountry={data.country}
          lang={data.lang}
        />
        {place?.action === "paid-cash" && data.config.cashOnDelivery ? <PaidOverlay state="paid" total={kase.quote.totals.totalCents} free={false} cash returningTo={null} /> : null}
      </div>
    )
  }
  return (
    <CheckoutWords lang={data.lang} words={words}>
      <CheckoutCurrency currency={data.currency}>{page}</CheckoutCurrency>
    </CheckoutWords>
  )
}

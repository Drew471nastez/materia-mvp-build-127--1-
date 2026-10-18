"use client"

/**
 * ===========================================================================
 *  CHECKOUT
 * ===========================================================================
 * Paying on the left, the order on the right, the way Shopify and Stripe lay
 * a checkout out: the buyer works down one column and reads the other. On a
 * phone the order folds into a bar at the top with the total on it, and the
 * code, the tip and the arithmetic come back just above Pay, where the
 * total they change is decided.
 *
 * THREE WAYS TO PAY, ONE ORDER:
 *   web       Stripe's own elements (parts/stripe-pay.tsx): Apple Pay,
 *             Google Pay, Link and PayPal as express buttons, Link's saved
 *             cards from the email box, and a card form the browser's saved
 *             cards fill;
 *   the app   plain fields sent to Stripe directly (parts/native-card.tsx),
 *             because Stripe.js navigates the app's WebView away;
 *   free      no payment at all: /api/checkout/process.
 *
 * Every price here is the page's: the server prices the order again from
 * the database when it is paid for (lib/checkout/pricing.ts), and the order
 * itself is made from the payment by lib/checkout/fulfil-payment.ts.
 */

import * as React from "react"
import { DEFAULT_CHECKOUT, type CheckoutConfig } from "@/lib/store/checkout-config"
import { digitalTax, type CheckoutTax } from "@/lib/tax/rules"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { isNativeApp } from "@/lib/platform-utils"
import { getProductUrl } from "@/lib/url-helpers"
import { ReturnLink } from "@/components/navigation/return-link"
import { canReturnInApp, canReturnTo } from "@/lib/navigation/in-app-history"
import { holdLeavingStill } from "@/lib/navigation/leaving-still"
import { BACK_WATCH_MS } from "@/lib/navigation/go-back"
import { creatorPageHref } from "@/lib/navigation/back-plan"
import { trackFunnelStep } from "@/lib/analytics-utils"
import { checkoutOrigin } from "@/lib/orders/checkout-origin-browser"
import { adoptCarriedTouches } from "@/lib/attribution/browser"
import { paidReturnUrl, returnHostLabel } from "@/lib/checkout/return-url"
import { EMPTY_BUSINESS, checkBusiness, type BusinessDetails } from "@/lib/checkout/business"
import { CheckRow, ErrorBanner, Field, PayButton, PoweredByStripe, Reveal, SectionTitle, Spinner, TextInput, PayDock, useCheckoutCurrency, useMoney } from "./parts/ui"
import { minimumChargeMinor } from "@/lib/store/selling-currency"
import { DiscountForm, LineItem, TipPicker, Totals, type SummaryVariant } from "./parts/order-summary"
import { BusinessFields } from "./parts/business-fields"
import { EMPTY_CARD, NativeCardFields, nativeCardComplete, type NativeCard } from "./parts/native-card"
import { PaidOverlay, holdPaidScreen } from "./parts/success"
import { StripePay, type IntentResult } from "./parts/stripe-pay"
import { afterPaymentReady } from "./parts/stripe-loader"

/** How long the ways out wait for a card form that never says it is ready (no Stripe form on this checkout, or Stripe blocked). */
const WARM_WITHOUT_FORM_MS = 6000
import { NativeWalletButtons } from "./parts/native-wallets"
import { RETURN_PARAM, forgetSecret, redirectToAirwallex, takeSecret } from "./parts/airwallex-redirect"
import { HtmlClass } from "@/components/platform/html-class"
import { AccessLink } from "./parts/access-link"
import { AppAvatar } from "@/components/app/app-avatar"
import { CommunityRefundPolicy, waiverSentence, type CommunityCheckoutTerms } from "@/components/community/membership/checkout-policy"
import { FAIL_COPY, WAIT_MS, fetchWithDeadline, requestJson } from "@/lib/net/request"
import { useBackFromCache } from "@/hooks/use-back-from-cache"

interface CheckoutPageClientProps {
  product: {
    id: string
    title: string
    slug: string
    description: string | null
    price_cents: number
    thumbnail_url: string | null
    type: string
  }
  creator: {
    id: string
    name: string
    avatar_url: string | null
    username: string
  }
  userEmail: string | null
  isLoggedIn: boolean
  /** The store's Settings › Checkout (lib/store/checkout-config). */
  checkoutConfig?: CheckoutConfig
  /** The signed in buyer has confirmed their email. */
  emailConfirmed?: boolean
  /** Settings › Taxes, when the store taxes digital products; null when nothing is taxed. */
  checkoutTax?: CheckoutTax | null
  /**
   * The creator's own website page to land on after paying, checked on the
   * server against their sites (lib/checkout/return-url.ts). Null: the
   * Storelib receipt, as before.
   */
  returnTo?: string | null
  /** Where Back goes, checked the same way. Null: the product. */
  backTo?: string | null
  selectedVariant?: SummaryVariant | null
  isPwyw?: boolean
  customPriceCents?: number | null
  allVariants?: SummaryVariant[]
  /**
   * Who takes the payment for this creator (lib/payments/service
   * providerFor): Stripe, the form drawn here, or Airwallex, whose own
   * payment page the buyer goes to after pressing Pay.
   */
  paymentProvider?: "stripe" | "airwallex"
  /** A product that sells a community tier: the community's refund policy and the EU withdrawal waiver where it applies (round 13). */
  communityTerms?: CommunityCheckoutTerms | null
  /** A marketplace dollar price and the rate day it was made at, sent back so the charge is the price shown (lib/money/marketplace). Null: the store's own prices. */
  pricing?: { context: "marketplace"; fxAsOf: string | null } | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIP_MAX_CENTS = 100_000
/** Which way out of the checkout was pressed. */
type Way = "back" | "shop" | "creator"
/** When React draws a press that the page has already shown (see startGoing). */
const GOING_STATE_MS = 120
/** How long "Payment complete" is on screen before the receipt, long enough to be read. */
const PAID_SCREEN_MS = 1100
const receiptHref = (receiptToken: string) => `/receipt/${encodeURIComponent(receiptToken)}`

/** Names and email survive a reload and a trip to the product page, for this tab only. */
function remembered(key: string): string {
  try {
    return sessionStorage.getItem(`checkout_${key}`) || ""
  } catch {
    return ""
  }
}
function remember(key: string, value: string) {
  try {
    sessionStorage.setItem(`checkout_${key}`, value)
  } catch {
    /* private mode: nothing to keep */
  }
}

/**
 * Every checkout call, bounded (lib/net/request.ts WAIT_MS.pay). Without a deadline a request the server never answered
 * left Pay on "Processing" until the page was reloaded. A failure to answer throws, as a dropped connection always did,
 * so every caller's own error path still applies; an answer, refusal or not, resolves.
 */
async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; field?: string } }> {
  const r = await requestJson<T & { error?: string; field?: string }>(url, { method: "POST", json: body, timeoutMs: WAIT_MS.pay })
  if (r.status === 0) throw Object.assign(new Error(FAIL_COPY[r.kind ?? "network"]), { kind: r.kind })
  return { ok: r.ok, status: r.status, data: r.data }
}

/**
 * Glides the page to `el`, centred on the screen, and when `focus`, puts the caret in it. The focus comes first, inside
 * the press, so a phone brings its keyboard up (a focus after a timer would not), and without a scroll of its own, so the
 * only movement is the glide. Reduced motion jumps.
 */
function bringIntoView(el: HTMLElement, focus = false) {
  const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (focus) {
    try {
      el.focus({ preventScroll: true })
    } catch {
      el.focus()
    }
  }
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
}

export default function CheckoutPageClient({
  product,
  creator,
  userEmail,
  returnTo = null,
  backTo = null,
  selectedVariant: initialVariant,
  isPwyw,
  customPriceCents,
  allVariants = [],
  paymentProvider = "stripe",
  communityTerms = null,
  pricing = null,
  isLoggedIn,
  checkoutConfig = DEFAULT_CHECKOUT,
  emailConfirmed = true,
  checkoutTax = null,
}: CheckoutPageClientProps) {
  /* Settings › Checkout: an account first, and a confirmed one, before Pay. */
  const accountGate = checkoutConfig.requireAccount && !isLoggedIn ? "sign-in" : checkoutConfig.requireConfirmedEmail && isLoggedIn && !emailConfirmed ? "confirm" : null
  const router = useRouter()
  const searchParams = useSearchParams()

  /* ── Who ─────────────────────────────────────────────────────────── */
  /* In the store's own currency, the one Pay charges (app/checkout/page.tsx sets it). */
  const money = useMoney()
  const chargeCurrency = useCheckoutCurrency()
  const [email, setEmail] = React.useState(() => searchParams.get("email") || userEmail || "")
  /* One "Full name" box, as Stripe asks for it, or First and Last apart when the store asks for both (Settings › Checkout); the order keeps a first and a last name either way. */
  const splitName = checkoutConfig.nameFields === "first_and_last"
  const [fullName, setFullName] = React.useState(() => [searchParams.get("firstName"), searchParams.get("lastName")].filter(Boolean).join(" "))
  const [firstOnly, setFirstOnly] = React.useState(() => searchParams.get("firstName") || "")
  const [lastOnly, setLastOnly] = React.useState(() => searchParams.get("lastName") || "")
  const firstName = splitName ? firstOnly.trim() : fullName.trim().split(/\s+/)[0] || ""
  const lastName = splitName ? lastOnly.trim() : fullName.trim().split(/\s+/).slice(1).join(" ")
  const [emailOptIn, setEmailOptIn] = React.useState(false)
  const [agreed, setAgreed] = React.useState(false)
  /* This page's own address, for coming back after signing in: read once mounted, so the server's HTML matches. */
  const [here, setHere] = React.useState("/checkout")
  React.useEffect(() => setHere(window.location.pathname + window.location.search), [])
  React.useEffect(() => {
    const kept = remembered("fullName") || [remembered("firstName"), remembered("lastName")].filter(Boolean).join(" ")
    setFullName((v) => v || kept)
    setFirstOnly((v) => v || kept.trim().split(/\s+/)[0] || "")
    setLastOnly((v) => v || kept.trim().split(/\s+/).slice(1).join(" "))
    setEmail((v) => v || remembered("email"))
  }, [])
  React.useEffect(() => remember("fullName", `${firstName} ${lastName}`.trim()), [firstName, lastName])
  React.useEffect(() => remember("email", email), [email])

  /* ── What, and for how much ──────────────────────────────────────── */
  const [variant, setVariant] = React.useState<SummaryVariant | null>(initialVariant ?? null)
  /* A pay-what-you-want amount belongs to the option it was chosen for. */
  const customPrice = (variant?.id ?? null) === (initialVariant?.id ?? null) && isPwyw ? customPriceCents ?? null : null
  /* "Your price" belongs to that option too, not to one picked after it. */
  const pwywNow = customPrice !== null
  const subtotal = variant ? variant.priceCents : product.price_cents

  const [tipPreset, setTipPreset] = React.useState(0)
  const [tipCustom, setTipCustom] = React.useState("")
  const tipCents = tipCustom ? Math.min(TIP_MAX_CENTS, Math.max(0, Math.round(Number.parseFloat(tipCustom) * 100) || 0)) : tipPreset

  const [code, setCode] = React.useState(() => searchParams.get("discountCode") || "")
  const [applied, setApplied] = React.useState<{ code: string; label: string; discountCents: number } | null>(null)
  const [codeBusy, setCodeBusy] = React.useState(false)
  const [codeError, setCodeError] = React.useState<string | null>(null)
  /** The reason a code from the link did not apply: said quietly, the buyer did nothing wrong. */
  const [codeFromLink, setCodeFromLink] = React.useState(false)
  const discountCents = applied ? Math.min(applied.discountCents, subtotal) : 0
  /* Tax the server charges too (lib/tax/rules digitalTax): by the buyer's country, which they can change. */
  const [taxCountry, setTaxCountry] = React.useState<string | null>(checkoutTax?.country ?? null)
  const taxNow = checkoutTax
    ? digitalTax(
        { enabled: true, digital: true, included: checkoutTax.included, regions: checkoutTax.regions.map((r) => ({ ...r, region: null })), overrides: checkoutTax.overrides },
        { taxableCents: Math.max(0, subtotal - discountCents), tipCents, productId: product.id, country: taxCountry },
      )
    : null
  const total = taxNow ? taxNow.totalCents : Math.max(0, subtotal - discountCents + tipCents)
  const isFree = total === 0

  /* ── Buying for a business ───────────────────────────────────────── */
  const [businessOn, setBusinessOn] = React.useState(false)
  const [business, setBusiness] = React.useState<BusinessDetails>(EMPTY_BUSINESS)
  const [businessErrors, setBusinessErrors] = React.useState<Partial<Record<keyof BusinessDetails, string>>>({})

  /* ── The page's own state ────────────────────────────────────────── */
  const [error, setError] = React.useState<string | null>(null)
  /*
    WHAT IS MISSING, AT ITS FIELD (round 21, the owner: "when something like my name is missing, scroll smoothly to it").
    Pay used to say what was missing in the line under the form only, wherever the field was. Now the field itself says
    it, in red, and the page glides to it with the field ready to type in.
  */
  const [fieldError, setFieldError] = React.useState<{ field: "email" | "name" | "last"; message: string } | null>(null)
  const missing = (field: "email" | "name" | "last", message: string) => {
    setFieldError({ field, message })
    const el = document.getElementById(field === "email" ? "checkout-email" : field === "last" ? "checkout-last" : splitName ? "checkout-first" : "checkout-name")
    if (el) bringIntoView(el, true)
    return message
  }
  const [busy, setBusy] = React.useState(false)
  const [paid, setPaid] = React.useState<{ total: number; free: boolean } | null>(null)
  /** Paid (or processing) and no longer payable, whatever happens next. */
  const [settled, setSettled] = React.useState(false)
  /* The order is open on a phone as the page arrives, as asked; it folds with Hide details. */
  const [summaryOpen, setSummaryOpen] = React.useState(true)
  /** A computer's width: the order is always shown there, beside the form. */
  const [wide, setWide] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const read = () => setWide(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])
  /** null until the first effect knows: in the app, Stripe.js must never load, even for one render. */
  const [nativeApp, setNativeApp] = React.useState<boolean | null>(null)
  const [card, setCard] = React.useState<NativeCard>(EMPTY_CARD)
  const secretRef = React.useRef<string | null>(null)

  React.useEffect(() => setNativeApp(isNativeApp()), [])
  /* Touches a website's link carried here (`sl_at`): read once, then off the address (lib/attribution/browser). */
  React.useEffect(() => {
    adoptCarriedTouches()
  }, [])
  React.useEffect(() => {
    void trackFunnelStep("checkout_start", creator.id, product.id)
  }, [creator.id, product.id])

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE CHECKOUT OPENS AT ITS TOP
    ═══════════════════════════════════════════════════════════════════════
    It used to open part way down. Measured (scripts/check-checkout-arrival):
    a Buy press from a scrolled product page already arrived at 0, because
    Next scrolls a new page to the top; a reload, or coming back to the
    checkout with Back or Forward, arrived at the offset the browser had
    saved for it (295px on a 390px phone), because the browser restores a
    history entry's scroll, and a phone's checkout is long enough to keep it.

    So this entry's scroll is not restored: `scrollRestoration` belongs to
    the history entry that is current when it is set, so "manual" here
    leaves every other page's Back exactly as it was, and the product page
    behind still comes back where the buyer left it. A page brought back
    whole from the browser's cache starts at the top too. Before paint, so
    the page is never seen part way down first.
  */
  React.useLayoutEffect(() => {
    const history = window.history
    try {
      history.scrollRestoration = "manual"
    } catch {
      /* not settable here: the scroll below still puts the page at its top */
    }
    if (window.scrollY !== 0) window.scrollTo(0, 0)
    const fromCache = (e: PageTransitionEvent) => {
      if (e.persisted) window.scrollTo(0, 0)
    }
    window.addEventListener("pageshow", fromCache)
    return () => {
      window.removeEventListener("pageshow", fromCache)
      /* Leaving: whichever entry is current now (the receipt pushed after
         this one, or the page Back returned to) keeps the browser's own
         restoring. */
      try {
        history.scrollRestoration = "auto"
      } catch {
        /* as above */
      }
    }
  }, [])

  /* Back goes where the buyer came from: the creator's website page when the
     server checked one (backTo), else a product page's ?from=, else the product. */
  const from = searchParams.get("from") || ""
  const productUrl = backTo ?? (from.startsWith("/") && !from.startsWith("//") ? from : getProductUrl(creator.username, product.slug))
  const siteHost = returnHostLabel(backTo ?? returnTo)
  /* Continue shopping: the product page itself, whatever came before it (the
     creator's page when the product has no page of its own: getProductUrl
     falls back to it), or the creator's website page the server checked. */
  const shopUrl = backTo ?? getProductUrl(creator.username, product.slug)
  /* The creator's page on Storelib, "#" when there is no handle to make one from. */
  const creatorHref = creatorPageHref(creator.username)

  /*
    ═══════════════════════════════════════════════════════════════════════
     LEAVING THE CHECKOUT: AT ONCE, AND NEVER INTO A LOOP
    ═══════════════════════════════════════════════════════════════════════
    Back used to return only when the page behind was exactly the product's
    own address, and to PUSH the product page otherwise. Reached from a /p/
    link, the address differed, so the product page was fetched fresh (up to
    five seconds on a phone, with nothing on screen to say so) and put on
    top of the checkout. The product page's own back arrow then landed on
    the checkout again: the loop that was reported.

    Now: any page of ours behind this one, or the page the buyer came from
    when it is the same site, is returned to with history.back(), which is
    instant. With nothing behind (a shared checkout link), the product page
    REPLACES the checkout rather than stacking on it. And the press is
    answered on the next frame, whatever the network does.
  */
  /*
    WHICH WAY OUT was pressed: Back, Continue shopping, or the creator. The
    control that was pressed stays pressed from the next frame and the page
    eases back a shade (to 80% over 100ms), so the press is seen to have
    landed whatever comes next. The arrow turns into a spinner only when
    the wait is long (about 370ms: startGoing's GOING_STATE_MS, then the
    spinner's own 250ms), so a Back through history never shows it and a
    slow fetch still says it is on its way. No white sheet, no flash.
  */
  const [going, setGoing] = React.useState<null | Way>(null)
  const leaving = going === "back"
  const pageRef = React.useRef<HTMLDivElement>(null)
  const goingLater = React.useRef(0)
  /** A way out is running: the checkout is held over the page that comes, and fades off it (LEAVING, below). */
  const leavingRef = React.useRef(false)
  /*
    The press is answered in the page itself, inside the click: the
    attribute that holds Back pressed and eases the page back is set on the
    element there and then. React's own render of it (the spinner that
    shows only after 250ms, the reset below) waits GOING_STATE_MS, past the
    first frames and the picture leaveWithFade takes: filmed with the whole
    checkout re-rendered inside the click, the first frame after it came
    40 to 60ms late.
  */
  const startGoing = (way: Way) => {
    pageRef.current?.setAttribute("data-leaving", way)
    window.clearTimeout(goingLater.current)
    goingLater.current = window.setTimeout(() => setGoing(way), GOING_STATE_MS)
  }
  /** Pressed already, whether or not React has drawn it yet: a second press does nothing. */
  const alreadyGoing = () => !!going || !!pageRef.current?.hasAttribute("data-leaving")
  React.useEffect(() => {
    if (!going) return
    const t = window.setTimeout(() => {
      /* Whatever was on its way is not coming: no still is taken if this page goes now. */
      leavingRef.current = false
      setGoing(null)
    }, 8000)
    return () => window.clearTimeout(t)
  }, [going])
  /* Back from Airwallex or a bank, restored from the browser's cache: Pay was left pressed with nothing behind it. */
  useBackFromCache(() => setBusy(false))
  /* A page brought back from the browser's cache is not still leaving, and a render of the press still waiting is dropped. */
  React.useEffect(() => {
    const reset = () => {
      window.clearTimeout(goingLater.current)
      pageRef.current?.removeAttribute("data-leaving")
      leavingRef.current = false
      setGoing(null)
    }
    window.addEventListener("pageshow", reset)
    return () => {
      window.removeEventListener("pageshow", reset)
      window.clearTimeout(goingLater.current)
    }
  }, [])
  /** The product page as a path on this site, or null when it is on another (a creator's website). */
  const ownPath = (href: string): string | null => {
    try {
      const url = new URL(href, window.location.href)
      return url.origin === window.location.origin ? url.pathname + url.search : null
    } catch {
      return null
    }
  }
  /*
    THE WAYS OUT, WARMED. The product page and the creator's page are asked
    for whole (a "full" prefetch: with no loading boundary on those routes an
    ordinary one brings back almost nothing), once the card form is ready
    and the browser is idle, so Stripe's own loading goes first. Asked at
    the first idle moment, they were whole routes of scripts arriving while
    Stripe's frames were still drawing, and on a phone the form waited for
    them (scripts/check-checkout-speed.mjs). A checkout with no card form
    (the app's own fields, Airwallex) waits a few seconds instead. The router
    keeps them for staleTimes (next.config.mjs), and a press on Back,
    Continue shopping or the creator then lands on the next frame, on the
    client, with no document load.
  */
  React.useEffect(() => {
    const paths = [...new Set([ownPath(productUrl), ownPath(shopUrl), creatorHref === "#" ? null : creatorHref])].filter(
      (p): p is string => !!p,
    )
    const warm = () => {
      for (const path of paths) {
        try {
          router.prefetch(path, { kind: "full" } as never)
        } catch {
          /* a prefetch that fails is a press that waits, nothing worse */
        }
      }
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    let cancelIdle = () => {}
    const cancelWait = afterPaymentReady(() => {
      if (w.requestIdleCallback) {
        const id = w.requestIdleCallback(warm, { timeout: 2000 })
        cancelIdle = () => w.cancelIdleCallback?.(id)
      } else {
        const t = window.setTimeout(warm, 800)
        cancelIdle = () => window.clearTimeout(t)
      }
    }, WARM_WITHOUT_FORM_MS)
    return () => {
      cancelWait()
      cancelIdle()
    }
  }, [productUrl, shopUrl, creatorHref, router])

  const plainClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

  /*
    ═══════════════════════════════════════════════════════════════════════
     LEAVING IS A CROSS-FADE, AND IT WAITS FOR NOTHING AT ALL
    ═══════════════════════════════════════════════════════════════════════
    "I click back, nothing happens, and it takes me back abruptly after 5
    seconds." That was `document.startViewTransition` holding the old frame
    while the page behind was fetched, and Chrome ending it after its fixed
    four seconds. It was fixed by starting the navigation on the press and
    capping the transition's own wait at 400ms.

    IT WAS STILL A WAIT, AND A WAIT IS STILL A FROZEN SCREEN. Filmed with
    the page behind 2.5 seconds away (scripts/check-back-stall.mjs), the
    screen did not change once for 429ms after the press: the transition
    was waiting for the checkout to go, and while a view transition waits
    the browser draws nothing at all, so the pressed Back, the page easing
    away and the spinner were all frozen with it. Nothing inside the page
    can see that, because a page that is not being drawn runs no animation
    frames either.

    So there is no view transition here now. The press is answered in the
    page itself (startGoing, in the click), the navigation starts in the
    same task, and the checkout is copied in the commit that takes it away
    and faded off the page that came (lib/navigation/leaving-still). Every
    frame between the press and the arrival is drawn live: a page behind
    that takes five seconds shows five seconds of the live checkout with
    its spinner turning, never a photograph of it.
  */
  React.useLayoutEffect(() => {
    const node = pageRef.current
    /* The commit that takes the checkout away, before that frame is painted: the page it goes to is already under this still. */
    return () => {
      if (leavingRef.current) holdLeavingStill(node)
    }
  }, [])
  const leaveWithFade = (go: () => void) => {
    leavingRef.current = true
    go()
  }

  /*
    A BACK THAT PROVES IT HAPPENED. `history.back()` reports nothing when it
    does nothing, and there are several ways for it to do nothing: an entry
    the browser replaced, a hash entry, a web view that reports a length it
    cannot go back through. Filmed with back made into a no-op, the checkout
    sat under a pressed arrow and a spinner for eight seconds and then came
    back to life on the same page. So a real back has to show itself (a
    popstate for a page the router still has, a pagehide for one it does
    not) within BACK_WATCH_MS, or the product page is used instead.
  */
  const backThen = (fallback: () => void) => {
    let settled = false
    const off = () => {
      window.removeEventListener("popstate", done)
      window.removeEventListener("pagehide", done)
    }
    function done() {
      settled = true
      off()
    }
    window.addEventListener("popstate", done)
    window.addEventListener("pagehide", done)
    window.history.back()
    window.setTimeout(() => {
      if (settled) return
      off()
      fallback()
    }, BACK_WATCH_MS)
  }

  /*
    AND THE BROWSER'S OWN BACK IS A PRESS TOO. An edge swipe on an iPhone,
    the hardware key on Android, the browser's own arrow: none of them
    touches the control, so the checkout used to sit there unanswered for
    as long as the page behind took to draw. Filmed with it 2.5 seconds
    away: the screen did not change once in 2,545ms. Now the same answer
    as the control's, from the popstate, and the same still over the page
    that comes.
  */
  React.useEffect(() => {
    const onPop = () => {
      if (alreadyGoing()) return
      leavingRef.current = true
      startGoing("back")
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
    /* Once: what it reads is the attribute on the page, never a rendered value. */
     
  }, [])

  /**
   * CONTINUE SHOPPING goes to the product page. When that is the page behind
   * this one, it goes back to it (instant, with its scroll); otherwise the
   * product page REPLACES the checkout, for the same reason Back does: a push
   * would leave the checkout one back away from the product page.
   */
  const goShopping = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!plainClick(e)) return
    e.preventDefault()
    if (alreadyGoing()) return
    startGoing("shop")
    const path = ownPath(shopUrl)
    if (canReturnTo(shopUrl)) {
      /* A back that does nothing is followed by the page itself, never by a spinner that ends in the same place. */
      leaveWithFade(() => backThen(() => (path ? router.replace(path) : window.location.replace(shopUrl))))
      return
    }
    if (!path) {
      window.location.replace(shopUrl)
      return
    }
    leaveWithFade(() => router.replace(path))
  }

  const goBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    /* A new tab, a new window, a context menu: the browser's. */
    if (!plainClick(e)) return
    e.preventDefault()
    if (alreadyGoing()) return
    startGoing("back")
    const cameFrom = (() => {
      try {
        return document.referrer ? new URL(document.referrer).origin : null
      } catch {
        return null
      }
    })()
    const target = (() => {
      try {
        return new URL(productUrl, window.location.href).origin
      } catch {
        return null
      }
    })()
    const path = ownPath(productUrl)
    /* The page behind is one of ours in this tab: the router draws it, and the checkout fades off it when it lands. */
    if (canReturnInApp()) {
      leaveWithFade(() => backThen(() => (path ? router.replace(path) : window.location.replace(productUrl))))
      return
    }
    /* The page behind is another document (a creator's website): the browser's own Back, from its cache when it can. */
    if (cameFrom !== null && cameFrom === target && window.history.length > 1) {
      leaveWithFade(() => backThen(() => window.location.replace(productUrl)))
      return
    }
    if (!path) {
      window.location.replace(productUrl)
      return
    }
    leaveWithFade(() => router.replace(path))
  }
  /** Back from a bank's page with a payment that went through: the page opens on "Finishing your order". */
  const [arriving, setArriving] = React.useState(() => {
    /* Known from the address, so the very first frame (the server's) is
       already "Finishing your order", never the form with Pay on it. */
    const status = searchParams.get("redirect_status")
    return !!searchParams.get("payment_intent") && !!searchParams.get("payment_intent_client_secret") && status !== "failed" && status !== "processing" && status !== "pending"
  })
  /**
   * AFTER PAYING: the creator's website when the link asked for it and the
   * server agreed, else the receipt. The receipt is emailed either way, and
   * its address never travels to the website: it is a credential.
   *
   * ONE SCREEN FROM PAID TO THE RECEIPT. "After finishing the checkout,
   * paid or free, the transition must be smooth and clean." It was three:
   * the check, then (the moment the receipt was asked for) the checkout and
   * its overlay taken down for the receipt's loading page, which waits
   * 200ms before it shows anything, so a bare grey page, then its skeleton,
   * then the receipt. Now the receipt is fetched while the check draws, and
   * the paid screen is held over the page (holdPaidScreen) until the
   * receipt itself is drawn under it, then fades off it. Nothing in
   * between is ever seen.
   */
  const afterPaid = React.useCallback(
    (receiptToken: string) => {
      if (returnTo) {
        window.location.replace(paidReturnUrl(returnTo))
        return
      }
      holdPaidScreen()
      router.replace(receiptHref(receiptToken))
    },
    [returnTo, router],
  )
  /** Paid, with the receipt's token: the check on screen, the receipt asked for now, and opened once the check has been seen. */
  const showPaid = React.useCallback(
    (receiptToken: string, paidState: { total: number; free: boolean }) => {
      /* The store's own Google Analytics hears the purchase (components/analytics/ga-route), never the token itself. */
      try {
        window.dispatchEvent(new CustomEvent("storelib:paid", { detail: { ref: receiptToken, totalCents: paidState.total } }))
      } catch {
        /* nothing to tell */
      }
      setPaid(paidState)
      setArriving(false)
      if (!returnTo) {
        try {
          router.prefetch(receiptHref(receiptToken), { kind: "full" } as never)
        } catch {
          /* then it is fetched when it is opened, under the same held screen */
        }
      }
      window.setTimeout(() => afterPaid(receiptToken), PAID_SCREEN_MS)
    },
    [afterPaid, returnTo, router],
  )

  /* ── After paying: the order, then the receipt ───────────────────── */
  /**
   * The payment is written into the address before the order is asked for,
   * the same way a bank's 3-D Secure page returns it. If making the order
   * fails (a timeout, a moment's outage) a refresh finishes it from there,
   * rather than showing an empty checkout that would take a second payment.
   * The webhook makes the same order anyway; this only fetches its receipt.
   */
  const finish = React.useCallback(
    async (paymentIntentId: string, clientSecret: string) => {
      const url = new URL(window.location.href)
      url.searchParams.set("payment_intent", paymentIntentId)
      url.searchParams.set("payment_intent_client_secret", clientSecret)
      url.searchParams.set("redirect_status", "succeeded")
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)

      let last = "Your payment went through. The order is still being saved: refresh this page in a moment. You will not be charged again."
      for (const wait of [0, 1500, 4000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait))
        const res = await postJson<{ receiptToken?: string; amountCents?: number }>("/api/checkout/confirm-payment", { paymentIntentId, clientSecret }).catch(
          () => null,
        )
        if (res?.ok && res.data.receiptToken) {
          showPaid(res.data.receiptToken, { total: res.data.amountCents ?? 0, free: false })
          return
        }
        /* A refusal is an answer; only a failure to answer is retried. */
        if (res && res.status >= 400 && res.status < 500) {
          last = res.data.error || last
          break
        }
      }
      setSettled(true)
      throw new Error(last)
    },
    [showPaid],
  )

  /* Arriving with a payment in the address: back from a bank's page, or a
     refresh after the order could not be finished. */
  React.useEffect(() => {
    const piId = searchParams.get("payment_intent")
    const secret = searchParams.get("payment_intent_client_secret")
    if (!piId || !secret) return
    const status = searchParams.get("redirect_status")
    const clear = () => {
      const url = new URL(window.location.href)
      for (const k of ["payment_intent", "payment_intent_client_secret", "redirect_status"]) url.searchParams.delete(k)
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    }
    if (status === "failed") {
      clear()
      setError("The bank did not approve the payment. Nothing was charged. Try again or use another card.")
      return
    }
    if (status === "processing" || status === "pending") {
      clear()
      setSettled(true)
      setError("Your bank is still processing the payment. The receipt will be emailed to you as soon as it clears.")
      return
    }
    setBusy(true)
    finish(piId, secret)
      .catch((e: Error) => {
        setArriving(false)
        setError(e.message)
      })
      .finally(() => setBusy(false))
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
    BACK FROM AIRWALLEX'S PAYMENT PAGE, with the payment's id in the address
    and its client secret in this tab (./parts/airwallex-redirect). The order
    is made the same way as Stripe's, once, and the receipt is fetched for the
    browser that paid. A different browser, or storage that was cleared,
    gets the receipt by email: the webhook makes the order either way.
  */
  React.useEffect(() => {
    const intentId = searchParams.get(RETURN_PARAM)
    if (!intentId) return
    const clear = () => {
      const url = new URL(window.location.href)
      url.searchParams.delete(RETURN_PARAM)
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    }
    const secret = takeSecret(intentId)
    if (!secret) {
      clear()
      setSettled(true)
      setError("If your payment went through, your receipt is on its way to your email. You will not be charged again.")
      return
    }
    setBusy(true)
    ;(async () => {
      let last = "Your payment went through. The order is still being saved: refresh this page in a moment. You will not be charged again."
      for (const wait of [0, 1500, 4000, 8000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait))
        const res = await postJson<{ receiptToken?: string; amountCents?: number }>("/api/payments/airwallex/return", { paymentIntentId: intentId, clientSecret: secret }).catch(() => null)
        if (res?.ok && res.data.receiptToken) {
          forgetSecret(intentId)
          clear()
          showPaid(res.data.receiptToken, { total: res.data.amountCents ?? 0, free: false })
          return
        }
        /* "Not completed" is Airwallex still settling a redirect payment: asked again. Any other refusal is an answer. */
        if (res && res.status >= 400 && res.status < 500 && !/not completed/i.test(res.data.error || "")) {
          last = res.data.error || last
          break
        }
      }
      setSettled(true)
      setError(last)
    })().finally(() => setBusy(false))
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Pay, for a creator on Airwallex ─────────────────────────────── */
  const payAirwallex = async () => {
    if (busy) return
    setError(null)
    const problem = check("card")
    if (problem) return setError(problem)
    setBusy(true)
    try {
      const res = await postJson<{ provider?: string; intentId?: string; clientSecret?: string; currency?: string; env?: "sandbox" | "prod" }>("/api/checkout/stripe-session", orderBody())
      if (!res.ok || res.data.provider !== "airwallex" || !res.data.intentId || !res.data.clientSecret || !res.data.currency) {
        const field = res.data.field as keyof BusinessDetails | undefined
        if (field) setBusinessErrors({ [field]: res.data.error || "Check this field." })
        throw new Error(res.data.error || "The payment could not be started. Nothing was charged.")
      }
      await redirectToAirwallex({ intentId: res.data.intentId, clientSecret: res.data.clientSecret, currency: res.data.currency, env: res.data.env === "prod" ? "prod" : "sandbox" })
      /* Leaving for the payment page: Pay stays pressed until the page changes. */
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payment could not be started. Nothing was charged.")
      setBusy(false)
    }
  }

  /* ── Checks, before anything is sent ─────────────────────────────── */
  const checkBusinessNow = (): string | null => {
    if (!businessOn) return null
    const r = checkBusiness(business)
    if (r.ok) {
      setBusinessErrors({})
      return null
    }
    setBusinessErrors({ [r.field]: r.error })
    const field = document.getElementById(`business-${r.field === "postalCode" ? "postal" : r.field === "taxId" ? "tax" : r.field}`)
    if (field) bringIntoView(field, true)
    return r.error
  }

  const check = (mode: "card" | "express" | "free"): string | null => {
    if (paid || settled) return "This order is already paid."
    setFieldError(null)
    /* Stripe's smallest charge: said before a wallet sheet opens, not after. The tip is where it can be changed. */
    if (mode !== "free" && total > 0 && total < minimumChargeMinor(chargeCurrency)) {
      const tip = document.querySelector<HTMLElement>("[data-tip-label]")?.closest<HTMLElement>("section, div") ?? null
      if (tip) bringIntoView(tip)
      return `The smallest card payment is ${money(minimumChargeMinor(chargeCurrency))}. Add to the tip or remove the code.`
    }
    if (mode !== "express") {
      if (!EMAIL.test(email.trim())) return missing("email", "Enter a valid email address.")
      /* A last name is not required unless the store asks for one: some people have one name. */
      if (!firstName.trim()) return missing("name", "Enter your name.")
      if (splitName && !lastName.trim()) return missing("last", "Enter your last name.")
    }
    if (accountGate) return accountGate === "sign-in" ? "Sign in or create an account to check out." : "Confirm your email address to check out."
    if (mode !== "free") {
      const b = checkBusinessNow()
      if (b) return b
    }
    if (!agreed) {
      const terms = document.getElementById("checkout-terms")
      if (terms) bringIntoView(terms)
      return "Tick the box to agree to the Terms and Conditions."
    }
    return null
  }

  const orderBody = (contact?: { email?: string; name?: string }) => {
    const payerEmail = (contact?.email || email).trim()
    /* The form's name when it was typed, whole; otherwise the wallet's, split
       the way a form would have it; otherwise the email's name, because the
       order needs one and a wallet does not always send it. */
    const walletName = (contact?.name || "").trim().split(/\s+/).filter(Boolean)
    const typed = firstName.trim() !== ""
    return {
      productId: product.id,
      variantId: variant?.id ?? null,
      customPriceCents: customPrice,
      tipCents,
      couponCode: applied?.code ?? "",
      firstName: typed ? firstName.trim() : walletName[0] || payerEmail.split("@")[0] || "",
      lastName: typed ? lastName.trim() : walletName.slice(1).join(" "),
      email: payerEmail,
      emailOptIn: checkoutConfig.marketingOptIn ? emailOptIn : false,
      /* The country the tax line was worked out for; the server checks it. */
      taxCountry: checkoutTax ? taxCountry : null,
      agreedToTerms: agreed,
      business: businessOn ? business : null,
      /* Which page sent the buyer here and where their visit came from, for
         the order's Source (lib/orders/checkout-origin). Read when Pay is
         pressed, when the page before this one is surely known. */
      origin: checkoutOrigin(creator.id),
      pricing,
    }
  }

  const createIntent = async (contact?: { email?: string; name?: string }, methods?: string[]): Promise<IntentResult> => {
    /* The ways to pay the form loaded with: the PaymentIntent is made for exactly those (lib/checkout/payment-methods). */
    const res = await postJson<IntentResult>("/api/checkout/stripe-session", { ...orderBody(contact), paymentMethods: methods })
    if (!res.ok || !res.data.clientSecret) {
      const field = res.data.field as keyof BusinessDetails | undefined
      if (field) setBusinessErrors({ [field]: res.data.error || "Check this field." })
      throw new Error(res.data.error || "The payment could not be started. Nothing was charged.")
    }
    secretRef.current = res.data.clientSecret
    return { clientSecret: res.data.clientSecret, paymentIntentId: res.data.paymentIntentId }
  }

  const onPaid = async (paymentIntentId: string, status: string) => {
    if (status === "processing") {
      /* Paid, not yet cleared: nothing more to press. The webhook makes the
         order when it clears, and the receipt is emailed then. */
      setSettled(true)
      setError("Your bank is still processing the payment. The receipt will be emailed to you as soon as it clears.")
      return
    }
    if (status !== "succeeded") {
      setError("The payment was not completed. Nothing was charged. Try again.")
      return
    }
    await finish(paymentIntentId, secretRef.current || "")
  }

  /* ── The app: card fields straight to Stripe ─────────────────────── */
  const payNative = async () => {
    if (busy) return
    setError(null)
    const problem = check("card")
    if (problem) return setError(problem)
    if (!nativeCardComplete(card)) return setError("Check the card number, expiration date and security code.")
    setBusy(true)
    try {
      const [mm, yy] = card.expiry.split("/")
      const params = new URLSearchParams({
        type: "card",
        "card[number]": card.number.replace(/\D/g, ""),
        "card[exp_month]": mm,
        "card[exp_year]": `20${yy}`,
        "card[cvc]": card.cvc,
        "billing_details[name]": (card.name || `${firstName} ${lastName}`).trim(),
        "billing_details[email]": email.trim(),
      })
      const pmRes = await fetchWithDeadline("https://api.stripe.com/v1/payment_methods", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      })
      const pm = await pmRes.json()
      if (!pmRes.ok) throw new Error(pm?.error?.message || "Check the card details and try again.")
      const intent = await createIntent()
      let confirmed: Awaited<ReturnType<typeof postJson<{ status?: string; actionUrl?: string }>>>
      try {
        confirmed = await postJson<{ status?: string; actionUrl?: string }>("/api/checkout/confirm-with-pm", {
          paymentIntentId: intent.paymentIntentId,
          clientSecret: intent.clientSecret,
          paymentMethodId: pm.id,
          returnUrl: window.location.href,
        })
      } catch {
        /* NO ANSWER IS NOT A NO. The card may have been charged after all, so this never says "nothing was charged" on a
           guess: it asks the server what Stripe says this payment did. Paid: the receipt (the same order the webhook makes,
           never a second). Not paid: Pay is free to press again. No answer to that either: it says it does not know. */
        const asked = await postJson<{ receiptToken?: string; amountCents?: number }>("/api/checkout/confirm-payment", {
          paymentIntentId: intent.paymentIntentId,
          clientSecret: intent.clientSecret,
        }).catch(() => null)
        if (asked?.ok && asked.data.receiptToken) {
          showPaid(asked.data.receiptToken, { total: asked.data.amountCents ?? 0, free: false })
          return
        }
        if (asked && asked.status >= 400 && asked.status < 500) throw new Error("The payment did not complete. Try again.")
        throw new Error("We could not confirm the payment. Check your email for a receipt before you try again.")
      }
      if (!confirmed.ok) throw new Error(confirmed.data.error || "The payment did not go through. Nothing was charged.")
      if (confirmed.data.status === "requires_action" && confirmed.data.actionUrl) {
        window.location.href = confirmed.data.actionUrl
        return
      }
      await onPaid(intent.paymentIntentId, confirmed.data.status || "unknown")
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payment did not go through. Nothing was charged.")
    } finally {
      setBusy(false)
    }
  }

  /* ── Free ────────────────────────────────────────────────────────── */
  const takeFree = async () => {
    if (busy) return
    setError(null)
    const problem = check("free")
    if (problem) return setError(problem)
    setBusy(true)
    try {
      /* No tip and no invoice: a tip would have made it a payment, and there is nothing to invoice. */
      const body: Partial<ReturnType<typeof orderBody>> = orderBody()
      delete body.tipCents
      delete body.business
      const res = await postJson<{ receiptToken?: string }>("/api/checkout/process", body)
      if (!res.ok || !res.data.receiptToken) throw new Error(res.data.error || "The order could not be finished. Try again.")
      showPaid(res.data.receiptToken, { total: 0, free: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : "The order could not be finished. Try again.")
    } finally {
      setBusy(false)
    }
  }

  /* ── Discount code ───────────────────────────────────────────────── */
  const applyCode = async (fromLink?: string) => {
    const typed = (fromLink ?? code).trim()
    if (!typed) return
    setCodeBusy(true)
    setCodeError(null)
    setCodeFromLink(!!fromLink)
    try {
      const res = await postJson<{ ok?: boolean; code?: string; label?: string; discountCents?: number }>("/api/coupons/validate", {
        code: typed,
        productId: product.id,
        variantId: variant?.id ?? null,
        customPriceCents: customPrice,
        pricing,
      })
      if (!res.data.ok) {
        setCodeError(res.data.error || "That code is not valid.")
        return
      }
      setApplied({ code: res.data.code || typed, label: res.data.label || "", discountCents: res.data.discountCents || 0 })
      setCode(res.data.code || typed)
    } catch {
      setCodeError("The code could not be checked. Try again.")
    } finally {
      setCodeBusy(false)
    }
  }
  const removeCode = () => {
    setApplied(null)
    setCode("")
    setCodeError(null)
  }
  /* A link with ?discountCode= applies it as the page opens: the buyer sees
     it taken off, or why it was not, without pressing Apply. Once. */
  const linkCode = React.useRef(searchParams.get("discountCode")?.trim() || "")
  React.useEffect(() => {
    const fromLink = linkCode.current
    linkCode.current = ""
    if (fromLink) void applyCode(fromLink)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /* Another option is another price: the code is checked again against it. */
  const chooseVariant = (v: SummaryVariant) => {
    setVariant(v.id === initialVariant?.id ? initialVariant : v)
    if (applied) {
      setApplied(null)
      setCodeError("Apply the code again for this option.")
    }
  }

  /* ── Pieces ──────────────────────────────────────────────────────── */
  /* Under the email, as Shopify puts it: the news box (never ticked for them), then the name as the store asks for it. */
  /* A guest who bought it before: the receipts of that email's orders go to that email, and the page never says whether there were any (lib/checkout/access-link). */
  const sendAccess = async (to: string) => {
    const res = await fetch("/api/checkout/access-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: to, productId: product.id }) })
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
    return { ok: res.ok, message: data.message || data.error || (res.ok ? "Check your inbox." : "That didn't go through. Try again in a moment.") }
  }
  const namesAndNews = (
    <div className="space-y-3">
      {checkoutConfig.marketingOptIn ? (
        <CheckRow id="checkout-news" checked={emailOptIn} onChange={setEmailOptIn}>
          Email me with news and offers
        </CheckRow>
      ) : null}
      {!isLoggedIn ? <AccessLink email={email} send={sendAccess} /> : null}
      {splitName ? (
        <div className="grid grid-cols-2 gap-3">
          <Field id="checkout-first" label="First name" error={fieldError?.field === "name" ? fieldError.message : null}>
            <TextInput
              id="checkout-first"
              autoComplete="given-name"
              placeholder="Jane"
              value={firstOnly}
              invalid={fieldError?.field === "name"}
              onChange={(e) => {
                setFirstOnly(e.target.value.slice(0, 60))
                if (fieldError?.field === "name") setFieldError(null)
              }}
            />
          </Field>
          <Field id="checkout-last" label="Last name" error={fieldError?.field === "last" ? fieldError.message : null}>
            <TextInput
              id="checkout-last"
              autoComplete="family-name"
              placeholder="Smith"
              value={lastOnly}
              invalid={fieldError?.field === "last"}
              onChange={(e) => {
                setLastOnly(e.target.value.slice(0, 60))
                if (fieldError?.field === "last") setFieldError(null)
              }}
            />
          </Field>
        </div>
      ) : (
        <Field id="checkout-name" label="Full name" error={fieldError?.field === "name" ? fieldError.message : null}>
          <TextInput
            id="checkout-name"
            autoComplete="name"
            placeholder="Jane Smith"
            value={fullName}
            invalid={fieldError?.field === "name"}
            aria-describedby={fieldError?.field === "name" ? "checkout-name-error" : undefined}
            onChange={(e) => {
              setFullName(e.target.value.slice(0, 121))
              if (fieldError?.field === "name") setFieldError(null)
            }}
          />
        </Field>
      )}
      {accountGate === "sign-in" ? (
        <div className="rounded-xl border border-[#d9dce1] bg-[#f8f9fa] px-4 py-3.5" data-checkout-account="sign-in">
          <p className="text-[14.5px] font-semibold text-[#1a1a2e]">Sign in to check out</p>
          <p className="mt-0.5 text-[13px] leading-[19px] text-[#4b5563]">{creator.name} asks for an account before an order, so you can find your purchase again.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <a href={`/login?next=${encodeURIComponent(here)}`} className="inline-flex h-9 items-center rounded-[10px] bg-[#1a1a2e] px-3.5 text-[13.5px] font-medium text-white">Sign in</a>
            <a href={`/signup?next=${encodeURIComponent(here)}`} className="inline-flex h-9 items-center rounded-[10px] border border-[#d9dce1] bg-white px-3.5 text-[13.5px] font-medium text-[#1a1a2e]">Create an account</a>
          </div>
        </div>
      ) : accountGate === "confirm" ? (
        <p className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[13.5px] text-[#92400e]" data-checkout-account="confirm">
          Confirm your email address to place an order. Open the link we sent when you signed up, then come back here.
        </p>
      ) : null}
    </div>
  )

  const emailField = (
    <Field id="checkout-email" label="Email" error={fieldError?.field === "email" ? fieldError.message : null}>
      <TextInput
        id="checkout-email"
        invalid={fieldError?.field === "email"}
        aria-describedby={fieldError?.field === "email" ? "checkout-email-error" : undefined}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value.slice(0, 254))
          if (fieldError?.field === "email") setFieldError(null)
        }}
      />
    </Field>
  )

  const discount = (suffix: string) => (
    <DiscountForm
      code={code}
      onCode={(v) => {
        setCode(v)
        setCodeError(null)
        setCodeFromLink(false)
      }}
      applied={!!applied}
      label={applied?.label || ""}
      busy={codeBusy}
      error={codeError}
      quiet={codeFromLink}
      onApply={() => void applyCode()}
      onRemove={removeCode}
      idSuffix={suffix}
    />
  )

  const tip = (suffix: string) => (
    <TipPicker
      creatorName={creator.name}
      tipCents={tipCents}
      custom={tipCustom}
      onPreset={(c) => {
        setTipPreset(c)
        setTipCustom("")
      }}
      onCustom={setTipCustom}
      idSuffix={suffix}
    />
  )

  /* The order, as Stripe lays it out: the line, the subtotal with the promotion code under it, the tip as one more line of it, the total due. */
  const details = (suffix: string) => (
    <div className="space-y-6">
      <LineItem product={product} variant={variant} variants={allVariants} onVariant={chooseVariant} priceCents={subtotal} isPwyw={pwywNow} />
      <div className="border-t border-black/[0.07] pt-5">
        <Totals
          part="top"
          subtotal={subtotal}
          discountCents={discountCents}
          discountLabel={applied?.code}
          total={total}
          isPwyw={pwywNow}
          promo={discount(suffix)}
        />
        <div className="mt-5">{tip(suffix)}</div>
        <div className="mt-5">
          <Totals
            part="bottom"
            subtotal={subtotal}
            discountCents={discountCents}
            total={total}
            tax={
              checkoutTax && !isFree
                ? { cents: taxNow?.taxCents ?? 0, rateBps: taxNow?.rateBps ?? 0, label: taxNow?.label, included: checkoutTax.included, country: taxCountry, countries: checkoutTax.regions.map((r) => r.country), onCountry: setTaxCountry, suffix }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  )

  const consent = (
    <div id="checkout-terms">
      <CheckRow id="checkout-agree" checked={agreed} onChange={(v) => { setAgreed(v); if (v) setError(null) }} invalid={!agreed && !!error?.includes("Terms")}>
        I agree to the{" "}
        <Link href="/terms" target="_blank" className="font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]">
          Terms and Conditions
        </Link>{" "}
        and the{" "}
        <Link href="/refund-policy" target="_blank" className="font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]">
          Refund policy
        </Link>
        {waiverSentence(communityTerms) ? `. ${waiverSentence(communityTerms)}` : null}
      </CheckRow>
      {communityTerms?.refundPolicy ? (
        <div className="mt-3">
          <CommunityRefundPolicy terms={communityTerms} />
        </div>
      ) : null}
    </div>
  )

  const beforePay = (
    <>
      {!isFree ? (
        <section aria-label="Invoice">
          <BusinessFields
            on={businessOn}
            onToggle={(on) => {
              setBusinessOn(on)
              setBusinessErrors({})
            }}
            value={business}
            onChange={(next) => {
              setBusiness(next)
              if (Object.keys(businessErrors).length) setBusinessErrors({})
            }}
            errors={businessErrors}
          />
        </section>
      ) : null}
      {consent}
      {error && error !== fieldError?.message ? <ErrorBanner>{error}</ErrorBanner> : null}
    </>
  )

  const payLabel = `Pay ${money(total)}`

  let payment: React.ReactNode
  if (isFree) {
    payment = (
      <div>
        <section aria-labelledby="checkout-contact-free">
          <SectionTitle>
            <span id="checkout-contact-free">Contact information</span>
          </SectionTitle>
          <div className="space-y-3">
            {emailField}
            {namesAndNews}
          </div>
        </section>
        <div className="mt-7 space-y-4">{beforePay}</div>
        <PayDock>
          <PayButton onClick={() => void takeFree()} busy={busy} disabled={!!paid || settled}>
            {busy ? "Processing" : "Get it free"}
          </PayButton>
        </PayDock>
      </div>
    )
  } else if (paymentProvider === "airwallex") {
    /* The card is entered on Airwallex's own page, in the app as on the web (./parts/airwallex-redirect). */
    payment = (
      <div>
        <section aria-labelledby="checkout-contact-awx">
          <SectionTitle>
            <span id="checkout-contact-awx">Contact information</span>
          </SectionTitle>
          <div className="space-y-3">
            {emailField}
            {namesAndNews}
          </div>
        </section>
        <div className="mt-7 space-y-4">{beforePay}</div>
        <p className="mt-5 text-[13px] leading-snug text-[#6b7280]">You enter your card on the next page, run by Airwallex.</p>
        <PayDock className="mt-3">
          <PayButton onClick={() => void payAirwallex()} busy={busy} disabled={!!paid || settled}>
            {busy ? "Opening" : payLabel}
          </PayButton>
        </PayDock>
      </div>
    )
  } else if (nativeApp === null) {
    /* The form's place, held for the one frame before the platform is known. */
    payment = <div aria-hidden className="min-h-[520px]" />
  } else if (nativeApp) {
    payment = (
      <div>
        <section aria-labelledby="checkout-contact-app">
          <SectionTitle>
            <span id="checkout-contact-app">Contact information</span>
          </SectionTitle>
          <div className="space-y-3">
            {emailField}
            {namesAndNews}
          </div>
        </section>
        <section aria-labelledby="checkout-payment-app" className="mt-8">
          <h2 id="checkout-payment-app" className="mb-3 text-[16px] font-semibold text-[#1a1a2e]">
            Payment method
          </h2>
          <NativeWalletButtons
            busy={busy}
            disabled={!!paid || settled}
            onError={setError}
            onPaid={async (paymentIntentId, clientSecret) => {
              secretRef.current = clientSecret
              await finish(paymentIntentId, clientSecret)
            }}
            start={async () => {
              const problem = check("card")
              if (problem) throw new Error(problem)
              const res = await postJson<{ url?: string; sessionId?: string }>("/api/checkout/stripe-session", { ...orderBody(), walletSheet: true })
              if (!res.ok || !res.data.url || !res.data.sessionId) throw new Error(res.data.error || "Apple Pay and Google Pay could not be opened. Nothing was charged.")
              return { url: res.data.url, sessionId: res.data.sessionId }
            }}
            payIntent={async () => {
              const problem = check("card")
              if (problem) throw new Error(problem)
              return createIntent()
            }}
            amountCents={total}
            label={product.title}
          />
          <NativeCardFields value={card} onChange={setCard} />
        </section>
        <div className="mt-7 space-y-4">{beforePay}</div>
        <PayDock>
          <PayButton onClick={() => void payNative()} busy={busy} disabled={!!paid || settled}>
            {busy ? "Processing" : payLabel}
          </PayButton>
        </PayDock>
      </div>
    )
  } else {
    payment = (
      <StripePay
        amountCents={total}
        creatorName={creator.name}
        email={email}
        onEmail={setEmail}
        check={(mode) => check(mode)}
        createIntent={createIntent}
        payerName={() => `${firstName} ${lastName}`.trim()}
        onPaid={onPaid}
        onError={setError}
        /* Still pressed after it worked: nothing is payable twice. */
        busy={busy || !!paid || settled}
        setBusy={setBusy}
        payLabel={payLabel}
        contactExtra={namesAndNews}
        beforePay={beforePay}
      />
    )
  }

  /* The creator, as the bar's name and Back's label. */
  const backLabel = backTo && siteHost ? `Back to ${siteHost}` : "Back"
  /*
    THE CREATOR'S PHOTO, DRAWN THE WAY THE APP DRAWS EVERY AVATAR. It was a
    next/image, which sends every photo through /_next/image, and the
    optimizer refuses any host that is not in next.config's remotePatterns:
    a creator whose photo is the one Google sent at sign up
    (lh3.googleusercontent.com) got a 400 and the browser's broken picture
    icon here, while the receipt, drawing the same address as a plain <img>,
    showed it. AppAvatar sends only hosts the optimizer accepts through it
    and loads any other as it is, fades the photo in when it arrives, and
    draws the initials when there is none or it fails. The name is already
    written beside it, so the picture says nothing more (alt="").
  */
  const creatorFace = (
    <AppAvatar
      src={creator.avatar_url}
      name={creator.name}
      alt=""
      size={28}
      className="shadow-[0_0_0_1px_rgba(17,17,19,0.06),0_1px_2px_rgba(17,17,19,0.08)]"
    />
  )

  return (
    <>
    <div
      ref={pageRef}
      data-page="checkout"
      data-leaving={going ?? undefined}
      /* Under the paid check, nothing behind it can be reached. */
      inert={!!paid}
      className={cn(
        "group/page relative min-h-screen bg-white transition-opacity duration-100 lg:bg-[#f8f9fa]",
        /* The press answered on the next frame: the page eases back a shade as it goes. */
        "data-[leaving]:pointer-events-none data-[leaving]:opacity-80",
      )}
    >
      <HtmlClass name="with-page-checkout" />
      {/*
        THE SPLIT, WITH DEPTH. The grey half is the order, the white half is
        the form, and the white half sits over the grey on a long soft shadow,
        the way Stripe Checkout's two halves read as a sheet on a desk. "Too
        much depth shadow" on the split: shorter and fainter than it was
        (-12px 32px at 0.16), so the halves meet on a hint of depth rather
        than a ridge. The grey is the app's own #f8f9fa, a shade lighter than
        before, still clearly apart from the white.
      */}
      <div aria-hidden className="pointer-events-none fixed inset-y-0 right-0 hidden w-1/2 bg-white shadow-[-8px_0_24px_-14px_rgba(17,24,39,0.11)] lg:block" />

      {/*
        ═══════════════════════════════════════════════════════════════════
         THE BAR ACROSS THE TOP
        ═══════════════════════════════════════════════════════════════════
        White, on a hairline and one soft shadow, just enough to sit over
        both halves of the page (a touch less deep than it was: the shadow
        under the hairline was 6px 16px at 0.12). Back on the left as a quiet rounded square
        with a faint lip (no circle, no raised disc), with a 44px target
        around its 36px face; the creator beside it, which opens their page; Continue
        shopping on the right, which goes to the product. Its edges line up
        with the two columns under it. Not animated in with the halves: it is
        the frame they arrive into. Its presses use named groups (group/back,
        group/shop): on a touch screen globals.css stops every transition
        inside a plain `.group`, which would make the press and the held-back
        spinner snap on exactly the phones they are for.
      */}
      <header
        data-checkout-bar=""
        className="relative z-10 bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(17,17,19,0.055),0_4px_12px_-10px_rgba(17,17,19,0.09)]"
      >
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-1.5 px-4 sm:px-7 lg:h-16 lg:px-[60px]">
          <ReturnLink
            href={productUrl}
            onClick={goBack}
            aria-label={backLabel}
            title={backLabel}
            data-back=""
            className="group/back grid h-11 w-11 shrink-0 place-items-center rounded-[12px] outline-none [-webkit-tap-highlight-color:transparent]"
          >
            <span
              data-back-face=""
              className={cn(
                "relative grid h-9 w-9 place-items-center rounded-[10px] border border-black/[0.06] bg-white text-[#1a1a2e] shadow-[0_1px_1px_rgba(17,17,19,0.04),0_1px_3px_-1px_rgba(17,17,19,0.06)] transition-[scale,background-color] duration-150 ease-out group-hover/back:bg-[#f7f7f8] group-active/back:scale-[0.94] group-active/back:bg-[#f1f2f4] group-focus-visible/back:outline-2 group-focus-visible/back:outline-offset-2 group-focus-visible/back:outline-[#1a1a2e] motion-reduce:transition-none",
                /* Pressed, and it stays pressed until the page behind is here. */
                "group-data-[leaving=back]/page:scale-[0.94] group-data-[leaving=back]/page:bg-[#f1f2f4]",
              )}
            >
              <ArrowLeft
                aria-hidden
                strokeWidth={2}
                className={cn(
                  "h-[18px] w-[18px] transition-[opacity,translate] duration-200 ease-out",
                  leaving ? "opacity-0 delay-[250ms]" : "group-hover/back:-translate-x-px",
                )}
              />
              {leaving ? (
                <Spinner late className="absolute h-4 w-4 text-[#6b7280]" />
              ) : null}
            </span>
          </ReturnLink>

          {creatorHref !== "#" ? (
            <ReturnLink
              href={creatorHref}
              onClick={(e) => {
                if (plainClick(e)) startGoing("creator")
              }}
              data-creator-link=""
              className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-[14px] font-medium text-[#1a1a2e] outline-none transition-[opacity] duration-150 hover:bg-black/[0.035] focus-visible:outline-2 focus-visible:outline-[#1a1a2e]/40 active:opacity-70 [-webkit-tap-highlight-color:transparent]"
            >
              {creatorFace}
              <span className="truncate">{creator.name}</span>
            </ReturnLink>
          ) : (
            <span className="flex min-w-0 items-center gap-2 py-1 pl-1 pr-2.5 text-[14px] font-medium text-[#1a1a2e]">
              {creatorFace}
              <span className="truncate">{creator.name}</span>
            </span>
          )}

          <Link
            href={shopUrl}
            prefetch={false}
            onClick={goShopping}
            data-continue=""
            className="group/shop ml-auto mr-1 grid min-h-[44px] shrink-0 place-items-center outline-none [-webkit-tap-highlight-color:transparent]"
          >
            <span
              className={cn(
                "inline-flex h-9 items-center rounded-[9px] border border-[#e1e3e7] bg-white px-3.5 text-[13.5px] font-medium text-[#1a1a2e] shadow-[0_1px_1px_rgba(17,17,19,0.04)] transition-[scale] duration-150 ease-out group-hover/shop:border-[#d2d5da] group-hover/shop:bg-[#fafafb] group-active/shop:scale-[0.97] group-active/shop:bg-[#f3f4f6] group-focus-visible/shop:outline-2 group-focus-visible/shop:outline-offset-2 group-focus-visible/shop:outline-[#1a1a2e] motion-reduce:transition-none",
                "group-data-[leaving=shop]/page:scale-[0.97] group-data-[leaving=shop]/page:bg-[#f3f4f6]",
              )}
            >
              Continue shopping
            </span>
          </Link>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-[1120px] lg:grid-cols-2">
        {/* ── The order ─────────────────────────────────────────────── */}
        <section
          aria-label="Order summary"
          data-summary=""
          className="checkout-enter border-b border-black/[0.06] bg-[#f8f9fa] px-5 pb-6 pt-6 sm:px-8 lg:border-b-0 lg:bg-transparent lg:px-16 lg:pb-16 lg:pt-12"
        >
          <div className="mx-auto w-full max-w-[440px] lg:ml-auto lg:mr-0 lg:sticky lg:top-12">
            <div>
              <p className="text-[15px] font-medium text-[#6b7280]">Pay {creator.name}</p>
              <p data-total="" className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-[#1a1a2e] sm:text-[36px]">
                {money(total)}
              </p>
            </div>

            {/* A phone shows the order open, with a way to fold it; a computer always shows it.
                The two words are laid over each other and cross-fade, so the
                button keeps its width instead of jumping between them. */}
            <button
              type="button"
              onClick={() => setSummaryOpen((o) => !o)}
              aria-expanded={summaryOpen}
              aria-controls="checkout-details"
              className="mt-3 inline-flex h-8 cursor-pointer items-center gap-1 rounded-[6px] bg-[#e9ebee] px-2.5 text-[13px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#e1e3e7] active:bg-[#d9dce1] lg:hidden [-webkit-tap-highlight-color:transparent]"
            >
              <span className="grid justify-items-center">
                <span aria-hidden={!summaryOpen} className={cn("[grid-area:1/1] transition-opacity duration-200", summaryOpen ? "opacity-100" : "opacity-0")}>
                  Hide details
                </span>
                <span aria-hidden={summaryOpen} className={cn("[grid-area:1/1] transition-opacity duration-200", summaryOpen ? "opacity-0" : "opacity-100")}>
                  Details
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className={cn("h-3.5 w-3.5 text-[#6b7280] transition-[rotate] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", summaryOpen && "rotate-180")}
              />
            </button>
            <Reveal id="checkout-details" open={summaryOpen || wide} tall>
              <div className="pt-6 lg:pt-10">{details("")}</div>
            </Reveal>
          </div>
        </section>

        {/* ── The form ──────────────────────────────────────────────── */}
        <main className="checkout-enter px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-8 lg:px-16 lg:pb-16 lg:pt-12 [animation-delay:60ms]">
          <div className="mx-auto w-full max-w-[440px] lg:ml-0 lg:mr-auto">
            {payment}
            {/* Under the button, paid or free. */}
            <PoweredByStripe />
          </div>
        </main>
      </div>

    </div>
    {/* Beside the page, not in it: the page is inert once paid, and an inert status would never be read out. */}
    <PaidOverlay
      state={paid ? "paid" : arriving ? "finishing" : null}
      total={paid?.total ?? 0}
      free={!!paid?.free}
      returningTo={returnTo ? returnHostLabel(returnTo) : null}
    />
    </>
  )
}

"use client"

/**
 * ===========================================================================
 *  THE PREVIEW IS THE LIVE PAGE, IN A FRAME
 * ===========================================================================
 * The editor's preview used to be a second drawing of the OnePage, five
 * thousand lines of it (phone-preview.tsx), kept beside the live page's
 * own and drifting from it one change at a time: other text sizes, other
 * heights, a card around a form that the live page did not have. Measured
 * with scripts/check-onepage-parity.mjs, every block differed from the live
 * page in every theme.
 *
 * So the preview is not drawn any more. This document, at /onepage-preview,
 * holds the live page's own component (components/onepage/public-onepage)
 * and the editor frames it (components/onepage/live-preview). The editor
 * posts the page as it is being edited, in the shape the published page is
 * built from (lib/onepage/public-shape), and this draws it. A frame 390 wide
 * is a phone 390 wide: the page's breakpoints, its fixed buttons and its
 * sheets behave exactly as they do on one.
 *
 * WHAT THE PREVIEW ADDS, AND ONLY THAT:
 *
 *   nothing leaves     a visitor's writes (a click counted, an email given,
 *                      a free product claimed, a subscription) are answered
 *                      here and never sent, so trying the page in the
 *                      editor records nothing and emails nobody
 *   links open aside   a link that would take this frame somewhere else
 *                      opens in a new tab instead, and the editor stays
 *   nothing kept       what the page remembers in the browser (a form sent,
 *                      a product bought) is kept for this frame only
 *   its products, now  a product block is resolved against the product row,
 *                      as the live page does on every render
 *                      (lib/onepage/live-products.ts): an archived,
 *                      unpublished or deleted product is not drawn, and a
 *                      live one shows its current title, price and picture.
 *                      The editor's own copy of the block cannot say that.
 *                      Read with the creator's session, which sees their own
 *                      products whatever their status; a read that fails
 *                      leaves the blocks as they are.
 *
 * The messages come only from the page that framed this one, on this
 * origin: a page elsewhere cannot frame this address at all (proxy.ts), and
 * one that could would have nothing to show.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { answersForBlocks, productIdsInBlocks, resolveProductBlocks, type ProductAnswers, type ProductsDb } from "@/lib/onepage/live-products"
import { createClient } from "@/lib/supabase/client"
import { ExtraBlockPreviewContext } from "@/components/onepage/extra-blocks"
import { ONEPAGE_PREVIEW_CHANNEL, type PreviewMessage } from "@/lib/onepage/preview-channel"
import type { PublicOnePageData } from "@/lib/onepage/public-shape"
import { familyOf, onePageFontHref } from "@/lib/onepage/fonts"
import { PriceCurrency } from "@/components/platform/price-currency"

/** The writes a visitor's page makes, answered here instead of by the server. */
const WRITES = /^\/api\/(onepage\/(track|leads|email-capture)|subscribe|checkout\/|download\/|purchases\/)/

function sandboxWrites() {
  const w = window as Window & { __onepagePreviewSandbox?: boolean }
  if (w.__onepagePreviewSandbox) return
  w.__onepagePreviewSandbox = true

  const realFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href)
      if (url.origin === window.location.origin && WRITES.test(url.pathname)) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, preview: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      }
    } catch {
      /* not a URL this could read: let it through as it was */
    }
    return realFetch(input as RequestInfo, init)
  }
  if (typeof navigator.sendBeacon === "function") {
    const realBeacon = navigator.sendBeacon.bind(navigator)
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      try {
        if (WRITES.test(new URL(String(url), window.location.href).pathname)) return true
      } catch {
        /* as above */
      }
      return realBeacon(url, data)
    }
  }

  /* What the page keeps in the browser stays in this frame. */
  try {
    const mine = new Map<string, string>()
    const memory: Storage = {
      get length() { return mine.size },
      clear: () => mine.clear(),
      getItem: (k) => (mine.has(k) ? (mine.get(k) as string) : null),
      key: (i) => [...mine.keys()][i] ?? null,
      removeItem: (k) => { mine.delete(k) },
      setItem: (k, v) => { mine.set(k, String(v)) },
    }
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => memory })
  } catch {
    /* a browser that will not let it be replaced keeps its own */
  }

  /* A link that would move this frame opens in a tab of its own. */
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.hasAttribute("download")) return
      const href = a.getAttribute("href") || ""
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return
      if (a.target && a.target !== "_self") return
      e.preventDefault()
      window.open(a.href, "_blank", "noopener,noreferrer")
    },
    true,
  )
}

/*
  A NEW THEME IS DRAWN WITH ITS OWN FACES, NOT A FRAME OF ANOTHER. Picking a
  theme with other fonts drew the page at once in the fallback face, then
  swapped to the theme's face when it came in a moment later: every line of
  the page jumped. The new faces are fetched here first and the page is
  drawn once they are in, or after FONT_WAIT_MS, whichever is first. Each
  face is fetched once per frame and kept.
*/
const FONT_WAIT_MS = 450
const fontLoads = new Map<string, { done: boolean; ready: Promise<void> }>()

function loadFace(family: string): { done: boolean; ready: Promise<void> } | null {
  const href = onePageFontHref(family)
  if (!href) return null
  const known = fontLoads.get(href)
  if (known) return known
  const entry = { done: false, ready: Promise.resolve() }
  entry.ready = new Promise<void>((resolve) => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    link.setAttribute("data-onepage-font-warm", "")
    link.onload = () => {
      const faces = document.fonts
      if (!faces?.load) return resolve()
      Promise.all([faces.load(`400 1em "${family}"`), faces.load(`700 1em "${family}"`)]).then(() => resolve(), () => resolve())
    }
    link.onerror = () => resolve()
    document.head.appendChild(link)
  }).then(() => { entry.done = true })
  fontLoads.set(href, entry)
  return entry
}

/** Null when the page's faces are in; else a promise that settles when they are. */
function facesPending(page: PublicOnePageData): Promise<void> | null {
  const t = (page as { theme?: { font_family?: unknown; title_font?: unknown } }).theme
  const waits = [familyOf(t?.font_family), familyOf(t?.title_font)]
    .map((f) => (f ? loadFace(f) : null))
    .filter((e): e is { done: boolean; ready: Promise<void> } => !!e && !e.done)
  return waits.length ? Promise.all(waits.map((e) => e.ready)).then(() => undefined) : null
}

/** How long the first drawing waits for the product answers before it draws the blocks as they are. */
const ANSWER_WAIT_MS = 1000

export function OnePagePreviewDocument() {
  /* The page as the editor sent it; `page` below is what is drawn. */
  const [sent, setSent] = useState<PublicOnePageData | null>(null)
  /* The store's currency, sent with the page: the live route wraps the page in it (PriceCurrency), so this does too. */
  const [currency, setCurrency] = useState<string | null>(null)
  const drawn = useRef(false)

  /*
    WHAT THE CATALOGUE SAYS ABOUT THE PRODUCTS THE PAGE NAMES. Asked again
    only when the page names a product it has not asked about, so typing in
    the editor does not read the database on every key.
  */
  const [answers, setAnswers] = useState<ProductAnswers>(() => new Map())
  const asked = useRef(new Set<string>())
  const [waited, setWaited] = useState(false)
  const sellerId = sent?.seller_id ?? null
  const blocks = sent?.blocks
  useEffect(() => {
    if (!sellerId || !blocks) return
    const fresh = productIdsInBlocks(blocks).filter((id) => !asked.current.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) asked.current.add(id)
    let db: ProductsDb
    try {
      db = createClient() as unknown as ProductsDb
    } catch {
      return
    }
    answersForBlocks(db, sellerId, blocks)
      .then((got) => {
        if (got.size > 0) setAnswers((prev) => new Map([...prev, ...got]))
      })
      .catch(() => {
        /* Fail open: the blocks stay as the editor has them. */
      })
  }, [sellerId, blocks])
  useEffect(() => {
    if (!sent || waited) return
    const t = window.setTimeout(() => setWaited(true), ANSWER_WAIT_MS)
    return () => window.clearTimeout(t)
  }, [sent, waited])

  /* Held back only until the first answers are in, or a second has gone, so an archived product does not flash in and out. */
  const unanswered = !!sent?.seller_id && productIdsInBlocks(sent.blocks).some((id) => !answers.has(id))
  const page = useMemo(() => (sent ? { ...sent, blocks: resolveProductBlocks(sent.blocks, answers) } : null), [sent, answers])
  const ready = !!page && (waited || !unanswered)

  useLayoutEffect(() => {
    sandboxWrites()
  }, [])

  useEffect(() => {
    const parent = window.parent
    if (!parent || parent === window) return
    let latest = 0
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== parent) return
      const data = e.data as PreviewMessage | null
      if (!data || data.channel !== ONEPAGE_PREVIEW_CHANNEL || data.kind !== "page") return
      const n = ++latest
      setCurrency(data.currency ?? null)
      const page = data.page
      /* The first drawing waits for its fonts on its own (below); a later one with new faces waits for them here. */
      const pending = drawn.current ? facesPending(page) : (facesPending(page), null)
      if (!pending) {
        setSent(page)
        return
      }
      let timer = 0
      const cap = new Promise<void>((r) => { timer = window.setTimeout(r, FONT_WAIT_MS) })
      Promise.race([pending, cap]).then(() => {
        window.clearTimeout(timer)
        /* Only the newest page is drawn: one sent while this waited has already won. */
        if (n === latest) setSent(page)
      })
    }
    window.addEventListener("message", onMessage)
    /* Here, and ready for the page: the editor answers with it. */
    parent.postMessage({ channel: ONEPAGE_PREVIEW_CHANNEL, kind: "ready" } satisfies PreviewMessage, window.location.origin)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  /* Drawn once, with its fonts: the editor's loader can go (components/onepage/onepage-editor). */
  useEffect(() => {
    if (!ready || drawn.current) return
    drawn.current = true
    let done = false
    const say = () => {
      if (done) return
      done = true
      window.parent?.postMessage({ channel: ONEPAGE_PREVIEW_CHANNEL, kind: "drawn" } satisfies PreviewMessage, window.location.origin)
    }
    const fonts = document.fonts?.ready ?? Promise.resolve()
    /* Fonts that do not come in a second are not waited for. */
    const cap = window.setTimeout(say, 1200)
    fonts.then(() => requestAnimationFrame(() => requestAnimationFrame(say)))
    return () => window.clearTimeout(cap)
  }, [ready])

  if (!page || !ready) return null
  return (
    /* The editor's, so a map waits for the typing to stop (components/onepage/extra-blocks). */
    <ExtraBlockPreviewContext.Provider value={true}>
      <PriceCurrency currency={currency}>
        <PublicOnePage onepage={page as never} />
      </PriceCurrency>
    </ExtraBlockPreviewContext.Provider>
  )
}

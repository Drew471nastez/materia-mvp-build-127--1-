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

/** How long the first drawing waits for the product answers before it draws the blocks as they are. */
const ANSWER_WAIT_MS = 1000

export function OnePagePreviewDocument() {
  /* The page as the editor sent it; `page` below is what is drawn. */
  const [sent, setSent] = useState<PublicOnePageData | null>(null)
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
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== parent) return
      const data = e.data as PreviewMessage | null
      if (!data || data.channel !== ONEPAGE_PREVIEW_CHANNEL || data.kind !== "page") return
      setSent(data.page)
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
      <PublicOnePage onepage={page as never} />
    </ExtraBlockPreviewContext.Provider>
  )
}

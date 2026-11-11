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
 *   nothing leaves     a link that would take this frame somewhere else
 *                      (or open a tab) stays put and says it opens on the
 *                      live page; a payment says it is a preview
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
import { PREVIEW_SHOWN_EVENT } from "@/components/onepage/block-entrance"
import { answersForBlocks, productIdsInBlocks, resolveProductBlocks, type ProductAnswers, type ProductsDb } from "@/lib/onepage/live-products"
import { createClient } from "@/lib/supabase/client"
import { ExtraBlockPreviewContext } from "@/components/onepage/extra-blocks"
import { ONEPAGE_PREVIEW_CHANNEL, type PreviewMessage } from "@/lib/onepage/preview-channel"
import type { PublicOnePageData } from "@/lib/onepage/public-shape"
import { familyOf, onePageFontHref } from "@/lib/onepage/fonts"
import { PriceCurrency } from "@/components/platform/price-currency"
import { PREVIEW_NOTICE_EVENT, showPreviewNotice, type PreviewNoticeKind } from "@/lib/onepage/preview-notice"
import { tt } from "@/lib/i18n/text"
import { blockIdAt, pickAction, validBlockId } from "@/lib/onepage/preview-select"

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

  /*
    NOTHING TAKES THE CREATOR OUT OF THE PREVIEW (round 11, the owner: "When
    I click buttons, it should not take me outside of it"). A link used to
    open in a tab of its own, over the editor. Now a link that would leave
    (another page, another site, the checkout, mail, a phone number, a new
    tab) stays where it is, and a short note says it opens on the live page
    (lib/onepage/preview-notice). Heard on the window after the page's own
    handlers, so what the page does in place (a product's sheet, the checkout
    window, a #section) still happens: those cancel the click themselves.
  */
  window.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0) return
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
    if (!a) return
    const href = a.getAttribute("href") || ""
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return
    /* The same page with a #part: a jump inside it, not a way out. */
    try {
      const u = new URL(a.href, window.location.href)
      if (u.origin === window.location.origin && u.pathname === window.location.pathname && u.search === window.location.search && u.hash) return
    } catch {
      /* not an address this can read: stopped like any other */
    }
    e.preventDefault()
    showPreviewNotice("link")
  })
  /* And a window opened by the page itself (a share, a PDF, a booking link): the same note, nothing opened. */
  window.open = ((..._args: unknown[]) => {
    showPreviewNotice("link")
    return null
  }) as typeof window.open
  /* A form that would post to another page. */
  document.addEventListener("submit", (e) => {
    if (e.defaultPrevented) return
    const form = e.target as HTMLFormElement | null
    if (!form || !form.getAttribute("action")) return
    e.preventDefault()
    showPreviewNotice("link")
  })
}

/**
 * The note itself: a small dark pill at the foot of the frame, in for a
 * moment and out again. One at a time; a second tap restarts it.
 */
function PreviewNoticeHost() {
  const [shown, setShown] = useState<PreviewNoticeKind | null>(null)
  const [up, setUp] = useState(false)
  useEffect(() => {
    let hide = 0
    let clear = 0
    const on = (e: Event) => {
      const kind = ((e as CustomEvent<{ kind?: PreviewNoticeKind }>).detail?.kind ?? "link") as PreviewNoticeKind
      window.clearTimeout(hide)
      window.clearTimeout(clear)
      setShown(kind)
      requestAnimationFrame(() => setUp(true))
      hide = window.setTimeout(() => setUp(false), 1800)
      clear = window.setTimeout(() => setShown(null), 2100)
    }
    window.addEventListener(PREVIEW_NOTICE_EVENT, on)
    return () => {
      window.removeEventListener(PREVIEW_NOTICE_EVENT, on)
      window.clearTimeout(hide)
      window.clearTimeout(clear)
    }
  }, [])
  if (!shown) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[2147483000] flex justify-center px-4 pb-[max(20px,env(safe-area-inset-bottom))]" data-preview-notice={shown}>
      <p
        role="status"
        aria-live="polite"
        className="rounded-full bg-[#111113] px-4 py-2.5 text-[13.5px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.2),0_8px_24px_-8px_rgba(0,0,0,0.35)] transition-[opacity,translate] duration-200 ease-out"
        style={{ opacity: up ? 1 : 0, translate: up ? "0 0" : "0 8px" }}
      >
        {shown === "payment" ? tt("This is a preview. Nothing is charged here.") : tt("Opens on your live page")}
      </p>
    </div>
  )
}

/**
 * ROUND AR: PICK A BLOCK. With the editor's select mode on, the block under
 * the pointer wears a quiet ring (white then ink, so it reads on a light or
 * a dark page), moved with transforms on one fixed layer, read once a
 * frame; a click on a block that is not the open one is taken before the
 * page hears it (window, capture) and sent to the editor. The open block's
 * own ring stays while it is open, and a click on it goes to the page.
 */
function BlockPicker({ selected }: { selected: string | null }) {
  const hoverRef = useRef<HTMLDivElement>(null)
  const openRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  useEffect(() => {
    let hovered: Element | null = null
    let frame = 0
    const place = (ring: HTMLDivElement | null, el: Element | null) => {
      if (!ring) return
      if (!el || !el.isConnected) {
        ring.style.opacity = "0"
        return
      }
      const r = el.getBoundingClientRect()
      ring.style.transform = `translate(${r.left - 4}px, ${r.top - 4}px)`
      ring.style.width = `${r.width + 8}px`
      ring.style.height = `${r.height + 8}px`
      ring.style.opacity = "1"
    }
    const openEl = () => (selectedRef.current ? document.querySelector(`[data-op-block="${CSS.escape(selectedRef.current)}"]`) : null)
    const draw = () => {
      frame = 0
      const open = openEl()
      place(hoverRef.current, hovered && hovered !== open ? hovered : null)
      place(openRef.current, open)
    }
    const later = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return
      const id = blockIdAt(e.target)
      const el = id ? (e.target as Element).closest("[data-op-block]") : null
      if (el === hovered) return
      hovered = el
      document.documentElement.style.cursor = el ? "pointer" : ""
      later()
    }
    const onLeave = () => {
      hovered = null
      document.documentElement.style.cursor = ""
      later()
    }
    const onClick = (e: MouseEvent) => {
      const hit = blockIdAt(e.target)
      if (pickAction({ mode: true, selected: selectedRef.current, hit, button: e.button, modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey }) !== "select" || !hit) return
      e.preventDefault()
      e.stopImmediatePropagation()
      window.parent?.postMessage({ channel: ONEPAGE_PREVIEW_CHANNEL, kind: "select", id: hit } satisfies PreviewMessage, window.location.origin)
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    document.documentElement.addEventListener("pointerleave", onLeave)
    window.addEventListener("click", onClick, true)
    window.addEventListener("scroll", later, { passive: true, capture: true })
    window.addEventListener("resize", later)
    later()
    return () => {
      cancelAnimationFrame(frame)
      document.documentElement.style.cursor = ""
      window.removeEventListener("pointermove", onMove)
      document.documentElement.removeEventListener("pointerleave", onLeave)
      window.removeEventListener("click", onClick, true)
      window.removeEventListener("scroll", later, true)
      window.removeEventListener("resize", later)
    }
  }, [])
  /* The open block moves when the page redraws (an edit): its ring is put back on the next frame. */
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const ring = openRef.current
      const el = selected ? document.querySelector(`[data-op-block="${CSS.escape(selected)}"]`) : null
      if (!ring) return
      if (!el) {
        ring.style.opacity = "0"
        return
      }
      const r = el.getBoundingClientRect()
      ring.style.transform = `translate(${r.left - 4}px, ${r.top - 4}px)`
      ring.style.width = `${r.width + 8}px`
      ring.style.height = `${r.height + 8}px`
      ring.style.opacity = "1"
    })
    return () => cancelAnimationFrame(id)
  })
  const ring = "pointer-events-none fixed left-0 top-0 z-[2147482000] rounded-[16px] opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none"
  return (
    <>
      <div ref={hoverRef} aria-hidden data-pick-hover="" className={ring} style={{ boxShadow: "0 0 0 1.5px rgba(255,255,255,0.9), 0 0 0 3px rgba(26,26,46,0.55)" }} />
      <div ref={openRef} aria-hidden data-pick-open="" className={ring} style={{ boxShadow: "0 0 0 1.5px rgba(255,255,255,0.95), 0 0 0 3.5px #1a1a2e" }} />
    </>
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
  /* Round AR: whether a click picks a block for the editor, and which block is open there. */
  const [pick, setPick] = useState<{ on: boolean; selected: string | null }>({ on: false, selected: null })

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
  /*
    AND ASKED AGAIN WHEN THE CREATOR COMES BACK (r40, "preview accurate and in
    sync with the live website"). The answers were kept for as long as the
    frame lived, and the editor keeps its frame: a price changed, a product
    archived or renamed in another tab was still drawn the old way here while
    the live page, which reads the catalogue on every request, had moved on.
    Coming back to the editor's tab asks about every product on the page once
    more, so the two say the same thing again.
  */
  const [round, setRound] = useState(0)
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== "visible") return
      asked.current.clear()
      setRound((n) => n + 1)
    }
    document.addEventListener("visibilitychange", back)
    return () => document.removeEventListener("visibilitychange", back)
  }, [])
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
  }, [sellerId, blocks, round])
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
      if (!data || data.channel !== ONEPAGE_PREVIEW_CHANNEL) return
      /* Round AR: the phone beside the editor picks blocks (lib/onepage/preview-select). */
      if (data.kind === "select-mode") {
        setPick({ on: data.on === true, selected: validBlockId(data.selected) ? data.selected : null })
        return
      }
      if (data.kind !== "page") return
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
      /* The editor shows the frame now: the blocks' entrance starts (components/onepage/block-entrance). */
      ;(window as Window & { __onepagePreviewShown?: boolean }).__onepagePreviewShown = true
      window.dispatchEvent(new Event(PREVIEW_SHOWN_EVENT))
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
      <PreviewNoticeHost />
      {pick.on ? <BlockPicker selected={pick.selected} /> : null}
    </ExtraBlockPreviewContext.Provider>
  )
}

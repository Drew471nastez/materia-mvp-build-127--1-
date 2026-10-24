"use client"

/**
 * ===========================================================================
 *  SEARCH IN A WINDOW OVER THE PAGE
 * ===========================================================================
 * Header › When search is clicked › Open a search window. The third answer
 * beside the field over the header row and the search page: a window that
 * comes down over the page with the field already focused, and the store's
 * products listed under it as the visitor types.
 *
 * THE SAME SEARCH AS THE SEARCH PAGE. It asks /api/website-builder/search,
 * which filters with `productMatchesQuery`, the rule /search itself uses, so
 * the window never finds something the page would not, and "View all" never
 * shows fewer than the window did.
 *
 * THE SAME FRAME AS THE DRAWERS. Portalled, pinned and locked by
 * useDrawerFrame, in the editor's canvas and on the live page alike, and in
 * the page only while open or closing. It comes in on transform and opacity,
 * started on a painted frame (useDrawerMotion), and leaves the same way.
 *
 * A REAL FORM. `action="/search"` with a `q`, so Enter works before any
 * script and from a keyboard. In the canvas the builder opens its search page
 * instead.
 *
 * Also opened by any element marked `data-storelib-search` in a section of
 * the creator's own (see sections/site-chrome-hooks.tsx), so a header written as a
 * .storelib file gets the same window.
 */
import { ChevronRight, Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { ProductImg, isDarkColor } from "@/components/media/missing-image"
import type { ColorSchemeValues } from "@/lib/website-builder/types"
import {
  DRAWER_BACKDROP_Z,
  DRAWER_PANEL_Z,
  useBackdropDismiss,
  useComposedRef,
  useDrawerFrame,
  useDrawerMotion,
  useDrawerPresence,
  useFocusTrap,
} from "./drawer-frame"
import { useMoney, useStorefront } from "./theme/storefront-context"
import { priceCentsFrom } from "@/lib/website-builder/storefront-hooks"

export interface SearchHit {
  id: string
  title: string
  price: string
  image: string
  url: string
}

/**
 * The query, and what the store's search answers for it, while the window is
 * open. Debounced, and aborted on the next keystroke, so an answer to "te"
 * arriving after "tech" never replaces the right list with the wrong one.
 */
export function useLiveSearch(open: boolean) {
  const { creatorId, installId } = useStorefront()
  const askAs = creatorId ? `creator=${encodeURIComponent(creatorId)}` : installId ? `install=${encodeURIComponent(installId)}` : ""
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [asked, setAsked] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) return
    setQ("")
    setHits([])
    setTotal(0)
    setAsked("")
  }, [open])

  useEffect(() => {
    const term = q.trim()
    if (!askAs || !term) { setHits([]); setTotal(0); setAsked(""); setBusy(false); return }
    const ctrl = new AbortController()
    setBusy(true)
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/website-builder/search?${askAs}&q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        if (!res.ok) return
        const data = (await res.json()) as { items?: SearchHit[]; total?: number }
        setHits(Array.isArray(data.items) ? data.items : [])
        setTotal(typeof data.total === "number" ? data.total : 0)
        setAsked(term)
      } catch {
        /* Aborted, or offline. The list stays as it was. */
      } finally {
        if (!ctrl.signal.aborted) setBusy(false)
      }
    }, 180)
    return () => { window.clearTimeout(id); ctrl.abort() }
  }, [q, askAs])

  return { q, setQ, hits, total, asked, busy, answered: asked !== "" && asked === q.trim() }
}

export function SearchModal({
  open,
  onClose,
  scheme,
  radius,
  placeholder,
  scopedToPreview,
  onEditorNavigate,
}: {
  open: boolean
  onClose: () => void
  scheme: ColorSchemeValues
  /** The theme's button corner, for the field. */
  radius: CSSProperties
  placeholder: string
  scopedToPreview: boolean
  onEditorNavigate?: (href: string, fromNav?: boolean) => void
}) {
  const { mounted, target, positionClass, frameStyle } = useDrawerFrame(open, scopedToPreview, onClose)
  const present = useDrawerPresence(open)
  if (!mounted || !target || !present) return null
  return createPortal(
    <SearchModalInner
      open={open}
      onClose={onClose}
      scheme={scheme}
      radius={radius}
      placeholder={placeholder}
      scopedToPreview={scopedToPreview}
      onEditorNavigate={onEditorNavigate}
      positionClass={positionClass}
      frameStyle={frameStyle}
    />,
    target,
  )
}

function SearchModalInner({
  open,
  onClose,
  scheme,
  radius,
  placeholder,
  scopedToPreview,
  onEditorNavigate,
  positionClass,
  frameStyle,
}: {
  open: boolean
  onClose: () => void
  scheme: ColorSchemeValues
  radius: CSSProperties
  placeholder: string
  scopedToPreview: boolean
  onEditorNavigate?: (href: string, fromNav?: boolean) => void
  positionClass: string
  frameStyle: CSSProperties
}) {
  /* A result's price as the cards on the page show it: the visitor's market's currency when the page converts, else the store's as the search wrote it. */
  const money = useMoney()
  const converting = !!useStorefront().display
  const shownPrice = (text: string) => (converting && priceCentsFrom(text) > 0 ? `${money(priceCentsFrom(text))}${/\/month$/.test(text) ? "/month" : ""}` : text)
  const { q, setQ, hits, total, asked, answered } = useLiveSearch(open)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const keepPanel = useCallback((node: HTMLDivElement | null) => { panelRef.current = node }, [])

  /* The window drops a little and fades in; the dark comes up with it. */
  const movePanel = useDrawerMotion(open, "transform", "translate3d(0, -16px, 0) scale(0.98)", "translate3d(0, 0, 0) scale(1)")
  const fadeFrame = useDrawerMotion(open, "opacity", "0", "1")
  const fadeBackdrop = useDrawerMotion(open, "opacity", "0", "1")
  const pressBackdrop = useBackdropDismiss(open, onClose)
  const backdropRef = useComposedRef(pressBackdrop, fadeBackdrop)
  const panelRefs = useComposedRef(movePanel, keepPanel)
  useFocusTrap(open, panelRef, !scopedToPreview)

  useEffect(() => {
    if (!open) {
      const active = document.activeElement as HTMLElement | null
      if (active && panelRef.current?.contains(active)) active.blur()
      return
    }
    /* After the frame the window becomes interactive on, or iOS declines to raise the keyboard. */
    const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60)
    return () => window.clearTimeout(id)
  }, [open])

  const go = (href: string) => (e: React.MouseEvent) => {
    if (!onEditorNavigate) { onClose(); return }
    e.preventDefault()
    e.stopPropagation()
    onClose()
    onEditorNavigate(href, true)
  }
  const viewAll = `/search?q=${encodeURIComponent(q.trim())}`
  const muted = { color: scheme.heading, opacity: 0.6 }

  return (
    <>
      <div
        aria-hidden
        data-site-drawer-backdrop=""
        ref={backdropRef}
        className={cn(positionClass, "left-0 right-0 bg-black/50", DRAWER_BACKDROP_Z)}
        style={{ ...frameStyle, pointerEvents: open ? "auto" : "none" }}
      />
      {/* The frame fades; the window inside it travels. Presses outside the window fall through to the backdrop. */}
      <div
        ref={fadeFrame}
        className={cn(positionClass, "left-0 right-0 flex justify-center px-3 sm:px-6", DRAWER_PANEL_Z)}
        style={{ ...frameStyle, pointerEvents: "none", paddingTop: "max(12px, min(10vh, 96px))" }}
      >
        <div
          ref={panelRefs}
          role="dialog"
          aria-modal={open ? true : undefined}
          aria-hidden={!open}
          aria-label="Search"
          data-site-drawer="search"
          data-chrome=""
          data-self-nav=""
          data-popup=""
          className="flex h-fit max-h-full w-full max-w-[640px] flex-col overflow-hidden"
          style={{
            background: scheme.bg,
            color: scheme.heading,
            pointerEvents: open ? "auto" : "none",
            borderRadius: "var(--theme-popup-radius, 12px)",
            boxShadow: "0 24px 60px -24px rgba(0, 0, 0, 0.45)",
          }}
        >
          <form
            action="/search"
            method="get"
            role="search"
            className="flex shrink-0 items-center gap-2 p-3"
            onSubmit={(e) => {
              if (!onEditorNavigate) return
              e.preventDefault()
              e.stopPropagation()
              onClose()
              onEditorNavigate("/search", true)
            }}
          >
            <div className="relative flex h-12 min-w-0 flex-1 items-center">
              <Search aria-hidden className="pointer-events-none absolute left-3.5 h-[18px] w-[18px]" strokeWidth={1.8} style={muted} />
              <input
                ref={inputRef}
                type="search"
                name="q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                aria-label={placeholder}
                autoComplete="off"
                data-drawer-focus=""
                className="hdr-search-field h-full w-full bg-transparent outline-none"
                style={{
                  /* 16px or iOS zooms the page when the field takes focus. */
                  fontSize: 16,
                  padding: "0 14px 0 42px",
                  color: scheme.heading,
                  caretColor: scheme.heading,
                  accentColor: scheme.heading,
                  WebkitAppearance: "none",
                  appearance: "none",
                  border: `1px solid ${scheme.inset_border}`,
                  ...radius,
                }}
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="theme-tint-hover flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors"
            >
              <X className="h-5 w-5" strokeWidth={1.8} />
            </button>
          </form>

          {answered && (
            <div className="min-h-0 border-t" style={{ borderColor: scheme.inset_border }} data-search-results="">
              {hits.length === 0 ? (
                <p className="px-4 py-5 text-[14px]" style={muted}>No results for &ldquo;{asked}&rdquo;</p>
              ) : (
                <>
                  <ul className="site-slim-scroll max-h-[min(calc(var(--sl-vh,1vh)*55),440px)] overflow-y-auto overscroll-contain py-1.5">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <a
                          href={h.url}
                          onClick={go(h.url)}
                          className="theme-tint-hover flex items-center gap-3 px-3 py-2 transition-colors"
                        >
                          <span className="h-12 w-12 shrink-0 overflow-hidden" style={{ background: scheme.inset_border, borderRadius: 8 }}>
                            <ProductImg src={h.image} className="h-full w-full object-cover" loading="lazy" dark={isDarkColor(scheme.bg)} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{h.title}</span>
                          {h.price && <span className="shrink-0 text-[14px] tabular-nums" style={{ opacity: 0.7 }}>{shownPrice(h.price)}</span>}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={viewAll}
                    onClick={go("/search")}
                    className="theme-tint-hover flex items-center justify-between border-t px-4 py-3 text-[14px] font-semibold transition-colors"
                    style={{ borderColor: scheme.inset_border }}
                  >
                    <span>View all {total} result{total === 1 ? "" : "s"}</span>
                    <ChevronRight className="h-4 w-4 opacity-60" strokeWidth={2} />
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

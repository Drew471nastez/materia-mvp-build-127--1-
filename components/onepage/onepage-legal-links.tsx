"use client"

/**
 * ===========================================================================
 *  COOKIES, PRIVACY, TERMS AND REPORT AT THE FOOT OF A OnePage
 * ===========================================================================
 * "When I click privacy or terms from a one page, open a modal where I can
 * read it, not take me to Storelib." Terms, Privacy and Cookies open one
 * sheet over the page (./onepage-dialog: the app's sheet on a phone, a
 * centred card from 640px), in the page's own light or dark, with the three
 * as tabs along its top. The text is Storelib's one copy (components/legal),
 * loaded once the page is idle, so the page itself carries none of it.
 *
 * ROUND AS, the owner: "it's cheap and glitchy when I switch between terms
 * and privacy policy pill". Switching used to swap the whole document in one
 * frame and only then put the scroll back to the top, after that frame was
 * painted: a flash of the other text halfway down, then a jump. The pill's
 * fill jumped too. Now:
 *
 *   the sheet keeps one height   a reading sheet is a fixed height (`tall`),
 *                                so nothing about its edge moves on a switch
 *   the thumb slides             one fill under the tabs, moved to the tab
 *                                pressed (translate and width, measured)
 *   the text fades through       out in FADE_OUT_MS, swapped and put back to
 *                                its top while nothing shows, then in
 *
 * Cookies is the visitor's choices, saved as they press (./onepage-legal-panels
 * CookieChoices), with the policy one press away. Report is a short form in a
 * sheet of its own, sent to the team with the page's address. Back closes
 * either, as it closes every sheet on the page.
 */
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type MouseEvent } from "react"
import { LEGAL_DOCS, type LegalKind } from "@/components/legal/legal-parts"
import { backInFlight, backThen } from "@/lib/navigation/go-back"
import { isOnePagePreview } from "@/lib/onepage/preview-notice"
import { OnePageDialog, SheetClose } from "./onepage-dialog"

type Tab = LegalKind | "cookies"
const TABS: { id: Tab; label: string }[] = [
  { id: "terms", label: "Terms" },
  { id: "privacy", label: "Privacy" },
  { id: "refunds", label: "Refunds" },
  { id: "cookies", label: "Cookies" },
]
const TITLE: Record<Tab, string> = { terms: LEGAL_DOCS.terms.title, privacy: LEGAL_DOCS.privacy.title, refunds: LEGAL_DOCS.refunds.title, cookies: "Cookie choices" }

/*
  ROUND AR: THE TEXT IS HERE BEFORE THE TAP. The reader (and, from round AS,
  the cookie choices and the report form) is fetched once the page is idle
  and the footer is drawn, and again on hover or a finger coming down; a tap
  that finds it opens the sheet with the text in it at once. A tap that beats
  it waits for it (never longer than READER_WAIT_MS) and the sheet then rises
  with the text, never a placeholder.
*/
type ReaderProps = { kind: LegalKind; anchor?: string; onKind?: (k: LegalKind, at?: string) => void }
type PanelsModule = typeof import("./onepage-legal-panels")
let Reader: ComponentType<ReaderProps> | null = null
let Panels: PanelsModule | null = null
let reading: Promise<ComponentType<ReaderProps> | null> | null = null
const loadReader = () => {
  reading ??= Promise.all([import("@/components/legal/legal-reader"), import("./onepage-legal-panels")])
    .then(([r, p]) => {
      Reader = r.default as unknown as ComponentType<ReaderProps>
      Panels = p
      return Reader
    })
    .catch(() => {
      reading = null
      return null
    })
  return reading
}
const READER_WAIT_MS = 600
/** The text's fade on a tab switch: out, swapped while nothing shows, then in. */
export const FADE_OUT_MS = 110
export const FADE_IN_MS = 180
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"

/*
  BACK CLOSES IT. The sheet stands on a history entry of its own (the
  address does not change), so a phone's Back or a swipe from the edge
  closes the sheet instead of leaving the page. Closed any other way, it
  steps back off that entry, so the next Back leaves the page as it should.
  Not in the editor's preview, which has no history of its own to use.
*/
export const LEGAL_HISTORY_KEY = "onepageLegal"
const entryOf = (st: unknown) => (st && typeof st === "object" ? ((st as Record<string, unknown>)[LEGAL_HISTORY_KEY] as string | undefined) ?? null : null)
function stateWith(mark: string | null): Record<string, unknown> {
  const st: Record<string, unknown> = { ...((window.history.state as Record<string, unknown> | null) ?? {}) }
  delete st[LEGAL_HISTORY_KEY]
  return mark ? { ...st, [LEGAL_HISTORY_KEY]: mark } : st
}
function useBackCloses(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open || isOnePagePreview()) return
    const m = `legal:${Date.now().toString(36)}`
    let mine: string | null = m
    try {
      window.history.pushState(stateWith(m), "", window.location.href)
    } catch {
      return
    }
    const onPop = () => {
      if (mine && entryOf(window.history.state) !== mine) {
        mine = null
        closeRef.current()
      }
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (!mine || entryOf(window.history.state) !== mine) return
      const strip = () => {
        try {
          if (entryOf(window.history.state) === m) window.history.replaceState(stateWith(null), "", window.location.href)
        } catch {
          /* the entry stays marked; Back from it does nothing */
        }
      }
      mine = null
      if (backInFlight()) strip()
      else backThen(strip, 500)
    }
  }, [open])
}

/** The tabs along the sheet's top, with one fill that slides to the tab pressed. */
function LegalTabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const list = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)
  const place = useCallback(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-legal-tab="${tab}"]`)
    const t = thumb.current
    if (!el || !t) return
    t.style.width = `${el.offsetWidth}px`
    t.style.translate = `${el.offsetLeft}px 0`
    if (!placed.current) {
      /* The first place is where it starts, not somewhere it slides to. */
      placed.current = true
      void t.offsetWidth
      t.style.transition = `translate 260ms ${EASE}, width 260ms ${EASE}`
      t.style.opacity = "1"
    }
  }, [tab])
  useLayoutEffect(place, [place])
  /* A typeface that arrives late changes the tabs' widths: the fill follows. */
  useEffect(() => {
    const el = list.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => place())
    ro.observe(el)
    return () => ro.disconnect()
  }, [place])
  return (
    <div ref={list} className="relative flex min-w-0 rounded-full bg-[var(--sheet-field)] p-1" role="tablist" aria-label="Legal" data-legal-tabs="">
      <span ref={thumb} aria-hidden className="absolute bottom-1 left-0 top-1 rounded-full bg-[var(--sheet-bg)] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.04)]" style={{ opacity: 0 }} data-legal-thumb="" />
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onTab(t.id)}
          data-legal-tab={t.id}
          className="relative h-8 rounded-full px-3.5 text-[13.5px] font-medium text-[var(--sheet-muted)] transition-colors duration-200 aria-selected:text-[var(--sheet-ink)]"
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function OnePageLegalLinks({ dark, color }: { dark: boolean; color: string }) {
  const [open, setOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  /* `tab` is the pill pressed; `shown` is what is drawn, which follows once the old text has faded. */
  const [tab, setTab] = useState<Tab>("privacy")
  const [shown, setShown] = useState<Tab>("privacy")
  const [anchor, setAnchor] = useState<string | undefined>()
  const [fading, setFading] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const swap = useRef<number | undefined>(undefined)

  const [, setLoaded] = useState(!!Reader)
  /* Once the page is idle: the reader is a small script, and the tap then opens it with nothing to wait for. */
  useEffect(() => {
    if (Reader) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
    const run = () => void loadReader().then((r) => r && setLoaded(true))
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(run, { timeout: 4000 })
      return () => w.cancelIdleCallback?.(h)
    }
    const t = window.setTimeout(run, 1500)
    return () => window.clearTimeout(t)
  }, [])
  useEffect(() => () => window.clearTimeout(swap.current), [])

  /** Opens a sheet once its script is here (or READER_WAIT_MS has passed). */
  const whenLoaded = (go: () => void) => {
    if (Reader) return go()
    let done = false
    const once = () => {
      if (done) return
      done = true
      setLoaded(true)
      go()
    }
    void loadReader().then(once)
    window.setTimeout(once, READER_WAIT_MS)
  }

  /** From the footer: the sheet opens on that tab, with nothing to fade. */
  const show = (t: Tab, at?: string) => {
    window.clearTimeout(swap.current)
    setFading(false)
    setTab(t)
    setShown(t)
    setAnchor(at)
    whenLoaded(() => setOpen(true))
  }

  /** Inside the sheet: the thumb moves now, the text fades out, is swapped at its top, and fades in. */
  const switchTo = useCallback(
    (t: Tab, at?: string) => {
      if (t === tab && t === shown && !at) return
      setTab(t)
      window.clearTimeout(swap.current)
      const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (reduce) {
        setShown(t)
        setAnchor(at)
        return
      }
      setFading(true)
      /*
        The new text is drawn as a transition: React builds it a few milliseconds at a time between frames, so the
        thumb keeps sliding while it does, and it stays faded until the new text is in (the layout effect below).
      */
      swap.current = window.setTimeout(() => {
        startTransition(() => {
          setShown(t)
          setAnchor(at)
        })
      }, FADE_OUT_MS)
    },
    [tab, shown],
  )

  /* The new text starts at its top, set before it is painted (a section asked for scrolls there after, ./legal-reader). */
  useLayoutEffect(() => {
    const scroller = body.current?.closest<HTMLElement>("[data-onepage-dialog-scroll], [data-sheet-scroll]")
    if (scroller && !anchor) scroller.scrollTop = 0
    /* In, and only now: the frame this is painted in is the first with the new text, at its top, still at 0. */
    setFading(false)
  }, [shown, anchor])

  const close = useCallback(() => setOpen(false), [])
  const closeReport = useCallback(() => setReportOpen(false), [])
  useBackCloses(open, close)
  useBackCloses(reportOpen, closeReport)
  /* A finger on the link starts the download, so the text is usually in before the sheet has finished rising. */
  const warm = () => void loadReader()

  /* The policy's own "Change your cookie choices" button shows this sheet's Cookies tab, not a second dialog over it. */
  const onBodyClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-cookie-choices]")) {
      e.preventDefault()
      e.stopPropagation()
      switchTo("cookies")
    }
  }

  const link = "transition-opacity hover:underline hover:underline-offset-2 cursor-pointer"
  const header = (
    <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-2 sm:px-8 sm:pt-6">
      <LegalTabs tab={tab} onTab={(t) => switchTo(t)} />
      <SheetClose onClose={close} />
    </div>
  )
  const reportHeader = (
    <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-2 sm:px-6 sm:pt-6">
      <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-[var(--sheet-ink)]">Report this page</h2>
      <SheetClose onClose={closeReport} />
    </div>
  )

  return (
    <>
      <nav aria-label="Legal" className="flex items-center justify-center gap-4 text-xs" style={{ color }} data-onepage-legal="">
        <button type="button" className={link} onPointerEnter={warm} onPointerDown={warm} onClick={() => show("cookies")}>
          Cookies
        </button>
        <button type="button" className={link} onPointerEnter={warm} onPointerDown={warm} onClick={() => show("privacy")}>
          Privacy
        </button>
        <button type="button" className={link} onPointerEnter={warm} onPointerDown={warm} onClick={() => show("terms")}>
          Terms
        </button>
        <button type="button" className={link} onPointerEnter={warm} onPointerDown={warm} onClick={() => whenLoaded(() => setReportOpen(true))} data-onepage-report-link="">
          Report
        </button>
      </nav>
      <OnePageDialog open={open} onClose={close} dark={dark} label={TITLE[tab]} header={header} width={720} tall>
        <h2 className="sr-only">{TITLE[shown]}</h2>
        <div
          ref={body}
          onClickCapture={onBodyClick}
          data-legal-body={shown}
          data-fading={fading ? "" : undefined}
          style={{ opacity: fading ? 0 : 1, transition: `opacity ${fading ? FADE_OUT_MS : FADE_IN_MS}ms ${EASE}` }}
        >
          {shown === "cookies" ? (
            Panels ? <Panels.CookieChoices onPolicy={() => switchTo("privacy", "cookies")} /> : <div className="min-h-[50dvh]" aria-hidden data-legal-loading="" />
          ) : Reader ? (
            <Reader kind={shown} anchor={anchor} onKind={(k, at) => switchTo(k, at)} />
          ) : (
            <div className="min-h-[50dvh]" aria-hidden data-legal-loading="" />
          )}
        </div>
      </OnePageDialog>
      <OnePageDialog open={reportOpen} onClose={closeReport} dark={dark} label="Report this page" header={reportHeader} width={460}>
        {Panels ? <Panels.ReportForm open={reportOpen} onClose={closeReport} /> : <div className="min-h-[320px]" aria-hidden data-legal-loading="" />}
      </OnePageDialog>
    </>
  )
}

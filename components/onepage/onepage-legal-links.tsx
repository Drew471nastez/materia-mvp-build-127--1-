"use client"

/**
 * ===========================================================================
 *  COOKIES, PRIVACY, TERMS AND REPORT AT THE FOOT OF A OnePage
 * ===========================================================================
 * "When I click privacy or terms from a one page, open a modal where I can
 * read it, not take me to Storelib." Privacy, Terms and Cookies open the
 * document in a sheet over the page (./onepage-dialog: the app's sheet on a
 * phone, a centred card from 640px), in the page's own light or dark. The
 * text is Storelib's one copy (components/legal), loaded the first time a
 * visitor reaches for a link, so the page itself carries none of it.
 *
 * Report goes to the Help Center's article on reporting, in a new tab: it is
 * a form somebody fills in, not a text to read.
 */
import { useCallback, useEffect, useState, type ComponentType } from "react"
import { publicHelpUrl } from "@/lib/help/paths"
import { LEGAL_DOCS, type LegalKind } from "@/components/legal/legal-parts"
import { OnePageDialog, SheetClose } from "./onepage-dialog"

/*
  ROUND AR: THE TEXT IS HERE BEFORE THE TAP. The reader used to load on the
  tap behind six grey bars (the owner: "that loading skeleton, I don't want
  that"). It is fetched once the page is idle and the footer is drawn, and
  again on hover or a finger coming down; a tap that finds it opens the sheet
  with the text in it at once. A tap that beats it waits for it (never longer
  than READER_WAIT_MS) and the sheet then rises with the text, never a
  placeholder.
*/
type ReaderProps = { kind: LegalKind; anchor?: string; onKind?: (k: LegalKind, at?: string) => void }
let Reader: ComponentType<ReaderProps> | null = null
let reading: Promise<ComponentType<ReaderProps> | null> | null = null
const loadReader = () => {
  reading ??= import("@/components/legal/legal-reader")
    .then((m) => {
      Reader = m.default as unknown as ComponentType<ReaderProps>
      return Reader
    })
    .catch(() => {
      reading = null
      return null
    })
  return reading
}
const READER_WAIT_MS = 600

export function OnePageLegalLinks({ dark, color }: { dark: boolean; color: string }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<LegalKind>("privacy")
  const [anchor, setAnchor] = useState<string | undefined>()

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
  const show = (k: LegalKind, at?: string) => {
    setKind(k)
    setAnchor(at)
    if (Reader) return setOpen(true)
    let done = false
    const go = () => {
      if (done) return
      done = true
      setLoaded(true)
      setOpen(true)
    }
    void loadReader().then(go)
    window.setTimeout(go, READER_WAIT_MS)
  }
  const close = useCallback(() => setOpen(false), [])
  /* A finger on the link starts the download, so the text is usually in before the sheet has finished rising. */
  const warm = () => void loadReader()

  const link = "transition-opacity hover:underline hover:underline-offset-2 cursor-pointer"
  const header = (
    <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-2 sm:px-8 sm:pt-6">
      <div className="flex min-w-0 gap-1 rounded-full bg-[var(--sheet-field)] p-1" role="tablist" aria-label="Legal documents">
        {(["terms", "privacy"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => show(k)}
            className="h-8 rounded-full px-3.5 text-[13.5px] font-medium text-[var(--sheet-muted)] transition-colors aria-selected:bg-[var(--sheet-bg)] aria-selected:text-[var(--sheet-ink)] aria-selected:shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
          >
            {LEGAL_DOCS[k].title}
          </button>
        ))}
      </div>
      <SheetClose onClose={close} />
    </div>
  )

  return (
    <>
      <nav aria-label="Legal" className="flex items-center justify-center gap-4 text-xs" style={{ color }} data-onepage-legal="">
        <button type="button" className={link} onPointerEnter={warm} onPointerDown={warm} onClick={() => show("privacy", "cookies")}>
          Cookies
        </button>
        <button type="button" className={link} onPointerEnter={warm} onPointerDown={warm} onClick={() => show("privacy")}>
          Privacy
        </button>
        <button type="button" className={link} onPointerEnter={warm} onPointerDown={warm} onClick={() => show("terms")}>
          Terms
        </button>
        <a href={publicHelpUrl("/policies/report-a-product")} target="_blank" rel="noopener noreferrer" className={link}>
          Report
        </a>
      </nav>
      <OnePageDialog open={open} onClose={close} dark={dark} label={LEGAL_DOCS[kind].title} header={header} width={720} tall scrollKey={kind}>
        <h2 className="sr-only">{LEGAL_DOCS[kind].title}</h2>
        {Reader ? <Reader kind={kind} anchor={anchor} onKind={show} /> : <div className="min-h-[50dvh]" aria-hidden data-legal-loading="" />}
      </OnePageDialog>
    </>
  )
}

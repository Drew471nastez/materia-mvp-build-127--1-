"use client"

/**
 * ===========================================================================
 *  WHAT ARE YOU SELLING? THE QUESTION BEFORE A NEW PRODUCT
 * ===========================================================================
 * Every New product in /app asks it first (./product-kinds.ts has the
 * answers and where each opens). Two shapes, one list:
 *
 *   IN PLACE (useNewProductChooser). The Products list's New product and
 *   Create product, Home's Create product and the header search's New
 *   product open it over the page they are on: the shared sheet on a phone,
 *   a dialog from 768px (components/ui/sheet-dialog). A pick then opens its
 *   editor the way New product always did: the editor's layer rises from the
 *   list (../list-return openEditor), so Back in the editor comes back here.
 *   On a phone the sheet leaves first and the editor rises after it, one
 *   thing moving at a time, as the app's other sheets hand over
 *   (../pick-sheet, A CHOICE WAITS FOR THE SHEET TO LEAVE).
 *
 *   AS A PAGE (NewProductKindPage). /app/products/new with no kind, for
 *   every link that points there. A pick replaces the page with its editor,
 *   so the question is not a step Back walks into again.
 *
 * FAST. Both editors are fetched ahead in full (warmKinds) when a New
 * product button is hovered, touched or focused, and again when the
 * question opens, so a pick finds its page already here. Nothing about a
 * pick is remembered for next time.
 *
 * NO MEMBERSHIP, NO PAID COMMUNITY. Memberships are communities now, and a
 * community is made from the Community page, so neither is an answer here
 * (./product-kinds.ts).
 *
 * THE KEYBOARD. The dialog puts the focus on the first answer; up and down
 * (and Home, End) move between them, Enter or Space picks, Escape closes,
 * and the focus goes back to the button that opened it.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { LAYER_PHONE } from "@/components/app/page-layer"
import { prefetchAppPage } from "@/lib/ui/app-navigation"
import { hapticTap } from "@/lib/native-bridge"
import { openEditor, returnToProducts } from "../list-return"
import { NEW_PRODUCT_HREF, editorHref, kindHref, kindOptions, type ProductKind } from "./product-kinds"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { tt, msg } from "@/lib/i18n/text"

import { ImportArt, LinkImportForm } from "./link-import-form"

type Router = ReturnType<typeof useRouter>

export const CHOOSER_TITLE = msg("Create new product")

/** Both editors, fetched ahead in full; asking again for one the router holds costs nothing. */
export function warmKinds(router: Router) {
  prefetchAppPage(router, editorHref("digital"))
  prefetchAppPage(router, editorHref("course"))
}

/* ── The drawings ─────────────────────────────────────────────────────── */

/**
 * Layered illustrations keep the product choices recognisable at a glance.
 * Products round 15: drawn again so each says what it is. A digital product
 * is a file with its download; a video course is a lesson playing, its
 * progress under it and the chapter list beside it. The same flat fills,
 * 1.5px outlines and soft ground as the box and the Import tiles.
 */
export function KindArt({ kind, className }: { kind: ProductKind; className?: string }) {
  return <span aria-hidden className={cn("relative grid h-16 w-16 shrink-0 place-items-center", className)}>
    <svg width="64" height="64" viewBox="0 0 80 80" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {kind === "physical" ? <>
        <ellipse cx="40" cy="68" rx="30" ry="5" fill="#e5e7eb" />
        <path d="M16 30 40 20l24 10v30L40 71 16 60Z" fill="#dca475" />
        <path d="m40 41 24-11v30L40 71Z" fill="#bd8156" />
        <path d="M16 30 40 41 29 52 5 39Zm24 11 24-11 11 9-24 13Z" fill="#f0c69e" />
        <path d="m16 30 7-13 24 10-7 14Z" fill="#edc19b" />
        <rect x="34" y="48" width="38" height="23" rx="5" fill="white" stroke="#d1d5db" />
        <rect x="39" y="53" width="28" height="4" rx="2" fill="#e5e7eb" /><rect x="39" y="61" width="21" height="5" rx="2.5" fill="#1a1a2e" />
      </> : kind === "course" ? <>
        <ellipse cx="40" cy="71" rx="31" ry="4" fill="#e5e7eb" />
        {/* The lesson playing, and how far into it */}
        <rect x="5" y="13" width="54" height="42" rx="7" fill="#d9d6f8" stroke="#9388c9" strokeWidth="1.5" />
        <rect x="10" y="18" width="44" height="25" rx="4" fill="#f6f4ff" />
        <path d="M28.5 25.5v11l9-5.5Z" fill="#9b7de2" stroke="#9b7de2" strokeWidth="2" />
        <rect x="10" y="47.5" width="44" height="3" rx="1.5" fill="#bdb6ea" />
        <rect x="10" y="47.5" width="25" height="3" rx="1.5" fill="#7c5bd6" />
        <circle cx="35" cy="49" r="3.2" fill="white" stroke="#7c5bd6" strokeWidth="1.5" />
        {/* The chapters: one done, one playing, one to come */}
        <rect x="45" y="31" width="30" height="37" rx="5" fill="white" stroke="#6b7280" strokeWidth="1.5" />
        <circle cx="52" cy="40" r="3.2" fill="#55afa8" /><path d="m50.6 40.1 1 1 2-2.2" stroke="white" strokeWidth="1.3" />
        <rect x="58" y="38.8" width="12" height="2.4" rx="1.2" fill="#d1d5db" />
        <circle cx="52" cy="49.5" r="3.2" fill="#8b5cf6" /><path d="M51.2 48.2v2.6l2-1.3Z" fill="white" stroke="white" strokeWidth="0.8" />
        <rect x="58" y="48.3" width="13" height="2.4" rx="1.2" fill="#9388c9" />
        <circle cx="52" cy="59" r="2.8" fill="white" stroke="#c4c7cf" strokeWidth="1.3" />
        <rect x="58" y="57.8" width="10" height="2.4" rx="1.2" fill="#e5e7eb" />
      </> : <>
        <ellipse cx="40" cy="71" rx="28" ry="4" fill="#e5e7eb" />
        {/* The file, its corner folded */}
        <path d="M21 8h24l13 13v42a5 5 0 0 1-5 5H21a5 5 0 0 1-5-5V13a5 5 0 0 1 5-5Z" fill="white" stroke="#55586a" strokeWidth="1.5" />
        <path d="M45 8v9a4 4 0 0 0 4 4h9" fill="#eef0f3" stroke="#55586a" strokeWidth="1.5" />
        <rect x="22" y="15" width="13" height="7" rx="2" fill="#e7bc53" />
        <rect x="22" y="28" width="26" height="3" rx="1.5" fill="#e5e7eb" />
        <rect x="22" y="35" width="21" height="3" rx="1.5" fill="#e5e7eb" />
        <rect x="22" y="42" width="14" height="3" rx="1.5" fill="#e5e7eb" />
        {/* Its download */}
        <circle cx="54" cy="55" r="14" fill="#d84e6b" stroke="white" strokeWidth="3" />
        <path d="M54 47.5v10.5m-4.5-4.5 4.5 4.5 4.5-4.5M48.5 62.5h11" stroke="white" strokeWidth="2" />
      </>}
    </svg>
  </span>
}

/* ── The list ─────────────────────────────────────────────────────────── */

/* Products round 15: about 15% shorter than the 112px rows, with 64px drawings rather than 80px. */
const ROW =
  "group/kind flex min-h-[88px] w-full items-center gap-4 rounded-2xl border border-[#e2e4e8] bg-white px-4 py-3 text-left outline-none transition-[background-color,border-color,scale] duration-150 hover:border-[#c9cdd5] hover:bg-[#fafbfc] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

/** Up, down, Home and End move between the answers; Enter and Space are the buttons' own. */
function moveFocus(e: React.KeyboardEvent<HTMLElement>) {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-kind]"))
  const at = items.indexOf(document.activeElement as HTMLButtonElement)
  const n = items.length
  const next = e.key === "ArrowDown" ? (at + 1) % n : e.key === "ArrowUp" ? (at - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1
  if (next < 0 || !n) return
  e.preventDefault()
  items[next].focus()
}

export function KindList({ onChoose, onImport }: { onChoose: (kind: ProductKind) => void; onImport?: () => void }) {
  const physical = usePhysicalCommerceEnabled()
  return (
    <div onKeyDown={moveFocus} data-kind-list="">
      <ul className="space-y-2.5">
        {kindOptions(physical).map((o) => (
          <li key={o.kind}>
            <button
              type="button"
              data-kind={o.kind}
              onClick={() => onChoose(o.kind)}
              className={ROW}
            >
              <KindArt kind={o.kind} />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold leading-5 text-[#1a1a2e]">{o.title}</span>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#b6bac2] transition-[translate,color] duration-150 group-hover/kind:translate-x-0.5 group-hover/kind:text-[#6b7280]" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" data-kind="import" data-import-products="" onClick={onImport ?? (() => { window.location.href = "/app/products/new" })} className={cn(ROW, "mt-2.5")}>
        <ImportArt /><span className="min-w-0 flex-1 text-[16px] font-semibold text-[#1a1a2e]">{tt("Import")}</span><ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#b6bac2]" />
      </button>
    </div>
  )
}

export const GUMROAD_IMPORT_HREF = "/app/products/import/gumroad"

const CLOSE =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_#9ca3af] [-webkit-tap-highlight-color:transparent]"

/* ── In place: the sheet, or the dialog ───────────────────────────────── */

/**
 * The question over the page it was asked on. `open` shows it; `warm` is
 * for the button's hover, touch and focus; `chooser` goes anywhere in the
 * page's tree (it draws in a portal).
 */
export function useNewProductChooser(): { open: () => void; warm: () => void; chooser: React.ReactNode } {
  const router = useRouter()
  const [importing, setImporting] = React.useState(false)
  const [isOpen, setOpen] = React.useState(false)
  const [phone, setPhone] = React.useState(false)
  // Prepare the closed phone sheet before the first Add press.
  React.useEffect(() => {
    const mq = window.matchMedia(LAYER_PHONE)
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  const body = React.useRef<HTMLDivElement>(null)
  /* The control that opened it: the focus goes back there when the dialog closes (the sheet does this itself). */
  const opener = React.useRef<HTMLElement | null>(null)
  /* Where a pick goes, once the sheet has left (a phone) or at once (the dialog). */
  const target = React.useRef<string | null>(null)

  const warm = React.useCallback(() => warmKinds(router), [router])
  const open = React.useCallback(() => {
    warm()
    target.current = null
    setImporting(false)
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    setPhone(window.matchMedia(LAYER_PHONE).matches)
    setOpen(true)
  }, [warm])

  const go = React.useCallback(() => {
    const href = target.current
    target.current = null
    if (!href) return
    startNavigationLoading(href)
    /* An editor rises as a layer from here, and its Back comes back here. */
    if (href.startsWith(NEW_PRODUCT_HREF)) openEditor(router, href, true)
    else if (/^\/app\/products\/[^/]+$/.test(href)) {
      router.refresh()
      openEditor(router, href, true)
    } else router.push(href)
  }, [router])

  /* Every answer's address is known ahead (./product-kinds kindHref), so nothing is made by a pick. */
  const choose = (kind: ProductKind) => {
    if (phone) hapticTap("soft")
    target.current = kindHref(kind)
    setOpen(false)
    if (!phone) go()
  }
  const close = () => setOpen(false)

  const chooser = (
    <SheetDialog
      open={isOpen}
      onClose={close}
      phone={phone}
      label={importing ? tt("Import product") : tt(CHOOSER_TITLE)}
      showCloseButton={false}
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        body.current?.querySelector<HTMLButtonElement>("[data-kind]")?.focus()
      }}
      sheet={{ fill: false, aboveKeyboard: true, maxHeight: "min(90dvh, 800px)", dismissible: true, onClosed: go }}
      dialog={{
        "aria-describedby": undefined,
        onCloseAutoFocus: (e) => {
          const back = opener.current
          if (!back?.isConnected) return
          e.preventDefault()
          back.focus({ preventScroll: true })
        },
      }}
      className="w-[calc(100%-32px)] max-w-[520px] gap-0 sm:max-w-[520px] rounded-2xl border-[#e5e7eb] bg-white p-0 shadow-[0_24px_64px_-16px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)]"
    >
      <div ref={body} data-new-product-chooser="" className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-2 md:pt-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <SheetDialogTitle className="text-[17px] font-semibold leading-6 text-[#1a1a2e]">{importing ? tt("Import product") : tt(CHOOSER_TITLE)}</SheetDialogTitle>
          <button type="button" onClick={close} aria-label={tt("Close")} className={CLOSE}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {importing ? <LinkImportForm onBack={() => setImporting(false)} onImported={(id) => { target.current = `/app/products/${id}`; prefetchAppPage(router, target.current); setOpen(false); if (!phone) go() }} /> : <KindList onChoose={choose} onImport={() => setImporting(true)} />}
      </div>
    </SheetDialog>
  )

  return { open, warm, chooser }
}

/**
 * A press on a link to /app/products/new that should ask in place instead:
 * the main button with no modifier. Anything else (a new tab, a middle
 * press) is left to the link, which opens the question as a page.
 */
export function asksInPlace(e: React.MouseEvent): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

/* ── As a page: /app/products/new with no kind ─────────────────────────── */

export function NewProductKindPage() {
  const router = useRouter()
  const [importing, setImporting] = React.useState(false)
  React.useEffect(() => {
    warmKinds(router)
    /* The first answer takes the focus on a computer, as in the dialog; a phone would scroll to show a ring nobody asked for. */
    if (!window.matchMedia(LAYER_PHONE).matches) document.querySelector<HTMLButtonElement>("[data-kind-page] [data-kind]")?.focus({ preventScroll: true })
  }, [router])

  const choose = (kind: ProductKind) => {
    const href = kindHref(kind)
    startNavigationLoading(href)
    /* The question gives its place in the history to the answer. */
    router.replace(href)
  }

  return (
    <div data-kind-page="" className="mx-auto w-full max-w-[560px] px-4 pb-24 pt-[calc(env(safe-area-inset-top,0px)+12px)] sm:px-6 md:pb-10 md:pt-12">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold leading-8 text-[#1a1a2e] sm:text-[28px] sm:leading-9">{tt(CHOOSER_TITLE)}</h1>
        <button type="button" aria-label={tt("Close")} data-layer-back="" onClick={() => returnToProducts(router, null)} className={CLOSE}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {importing ? <LinkImportForm onBack={() => setImporting(false)} onImported={(id) => router.replace(`/app/products/${id}`)} /> : <KindList onChoose={choose} onImport={() => setImporting(true)} />}
      </div>
    </div>
  )
}

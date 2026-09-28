"use client"

/**
 * ===========================================================================
 *  WHAT ARE YOU SELLING? THE QUESTION BEFORE A NEW PRODUCT
 * ===========================================================================
 * Every New product in /app asks it first (./product-kinds.ts has the three
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
 * question opens, so a pick finds its page already here. A membership is
 * different: its screen is one membership's, so a pick makes the draft first
 * (/api/app/memberships, as New membership on /app/memberships does) and
 * the row says so with a spinner while it does. Nothing about a pick is
 * remembered for next time.
 *
 * THE KEYBOARD. The dialog puts the focus on the first answer; up and down
 * (and Home, End) move between the three, Enter or Space picks, Escape
 * closes, and the focus goes back to the button that opened it.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { LAYER_PHONE } from "@/components/app/page-layer"
import { prefetchAppPage } from "@/lib/ui/app-navigation"
import { hapticTap } from "@/lib/native-bridge"
import { openEditor, returnToProducts } from "../list-return"
import { KIND_OPTIONS, NEW_PRODUCT_HREF, editorHref, membershipHref, type ProductKind } from "./product-kinds"

type Router = ReturnType<typeof useRouter>

export const CHOOSER_TITLE = "What are you selling?"

/** Both editors, fetched ahead in full; asking again for one the router holds costs nothing. */
export function warmKinds(router: Router) {
  prefetchAppPage(router, editorHref("digital"))
  prefetchAppPage(router, editorHref("course"))
}

/** A new membership, as a draft. Answers the address of its screen, or the sentence to show. */
async function makeMembership(): Promise<{ href: string } | { error: string }> {
  try {
    const res = await fetch("/api/app/memberships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Membership" }),
      credentials: "same-origin",
    })
    const data = (await res.json().catch(() => ({}))) as { productId?: string; error?: string }
    if (!res.ok || !data.productId) return { error: data.error || "The membership could not be made. Try again." }
    return { href: membershipHref(data.productId) }
  } catch {
    return { error: "The connection dropped. Nothing was made. Try again." }
  }
}

/**
 * A pick, turned into where it goes. The editors' addresses are known; a
 * membership's comes back from the draft it makes. `pending` is the row
 * whose answer is on its way.
 */
function useKindChoice() {
  const [pending, setPending] = React.useState<ProductKind | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const busy = React.useRef(false)
  const resolve = React.useCallback(async (kind: ProductKind): Promise<string | null> => {
    if (busy.current) return null
    setError(null)
    if (kind !== "membership") return editorHref(kind)
    busy.current = true
    setPending(kind)
    const made = await makeMembership()
    busy.current = false
    setPending(null)
    if ("error" in made) {
      setError(made.error)
      return null
    }
    return made.href
  }, [])
  const reset = React.useCallback(() => {
    if (busy.current) return
    setPending(null)
    setError(null)
  }, [])
  return { pending, error, resolve, reset }
}

/* ── The drawings ─────────────────────────────────────────────────────── */

const INK = "#1a1a2e"
const ACCENT = "#8b5cf6"

/** A small drawing of each kind: a file coming down, a lesson playing, a month of updates. */
export function KindArt({ kind, className }: { kind: ProductKind; className?: string }) {
  return (
    <span aria-hidden className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f4f6]", className)}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {kind === "digital" ? (
          <>
            <path d="M9 4.8h9l5.2 5.2v15.4a1.8 1.8 0 0 1-1.8 1.8H9a1.8 1.8 0 0 1-1.8-1.8V6.6A1.8 1.8 0 0 1 9 4.8z" stroke={INK} />
            <path d="M18 4.8V10h5.2" stroke={INK} />
            <path d="M15.2 13.4v7.4M12.2 17.9l3 3 3-3" stroke={ACCENT} />
          </>
        ) : kind === "course" ? (
          <>
            <rect x="4.2" y="6.2" width="23.6" height="15.6" rx="2.6" stroke={INK} />
            <path d="M13.6 10.6v6.8l5.6-3.4z" fill={ACCENT} stroke={ACCENT} strokeWidth="1.2" />
            <path d="M4.8 26.2h22.4" stroke="#d1d5db" />
            <path d="M4.8 26.2h9.6" stroke={ACCENT} />
          </>
        ) : (
          <>
            <rect x="5" y="7" width="22" height="20" rx="2.6" stroke={INK} />
            <path d="M5 12.4h22M11 4.6v4.4M21 4.6v4.4" stroke={INK} />
            <circle cx="11" cy="17.6" r="1.1" fill="#c4c8cf" />
            <circle cx="16" cy="17.6" r="1.1" fill="#c4c8cf" />
            <circle cx="21" cy="17.6" r="1.6" fill={ACCENT} />
            <circle cx="11" cy="22.2" r="1.1" fill="#c4c8cf" />
            <circle cx="16" cy="22.2" r="1.1" fill="#c4c8cf" />
            <circle cx="21" cy="22.2" r="1.1" fill="#c4c8cf" />
          </>
        )}
      </svg>
    </span>
  )
}

/* ── The list ─────────────────────────────────────────────────────────── */

const ROW =
  "group/kind flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left outline-none transition-colors duration-100 hover:bg-[#f5f6f8] active:bg-[#eef0f3] focus-visible:bg-[#f5f6f8] focus-visible:shadow-[inset_0_0_0_2px_#9ca3af] aria-disabled:pointer-events-none [-webkit-tap-highlight-color:transparent] md:py-2.5"

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

export function KindList({
  pending,
  error,
  onChoose,
}: {
  pending: ProductKind | null
  error: string | null
  onChoose: (kind: ProductKind) => void
}) {
  return (
    <div onKeyDown={moveFocus} data-kind-list="">
      <ul className="space-y-0.5">
        {KIND_OPTIONS.map((o) => (
          <li key={o.kind}>
            <button
              type="button"
              data-kind={o.kind}
              aria-disabled={pending !== null || undefined}
              aria-busy={pending === o.kind || undefined}
              onClick={() => onChoose(o.kind)}
              className={ROW}
            >
              <KindArt kind={o.kind} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-5 text-[#1a1a2e]">{o.title}</span>
                <span className="mt-0.5 block text-[13.5px] leading-[19px] text-[#6b7280]">{o.line}</span>
              </span>
              {pending === o.kind ? (
                <ActivitySpinner size={16} label="Setting up" className="shrink-0 text-[#6b7280]" />
              ) : (
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#b6bac2] transition-[translate,color] duration-150 group-hover/kind:translate-x-0.5 group-hover/kind:text-[#6b7280]" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mx-3 mt-2 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[13.5px] text-[#991b1b]">
          {error}
        </p>
      ) : null}
    </div>
  )
}

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
  const [isOpen, setOpen] = React.useState(false)
  const [phone, setPhone] = React.useState(false)
  const choice = useKindChoice()
  const { reset } = choice
  const body = React.useRef<HTMLDivElement>(null)
  /* The control that opened it: the focus goes back there when the dialog closes (the sheet does this itself). */
  const opener = React.useRef<HTMLElement | null>(null)
  /* Where a pick goes, once the sheet has left (a phone) or at once (the dialog). */
  const target = React.useRef<string | null>(null)

  const warm = React.useCallback(() => warmKinds(router), [router])
  const open = React.useCallback(() => {
    warm()
    reset()
    target.current = null
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    setPhone(window.matchMedia(LAYER_PHONE).matches)
    setOpen(true)
  }, [warm, reset])

  const go = React.useCallback(() => {
    const href = target.current
    target.current = null
    if (!href) return
    startNavigationLoading(href)
    /* An editor rises as a layer from here, and its Back comes back here. */
    if (href.startsWith(NEW_PRODUCT_HREF)) openEditor(router, href, true)
    else router.push(href)
  }, [router])

  const choose = async (kind: ProductKind) => {
    if (choice.pending) return
    if (phone) hapticTap("soft")
    const href = await choice.resolve(kind)
    if (!href) return
    target.current = href
    setOpen(false)
    if (!phone) go()
  }
  const close = () => {
    if (!choice.pending) setOpen(false)
  }

  const chooser = (
    <SheetDialog
      open={isOpen}
      onClose={close}
      phone={phone}
      label={CHOOSER_TITLE}
      showCloseButton={false}
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        body.current?.querySelector<HTMLButtonElement>("[data-kind]")?.focus()
      }}
      sheet={{ fill: false, aboveKeyboard: false, maxHeight: "min(86dvh, 720px)", dismissible: !choice.pending, onClosed: go }}
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
      <div ref={body} data-new-product-chooser="" className="px-2 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-1 md:pb-2 md:pt-2">
        <div className="flex items-center justify-between gap-3 pb-2 pl-3 pr-1 md:pt-1">
          <SheetDialogTitle className="text-[17px] font-semibold leading-6 text-[#1a1a2e]">{CHOOSER_TITLE}</SheetDialogTitle>
          <button type="button" onClick={close} aria-label="Close" className={cn(CLOSE, "max-md:hidden")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <KindList pending={choice.pending} error={choice.error} onChoose={(k) => void choose(k)} />
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
  const choice = useKindChoice()
  React.useEffect(() => {
    warmKinds(router)
    /* The first answer takes the focus on a computer, as in the dialog; a phone would scroll to show a ring nobody asked for. */
    if (!window.matchMedia(LAYER_PHONE).matches) document.querySelector<HTMLButtonElement>("[data-kind-page] [data-kind]")?.focus({ preventScroll: true })
  }, [router])

  const choose = async (kind: ProductKind) => {
    const href = await choice.resolve(kind)
    if (!href) return
    startNavigationLoading(href)
    /* The question gives its place in the history to the answer. */
    router.replace(href)
  }

  return (
    <div data-kind-page="" className="mx-auto w-full max-w-[560px] px-4 pb-24 pt-[calc(env(safe-area-inset-top,0px)+12px)] sm:px-6 md:pb-10 md:pt-12">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold leading-8 text-[#1a1a2e] sm:text-[28px] sm:leading-9">{CHOOSER_TITLE}</h1>
        <button type="button" aria-label="Close" data-layer-back="" onClick={() => returnToProducts(router, null)} className={CLOSE}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <KindList pending={choice.pending} error={choice.error} onChoose={(k) => void choose(k)} />
      </div>
    </div>
  )
}

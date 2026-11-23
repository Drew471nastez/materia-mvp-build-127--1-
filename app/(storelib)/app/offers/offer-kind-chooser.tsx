"use client"

/**
 * ===========================================================================
 *  NEW OFFER: WHICH KIND, ASKED OVER THE LIST
 * ===========================================================================
 * Round 60: "when I click Create offer, it should open a modal like the Add
 * product one. I choose what kind of offer I create, then it takes me to the
 * subpage." So the modal only asks; the offer itself is made on its own page
 * (./offer-editor.tsx at /app/offers/new?kind=).
 *
 * The shell is Add product's (../products/new/kind-chooser.tsx): the shared
 * sheet on a phone, a 520px dialog from 768px (components/ui/sheet-dialog),
 * its title and close button on one line, one row per kind with its drawing
 * and one line. A pick closes it; on a phone the page rises after the sheet
 * has left (one thing moving at a time), on a computer at once. The three
 * pages are fetched ahead when the modal opens, so a pick finds its page
 * already here.
 *
 * The keyboard: the first row takes the focus, up and down (Home, End) move,
 * Enter picks, Escape closes and the focus goes back to New offer.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, X } from "lucide-react"
import { tt } from "@/lib/i18n/text"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { LAYER_PHONE } from "@/components/app/page-layer"
import { prefetchAppPage } from "@/lib/ui/app-navigation"
import { hapticTap } from "@/lib/native-bridge"
import type { OfferKind } from "@/lib/offers/offers"
import { KindDrawing } from "./offer-fields"
import { KIND_WORD } from "./offer-parts"
import { newOfferHref, offersReturn } from "./list-return"

/** The order the kinds are offered in. */
export const KIND_ORDER: OfferKind[] = ["bundle", "checkout", "quantity_break"]

/** What each kind does, in one line, under its name. */
export const KIND_HINT: Record<OfferKind, () => string> = {
  bundle: () => tt("Two to five products bought together, for less."),
  checkout: () => tt("One more product, suggested on the product page, in the cart or at checkout."),
  quantity_break: () => tt("Buy more, pay less each. Or buy 2, get 1 free."),
}

/* Add product's rows (../products/new/kind-chooser.tsx ROW), a little shorter: the drawing is smaller. */
const ROW =
  "group/kind flex min-h-[76px] w-full cursor-pointer items-center gap-4 rounded-2xl border border-[#e2e4e8] bg-white px-4 py-3 text-left outline-none transition-[background-color,border-color] duration-150 hover:border-[#c9cdd5] hover:bg-[#fafbfc] focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

const CLOSE =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_#9ca3af] [-webkit-tap-highlight-color:transparent] max-md:h-11 max-md:w-11"

type Router = ReturnType<typeof useRouter>

/** The three new offer pages, fetched ahead in full. */
export function warmOfferKinds(router: Router) {
  for (const k of KIND_ORDER) prefetchAppPage(router, newOfferHref(k))
}

/** Up, down, Home and End move between the rows. */
function moveFocus(e: React.KeyboardEvent<HTMLElement>) {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-kind]"))
  const at = items.indexOf(document.activeElement as HTMLButtonElement)
  const n = items.length
  const next = e.key === "ArrowDown" ? (at + 1) % n : e.key === "ArrowUp" ? (at - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1
  if (next < 0 || !n) return
  e.preventDefault()
  items[next].focus()
}

export function OfferKindList({ onChoose }: { onChoose: (kind: OfferKind) => void }) {
  return (
    <ul className="space-y-2.5" data-kind-list="" role="list" onKeyDown={moveFocus}>
      {KIND_ORDER.map((k) => (
        <li key={k}>
          <button type="button" data-kind={k} onClick={() => onChoose(k)} className={ROW}>
            <span aria-hidden className="flex h-[52px] w-[76px] shrink-0 items-center rounded-xl bg-[#f4f5f7] px-1.5">
              <KindDrawing kind={k} on={false} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold leading-5 text-[#1a1a2e]">{KIND_WORD[k]()}</span>
              <span data-kind-hint={k} className="mt-0.5 block text-[13px] leading-[18px] text-[#6b7280] max-sm:text-[14px] max-sm:leading-5">
                {KIND_HINT[k]()}
              </span>
            </span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#b6bac2] transition-[translate,color] duration-150 group-hover/kind:translate-x-0.5 group-hover/kind:text-[#6b7280] motion-reduce:transition-none" />
          </button>
        </li>
      ))}
    </ul>
  )
}

type Control = { open: () => void; warm: () => void }

/**
 * The chooser, its state kept below the caller (opening it must not redraw
 * the list), as Add product's useNewProductChooser is. `chooser` goes
 * anywhere in the page's tree: it draws in a portal.
 */
export function useNewOfferChooser(): { open: () => void; warm: () => void; chooser: React.ReactNode } {
  const control = React.useRef<Control | null>(null)
  const open = React.useCallback(() => control.current?.open(), [])
  const warm = React.useCallback(() => control.current?.warm(), [])
  const chooser = React.useMemo(() => <NewOfferChooser control={control} />, [])
  return { open, warm, chooser }
}

const NewOfferChooser = React.memo(function NewOfferChooser({ control }: { control: React.RefObject<Control | null> }) {
  const router = useRouter()
  const [isOpen, setOpen] = React.useState(false)
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia(LAYER_PHONE)
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  const body = React.useRef<HTMLDivElement>(null)
  const opener = React.useRef<HTMLElement | null>(null)
  /* Where a pick goes, once the sheet has left (a phone) or at once (the dialog). */
  const target = React.useRef<string | null>(null)

  const warm = React.useCallback(() => warmOfferKinds(router), [router])
  const open = React.useCallback(() => {
    hapticTap("soft")
    warm()
    target.current = null
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    setPhone(window.matchMedia(LAYER_PHONE).matches)
    setOpen(true)
  }, [warm])

  const go = React.useCallback(() => {
    const href = target.current
    target.current = null
    if (!href) return
    startNavigationLoading(href)
    /* The page rises as a layer from the list on a phone, and its Back comes back here (./list-return). */
    offersReturn.open(router, href)
  }, [router])

  const choose = (kind: OfferKind) => {
    if (phone) hapticTap("soft")
    target.current = newOfferHref(kind)
    setOpen(false)
    if (!phone) go()
  }
  const close = () => setOpen(false)

  const heading = (
    <div data-offer-chooser-head="" className="flex shrink-0 items-center justify-between gap-3 bg-white px-5 pb-3 pt-2 md:px-0 md:pt-0">
      <SheetDialogTitle className="text-[17px] font-semibold leading-6 text-[#1a1a2e]">{tt("New offer")}</SheetDialogTitle>
      <button type="button" onClick={close} aria-label={tt("Close")} data-offer-chooser-close="" className={CLOSE}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )

  const chooser = (
    <SheetDialog
      open={isOpen}
      onClose={close}
      phone={phone}
      label={tt("New offer")}
      showCloseButton={false}
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        body.current?.querySelector<HTMLButtonElement>("[data-kind]")?.focus({ preventScroll: true })
      }}
      sheet={{ fill: false, aboveKeyboard: true, maxHeight: "min(800px, calc(var(--vv-h, 100dvh) - max(env(safe-area-inset-top, 0px), 16px) - 12px))", header: heading, dismissible: true, onClosed: go }}
      dialog={{
        "aria-describedby": undefined,
        onCloseAutoFocus: (e) => {
          const back = opener.current
          /* A pick is on its way to the page: no focus ring back on the list's button. */
          if (!back?.isConnected || window.location.pathname !== offersReturn.href) return
          e.preventDefault()
          back.focus({ preventScroll: true })
        },
      }}
      className="w-[calc(100%-32px)] max-w-[520px] gap-0 rounded-2xl border-[#e5e7eb] bg-white p-0 shadow-[0_24px_64px_-16px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none sm:max-w-[520px]"
    >
      <div ref={body} data-offer-chooser="" className="min-h-0 px-5 pb-3 md:pb-5 md:pt-5">
        {!phone ? heading : null}
        <OfferKindList onChoose={choose} />
      </div>
    </SheetDialog>
  )

  React.useImperativeHandle(control, () => ({ open, warm }), [open, warm])
  return chooser
})

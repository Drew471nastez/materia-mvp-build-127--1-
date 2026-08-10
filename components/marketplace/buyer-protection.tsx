"use client"

import { useState } from "react"
import { ShieldCheck } from "lucide-react"

import { PickerPage } from "@/components/sell/picker-page"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE MARK BESIDE THE PRICE, AND WHAT IT OPENS
 * ===========================================================================
 *
 * Prices are quoted inclusive of buyer protection now (see
 * lib/marketplace/display-price.ts). Quoting an inclusive number without saying
 * so would be the same lie in the other direction — a seller asking 130 whose
 * listing reads 141 with no explanation looks like a marketplace adding a
 * mystery margin.
 *
 * So: a shield and the word "incl.", small enough to sit on a grid card without
 * competing with the figure it qualifies. Not a coloured pill, not a banner —
 * this is a footnote to a number, and it has to be legible sixty times on one
 * screen without turning the grid into a wall of badges.
 */
export function ProtectionMark({
  onClick,
  className,
}: {
  /** Interactive on the listing page; a plain mark on a grid card, where a
   *  nested button inside the card's own link is a hit target fighting the one
   *  around it — and sixty subpages would be mounted to serve one tap. */
  onClick?: () => void
  className?: string
}) {
  const body = (
    <>
      <ShieldCheck className="h-[13px] w-[13px] shrink-0" strokeWidth={2.4} />
      <span className="leading-none">incl.</span>
    </>
  )

  const base = cn(
    "inline-flex shrink-0 items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-[3px] text-[11px] font-semibold text-neutral-500",
    className,
  )

  if (!onClick) {
    return (
      <span className={base} aria-label="Protecția cumpărătorului inclusă">
        {body}
      </span>
    )
  }

  return (
    <button
      type="button"
      aria-label="Ce înseamnă protecția cumpărătorului"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void triggerHaptic("light")
        onClick()
      }}
      className={cn(base, "transition-colors duration-200 ease-out active:duration-0 active:bg-neutral-200")}
    >
      {body}
    </button>
  )
}

/**
 * ===========================================================================
 *  WHAT THE SHIELD MEANS, ON ITS OWN SCREEN
 * ===========================================================================
 *
 * A subpage rather than a sheet, and PickerPage rather than a second
 * implementation of one. It lives under components/sell because that is where
 * the first eight of these were built, but nothing about it is about selling —
 * it is the app's answer to "a screen deeper into the same task", and building
 * a second one here would give the app two grammars for the same movement,
 * which is precisely what reads as unfinished.
 *
 * Written as answers to the three questions somebody actually has when they tap
 * a shield next to a number that is bigger than the seller's asking price:
 * what am I paying for, how much is it, and when do I get it back.
 */
export function BuyerProtectionPage({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <PickerPage open={open} title="Protecția cumpărătorului" onClose={onClose}>
      {() => (
        <div className="px-5 pb-10 pt-1">
          <div className="flex flex-col items-center pb-6 pt-2 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white">
              <ShieldCheck className="h-7 w-7" strokeWidth={2.2} />
            </span>
            <p className="text-[19px] font-bold tracking-[-0.015em] text-neutral-900">
              Prețul afișat este prețul final
            </p>
            <p className="mt-2 max-w-[320px] text-[14.5px] font-medium leading-relaxed text-neutral-500">
              Include deja taxa de protecție. La finalizarea comenzii se adaugă doar livrarea, în funcție de
              curierul ales.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-neutral-200/80">
            <Point title="Banii tăi sunt ținuți până primești coletul">
              Plata nu ajunge la vânzător în momentul comenzii. O eliberăm după ce articolul ajunge la tine și
              ai avut timp să îl verifici.
            </Point>
            <Point title="Primești banii înapoi dacă ceva nu e în regulă">
              Dacă articolul nu ajunge, ajunge deteriorat sau nu corespunde descrierii din anunț, deschizi o
              sesizare și îți returnăm suma plătită.
            </Point>
            <Point title="Cât costă" last>
              5% din prețul articolului, plus 4 lei. Suma este deja inclusă în prețul pe care îl vezi, așa că
              nu apare nimic în plus la final.
            </Point>
          </div>

          <p className="mt-4 px-1 text-[12.5px] font-medium leading-relaxed text-neutral-400">
            Taxa se aplică o singură dată pe comandă și nu se aplică livrării.
          </p>

          <button
            type="button"
            onClick={() => {
              void triggerHaptic("light")
              onClose()
            }}
            className="mt-7 flex h-[52px] w-full items-center justify-center rounded-lg bg-neutral-900 text-[15.5px] font-semibold text-white transition-colors duration-200 ease-out active:duration-0 active:bg-neutral-800"
          >
            Am înțeles
          </button>
        </div>
      )}
    </PickerPage>
  )
}

function Point({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={cn("px-4 py-4", !last && "border-b border-neutral-100")}>
      <p className="text-[15px] font-semibold tracking-[-0.01em] text-neutral-900">{title}</p>
      <p className="mt-1 text-[13.5px] font-medium leading-relaxed text-neutral-500">{children}</p>
    </div>
  )
}

/**
 * The pair, for a surface that wants both and does not want to hold the state.
 *
 * Returns the mark and mounts the subpage next to it. Only for screens that
 * show ONE price — a grid must not mount sixty of these, which is why
 * ProtectionMark is exported on its own for cards.
 */
export function ProtectionMarkWithPage({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ProtectionMark className={className} onClick={() => setOpen(true)} />
      <BuyerProtectionPage open={open} onClose={() => setOpen(false)} />
    </>
  )
}

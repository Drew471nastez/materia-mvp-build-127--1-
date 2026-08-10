"use client"

import { useCallback, useSyncExternalStore } from "react"
import { ShieldCheck } from "lucide-react"

import { PickerPage } from "@/components/sell/picker-page"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE MARK BESIDE THE PRICE, AND WHAT IT OPENS
 * ===========================================================================
 *
 * Prices are quoted inclusive of buyer protection (see
 * lib/marketplace/display-price.ts). Quoting an inclusive number without saying
 * so would be the same lie in the other direction — a seller asking 130 whose
 * listing reads 141 with no explanation looks like a marketplace adding a
 * mystery margin.
 *
 * ---------------------------------------------------------------------------
 * IT IS A CONTROL, NOT A LABEL — INCLUDING ON A GRID CARD
 * ---------------------------------------------------------------------------
 * It was inert on cards, and the reason was real: sixty cards meant sixty
 * subpages mounted to serve one tap, each with its own matchMedia listener and
 * its own stage machine. But a shield that does nothing where people actually
 * meet it is a promise the feed does not keep — the feed IS where somebody
 * first wonders why the number is what it is, and being told to open the
 * listing to find out is not an answer.
 *
 * So there is ONE subpage for the whole application, mounted once in the root
 * layout, and every mark on every surface opens that one. The store below is
 * three lines because that is all the state is: a boolean nobody owns.
 *
 * ---------------------------------------------------------------------------
 * AND IT IS NOT A CHIP, OR A CALL TO ACTION
 * ---------------------------------------------------------------------------
 * A filled grey pill beside every price turned the grid into two columns of
 * badges. Colouring the shield purple instead was worse in the other direction:
 * purple is what this interface uses for the thing it wants you to press, and
 * sixty of them down a feed is sixty calls to action drowning the numbers they
 * qualify. Shield and word in one quiet grey, at 11px, next to a bold price —
 * a footnote you notice exactly when you are already asking what it means.
 */

/* ── One subpage, one boolean, no provider ─────────────────────────────────
 *
 * A context would mean a provider high enough for every surface — the feed, the
 * profile grid, the listing page, the wishlist — re-rendering all of it to
 * toggle one panel. This is read with useSyncExternalStore, so opening the
 * panel re-renders the panel and nothing else. */
let panelOpen = false
const subscribers = new Set<() => void>()

function emit() {
  subscribers.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function openBuyerProtection() {
  void triggerHaptic("light")
  panelOpen = true
  emit()
}

export function closeBuyerProtection() {
  panelOpen = false
  emit()
}

/**
 * Mounted ONCE, in the root layout. Renders nothing until somebody taps a mark
 * — PickerPage is null while closed — so the cost of having it everywhere is a
 * single subscription.
 */
export function BuyerProtectionHost() {
  const open = useSyncExternalStore(
    subscribe,
    () => panelOpen,
    // The server never has a panel open, and saying otherwise would hydrate a
    // subpage onto a page that does not have one.
    () => false,
  )
  return <BuyerProtectionPage open={open} onClose={closeBuyerProtection} />
}

/**
 * The shield and the word, in one colour.
 *
 * `tone` exists for the one surface that is drawn over a photograph, where a
 * mid grey disappears and white does not.
 */
export function ProtectionMark({
  className,
  tone = "default",
}: {
  className?: string
  tone?: "default" | "onPhoto"
}) {
  const onClick = useCallback((e: React.MouseEvent) => {
    // It lives beside a price, inside a card whose photograph is a link. Without
    // both of these the tap opens the listing and the panel never appears.
    e.preventDefault()
    e.stopPropagation()
    openBuyerProtection()
  }, [])

  return (
    <button
      type="button"
      aria-label="Ce înseamnă protecția cumpărătorului"
      onClick={onClick}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-[3px] text-[11px] font-semibold leading-none",
        // The tap target is bigger than the mark. At 11px the glyph and the
        // word together are about forty pixels wide and twelve tall, which is
        // half of what a thumb needs — so the hit area is pushed out around it
        // without moving anything on the screen.
        "after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-['']",
        "transition-opacity duration-200 ease-out active:duration-0 active:opacity-55",
        tone === "onPhoto" ? "text-white/90" : "text-neutral-500",
        className,
      )}
    >
      {/* THE SAME GREY AS THE WORD, not the brand purple.
          
          Purple is what this interface uses for the thing it wants you to press
          — the compose button, Publish. On a footnote beside a price, repeated
          on every card in a grid, it reads as sixty calls to action, and the
          eye goes to them instead of to the numbers they qualify. A footnote
          should be quiet enough that you only notice it when you are already
          asking the question it answers. */}
      <ShieldCheck className="h-[13px] w-[13px] shrink-0" strokeWidth={2.5} />
      incl.
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
          {/* AIR ABOVE THE MARK.
              
              It sat two pixels under the title bar's hairline, so the badge read
              as attached to the chrome rather than as the first thing on the
              screen. A subpage whose content starts immediately under its own
              header has nothing separating what you navigated FROM from what
              you navigated TO. */}
          <div className="flex flex-col items-center pb-6 pt-8 text-center">
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

"use client"

/**
 * ===========================================================================
 *  THE SHOP ACROSS THE TOP OF A WEBSITE'S CHECKOUT
 * ===========================================================================
 * The basket checkout (app/checkout/cart) and the physical checkout
 * (app/checkout/physical) are reached from a creator's own website, so the
 * bar says whose shop it is and goes back to it: the same bar the product
 * checkout draws (app/checkout/checkout-client.tsx), the quiet rounded Back on
 * the left, the shop beside it, Continue shopping on the right.
 *
 * THE SHOP IS THE SERVER'S (lib/checkout/brand-server): the website's logo,
 * drawn as it is because a wordmark is wide (with the store logo's small
 * corner, components/brand/store-logo), or the person's photo, round,
 * beside the name. Settings › Checkout › Top of checkout picks what shows
 * (brand.shows): the logo with the name beside it (the default), the logo
 * alone, or the name alone. Without a logo, the photo and the name show.
 * Back is the page the buyer came from, checked on the
 * server against the shop's own sites; with the page right behind this one
 * in the tab's history it is a history step, which is instant, and the press
 * shows at once either way.
 */
import * as React from "react"
import { ArrowLeft, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { Spinner } from "./ui"
import { backThen } from "@/lib/navigation/go-back"
import { useCt } from "./words"
import { StoreLogo } from "@/components/brand/store-logo"

export interface ShopBrand {
  name: string
  imageUrl: string | null
  kind: "logo" | "photo" | null
  /** Settings › Checkout › Top of checkout. Absent: both. */
  shows?: "both" | "logo" | "name"
}

/** The host a link names, for "Back to …". */
function hostOf(href: string | null | undefined): string | null {
  if (!href) return null
  try {
    return new URL(href).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/** The page behind this one in the tab is the one Back goes to. */
function behindIs(target: string): boolean {
  try {
    if (window.history.length < 2 || !document.referrer) return false
    const ref = new URL(document.referrer)
    const to = new URL(target)
    return ref.origin === to.origin && ref.pathname === to.pathname
  } catch {
    return false
  }
}

export function ShopBar({
  brand,
  backTo,
  shopUrl,
  onLeave,
}: {
  brand: ShopBrand
  /** Where Back goes (the site's cart), checked on the server. Null: no Back. */
  backTo: string | null
  /** The site's home page, for the shop's name and Continue shopping. */
  shopUrl: string | null
  /** Told when the buyer leaves, so the page can ease back as it goes. */
  onLeave?: () => void
}) {
  const ct = useCt()
  const [leaving, setLeaving] = React.useState(false)
  const site = hostOf(backTo ?? shopUrl)
  const backLabel = site ? ct("Back to {site}", { site }) : ct("Back")

  const plain = (e: React.MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
  const goBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!backTo || !plain(e)) return
    setLeaving(true)
    onLeave?.()
    if (behindIs(backTo)) {
      e.preventDefault()
      /* A back that does nothing (a replaced entry, a web view) lands on the cart's own address instead. */
      backThen(() => window.location.assign(backTo))
    }
  }
  /* Back from the browser's cache: the press is over. */
  React.useEffect(() => {
    const shown = (e: PageTransitionEvent) => {
      if (e.persisted) setLeaving(false)
    }
    window.addEventListener("pageshow", shown)
    return () => window.removeEventListener("pageshow", shown)
  }, [])

  const shows = brand.shows ?? "both"
  const logo = brand.kind === "logo" && brand.imageUrl ? brand.imageUrl : null
  const nameText = <span className="truncate" data-shop-name="">{brand.name}</span>
  const face =
    shows === "name" ? (
      nameText
    ) : logo ? (
      <>
        {/* The store logo's small corner and no shadow (round 49, components/brand/store-logo). Narrower beside the name, so a phone keeps room for it. */}
        <StoreLogo src={logo} alt={shows === "both" ? "" : brand.name} height={32} className={shows === "logo" ? "max-w-[168px] sm:max-w-[200px]" : "max-w-[112px] shrink-0 sm:max-w-[168px]"} />
        {shows === "both" ? nameText : null}
      </>
    ) : (
      <>
        <AppAvatar src={brand.imageUrl} name={brand.name} alt="" size={28} className="shadow-[0_0_0_1px_rgba(17,17,19,0.06),0_1px_2px_rgba(17,17,19,0.08)]" />
        {nameText}
      </>
    )
  const faceClass = cn("flex min-h-[44px] min-w-0 items-center rounded-full py-1 pr-2.5 text-[14px] font-medium text-[#1a1a2e]", shows === "name" ? "pl-2.5 text-[15px] font-semibold" : logo ? "gap-2.5 pl-1" : "gap-2 pl-1")

  return (
    <header data-checkout-bar="" className="relative z-10 bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(17,17,19,0.055),0_4px_12px_-10px_rgba(17,17,19,0.09)]">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-1.5 px-4 sm:px-7 lg:h-16 lg:px-[60px]">
        {backTo ? (
          <a
            href={backTo}
            onClick={goBack}
            aria-label={backLabel}
            title={backLabel}
            data-back=""
            className="group/back grid h-11 w-11 shrink-0 place-items-center rounded-[12px] outline-none [-webkit-tap-highlight-color:transparent]"
          >
            <span
              className={cn(
                "relative grid h-9 w-9 place-items-center rounded-[10px] border border-black/[0.06] bg-white text-[#1a1a2e] shadow-[0_1px_1px_rgba(17,17,19,0.04),0_1px_3px_-1px_rgba(17,17,19,0.06)] transition-[scale,background-color] duration-150 ease-out group-hover/back:bg-[#f7f7f8] group-active/back:scale-[0.94] group-active/back:bg-[#f1f2f4] group-focus-visible/back:outline-2 group-focus-visible/back:outline-offset-2 group-focus-visible/back:outline-[#1a1a2e] motion-reduce:transition-none",
                leaving && "scale-[0.94] bg-[#f1f2f4]",
              )}
            >
              <ArrowLeft aria-hidden strokeWidth={2} className={cn("h-[18px] w-[18px] transition-[opacity,translate] duration-200 ease-out", leaving ? "opacity-0 delay-[250ms]" : "group-hover/back:-translate-x-px")} />
              {leaving ? <Spinner late className="absolute h-4 w-4 text-[#6b7280]" /> : null}
            </span>
          </a>
        ) : null}

        {shopUrl ? (
          <a href={shopUrl} data-shop-link="" data-shows={shows} className={cn(faceClass, "outline-none transition-[opacity] duration-150 hover:bg-black/[0.035] focus-visible:outline-2 focus-visible:outline-[#1a1a2e]/40 active:opacity-70 [-webkit-tap-highlight-color:transparent]")}>
            {face}
          </a>
        ) : (
          <span className={faceClass} data-shows={shows}>{face}</span>
        )}

        {shopUrl ? (
          <a href={shopUrl} data-continue="" className="group/shop ml-auto mr-1 hidden min-h-[44px] shrink-0 place-items-center outline-none [-webkit-tap-highlight-color:transparent] sm:grid">
            <span className="inline-flex h-9 items-center rounded-[9px] border border-[#e1e3e7] bg-white px-3.5 text-[13.5px] font-medium text-[#1a1a2e] shadow-[0_1px_1px_rgba(17,17,19,0.04)] transition-[scale] duration-150 ease-out group-hover/shop:border-[#d2d5da] group-hover/shop:bg-[#fafafb] group-active/shop:scale-[0.97] group-active/shop:bg-[#f3f4f6] group-focus-visible/shop:outline-2 group-focus-visible/shop:outline-offset-2 group-focus-visible/shop:outline-[#1a1a2e] motion-reduce:transition-none">
              {ct("Continue shopping")}
            </span>
          </a>
        ) : (
          <span className="ml-auto mr-1 flex items-center gap-1.5 text-[13px] text-[#6b7280]">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {ct("Secure checkout")}
          </span>
        )}
      </div>
    </header>
  )
}

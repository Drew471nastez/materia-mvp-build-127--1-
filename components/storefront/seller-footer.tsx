"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { openCookiePreferences } from "@/lib/consent/client"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal } from "@/lib/native-bridge"
import { StorelibLogo } from "@/components/brand/storelib-logo"

export interface SellerFooterSurface {
  backgroundColor?: string
  textColor?: string
  mutedColor?: string
  borderColor?: string
}

interface SellerFooterProps {
  isMobile?: boolean
  /**
   * THE FOOTER IS PART OF THE PAGE, NOT PART OF STORELIB.
   *
   * It was `bg-white` with grey links, whatever the creator's page was doing,
   * so a page on a dark scheme ended in a white band with "Powered by
   * Storelib" in it. The colours come from the scheme now; the classes remain
   * as the fallback for the builder canvas and the product pages, which
   * render this without a surface.
   */
  surface?: SellerFooterSurface
}

/**
 * How the footer is laid out. `stack` is the phone: "Powered by" centred on
 * top and the links centred under it. `row` is the desktop: "Powered by" on
 * the left and the links on the right. `responsive` is the live page, which
 * is `stack` below the `sm` breakpoint and `row` from it.
 *
 * isMobile=true is the editor's phone preview, isMobile=false its desktop
 * preview (still the phone layout on a real phone, where the row does not
 * fit), and no isMobile is a live page.
 */
type Layout = "stack" | "row" | "responsive"

/**
 * ===========================================================================
 *  THE LINKS ARE ONE GROUP
 * ===========================================================================
 * "Cookie preferences" used to be a second block under the footer's row,
 * centred on its own line in its own size, so on a desktop the footer read as
 * a bar with a stray link hanging under the middle of it. It is the third
 * link of the same group now: same size, same colour, same gap, on the same
 * line as Privacy Policy and Terms & Conditions. On a phone the three wrap
 * together, centred, under "Powered by".
 *
 * The classes live here once, so the three cannot drift apart again.
 */
const LINK_TYPE: Record<Layout, string> = {
  stack: "text-[12px] leading-5",
  row: "text-sm leading-5",
  responsive: "text-[12px] leading-5 sm:text-sm",
}
const LINKS_ROW: Record<Layout, string> = {
  stack: "flex w-full flex-wrap items-baseline justify-center gap-x-4 gap-y-1",
  row: "flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1",
  responsive: "flex w-full flex-wrap items-baseline justify-center gap-x-4 gap-y-1 sm:w-auto sm:justify-end sm:gap-x-6",
}

export function SellerFooter({ isMobile, surface }: SellerFooterProps = {}) {
  /**
   * An inline colour only when there is one, so an unthemed footer keeps
   * exactly the classes it had rather than being handed a second opinion.
   */
  const tone = (colour?: string) => (colour ? { color: colour } : undefined)
  const text = tone(surface?.textColor)
  const muted = tone(surface?.mutedColor)

  const storelibHref = `https://${process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"}/explore`

  const handleStorelibClick = (e: { preventDefault: () => void }) => {
    if (isNativeApp()) {
      e.preventDefault()
      openExternal(storelibHref)
    }
  }

  /* Render functions rather than components declared in here, so a re-render
     does not unmount and remount the footer's contents. */
  const poweredBy = (layout: Layout) => (
    <div
      className={cn(
        "flex items-center gap-1.5",
        layout === "stack" && "w-full justify-center",
        layout === "responsive" && "w-full justify-center sm:w-auto sm:justify-start",
      )}
    >
      <span
        className={cn(
          "whitespace-nowrap",
          layout === "stack" && "text-[12px] text-gray-400",
          layout === "row" && "text-sm text-gray-500",
          layout === "responsive" && "text-[12px] text-gray-400 sm:text-sm sm:text-gray-500",
        )}
        style={muted}
      >
        Powered by
      </span>
      <a
        href={storelibHref}
        onClick={handleStorelibClick}
        className={cn("inline-flex shrink-0 items-center", layout === "row" ? "gap-1.5" : "gap-1 sm:gap-1.5")}
        aria-label="Explore Storelib"
      >
        {/* 15px on a phone is under the 18px where 7px corners would make a
            circle, so there the corner follows the logo's proportion instead
            (lib/brand/logo.ts storelibLogoRadius), and it is 7px from 18px up. */}
        {layout === "responsive" ? (
          <StorelibLogo
            size={18}
            fluid
            className="h-[15px] w-[15px] [--storelib-logo-radius:3.3px] sm:h-[18px] sm:w-[18px] sm:[--storelib-logo-radius:7px]"
          />
        ) : (
          <StorelibLogo size={layout === "stack" ? 15 : 18} />
        )}
        <span
          className={cn(
            "font-semibold leading-none tracking-tight text-gray-700",
            layout === "stack" && "text-[12px]",
            layout === "row" && "text-sm",
            layout === "responsive" && "text-[12px] sm:text-sm",
          )}
          style={text}
        >
          Storelib
        </span>
      </a>
    </div>
  )

  const links = (layout: Layout) => {
    const link = cn(LINK_TYPE[layout], "whitespace-nowrap text-gray-500 transition-colors hover:text-gray-700")
    return (
      <nav aria-label="Legal" className={LINKS_ROW[layout]} data-footer-links>
        <a href="/privacy" className={link} style={muted}>
          Privacy Policy
        </a>
        <a href="/terms" className={link} style={muted}>
          Terms & Conditions
        </a>
        {/* How a visitor changes their cookie choice later: as easy as making it. */}
        <CookiePreferencesLink className={link} style={muted} />
      </nav>
    )
  }

  const stack = (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-3 px-4 py-5">
      {poweredBy("stack")}
      {links("stack")}
    </div>
  )

  return (
    <footer
      className="w-full bg-white border-t border-gray-100"
      data-seller-footer
      style={
        surface?.backgroundColor || surface?.borderColor
          ? { backgroundColor: surface.backgroundColor, borderTopColor: surface.borderColor }
          : undefined
      }
    >
      {isMobile === true ? (
        stack
      ) : isMobile === false ? (
        <>
          <div className="block sm:hidden">{stack}</div>
          <div className="hidden sm:block">
            <div className="mx-auto flex w-full max-w-6xl flex-row items-center justify-between gap-6 px-6 py-4">
              {poweredBy("row")}
              {links("row")}
            </div>
          </div>
        </>
      ) : (
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-5 sm:flex-row sm:justify-between sm:gap-6 sm:px-6 sm:py-4">
          {poweredBy("responsive")}
          {links("responsive")}
        </div>
      )}
    </footer>
  )
}

/**
 * A button, because it opens a dialog rather than going anywhere, drawn with
 * exactly the classes of the links beside it. The preflight already gives a
 * button the page's font; `p-0`, `border-0` and `bg-transparent` say so again
 * for a stylesheet that does not, so it sits on the same baseline at the same
 * size.
 *
 * NOT IN THE APP. The app has no banner, so there is nothing to reopen.
 * `html.capacitor` is set before the first paint, so the CSS rule hides it
 * there without the row moving; the effect covers the Android webview the
 * class does not catch.
 */
function CookiePreferencesLink({ className, style }: { className: string; style?: CSSProperties }) {
  const [native, setNative] = useState(false)
  useEffect(() => setNative(isNativeApp()), [])
  if (native) return null
  return (
    <button
      type="button"
      onClick={() => openCookiePreferences()}
      className={cn(className, "cursor-pointer border-0 bg-transparent p-0 text-left in-[.capacitor]:hidden")}
      style={style}
      data-cookie-preferences
    >
      Cookie preferences
    </button>
  )
}

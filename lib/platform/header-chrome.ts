/**
 * Buyer platform header (storelib.com, not /app): dark bar vs near-white bar.
 * Classes only; no CSS scale.
 */

/** Dark mode bar: near-black, not pure #000. */
export const BUYER_HEADER_DARK_BG = "#0e0e10"
/*
  LIGHT MODE BAR: WHITE, AND ONE SURFACE WITH THE STATUS BAR ABOVE IT. It was
  #fcfcfd at 98% over a blur, so on a phone it read as a grey a shade off the
  white band under the clock, and the page showed through it as it scrolled
  (the owner's screenshots of the library and the account). Now it is the
  band's own white (--native-band in app/globals.css), opaque, with a
  hairline at its foot and nothing else: content goes under it and is not
  seen. conditional-header's stand in uses the same value, so nothing
  flashes.
*/
export const BUYER_HEADER_LIGHT_BG = "#ffffff"
export type HeaderChrome = {
  root: string
  header: string
  headerBorder: string
  focus: string
  wordmark: string
  wordmarkPhone: string
  navActive: string
  navIdle: string
  iconBtn: string
  menuBtn: string
  hamburger: string
  /** The navigator's three lines (components/nav/place-navigator.tsx): colour, hover and focus on this bar. */
  navigator: string
  catBtn: string
  catBtnOpen: string
  guestDivider: string
  guestSell: string
  guestLogin: string
  concaveBg: string
  /* The desktop search field is no longer the bar's colours: it is Explore's hero field on any bar (lib/explore/search-field-look). */
}

const LIGHT_FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white"

const DARK_FOCUS =
  `outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[${BUYER_HEADER_DARK_BG}]`

export function headerChrome(light: boolean): HeaderChrome {
  if (!light) {
    return {
      root: `platform-header-depth z-40 w-full bg-[${BUYER_HEADER_DARK_BG}] backdrop-blur supports-[backdrop-filter]:bg-[${BUYER_HEADER_DARK_BG}]`,
      header: `w-full bg-[${BUYER_HEADER_DARK_BG}]`,
      headerBorder: "border-b border-white/10",
      focus: DARK_FOCUS,
      wordmark: "text-[21px] font-bold text-white tracking-tight",
      wordmarkPhone: "text-[19px] font-bold text-white tracking-tight",
      navActive: "border-white/20 bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]",
      navIdle:
        "border-transparent text-white/70 hover:text-white hover:bg-white/10 hover:border-white/15 active:scale-[0.98]",
      iconBtn: "text-white/80 hover:text-white hover:bg-white/10",
      menuBtn: "bg-white/10 backdrop-blur-sm border border-white/15 text-white hover:bg-white/15",
      hamburger: "text-white",
      navigator: "text-white hover:bg-white/10 focus-visible:ring-white/40",
      catBtn: "text-white/80 hover:bg-white/10 hover:text-white",
      catBtnOpen: "bg-white/15 text-white",
      guestDivider: "bg-white/15",
      guestSell: "text-white/85 hover:text-white",
      guestLogin: "border-white/30 text-white hover:border-white/55 hover:bg-white/[0.06]",
      concaveBg: `bg-[${BUYER_HEADER_DARK_BG}]`,
    }
  }

  return {
    root: "platform-header-light z-40 w-full bg-white",
    header: "w-full bg-transparent",
    headerBorder: "border-b border-[rgba(16,18,27,0.06)]",
    focus: LIGHT_FOCUS,
    wordmark: "text-[21px] font-bold text-[#1a1a2e] tracking-tight",
    wordmarkPhone: "text-[19px] font-bold text-[#1a1a2e] tracking-tight",
    navActive:
      "border-[rgba(16,18,27,0.08)] bg-[rgba(16,18,27,0.05)] text-[#1a1a2e] shadow-[inset_0_0_0_1px_rgba(16,18,27,0.04)]",
    navIdle:
      "border-transparent text-[#5c6574] hover:text-[#1a1a2e] hover:bg-[rgba(16,18,27,0.04)] hover:border-[rgba(16,18,27,0.06)] active:scale-[0.98]",
    iconBtn: "text-[#5c6574] hover:text-[#1a1a2e] hover:bg-[rgba(16,18,27,0.05)]",
    menuBtn:
      "bg-[rgba(16,18,27,0.04)] backdrop-blur-sm border border-[rgba(16,18,27,0.08)] text-[#1a1a2e] hover:bg-[rgba(16,18,27,0.06)]",
    hamburger: "text-[#1a1a2e]",
    navigator: "text-[#1a1a2e] hover:bg-[rgba(16,18,27,0.05)] focus-visible:ring-[#1a1a2e]/20",
    catBtn: "text-[#5c6574] hover:bg-[rgba(16,18,27,0.05)] hover:text-[#1a1a2e]",
    catBtnOpen: "bg-[rgba(16,18,27,0.06)] text-[#1a1a2e]",
    guestDivider: "bg-[rgba(16,18,27,0.1)]",
    guestSell: "text-[#5c6574] hover:text-[#1a1a2e]",
    guestLogin: "border-[rgba(16,18,27,0.12)] text-[#1a1a2e] hover:border-[rgba(16,18,27,0.2)] hover:bg-[rgba(16,18,27,0.03)]",
    concaveBg: "bg-white",
  }
}

/**
 * The 20px rounded edge under the header on storelib.com's own pages
 * (platform-header-client draws it). One answer for both the header and its
 * stand in (components/marketing/conditional-header), so the stand in leaves
 * the same room and nothing below moves when the real header replaces it
 * (round AB1: measured as a 19px shift of the whole page, CLS 0.02).
 */
export function hasConcaveEdge(pathname: string): boolean {
  if (pathname === "/faq") return false
  return pathname === "/" || pathname.startsWith("/features") || pathname.startsWith("/blog") || pathname.startsWith("/pricing") || pathname === "/developers" || pathname.startsWith("/developers/")
}

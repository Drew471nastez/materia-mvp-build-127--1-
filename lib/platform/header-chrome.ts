/**
 * Buyer platform header (storelib.com, not /app): dark bar vs near-white bar.
 * Classes only; no CSS scale.
 */

/*
  DARK MODE BAR: A SURFACE A STEP ABOVE THE PAGE, NOT BLACK ON BLACK (round
  AD5). It was #0e0e10, darker than the dark look's page (#111113) and the
  same as the front page's hero panel, so on Explore it read as "pitch black
  with no depth". Now a near black a step lighter than both, with a hairline
  at its foot (headerBorder), a faint top light and, once the page is
  scrolled, a soft shadow (app/globals.css .platform-header-depth). Still
  near black, never the dark look's graphite.

  The classes are built from this value below; Tailwind sees them written
  out in components/marketing/conditional-header.tsx and
  platform-header-client.tsx: bg-[#16161a] ring-offset-[#16161a].
*/
export const BUYER_HEADER_DARK_BG = "#16161a"
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
      /* Landing round 14: no backdrop-blur. The bar is a solid colour, so the blur drew nothing, and a backdrop filter on a sticky bar makes Safari on a phone filter the page under it again on every frame of a scroll (the owner: the header "pops and flashes"). */
      root: `platform-header-depth z-40 w-full bg-[${BUYER_HEADER_DARK_BG}]`,
      header: `w-full bg-[${BUYER_HEADER_DARK_BG}]`,
      headerBorder: "border-b border-white/[0.08]",
      focus: DARK_FOCUS,
      wordmark: "text-[21px] font-bold text-white tracking-tight",
      wordmarkPhone: "text-[19px] font-bold text-white tracking-tight",
      navActive: "border-white/20 bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]",
      navIdle:
        "border-transparent text-white/70 hover:text-white hover:bg-white/10 hover:border-white/15 active:scale-[0.98]",
      iconBtn: "text-white/80 hover:text-white hover:bg-white/10",
      /* A key, as the community's bar has it (round 24): a hairline, a top light and a soft drop under it. */
      menuBtn: "bg-[#262626] border border-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.45),0_4px_10px_-4px_rgba(0,0,0,0.55)] hover:bg-[#2e2e2e] active:bg-[#1f1f1f] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]",
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
    /* The community bar's key (components/community/member/ui.ts DEPTH_ICON_BTN), round 24. */
    menuBtn:
      "bg-[#f8f9fa] border border-[#e6e8eb] text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.04)] hover:bg-[#f1f2f4] hover:border-[#dcdfe3] active:shadow-none",
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
  /*
    Not on the front page (round AC1): its hero is a rounded panel of its own,
    inset under the header, and the owner asked for less room between the
    two. The edge was 20px of it.
  */
  return pathname.startsWith("/features") || pathname.startsWith("/blog") || pathname.startsWith("/pricing") || pathname === "/alternatives" || pathname.startsWith("/alternatives/") || pathname.startsWith("/sell/") || pathname === "/developers" || pathname.startsWith("/developers/")
}

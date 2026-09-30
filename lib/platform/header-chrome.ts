/**
 * Buyer platform header (storelib.com, not /app): dark bar vs near-white bar.
 * Classes only; no CSS scale.
 */

/** Dark mode bar: near-black, not pure #000. */
export const BUYER_HEADER_DARK_BG = "#0e0e10"
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
  catBtn: string
  catBtnOpen: string
  guestDivider: string
  guestSell: string
  guestLogin: string
  deskSearchIcon: string
  deskSearchField: string
  deskSearchClear: string
  wishlistRing: string
  concaveBg: string
}

const LIGHT_FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f8f9]"

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
      catBtn: "text-white/80 hover:bg-white/10 hover:text-white",
      catBtnOpen: "bg-white/15 text-white",
      guestDivider: "bg-white/15",
      guestSell: "text-white/85 hover:text-white",
      guestLogin: "border-white/30 text-white hover:border-white/55 hover:bg-white/[0.06]",
      deskSearchIcon: "text-white/40",
      deskSearchField:
        "bg-white/10 border-white/15 text-white placeholder:text-white/50 focus-visible:border-white/45 focus:border-white/45",
      deskSearchClear: "text-white/40 hover:text-white/70",
      wishlistRing: `ring-[${BUYER_HEADER_DARK_BG}]`,
      concaveBg: `bg-[${BUYER_HEADER_DARK_BG}]`,
    }
  }

  return {
    root:
      "platform-header-light platform-header-depth z-40 w-full bg-[#f7f8f9] backdrop-blur supports-[backdrop-filter]:bg-[#f7f8f9]/98",
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
    catBtn: "text-[#5c6574] hover:bg-[rgba(16,18,27,0.05)] hover:text-[#1a1a2e]",
    catBtnOpen: "bg-[rgba(16,18,27,0.06)] text-[#1a1a2e]",
    guestDivider: "bg-[rgba(16,18,27,0.1)]",
    guestSell: "text-[#5c6574] hover:text-[#1a1a2e]",
    guestLogin: "border-[rgba(16,18,27,0.12)] text-[#1a1a2e] hover:border-[rgba(16,18,27,0.2)] hover:bg-[rgba(16,18,27,0.03)]",
    deskSearchIcon: "text-[#9aa3b2]",
    deskSearchField:
      "bg-white border-[rgba(16,18,27,0.08)] text-[#1a1a2e] placeholder:text-[#9aa3b2] shadow-[0_1px_2px_rgba(16,18,27,0.04)] focus-visible:border-[rgba(16,18,27,0.14)] focus:border-[rgba(16,18,27,0.14)]",
    deskSearchClear: "text-[#9aa3b2] hover:text-[#5c6574]",
    wishlistRing: "ring-[#f7f8f9]",
    concaveBg: "bg-[#f7f8f9]",
  }
}

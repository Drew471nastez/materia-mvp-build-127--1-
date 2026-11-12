/* The log in page's buttons and link, as classes, for pages drawn in its layout (components/auth/auth-split). No React here, so a client button imports them without the layout. */

/** The login page's Continue. */
export const AUTH_BTN_PRIMARY =
  "inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 text-[15px] font-semibold text-white outline-none transition-colors hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-900/30 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
/** The login page's Continue with Google: outlined, the same height. */
export const AUTH_BTN_SECONDARY =
  "inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-[15px] font-medium text-neutral-700 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:cursor-not-allowed disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"
/** The login page's "Sign up" under the form. */
export const AUTH_LINK = "font-medium text-purple-600 hover:text-purple-700"

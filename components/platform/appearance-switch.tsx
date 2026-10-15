"use client"

/**
 * The light and dark switch (lib/appearance), in the two shapes it takes:
 *
 *   AppearanceMenuRow   a row in the account menu and the phone's account
 *                       sheet: "Dark mode" with a switch at its end that
 *                       slides as it is pressed. The menu stays open, so the
 *                       page can be seen turning under it.
 *   AppearanceButton    the sun and moon in a community's bar on a computer,
 *                       beside the bell: one glyph turns into the other.
 *
 * Pressed, each gives a little under the finger (the button, or the knob)
 * and springs back as the new look fades in.
 *
 * Both only appear on Storelib's own buyer pages (themedPath): the dashboard
 * keeps its own look.
 */
import { Moon, Sun } from "lucide-react"
import { usePathname } from "next/navigation"
import { chooseAppearance, useAppearanceChoice, usePageDefaultAppearance } from "@/lib/appearance/client"
import { themedPath } from "@/lib/appearance/site-appearance"
import { cn } from "@/lib/utils"

/** The look on screen now, and the switch to the other one; null off Storelib's buyer pages. */
export function useAppearanceSwitch(): { dark: boolean; flip: () => void } | null {
  const pathname = usePathname()
  const choice = useAppearanceChoice()
  const pageDefault = usePageDefaultAppearance()
  if (!themedPath(pathname)) return null
  const dark = (choice ?? pageDefault ?? "light") === "dark"
  return { dark, flip: () => chooseAppearance(dark ? "light" : "dark") }
}

/** The switch's own track and knob. */
export function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      data-appearance-switch={on ? "on" : "off"}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
        on ? "bg-[#3a3a42]" : "bg-[#e3e5e9]",
      )}
    >
      <span
        className={cn(
          "absolute left-[3px] h-4 w-4 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-[translate,background-color,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-active/appearance:scale-[0.85] motion-reduce:transition-none",
          on ? "translate-x-4 bg-[#ececee]" : "translate-x-0 bg-white",
        )}
      />
    </span>
  )
}

/** "Dark mode" with its switch, for a menu (desktop) or a sheet (phone). */
export function AppearanceMenuRow({ className, iconClassName }: { className: string; iconClassName: string }) {
  const sw = useAppearanceSwitch()
  if (!sw) return null
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={sw.dark}
      data-account-item="appearance"
      onClick={sw.flip}
      className={cn(className, "group/appearance justify-between")}
    >
      <span className="flex min-w-0 items-center gap-[inherit]">
        {sw.dark ? <Moon aria-hidden className={iconClassName} strokeWidth={1.75} /> : <Sun aria-hidden className={iconClassName} strokeWidth={1.75} />}
        Dark mode
      </span>
      <Switch on={sw.dark} />
    </button>
  )
}

/** The sun and moon beside the bell in a community's bar (a computer). */
export function AppearanceButton({ className }: { className?: string }) {
  const sw = useAppearanceSwitch()
  if (!sw) return null
  return (
    <button
      type="button"
      onClick={sw.flip}
      aria-label={sw.dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={sw.dark}
      data-appearance-button={sw.dark ? "dark" : "light"}
      className={cn("relative grid h-10 w-10 place-items-center rounded-full text-[#4b5563] outline-none transition-[background-color,color,scale] duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.9] motion-reduce:transition-none hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15", className)}
    >
      <Sun
        aria-hidden
        strokeWidth={1.8}
        className={cn("absolute h-[21px] w-[21px] transition-[opacity,rotate,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none", sw.dark ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100")}
      />
      <Moon
        aria-hidden
        strokeWidth={1.8}
        className={cn("absolute h-[20px] w-[20px] transition-[opacity,rotate,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none", sw.dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0")}
      />
    </button>
  )
}

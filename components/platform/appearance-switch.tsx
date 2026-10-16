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
 * Pressed, the button gives a little under the finger and springs back as
 * the new look fades in. The knob only slides: a squeeze on top of the slide
 * read as the circle glitching.
 *
 * Both only appear on Storelib's own buyer pages (themedPath): the dashboard
 * keeps its own look.
 */
import { Moon, Sun } from "lucide-react"
import { usePathname } from "next/navigation"
import { chooseAppearance, useAppearanceChoice, usePageDefaultAppearance } from "@/lib/appearance/client"
import { themedPath } from "@/lib/appearance/site-appearance"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { cn } from "@/lib/utils"

/**
 * The look on screen now, and the switch to the other one; null off Storelib's buyer pages. `flip` takes the control
 * that was pressed, which then moves live through the page's fade instead of as a still (lib/appearance/client.ts).
 */
export function useAppearanceSwitch(): { dark: boolean; flip: (own?: HTMLElement | null) => void } | null {
  const pathname = usePathname()
  const choice = useAppearanceChoice()
  const pageDefault = usePageDefaultAppearance()
  if (!themedPath(pathname)) return null
  const dark = (choice ?? pageDefault ?? "light") === "dark"
  return { dark, flip: (own) => chooseAppearance(dark ? "light" : "dark", own) }
}

/**
 * The switch's track and knob: the one switch every toggle draws (components/ui/switch-style.ts), a knob that slides
 * on translate alone over 200ms. The dark look turns it over (app/theme-dark.css, from aria-checked on the row).
 */
export function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden data-appearance-switch={on ? "on" : "off"} className={switchTrack(on)}>
      <span data-appearance-knob="" className={switchKnob(on)} />
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
      onClick={(e) => sw.flip(e.currentTarget.querySelector<HTMLElement>("[data-appearance-switch]"))}
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
      onClick={(e) => sw.flip(e.currentTarget)}
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

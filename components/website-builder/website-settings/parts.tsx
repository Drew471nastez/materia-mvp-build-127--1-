"use client"

/**
 * The pieces every Website Settings page is built from, drawn once so the
 * nine pages read as one place.
 *
 * The shape is a settings page's, not a form's: a card per subject, a row
 * per fact with its label on the left and its value or control on the
 * right, and a thin rule between rows. On a phone the label goes above.
 * Dark, because this page stands over the builder and the builder is dark,
 * unless the person chose light (lib/appearance): the panels keep their dark
 * classes and app/website-settings-light.css gives each its light step under
 * [data-ws-look="light"] (scripts/gen-website-settings-light.mjs).
 */

import * as React from "react"
import { Check, Copy, ExternalLink, Globe, Moon, Sun, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { switchKnob, switchKnobDark, switchTrack, switchTrackDark } from "@/components/ui/switch-style"
import { chooseAppearance, useAppearanceChoice } from "@/lib/appearance/client"
import { tt, msg } from "@/lib/i18n/text"

/* ── Light or dark ─────────────────────────────────────────────────────────── */

export type SettingsLook = "light" | "dark"

/**
 * The look Website Settings is drawn in: the person's own light or dark choice,
 * the one Explore, the account and the communities follow (lib/appearance), so
 * choosing here is choosing there. Dark for a person who never chose, as this
 * page has always been.
 */
export function useSettingsLookChoice(): SettingsLook {
  return useAppearanceChoice() ?? "dark"
}

export const SettingsLookContext = React.createContext<SettingsLook>("dark")
/** For a part that draws itself differently in the light: a switch, an image picker, a tone. */
export const useSettingsLook = () => React.useContext(SettingsLookContext)

/**
 * Around a shared part that has its own dark drawing (Tailwind's `dark:`, read
 * from a `.dark` ancestor): the image picker, the rich text field. In the light
 * look they keep their own light drawing.
 */
export function DarkScope({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(useSettingsLook() === "dark" && "dark", className) || undefined} {...rest} />
}

/**
 * The sun and the moon, beside Back to editor. Pressed, the page fades from one
 * look into the other in one picture (lib/appearance/client.ts swap: a View
 * Transition, nothing per element) while this button moves live on its own
 * layer, one glyph turning into the other.
 */
export function LookButton({ look }: { look: SettingsLook }) {
  const dark = look === "dark"
  return (
    <button
      type="button"
      onClick={(e) => chooseAppearance(dark ? "light" : "dark", e.currentTarget)}
      aria-label={tt("Dark mode")}
      aria-pressed={dark}
      title={tt("Dark mode")}
      data-ws-look-switch={look}
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white/60 outline-none transition-[background-color,color,scale] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 active:scale-[0.92] motion-reduce:transition-none md:h-9 md:w-9 [-webkit-tap-highlight-color:transparent]"
    >
      <Sun
        aria-hidden
        strokeWidth={1.8}
        className={cn("absolute h-[18px] w-[18px] transition-[opacity,rotate,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none", dark ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100")}
      />
      <Moon
        aria-hidden
        strokeWidth={1.8}
        className={cn("absolute h-[17px] w-[17px] transition-[opacity,rotate,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none", dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0")}
      />
    </button>
  )
}

/**
 * The subject's name, and its one action beside it. On a phone the action
 * stays on the heading's line at its own width, and only drops under the
 * heading when the two do not fit; it used to go full width under every
 * heading, a slab of button before anything was said.
 */
export function PageTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 md:items-end">
      <h1 className="min-w-0 text-[24px] font-semibold tracking-[-0.01em] md:text-[28px]">{children}</h1>
      {aside}
    </div>
  )
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 max-w-[600px] text-[14px] leading-relaxed text-white/55 md:text-[14.5px]">{children}</p>
}

export function Card({ title, children, className, footer }: { title?: string; children: React.ReactNode; className?: string; footer?: React.ReactNode }) {
  return (
    <section className={cn("mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] md:mt-6", className)}>
      {title && <h2 className="border-b border-white/[0.07] px-4 py-3.5 text-[14px] font-semibold text-white/90 md:px-6">{title}</h2>}
      <div className="divide-y divide-white/[0.07]">{children}</div>
      {footer && <div className="border-t border-white/[0.07] px-4 py-3 text-[13px] leading-snug text-white/50 md:px-6">{footer}</div>}
    </section>
  )
}

/**
 * One fact or one control. `stack` puts the control under its label at every
 * width, for the controls that need the room: a text area, an image.
 * `inline` keeps a small control (a switch, a badge, one button) on the
 * label's line on a phone too, the way a phone's own settings do, instead of
 * a line of its own under the words.
 */
export function Row({
  label,
  hint,
  children,
  stack = false,
  inline = false,
  htmlFor,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  children?: React.ReactNode
  stack?: boolean
  inline?: boolean
  htmlFor?: string
}) {
  const Label = htmlFor ? "label" : "div"
  return (
    <div
      className={cn(
        "flex px-4 py-4 md:px-6",
        inline && !stack
          ? "flex-row items-center justify-between gap-4 md:gap-6"
          : cn("flex-col gap-2.5", !stack && "md:flex-row md:items-center md:justify-between md:gap-6"),
      )}
    >
      <div className={cn("min-w-0", !stack && (inline ? "flex-1" : "md:flex-1"))}>
        <Label {...(htmlFor ? { htmlFor } : {})} className="block text-[14.5px] font-medium text-white">
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-[13px] leading-snug text-white/50">{hint}</p>}
      </div>
      {children !== undefined && <div className={cn("min-w-0", !stack && (inline ? "shrink-0" : "md:shrink-0"))}>{children}</div>}
    </div>
  )
}

/**
 * 16px text on a phone, and that is not a matter of taste: iOS zooms the
 * whole page into any field whose text is smaller than 16px the moment it is
 * focused, and leaves it zoomed. 44px tall there, a thumb's height; the
 * desktop keeps its 40.
 */
export const inputClass =
  "h-11 w-full min-w-0 rounded-lg border border-white/12 bg-[#171717] px-3.5 text-[16px] text-white outline-none transition-colors duration-150 placeholder:text-white/30 focus:border-white/35 md:h-10 md:w-[320px] md:text-[14.5px]"

/** A text area with the same edge, fill and phone rule as a field. */
export const textAreaClass =
  "w-full resize-none rounded-lg border border-white/12 bg-[#171717] px-3.5 py-2.5 text-[16px] leading-relaxed text-white outline-none transition-colors duration-150 placeholder:text-white/30 focus:border-white/35 md:text-[14.5px]"

/**
 * The editor bar's depth, drawn for the dark page: a line of light along the
 * top and a shade at the foot, flat and a step darker when pressed. 44px on a
 * phone, 36 on a desktop.
 */
export const buttonClass =
  "inline-flex h-11 shrink-0 select-none items-center justify-center gap-2 rounded-[10px] border border-white/[0.13] bg-white/[0.06] px-4 text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.4)] transition-[background-color,box-shadow] duration-100 hover:bg-white/[0.1] active:bg-white/[0.04] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] disabled:cursor-default disabled:opacity-50 md:h-9 md:rounded-lg md:px-3.5 md:text-[14px] [-webkit-tap-highlight-color:transparent]"

export const primaryButtonClass =
  "inline-flex h-11 shrink-0 select-none items-center justify-center gap-2 rounded-[10px] bg-white px-4 text-[15px] font-semibold text-[#0f0f0f] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.4)] transition-[opacity,box-shadow] duration-100 hover:opacity-90 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] disabled:cursor-default disabled:opacity-50 md:h-9 md:rounded-lg md:text-[14px] [-webkit-tap-highlight-color:transparent]"

/**
 * A word that goes somewhere, inside a hint or beside a badge. Its box is the
 * word; on a phone its press area is a thumb's height around it, an
 * invisible band above and below, so no text moves to make room.
 */
export const textLinkClass =
  "relative inline-flex items-center text-white/75 underline underline-offset-2 transition-colors hover:text-white after:absolute after:-inset-x-1 after:-inset-y-[13px] after:content-[''] md:after:hidden [-webkit-tap-highlight-color:transparent]"

/** A square icon button (copy, open): 44px on a phone, 32 on a desktop. */
export const iconButtonClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white active:bg-white/[0.08] md:h-8 md:w-8 md:rounded-md [-webkit-tap-highlight-color:transparent]"

type Tone = "live" | "neutral" | "attention" | "critical"

const TONE: Record<Tone, string> = {
  live: "bg-emerald-400/12 text-emerald-300",
  neutral: "bg-white/[0.08] text-white/70",
  attention: "bg-amber-400/12 text-amber-200",
  critical: "bg-red-500/15 text-red-300",
}

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12.5px] font-medium", TONE[tone])}>
      {tone === "live" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />}
      {children}
    </span>
  )
}

/**
 * A switch: the app's one switch (components/ui/switch-style.ts), in its
 * dark drawing, so the knob slides on transform over the same 200ms curve
 * as everywhere else. A real checkbox underneath, so a keyboard and a
 * screen reader get one for free.
 */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  const light = useSettingsLook() === "light"
  return (
    /* 22px drawn in a 24px box, 44px pressed: the band around it belongs to the label. */
    <label
      data-toggle={checked ? "on" : "off"}
      className="relative inline-flex h-6 w-[38px] shrink-0 cursor-pointer items-center after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-[''] [-webkit-tap-highlight-color:transparent]"
    >
      <input type="checkbox" className="peer sr-only" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={cn(light ? switchTrack(checked) : switchTrackDark(checked), "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white/60")}>
        <span data-toggle-knob="" className={light ? switchKnob(checked) : switchKnobDark(checked)} />
      </span>
    </label>
  )
}

/** The site's address with copy and open, the same everywhere it appears. */
export function AddressValue({ url, display }: { url: string; display: string }) {
  const [copied, setCopied] = React.useState(false)
  if (!url) return <span className="text-[14.5px] text-white/50">{tt("No address yet")}</span>
  return (
    <span className="-mr-2 flex min-w-0 items-center md:mr-0 md:gap-1">
      <span className="min-w-0 flex-1 truncate text-[14.5px] text-white/85 md:flex-none">{display}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1400)
          })
        }}
        className={iconButtonClass}
        aria-label={copied ? tt("Address copied") : tt("Copy address")}
      >
        {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={iconButtonClass}
        aria-label={tt("Open the website")}
      >
        <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
      </a>
    </span>
  )
}

/** A character count that turns amber past the length search engines show. */
export function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={cn("text-[12px] tabular-nums", value.length > max ? "text-amber-300" : "text-white/50")}>
      {value.length}/{max}
    </span>
  )
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[14px] text-red-300">{children}</p>
}

/** Settings stored with the draft say so once, under their card. */
export const GOES_LIVE = msg("Saved with your draft. Visitors see it after you publish.")

/**
 * A search result, drawn the way Google draws one in its dark theme, on the
 * page's own dark: it was a white card, the one light thing on the dark
 * settings page (round R6, the owner: "in dark UI the SEO preview is white").
 * The colours are a search page's, so it still reads as a result.
 */
export function SearchResultPreview({ address, title, description, compact = false }: { address: string; title: string; description: string; compact?: boolean }) {
  return (
    <div
      className={cn("rounded-xl border border-white/[0.08] bg-[#171717] text-left", compact ? "p-4" : "rounded-2xl p-4 md:p-6")}
      aria-label={tt("Search result preview")}
      data-search-preview=""
    >
      <p className={cn("truncate text-[#bdc1c6]", compact ? "text-[12.5px]" : "text-[13px]")}>{address}</p>
      <p className={cn("mt-0.5 truncate leading-snug text-[#8ab4f8]", compact ? "text-[17px]" : "mt-1 text-[19px]")}>{title}</p>
      <p className={cn("mt-0.5 line-clamp-2 leading-snug text-[#bdc1c6]/85", compact ? "text-[13px]" : "mt-1 text-[13.5px]")}>{description}</p>
    </div>
  )
}

/**
 * A browser tab, small: the website's icon and the title its home page
 * gives the tab, cut where a browser cuts it. What SEO & Social's site
 * title and General's favicon look like where a visitor sees them both
 * (lib/website-builder/tab-title.ts). No icon, or one that will not load,
 * is drawn as a browser draws none: a globe.
 */
export function BrowserTabPreview({ icon, title, className }: { icon?: string; title: string; className?: string }) {
  const [failed, setFailed] = React.useState<string | null>(null)
  const src = icon && failed !== icon ? icon : null
  return (
    /* The tab strip, the tab, and the top of the toolbar it opens onto, as a dark browser draws them. */
    <div className={cn("flex w-[248px] min-w-0 max-w-full flex-col overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#1b1b1b]", className)} aria-label={tt("Browser tab preview")} data-tab-preview="">
      <div className="flex px-1.5 pt-1.5">
        <div className="flex h-8 min-w-0 max-w-[212px] flex-1 items-center gap-2 rounded-t-[8px] bg-[#2b2b2b] pl-2.5 pr-2">
          {src ? (
            <img src={src} alt="" width={16} height={16} className="h-4 w-4 shrink-0 rounded-[3px] object-contain" onError={() => setFailed(src)} />
          ) : (
            <Globe className="h-4 w-4 shrink-0 text-white/50" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/85" data-tab-title="">{title}</span>
          <X className="h-3 w-3 shrink-0 text-white/50" aria-hidden />
        </div>
      </div>
      <div className="h-2 bg-[#2b2b2b]" aria-hidden />
    </div>
  )
}

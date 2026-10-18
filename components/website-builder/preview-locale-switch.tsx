"use client"

/**
 * ===========================================================================
 *  WHICH LANGUAGE AND CURRENCY THE EDITOR SHOWS
 * ===========================================================================
 * The store's languages (Settings › Markets and languages, hidden ones
 * included, so a language can be prepared before visitors see it) and the
 * currencies a visitor can be shown, in one place. A choice changes the
 * canvas (its words and its prices) and the language the sidebar's text
 * settings write (components/website-builder/editor/translation-editing.tsx).
 * It never changes the live website: visitors pick their own.
 *
 * Two shapes of one model:
 *   PreviewLocaleButton    the top bar's small globe beside the page
 *                          switcher, "EN USD", opening a small list
 *   SidebarLanguageBar     one row at the top of the sidebar (a phone's
 *                          sheet included) opening the same light list
 *   PreviewLocaleSelects   two plain selects, for Website settings
 *
 * Remembered for the tab, per website (use-preview-language.ts,
 * use-preview-market.ts).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react"
import type React from "react"
import { Check, ChevronDown, Globe } from "lucide-react"
import { AnchoredPanel } from "@/components/website-builder/anchored-panel"
import { Reveal } from "@/components/ui/reveal"
import { cn } from "@/lib/utils"
import { activeLocale, tt } from "@/lib/i18n/text"
import { languageName } from "@/lib/markets/locales"

export interface PreviewLocaleModel {
  /** Every language of the website, its own first. */
  languages: string[]
  published: string[]
  defaultLanguage: string
  /** Shown now; null is the website's own. */
  locale: string | null
  setLocale: (code: string | null) => void
  /** The store's own currency. */
  base: string
  /** The currencies a visitor can be shown today, by market. */
  markets: { id: string; name: string; currency: string }[]
  /** Shown now; null is the store's own. */
  marketId: string | null
  setMarket: (id: string | null) => void
}

/** Anything to choose: a second language, or a second currency. */
export const hasPreviewChoices = (m: PreviewLocaleModel) => m.languages.length > 1 || m.markets.length > 0

const short = (code: string) => code.split("-")[0].toUpperCase()

function languageLabel(m: PreviewLocaleModel, code: string): string {
  const name = languageName(code, activeLocale())
  if (code === m.defaultLanguage) return tt("{name} (default)", { name })
  return m.published.includes(code) ? name : tt("{name} (hidden)", { name })
}

function currencyNow(m: PreviewLocaleModel): string {
  const market = m.marketId ? m.markets.find((x) => x.id === m.marketId) : undefined
  return market?.currency ?? m.base
}

/** The two lists, language and currency, for the top bar's dark menu and the sidebar's light one. */
function LocaleMenuBody({ model, tone }: { model: PreviewLocaleModel; tone: "light" | "dark" }) {
  const lang = model.locale ?? model.defaultLanguage
  const dark = tone === "dark"
  const row = (active: boolean) =>
    cn(
      "flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors",
      dark
        ? active
          ? "bg-white/[0.09] text-white"
          : "text-white/75 hover:bg-white/[0.06] hover:text-white"
        : active
          ? "bg-[#f3f4f6] font-medium text-[#1a1a2e]"
          : "text-[#374151] hover:bg-[#f6f7f8]",
    )
  const code = dark ? "text-white/50" : "text-[#9ca3af]"
  const heading = cn("px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]", dark ? "text-white/45" : "text-[#9ca3af]")
  return (
    <div data-preview-locale-menu="">
      {model.languages.length > 1 ? (
        <div role="radiogroup" aria-label={tt("Language")}>
          <p className={heading}>{tt("Language")}</p>
          {model.languages.map((c) => {
            const active = c === lang
            return (
              <button key={c} type="button" role="radio" aria-checked={active} className={row(active)} data-preview-language={c} onClick={() => model.setLocale(c === model.defaultLanguage ? null : c)}>
                <span className={cn("w-7 shrink-0 text-[11px] font-semibold", code)}>{short(c)}</span>
                <span className="min-w-0 flex-1 truncate">{languageLabel(model, c)}</span>
                {active ? <Check className="h-4 w-4 shrink-0" strokeWidth={2.25} /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
      {model.markets.length > 0 ? (
        <div role="radiogroup" aria-label={tt("Currency")} className={model.languages.length > 1 ? cn("mt-1 border-t pt-1", dark ? "border-white/10" : "border-[#eef0f2]") : ""}>
          <p className={heading}>{tt("Prices in")}</p>
          {[{ id: null as string | null, name: tt("Store currency"), currency: model.base }, ...model.markets].map((mk) => {
            const active = (mk.id ?? null) === (model.marketId ?? null)
            return (
              <button key={mk.id ?? "home"} type="button" role="radio" aria-checked={active} className={row(active)} data-preview-currency={mk.id ?? "home"} onClick={() => model.setMarket(mk.id)}>
                <span className={cn("w-9 shrink-0 text-[11px] font-semibold", code)}>{mk.currency}</span>
                <span className="min-w-0 flex-1 truncate">{mk.name}</span>
                {active ? <Check className="h-4 w-4 shrink-0" strokeWidth={2.25} /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
      <p className={cn("px-2.5 pb-1.5 pt-2 text-[11.5px] leading-[16px]", dark ? "text-white/45" : "text-[#9ca3af]")}>{tt("Only changes what you see here. Visitors choose their own.")}</p>
    </div>
  )
}

/** Closes on a press outside the trigger and the panel, and on Escape. */
function useDismiss(open: boolean, close: () => void, trigger: React.RefObject<HTMLElement | null>, panel: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (trigger.current?.contains(t) || panel.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      close()
      trigger.current?.focus({ preventScroll: true })
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, close, trigger, panel])
}

/**
 * Kept in the page once it has opened, so it can leave as it came: the same
 * fade and 4px drop as the page switcher's list (`.wb-pages-menu` in
 * app/globals.css, entering by @starting-style). `inert` while closed.
 */
function useKeptOpen(open: boolean): boolean {
  const [kept, setKept] = useState(open)
  if (open && !kept) setKept(true)
  return kept
}

/**
 * THE TOP BAR'S CHIP (the owner: "make the language and currency selector more
 * subtle and clean"). It was a filled box beside round buttons: here it is the
 * bar's quiet text button, the same 32px height and full round as the size and
 * full screen buttons beside it, with no fill or edge until a pointer is on it.
 * Its words are smaller and greyer than the page switcher's and still 4.5:1 on
 * the bar (scripts/check-ui-polish-x.mjs measures both).
 */
export const LOCALE_CHIP_CLASS =
  "relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium uppercase tracking-[0.04em] tabular-nums outline-none transition-[background-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-white/25 [-webkit-tap-highlight-color:transparent]"

export function PreviewLocaleButton({ model }: { model: PreviewLocaleModel }) {
  const [open, setOpen] = useState(false)
  const kept = useKeptOpen(open)
  const pillRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, pillRef, menuRef)

  if (!hasPreviewChoices(model)) return null
  const lang = model.locale ?? model.defaultLanguage
  const currency = currencyNow(model)
  const translating = !!model.locale && model.locale !== model.defaultLanguage

  return (
    <div className="relative shrink-0">
      <button
        ref={pillRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={tt("Preview language and currency: {language}, {currency}", { language: languageName(lang, activeLocale()), currency })}
        data-preview-locale=""
        data-translating={translating ? "true" : "false"}
        className={cn(LOCALE_CHIP_CLASS, open ? "bg-white/[0.08] text-white/90" : "text-white/60 hover:bg-white/[0.06] hover:text-white/90")}
      >
        <Globe aria-hidden className="h-[13px] w-[13px]" strokeWidth={1.75} />
        <span className="leading-none">
          {model.languages.length > 1 ? short(lang) : currency}
          {model.languages.length > 1 && model.markets.length > 0 ? <span className="ml-1">{currency}</span> : null}
        </span>
        {/* Another language: a small dot, the words in the sidebar are that language's. */}
        {translating ? <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#8b5cf6]" /> : null}
      </button>
      {kept ? (
        <AnchoredPanel
          anchorRef={pillRef}
          align="center"
          gap={8}
          panelRef={menuRef}
          role="dialog"
          aria-label={tt("Preview language and currency")}
          data-state={open ? "open" : "closed"}
          className="wb-pages-menu flex w-[260px] max-w-[calc(100vw-16px)] flex-col overflow-y-auto rounded-2xl border border-white/10 bg-[#1f1f1f] p-1.5 text-white shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)]"
        >
          <div inert={!open}>
            <LocaleMenuBody model={model} tone="dark" />
          </div>
        </AnchoredPanel>
      ) : null}
    </div>
  )
}

/** Two plain selects. `tone`: the sidebar's light surface, or Website settings' dark one. */
export function PreviewLocaleSelects({ model, tone = "light", className }: { model: PreviewLocaleModel; tone?: "light" | "dark"; className?: string }) {
  const id = useId()
  if (!hasPreviewChoices(model)) return null
  const lang = model.locale ?? model.defaultLanguage
  const select =
    tone === "dark"
      ? "h-9 w-full min-w-0 appearance-none rounded-lg border border-white/10 bg-white/[0.06] pl-3 pr-8 text-[13px] text-white outline-none focus:border-white/30"
      : "h-8 w-full min-w-0 cursor-pointer appearance-none rounded-lg bg-[#f3f4f6] pl-2.5 pr-7 text-[12.5px] font-medium text-[#1a1a2e] shadow-[inset_0_0_0_1px_rgba(16,24,40,0.06)] outline-none transition-colors hover:bg-[#eceef1] focus-visible:shadow-[inset_0_0_0_1px_rgba(16,24,40,0.25)] max-sm:h-10 max-sm:text-[15px]"
  const chevron = <ChevronDown aria-hidden className={cn("pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2", tone === "dark" ? "text-white/50" : "text-muted-foreground")} />
  return (
    <div className={cn("flex items-center gap-2", className)} data-preview-locale-selects={tone}>
      {model.languages.length > 1 ? (
        <div className="relative min-w-0 flex-1">
          <label htmlFor={`${id}-lang`} className="sr-only">
            {tt("Language")}
          </label>
          <select id={`${id}-lang`} value={lang} onChange={(e) => model.setLocale(e.target.value === model.defaultLanguage ? null : e.target.value)} className={select} data-preview-language-select="">
            {model.languages.map((code) => (
              <option key={code} value={code}>
                {languageLabel(model, code)}
              </option>
            ))}
          </select>
          {chevron}
        </div>
      ) : null}
      {model.markets.length > 0 ? (
        <div className={cn("relative min-w-0", model.languages.length > 1 ? "w-[42%] shrink-0" : "flex-1")}>
          <label htmlFor={`${id}-cur`} className="sr-only">
            {tt("Currency")}
          </label>
          <select id={`${id}-cur`} value={model.marketId ?? "home"} onChange={(e) => model.setMarket(e.target.value === "home" ? null : e.target.value)} className={select} data-preview-currency-select="">
            <option value="home">{model.base}</option>
            {model.markets.map((mk) => (
              <option key={mk.id} value={mk.id}>
                {`${mk.currency} · ${mk.name}`}
              </option>
            ))}
          </select>
          {chevron}
        </div>
      ) : null}
    </div>
  )
}

/**
 * THE LANGUAGE BEING EDITED, AT THE TOP OF THE SIDEBAR (and of a phone's
 * sheet, which has no top bar switch): the language and currency selects,
 * and in another language one quiet line: words save to that language,
 * everything else changes in all of them.
 * Not drawn for a website with one language and one currency.
 */
/**
 * The sidebar's row, quieter than it was (the owner: "more subtle, clean and
 * smooth"): no white box with a shadow and no chips inside it, only the globe,
 * the language and the currency in grey, a fill under a pointer, and the list
 * fading down out of it rather than appearing. The line under it about where
 * text saves opens and closes by its height (Reveal), so the sidebar under it
 * slides instead of jumping.
 */
export const SIDEBAR_LOCALE_TRIGGER_CLASS =
  "group flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left outline-none transition-colors duration-150 hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 max-sm:h-11 [-webkit-tap-highlight-color:transparent]"

export function SidebarLanguageBar({ model, editing }: { model: PreviewLocaleModel; editing: { locale: string; name: string } | null }) {
  const [open, setOpen] = useState(false)
  const kept = useKeptOpen(open)
  /* The last language the line named, kept while it closes. */
  const [lastName, setLastName] = useState(editing?.name ?? "")
  if (editing && editing.name !== lastName) setLastName(editing.name)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, triggerRef, panelRef)
  if (!hasPreviewChoices(model)) return null
  const lang = model.locale ?? model.defaultLanguage
  const currency = currencyNow(model)
  return (
    <div className="shrink-0 border-b border-border px-2 py-1.5" data-wb-language-bar={editing ? editing.locale : ""}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={tt("Preview language and currency: {language}, {currency}", { language: languageName(lang, activeLocale()), currency })}
        data-wb-locale-trigger=""
        className={cn(SIDEBAR_LOCALE_TRIGGER_CLASS, open && "bg-[#f3f4f6]")}
      >
        <Globe aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#6b7280]" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[#374151] max-sm:text-[14px]">
          {model.languages.length > 1 ? languageName(lang, activeLocale()) : tt("Prices in")}
        </span>
        {model.markets.length > 0 || model.languages.length <= 1 ? (
          <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-[#6b7280] max-sm:text-[13px]">{currency}</span>
        ) : null}
        <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 shrink-0 text-[#9ca3af] transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      {kept ? (
        <AnchoredPanel
          anchorRef={triggerRef}
          align="center"
          gap={6}
          panelRef={panelRef}
          role="dialog"
          aria-label={tt("Preview language and currency")}
          data-state={open ? "open" : "closed"}
          className="wb-pages-menu flex w-[260px] max-w-[calc(100vw-16px)] flex-col overflow-y-auto rounded-[14px] border border-[#eceef1] bg-white p-1.5 text-[#1a1a2e] shadow-[0_16px_40px_-12px_rgba(16,24,40,0.22),0_2px_6px_rgba(16,24,40,0.06)]"
        >
          <div inert={!open}>
            <LocaleMenuBody model={model} tone="light" />
          </div>
        </AnchoredPanel>
      ) : null}
      <Reveal open={!!editing}>
        <p className="flex items-center gap-1.5 px-2 pb-0.5 pt-1 text-[11.5px] leading-[16px] text-[#6b7280]" data-wb-translating="">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a1a2e]" />
          <span className="min-w-0">{tt("Text saves to {name}. Everything else changes in all languages.", { name: editing?.name ?? lastName })}</span>
        </p>
      </Reveal>
    </div>
  )
}

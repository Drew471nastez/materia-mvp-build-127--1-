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
 *   PreviewLocaleSelects   two plain selects, for the top of the sidebar
 *                          (a phone's sheet included) and Website settings
 *
 * Remembered for the tab, per website (use-preview-language.ts,
 * use-preview-market.ts).
 */
import { useEffect, useId, useRef, useState } from "react"
import { Check, ChevronDown, Globe } from "lucide-react"
import { AnchoredPanel } from "@/components/website-builder/anchored-panel"
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

export function PreviewLocaleButton({ model }: { model: PreviewLocaleModel }) {
  const [open, setOpen] = useState(false)
  const pillRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (pillRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      pillRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (!hasPreviewChoices(model)) return null
  const lang = model.locale ?? model.defaultLanguage
  const currency = currencyNow(model)
  const translating = !!model.locale && model.locale !== model.defaultLanguage
  const row = (active: boolean) =>
    cn("flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors", active ? "bg-white/[0.09] text-white" : "text-white/75 hover:bg-white/[0.06] hover:text-white")

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
        className={cn(
          "relative flex h-7 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium tabular-nums transition-colors",
          open ? "bg-white/[0.12] text-white" : "text-white/70 hover:bg-white/[0.08] hover:text-white",
        )}
      >
        <Globe className="h-3.5 w-3.5 opacity-80" strokeWidth={2} />
        <span className="leading-none">
          {model.languages.length > 1 ? short(lang) : currency}
          {model.languages.length > 1 && model.markets.length > 0 ? <span className="ml-1 text-white/45">{currency}</span> : null}
        </span>
        {/* Another language: a small dot, the words in the sidebar are that language's. */}
        {translating ? <span aria-hidden className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-white/80" /> : null}
      </button>
      {open ? (
        <AnchoredPanel
          anchorRef={pillRef}
          align="center"
          gap={8}
          panelRef={menuRef}
          role="dialog"
          aria-label={tt("Preview language and currency")}
          className="flex w-[260px] max-w-[calc(100vw-16px)] flex-col overflow-y-auto rounded-2xl border border-white/10 bg-[#1f1f1f] p-1.5 text-white shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)]"
        >
          <div data-preview-locale-menu="">
            {model.languages.length > 1 ? (
              <div role="radiogroup" aria-label={tt("Language")}>
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-white/45">{tt("Language")}</p>
                {model.languages.map((code) => {
                  const active = code === lang
                  return (
                    <button key={code} type="button" role="radio" aria-checked={active} className={row(active)} data-preview-language={code} onClick={() => model.setLocale(code === model.defaultLanguage ? null : code)}>
                      <span className="w-7 shrink-0 text-[11px] font-semibold text-white/50">{short(code)}</span>
                      <span className="min-w-0 flex-1 truncate">{languageLabel(model, code)}</span>
                      {active ? <Check className="h-4 w-4 shrink-0" strokeWidth={2.25} /> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
            {model.markets.length > 0 ? (
              <div role="radiogroup" aria-label={tt("Currency")} className={model.languages.length > 1 ? "mt-1 border-t border-white/10 pt-1" : ""}>
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-white/45">{tt("Prices in")}</p>
                {[{ id: null as string | null, name: tt("Store currency"), currency: model.base }, ...model.markets].map((mk) => {
                  const active = (mk.id ?? null) === (model.marketId ?? null)
                  return (
                    <button key={mk.id ?? "home"} type="button" role="radio" aria-checked={active} className={row(active)} data-preview-currency={mk.id ?? "home"} onClick={() => model.setMarket(mk.id)}>
                      <span className="w-9 shrink-0 text-[11px] font-semibold text-white/50">{mk.currency}</span>
                      <span className="min-w-0 flex-1 truncate">{mk.name}</span>
                      {active ? <Check className="h-4 w-4 shrink-0" strokeWidth={2.25} /> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
            <p className="px-2.5 pb-1.5 pt-2 text-[11.5px] leading-[16px] text-white/45">{tt("Only changes what you see here. Visitors choose their own.")}</p>
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
export function SidebarLanguageBar({ model, editing }: { model: PreviewLocaleModel; editing: { locale: string; name: string } | null }) {
  if (!hasPreviewChoices(model)) return null
  return (
    <div className="shrink-0 border-b border-border px-3 py-2" data-wb-language-bar={editing ? editing.locale : ""}>
      <PreviewLocaleSelects model={model} />
      {editing ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] leading-[16px] text-[#6b7280]" data-wb-translating="">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a1a2e]" />
          <span className="min-w-0">{tt("Text saves to {name}. Everything else changes in all languages.", { name: editing.name })}</span>
        </p>
      ) : null}
    </div>
  )
}

"use client"

/**
 * THE LANGUAGE THE CANVAS IS DRAWN IN, beside the page switcher. Only for a
 * website with more than one language (Settings › Markets and languages);
 * the canvas then shows the page as /fr shows it on the website, with what
 * is not translated yet left as written (./use-preview-language.ts).
 */
import { useEffect, useRef, useState } from "react"
import { Check, Languages } from "lucide-react"

import { AnchoredPanel } from "@/components/website-builder/anchored-panel"
import { languageName } from "@/lib/markets/locales"
import { cn } from "@/lib/utils"
import type { PreviewLanguage, PreviewMarket } from "./use-preview-language"
import { activeLocale, tt } from "@/lib/i18n/text"

const EXIT_MS = 140

export function PreviewLanguageSwitch({ lang, market, className }: { lang: PreviewLanguage; market?: PreviewMarket; className?: string }) {
  const [open, setOpen] = useState(false)
  const [present, setPresent] = useState(false)
  if (open && !present) setPresent(true)
  useEffect(() => {
    if (open || !present) return
    const id = window.setTimeout(() => setPresent(false), EXIT_MS)
    return () => window.clearTimeout(id)
  }, [open, present])
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const languages = lang.languages.length >= 2
  const markets = market && market.markets.length > 0 ? market : null
  if (!languages && !markets) return null
  const now = lang.locale ?? lang.defaultLanguage
  const currencyNow = markets?.markets.find((m) => m.id === markets.market)?.currency ?? null
  const pick = (code: string) => {
    lang.setLocale(code === lang.defaultLanguage ? null : code)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={currencyNow ? tt("Preview: {name}, prices in {currency}", { name: languageName(now, activeLocale()), currency: currencyNow }) : tt("Preview language: {name}", { name: languageName(now, activeLocale()) })}
        data-wb-preview-language={now}
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-2.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--wb-chrome-fg)] transition-colors duration-150 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
          lang.locale || currencyNow ? "bg-white/[0.14]" : "bg-white/[0.05]",
          className,
        )}
      >
        <Languages className="h-[14px] w-[14px]" strokeWidth={1.75} />
        {now.split("-")[0]}
        {currencyNow ? <span className="font-medium text-white/60">· {currencyNow}</span> : null}
      </button>
      {present && (
        <AnchoredPanel
          anchorRef={triggerRef}
          align="center"
          gap={8}
          panelRef={menuRef}
          role="dialog"
          aria-label={tt("Preview")}
          data-state={open ? "open" : "closed"}
          className="wb-pages-menu flex w-[240px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1f1f1f] p-1.5 text-white shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)]"
        >
          <div inert={!open} className="flex flex-col">
            {languages ? <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-white/50">{tt("Preview in")}</p> : null}
            {(languages ? lang.languages : []).map((code) => {
              const on = code === now
              const hidden = code !== lang.defaultLanguage && !lang.published.includes(code)
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => pick(code)}
                  aria-pressed={on}
                  className={cn("flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors hover:bg-white/[0.08]", on && "bg-white/[0.06]")}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {languageName(code, activeLocale())}
                    {code === lang.defaultLanguage && <span className="ml-1.5 text-white/45">{tt("Default")}</span>}
                    {hidden && <span className="ml-1.5 text-white/45">{tt("Hidden")}</span>}
                  </span>
                  {on && <Check className="h-4 w-4 shrink-0 text-white/80" strokeWidth={2} />}
                </button>
              )
            })}
            {/* A market's currency (Settings › Markets and languages): the prices its visitors see, as the website converts them. */}
            {markets ? (
              <>
                <p className={cn("px-2.5 pb-1 text-[11px] font-medium text-white/50", languages ? "mt-1 border-t border-white/10 pt-2.5" : "pt-1.5")}>{tt("Prices in")}</p>
                {[{ id: null as string | null, label: tt("Your prices ({currency})", { currency: markets.base }) }, ...markets.markets.map((m) => ({ id: m.id as string | null, label: `${m.name} (${m.currency})` }))].map((o) => {
                  const on = o.id === markets.market
                  return (
                    <button
                      key={o.id ?? "home"}
                      type="button"
                      onClick={() => {
                        markets.setMarket(o.id)
                        setOpen(false)
                      }}
                      aria-pressed={on}
                      data-wb-preview-market={o.id ?? "home"}
                      className={cn("flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors hover:bg-white/[0.08]", on && "bg-white/[0.06]")}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {on && <Check className="h-4 w-4 shrink-0 text-white/80" strokeWidth={2} />}
                    </button>
                  )
                })}
              </>
            ) : null}
          </div>
        </AnchoredPanel>
      )}
    </>
  )
}

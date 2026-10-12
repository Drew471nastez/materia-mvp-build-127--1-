"use client"

/**
 * ===========================================================================
 *  SETTINGS › MARKETS AND LANGUAGES
 * ===========================================================================
 * For the store's own website (lib/markets). Simple by default: a website
 * with nothing set here is exactly as it was, one language and the store's
 * own prices. What can be added, in the order a creator meets it:
 *
 *   Languages   the default language, and others the website is offered
 *               in, each published or not, each with "Translate" (the
 *               website's texts, products and collections, by hand or
 *               drafted by AI to review)
 *   Markets     the store's home, and groups of countries that see prices
 *               in their own currency (converted at the day's ECB rate,
 *               with the rounding and adjustment set here), starting in
 *               their own language
 *
 * EASY BY DEFAULT (round AE): every change is saved as it is made (no Save
 * bar to forget), a language is added from a searchable list and opens
 * straight into Translate, publishing is a switch on its row, a market's
 * countries are added a region at a time or searched, and the longer
 * explanations live behind How it works. Saved whole, checked on the
 * server (lib/markets/model validateLocalization); a save the server turns
 * down puts the page back as it was and says why.
 *
 * A market's currency is live on the website: a visitor from one of its
 * countries (or who picks it) sees prices converted at the day's rate on
 * builder and imported themes alike (lib/markets/pricing.ts, live.ts,
 * compat.ts), and checkout says what the card is charged in.
 */
import * as React from "react"
import { Check, ChevronDown, ChevronRight, Globe2, Plus, Search, Trash2, X } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Card, Field, Modal, Notice, Pill, SelectInput, TextInput, Toggle, api, peekGet } from "@/components/physical/ui"
import { REGIONS } from "@/lib/markets/regions"
import { SITE_LANGUAGE_CODES, languageName } from "@/lib/markets/locales"
import type { Localization, Market } from "@/lib/markets/model"
import type { PriceRounding } from "@/lib/markets/money"
import { COUNTRIES, countryName } from "@/lib/checkout/countries"
import { TranslateSheet } from "./translate-sheet"
import { activeLocale, tt, ttx } from "@/lib/i18n/text"

const PATH = "/api/store/markets"

interface Loaded {
  ready: boolean
  localization: Localization
  baseCurrency: string
  chargeCurrency: string
  fx: { asOf: string; fresh: boolean; currencies: string[] } | null
}

const ROUNDING_LABEL: Record<PriceRounding, string> = {
  get none() { return tt("As converted") },
  get whole() { return tt("Up to a whole number") },
  get nine_nine() { return tt("Ending in .99") },
}

/** "French · Français", "Französisch · Français": the creator's word for it, in the dashboard's language, and the visitor's. */
function languageLabel(code: string): string {
  const mine = languageName(code, activeLocale())
  const own = languageName(code)
  return mine === own ? mine : `${mine} · ${own}`
}

/** The market every store starts with is named "Home" in its data; it reads in the dashboard's language until the creator renames it. */
const marketName = (m: { name: string; primary?: boolean }) => (m.primary && m.name.trim().toLowerCase() === "home" ? ttx("market", "Home") : m.name)

export function MarketsPanel() {
  const [data, setData] = React.useState<Loaded | null>(() => peekGet<Loaded>(PATH))
  const [draft, setDraft] = React.useState<Localization | null>(() => peekGet<Loaded>(PATH)?.localization ?? null)
  const [error, setError] = React.useState<string | null>(null)
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle")
  const [picking, setPicking] = React.useState(false)
  const [editing, setEditing] = React.useState<Market | "new" | null>(null)
  const [translating, setTranslating] = React.useState<string | null>(null)
  const savedRef = React.useRef<Localization | null>(draft)
  const queue = React.useRef<Promise<void>>(Promise.resolve())

  React.useEffect(() => {
    void api<Loaded>(PATH).then((r) => {
      if (r.ok) {
        setData(r.data)
        setDraft(r.data.localization)
        savedRef.current = r.data.localization
      } else setError(r.error)
    })
  }, [])

  /* SAVED AS IT IS MADE: one at a time, in order; a refusal puts back what was saved last and says why. */
  const commit = (next: Localization) => {
    setDraft(next)
    setError(null)
    setState("saving")
    queue.current = queue.current.then(async () => {
      const r = await api<{ localization: Localization }>(PATH, { method: "PUT", body: { localization: next } })
      if (!r.ok) {
        setError(r.error)
        setDraft(savedRef.current)
        setState("idle")
        return
      }
      savedRef.current = r.data.localization
      setDraft(r.data.localization)
      setData((d) => (d ? { ...d, localization: r.data.localization } : d))
      setState("saved")
      window.setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1600)
    })
  }

  if (!data || !draft) {
    return (
      <div className="space-y-4 sm:space-y-6" data-markets-panel="" aria-busy={!error}>
        <Card title={tt("Languages")} description={tt("Your website in more languages.")}>
          {error ? <Notice>{error}</Notice> : <div className="h-24" />}
        </Card>
      </div>
    )
  }

  const used = new Set([draft.defaultLanguage, ...draft.languages.map((l) => l.code)])
  const offer = SITE_LANGUAGE_CODES.filter((c) => !used.has(c))
  const home = draft.markets.find((m) => m.primary)
  const status = state === "saving" ? tt("Saving") : state === "saved" ? tt("Saved") : null
  const setPublished = (code: string, published: boolean) => commit({ ...draft, languages: draft.languages.map((x) => (x.code === code ? { ...x, published } : x)) })

  return (
    <div className="space-y-4 sm:space-y-6" data-markets-panel="">
      {!data.ready ? <Notice tone="amber">{tt("Markets and languages aren't set up yet. Run SQL part 136 in Supabase, then come back here.")}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}

      <Card
        title={tt("Languages")}
        help="languages"
        description={tt("Your website in more languages, each at its own address like /fr.")}
        action={status ? <span className="text-[12.5px] text-[#6b7280]" aria-live="polite" data-markets-status="">{status}</span> : null}
      >
        <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-languages="">
          <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3" data-language-default={draft.defaultLanguage}>
            <LanguageBadge code={draft.defaultLanguage} />
            <span className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
              <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{languageLabel(draft.defaultLanguage)}</span>
              <span className="block text-[12.5px] text-[#6b7280]">{tt("Default · your website as it is written")}</span>
            </span>
            <label className="relative ml-12 inline-flex sm:ml-0">
              <span className="sr-only">{tt("Default language")}</span>
              <select
                value={draft.defaultLanguage}
                onChange={(e) => {
                  const v = e.target.value
                  commit({ ...draft, defaultLanguage: v, languages: draft.languages.filter((l) => l.code !== v) })
                }}
                className="h-9 cursor-pointer appearance-none rounded-lg border border-[#e5e7eb] bg-white pl-3 pr-8 text-[13px] font-medium text-[#1a1a2e] outline-none hover:border-[#d1d5db] focus-visible:border-[#1a1a2e]"
              >
                {[...new Set([draft.defaultLanguage, ...SITE_LANGUAGE_CODES])].map((c) => (
                  <option key={c} value={c}>
                    {languageName(c, activeLocale())}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]" />
            </label>
          </li>
          {draft.languages.map((l) => (
            <li key={l.code} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3" data-language={l.code}>
              <LanguageBadge code={l.code} />
              <span className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
                <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{languageLabel(l.code)}</span>
                <span className="block text-[12.5px] text-[#6b7280]">
                  /{l.code.toLowerCase()} · {l.published ? tt("Live on your website") : tt("Hidden until published")}
                </span>
              </span>
              {/* Wraps on a phone: "Przetłumacz", "Opublikowana" and the bin are wider than Translate and Published. */}
              <span className="ml-12 flex flex-wrap items-center gap-2 sm:ml-0">
                <button type="button" className={cn(BTN_SECONDARY, "h-9 px-3")} onClick={() => setTranslating(l.code)} data-translate-language={l.code}>
                  {tt("Translate")}
                </button>
                <label className="flex items-center gap-2 pl-1 text-[12.5px] font-medium text-[#4b5563]">
                  <span>{tt("Published")}</span>
                  <Switch checked={l.published} onCheckedChange={(v) => setPublished(l.code, v)} aria-label={tt("Publish {name}", { name: languageName(l.code, activeLocale()) })} />
                </label>
                <button
                  type="button"
                  aria-label={tt("Remove {name}", { name: languageName(l.code, activeLocale()) })}
                  className={cn(BTN_GHOST, "w-9 px-0 text-[#6b7280]")}
                  onClick={() => {
                    if (!window.confirm(tt("Remove {name}? Its translations are kept, in case you add it again.", { name: languageName(l.code, activeLocale()) }))) return
                    commit({ ...draft, languages: draft.languages.filter((x) => x.code !== l.code), markets: draft.markets.map((m) => (m.language === l.code ? { ...m, language: null } : m)) })
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className={cn(BTN_SECONDARY, "mt-3")} onClick={() => setPicking(true)} disabled={!data.ready} data-add-language="">
          <Plus className="h-4 w-4" />
          {tt("Add a language")}
        </button>
        {/* Show visitors their own language (lib/markets/visitor-language.ts): saved as it is switched, like the rest. */}
        <div className="mt-4 border-t border-[#f1f2f4] pt-4" data-visitor-language="">
          <Toggle
            id="visitor-language"
            label={tt("Show visitors their own language")}
            description={
              draft.languages.some((l) => l.published)
                ? tt("A first visit opens in the language the visitor's browser asks for, once, on your website and your storelib.com page. A close match gets a small offer instead.")
                : tt("Works once a language is published: a first visit opens in the language the visitor's browser asks for.")
            }
            checked={draft.visitorLanguage === true}
            disabled={!data.ready}
            onChange={(v) => commit({ ...draft, visitorLanguage: v })}
          />
        </div>
      </Card>

      <Card
        title={tt("Markets")}
        help="markets"
        description={tt("Show prices in your visitors' own currency.")}
      >
        <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-markets="">
          {draft.markets.map((m) => (
            <li key={m.id} data-market={m.id}>
              <button type="button" onClick={() => setEditing(m)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#fafafb] active:bg-[#f3f4f6] [-webkit-tap-highlight-color:transparent]">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[13px]">
                  {m.countries.length && !m.primary ? flagOf(m.countries[0]) : <Globe2 className="h-4 w-4 text-[#4b5563]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
                    <span className="truncate">{marketName(m)}</span>
                    {m.primary && m.name.trim().toLowerCase() !== "home" ? <Pill tone="gray">{tt("Home")}</Pill> : null}
                    {!m.active ? <Pill tone="gray">{tt("Off")}</Pill> : null}
                  </span>
                  <span className="block truncate text-[12.5px] leading-[18px] text-[#6b7280]">
                    {m.primary ? tt("Everywhere else") : m.countries.length === 0 ? tt("No countries yet") : m.countries.length <= 3 ? m.countries.map(countryName).join(", ") : tt("{length} countries", { length: m.countries.length })}
                    {" · "}
                    {m.currency ?? data.baseCurrency}
                    {m.language ? ` · ${languageName(m.language, activeLocale())}` : ""}
                  </span>
                </span>
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={BTN_SECONDARY} onClick={() => setEditing("new")} disabled={!data.ready} data-add-market="">
            <Plus className="h-4 w-4" />
            {tt("Add a market")}
          </button>
          <span className="text-[12.5px] text-[#6b7280]" data-fx={data.fx ? (data.fx.fresh ? "fresh" : "old") : "none"}>
            {data.fx ? (data.fx.fresh ? tt("Rates from {asOf}", { asOf: data.fx.asOf }) : tt("Rates from {asOf} are too old: your own prices show", { asOf: data.fx.asOf })) : tt("Exchange rates aren't in yet: your own prices show")}
          </span>
        </div>
        {home ? null : <Notice tone="amber" className="mt-3">{tt("Choose one market as your home.")}</Notice>}
      </Card>

      <LanguagePicker
        open={picking}
        options={offer}
        onClose={() => setPicking(false)}
        onPick={(code) => {
          setPicking(false)
          commit({ ...draft, languages: [...draft.languages, { code, published: false }] })
          /* Straight into translating it: the next step is always the words. */
          setTranslating(code)
        }}
      />
      <MarketEditor
        market={editing}
        localization={draft}
        baseCurrency={data.baseCurrency}
        chargeCurrency={data.chargeCurrency}
        currencies={data.fx?.currencies ?? []}
        onClose={() => setEditing(null)}
        onRemove={(id) => {
          setEditing(null)
          commit({ ...draft, markets: draft.markets.filter((x) => x.id !== id) })
        }}
        onDone={(m) => {
          const taken = new Set(draft.markets.filter((x) => x.id !== m.id).flatMap((x) => x.countries))
          const clean = { ...m, countries: m.countries.filter((c) => !taken.has(c)) }
          setEditing(null)
          commit({ ...draft, markets: draft.markets.some((x) => x.id === m.id) ? draft.markets.map((x) => (x.id === m.id ? clean : x)) : [...draft.markets, clean] })
        }}
      />
      <TranslateSheet
        locale={translating}
        defaultLanguage={draft.defaultLanguage}
        published={!!draft.languages.find((l) => l.code === translating)?.published}
        onPublish={translating ? (v) => setPublished(translating, v) : undefined}
        onClose={() => setTranslating(null)}
      />
    </div>
  )
}

/** A country's flag, from its two letters (regional indicator symbols): no picture to load. */
function flagOf(code: string): string {
  return /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : ""
}

/** A language's two letters on a quiet tile. */
function LanguageBadge({ code }: { code: string }) {
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f1ecff] text-[12px] font-semibold uppercase tracking-wide text-[#6d28d9]">
      {code.slice(0, 2)}
    </span>
  )
}

/** Every language that can be added, searchable, each in its own words too. A bottom sheet on a phone. */
function LanguagePicker({ open, options, onClose, onPick }: { open: boolean; options: string[]; onClose: () => void; onPick: (code: string) => void }) {
  const [query, setQuery] = React.useState("")
  React.useEffect(() => {
    if (open) setQuery("")
  }, [open])
  const q = query.trim().toLowerCase()
  const shown = options.filter((c) => !q || languageName(c, activeLocale()).toLowerCase().includes(q) || languageName(c, "en").toLowerCase().includes(q) || languageName(c).toLowerCase().includes(q) || c.toLowerCase() === q)
  return (
    <Modal open={open} onClose={onClose} title={tt("Add a language")}>
      <div className="space-y-3" data-language-picker="">
        <label className="relative block">
          <span className="sr-only">{tt("Search languages")}</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search languages")} className="pl-9" />
        </label>
        <ul className="-mx-1 max-h-[min(420px,55vh)] overflow-y-auto overscroll-contain">
          {shown.map((c) => (
            <li key={c}>
              <button type="button" onClick={() => onPick(c)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#f8f9fa] active:bg-[#f3f4f6]" data-pick-language={c}>
                <LanguageBadge code={c} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{languageName(c, activeLocale())}</span>
                  <span className="block truncate text-[12.5px] text-[#6b7280]">{languageName(c)}</span>
                </span>
                <Plus aria-hidden className="h-4 w-4 text-[#9ca3af]" />
              </button>
            </li>
          ))}
          {shown.length === 0 ? <li className="px-2 py-6 text-center text-[13.5px] text-[#6b7280]">{tt("No language matches.")}</li> : null}
        </ul>
      </div>
    </Modal>
  )
}

/** One market: its name, its countries (a region at a time, or searched), its currency and language; rounding and adjustment folded away. */
function MarketEditor({
  market,
  localization,
  baseCurrency,
  chargeCurrency,
  currencies,
  onClose,
  onDone,
  onRemove,
}: {
  market: Market | "new" | null
  localization: Localization
  baseCurrency: string
  chargeCurrency: string
  currencies: string[]
  onClose: () => void
  onDone: (m: Market) => void
  onRemove: (id: string) => void
}) {
  const fresh = React.useCallback(
    (): Market =>
      market && market !== "new"
        ? market
        : { id: `m${Date.now().toString(36)}`, name: "", countries: [], currency: null, language: null, active: true, primary: false, rounding: "none", adjustBps: 0 },
    [market],
  )
  const [m, setM] = React.useState<Market>(fresh)
  const [query, setQuery] = React.useState("")
  const [more, setMore] = React.useState(false)
  React.useEffect(() => {
    if (market) {
      const next = fresh()
      setM(next)
      setQuery("")
      setMore(next.rounding !== "none" || next.adjustBps !== 0)
    }
  }, [market, fresh])
  const elsewhere = new Map(localization.markets.filter((x) => x.id !== m.id).flatMap((x) => x.countries.map((c) => [c, x.name] as const)))
  const q = query.trim().toLowerCase()
  const shown = q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q) : []
  const toggle = (code: string) => setM((x) => ({ ...x, countries: x.countries.includes(code) ? x.countries.filter((c) => c !== code) : [...x.countries, code] }))
  const addRegion = (codes: readonly string[]) => setM((x) => ({ ...x, countries: [...new Set([...x.countries, ...codes.filter((c) => !elsewhere.has(c) && COUNTRIES.some((k) => k.code === c))])] }))
  const regionFull = (codes: readonly string[]) => codes.filter((c) => !elsewhere.has(c) && COUNTRIES.some((k) => k.code === c)).every((c) => m.countries.includes(c))
  const languages = [localization.defaultLanguage, ...localization.languages.map((l) => l.code)]
  const existing = market && market !== "new" && !market.primary
  return (
    <Modal
      open={market !== null}
      onClose={onClose}
      wide
      title={market === "new" ? tt("Add a market") : tt("Edit {value}", { value: marketName(m) || tt("market") })}
      footer={
        <div className="flex items-center gap-2">
          {existing ? (
            <button
              type="button"
              className={cn(BTN_GHOST, "mr-auto text-[#6b7280]")}
              onClick={() => {
                if (window.confirm(tt("Remove {value}? Its countries go back to your home market.", { value: m.name || tt("this market") }))) onRemove(m.id)
              }}
              data-remove-market=""
            >
              <Trash2 className="h-4 w-4" />
              {tt("Remove")}
            </button>
          ) : null}
          <button type="button" className={cn(BTN_SECONDARY, !existing && "ml-auto")} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={!m.name.trim() || (!m.primary && m.countries.length === 0)} onClick={() => onDone({ ...m, name: m.name.trim() })}>
            {market === "new" ? tt("Add market") : tt("Done")}
          </button>
        </div>
      }
    >
      <div className="space-y-5" data-market-editor="">
        <Field label={tt("Name")}>
          <TextInput value={m.name} onChange={(e) => setM({ ...m, name: e.target.value.slice(0, 60) })} placeholder={tt("Europe")} maxLength={60} />
        </Field>

        {!m.primary ? (
          <div className="space-y-3">
            <p className="text-[13.5px] font-medium text-[#1a1a2e]">{tt("Countries")}</p>
            <div className="flex flex-wrap gap-1.5" data-market-regions="">
              {REGIONS.map((r) => {
                const full = regionFull(r.countries)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => (full ? setM((x) => ({ ...x, countries: x.countries.filter((c) => !r.countries.includes(c)) })) : addRegion(r.countries))}
                    className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors", full ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db]")}
                    data-region={r.id}
                  >
                    {full ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {r.name}
                  </button>
                )
              })}
            </div>
            <label className="relative block">
              <span className="sr-only">{tt("Search countries")}</span>
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search a country to add")} className="pl-9" />
            </label>
            {q ? (
              <ul className="max-h-[220px] divide-y divide-[#f4f4f6] overflow-y-auto overscroll-contain rounded-xl border border-[#eceef1]" data-market-countries="">
                {shown.map((c) => {
                  const other = elsewhere.get(c.code)
                  const on = m.countries.includes(c.code)
                  return (
                    <li key={c.code}>
                      <button type="button" disabled={!!other} onClick={() => toggle(c.code)} className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px]", other ? "cursor-not-allowed opacity-50" : "hover:bg-[#fafafb]")}>
                        <span aria-hidden className="text-[16px]">{flagOf(c.code)}</span>
                        <span className="flex-1 text-[#1a1a2e]">{c.name}</span>
                        {other ? <span className="text-[12px] text-[#9ca3af]">{tt("In {other}", { other })}</span> : on ? <Check className="h-4 w-4 text-[#1a1a2e]" /> : <Plus className="h-4 w-4 text-[#9ca3af]" />}
                      </button>
                    </li>
                  )
                })}
                {shown.length === 0 ? <li className="px-3 py-4 text-center text-[13px] text-[#6b7280]">{tt("No country matches.")}</li> : null}
              </ul>
            ) : null}
            {m.countries.length ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12.5px] text-[#6b7280]">{m.countries.length} {m.countries.length === 1 ? "country" : "countries"}</span>
                  <button type="button" className="text-[12.5px] font-medium text-[#6b7280] hover:text-[#1a1a2e]" onClick={() => setM({ ...m, countries: [] })}>
                    {tt("Clear")}
                  </button>
                </div>
                <ul className="flex max-h-[148px] flex-wrap gap-1.5 overflow-y-auto overscroll-contain" data-market-chosen="">
                  {m.countries.map((c) => (
                    <li key={c}>
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f3f4f6] pl-2.5 pr-1 text-[12.5px] font-medium text-[#1a1a2e]">
                        <span aria-hidden>{flagOf(c)}</span>
                        {countryName(c)}
                        <button type="button" aria-label={tt("Remove {count}", { count: countryName(c) })} onClick={() => toggle(c)} className="grid h-6 w-6 place-items-center rounded-full text-[#6b7280] hover:bg-[#e5e7eb]">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[12.5px] text-[#6b7280]">{tt("Pick a region or search for a country. A country can be in one market only.")}</p>
            )}
          </div>
        ) : (
          <p className="text-[13.5px] leading-5 text-[#4b5563]">{tt("Your home market: every country not in another market, at your own prices in {baseCurrency}.", { baseCurrency })}</p>
        )}

        {!m.primary ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tt("Currency")} hint={currencies.length ? tt("Converted from {baseCurrency} at the day's rate. Cards are charged in {chargeCurrency}.", { baseCurrency, chargeCurrency }) : tt("Exchange rates aren't in yet: try again in a minute.")}>
              <SelectInput value={m.currency ?? ""} onChange={(v) => setM({ ...m, currency: v || null })}>
                <option value="">{tt("{baseCurrency} (your prices)", { baseCurrency })}</option>
                {currencies
                  .filter((c) => c !== baseCurrency)
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </SelectInput>
            </Field>
            <Field label={tt("Language")} hint={tt("What its visitors see first.")}>
              <SelectInput value={m.language ?? ""} onChange={(v) => setM({ ...m, language: v || null })}>
                <option value="">{tt("{name} (default)", { name: languageName(localization.defaultLanguage, activeLocale()) })}</option>
                {languages
                  .filter((l) => l !== localization.defaultLanguage)
                  .map((l) => (
                    <option key={l} value={l}>
                      {languageName(l, activeLocale())}
                    </option>
                  ))}
              </SelectInput>
            </Field>
          </div>
        ) : null}

        {!m.primary && m.currency ? (
          <div className="rounded-xl border border-[#eceef1]">
            <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="flex w-full items-center justify-between px-3.5 py-3 text-left text-[13.5px] font-medium text-[#1a1a2e]">
              {tt("Rounding and price adjustment")}
              <ChevronDown aria-hidden className={cn("h-4 w-4 text-[#6b7280] transition-transform", more && "rotate-180")} />
            </button>
            {more ? (
              <div className="grid gap-4 border-t border-[#f1f2f4] px-3.5 py-3.5 sm:grid-cols-2">
                <Field label={tt("Rounding")}>
                  <SelectInput value={m.rounding} onChange={(v) => setM({ ...m, rounding: v as PriceRounding })}>
                    {(Object.keys(ROUNDING_LABEL) as PriceRounding[]).map((r) => (
                      <option key={r} value={r}>
                        {ROUNDING_LABEL[r]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label={tt("Adjustment (%)")} hint={tt("Raise or lower prices here.")}>
                  <TextInput
                    inputMode="decimal"
                    value={m.adjustBps ? String(m.adjustBps / 100) : ""}
                    placeholder="0"
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(",", "."))
                      setM({ ...m, adjustBps: Number.isFinite(n) ? Math.max(-5000, Math.min(10000, Math.round(n * 100))) : 0 })
                    }}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}

        {!m.primary ? <Toggle label={tt("Active")} description={tt("Off, its countries see your home market.")} checked={m.active} onChange={(v) => setM({ ...m, active: v })} /> : null}
      </div>
    </Modal>
  )
}

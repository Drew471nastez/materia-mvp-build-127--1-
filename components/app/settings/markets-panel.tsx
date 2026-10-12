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
 * Said plainly on the page: which currency cards are charged in, and that a
 * market's prices in another currency are an estimate until checkout.
 * Saved whole, checked on the server (lib/markets/model validateLocalization).
 *
 * A market's currency is live on the website: a visitor from one of its
 * countries (or who picks it) sees prices converted at the day's rate on
 * builder and imported themes alike (lib/markets/pricing.ts, live.ts,
 * compat.ts), and checkout says what the card is charged in.
 */
import * as React from "react"
import { Globe2, Languages, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Card, Field, Modal, Notice, Pill, SelectInput, TextInput, Toggle, api, peekGet } from "@/components/physical/ui"
import { SITE_LANGUAGE_CODES, languageName } from "@/lib/markets/locales"
import type { Localization, Market } from "@/lib/markets/model"
import type { PriceRounding } from "@/lib/markets/money"
import { COUNTRIES, countryName } from "@/lib/checkout/countries"
import { TranslateSheet } from "./translate-sheet"
import { tt } from "@/lib/i18n/text"

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

/** "French · Français": the creator's word for it and the visitor's. */
function languageLabel(code: string): string {
  const english = languageName(code, "en")
  const own = languageName(code)
  return english === own ? english : `${english} · ${own}`
}

export function MarketsPanel() {
  const [data, setData] = React.useState<Loaded | null>(() => peekGet<Loaded>(PATH))
  const [draft, setDraft] = React.useState<Localization | null>(() => peekGet<Loaded>(PATH)?.localization ?? null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [adding, setAdding] = React.useState("")
  const [editing, setEditing] = React.useState<Market | "new" | null>(null)
  const [translating, setTranslating] = React.useState<string | null>(null)

  React.useEffect(() => {
    void api<Loaded>(PATH).then((r) => {
      if (r.ok) {
        setData(r.data)
        setDraft(r.data.localization)
      } else setError(r.error)
    })
  }, [])

  const dirty = !!data && !!draft && JSON.stringify(draft) !== JSON.stringify(data.localization)
  const save = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    const r = await api<{ localization: Localization }>(PATH, {
      method: "PUT",
      body: { localization: draft },
    })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setData((d) => (d ? { ...d, localization: r.data.localization } : d))
    setDraft(r.data.localization)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  if (!data || !draft) {
    return (
      <div className="space-y-4 sm:space-y-6" data-markets-panel="" aria-busy={!error}>
        <Card title={tt("Markets and languages")} description={tt("Sell to other countries in their language and currency.")}>
          {error ? <Notice>{error}</Notice> : <div className="h-24" />}
        </Card>
      </div>
    )
  }

  const usedLanguages = new Set([draft.defaultLanguage, ...draft.languages.map((l) => l.code)])
  const offer = SITE_LANGUAGE_CODES.filter((c) => !usedLanguages.has(c))
  const home = draft.markets.find((m) => m.primary)

  return (
    <div className="space-y-4 sm:space-y-6" data-markets-panel="">
      {!data.ready ? <Notice tone="amber">{tt("Markets and languages aren't set up yet. Run SQL part 136 in Supabase, then come back here.")}</Notice> : null}

      <Card title={tt("Languages")} help="languages" description={tt("The languages your website is offered in. Visitors pick theirs from the language selector, and each language has its own address, like /fr.")}>
        <div className="space-y-4">
          <Field label={tt("Default language")} hint={tt("What your website is written in now. It keeps its addresses as they are.")}>
            <SelectInput
              value={draft.defaultLanguage}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  defaultLanguage: v,
                  languages: draft.languages.filter((l) => l.code !== v),
                })
              }
            >
              {[...new Set([draft.defaultLanguage, ...SITE_LANGUAGE_CODES])].map((c) => (
                <option key={c} value={c}>
                  {languageLabel(c)}
                </option>
              ))}
            </SelectInput>
          </Field>

          {draft.languages.length ? (
            <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-languages="">
              {draft.languages.map((l) => (
                <li key={l.code} className="flex flex-wrap items-center gap-3 px-3.5 py-3" data-language={l.code}>
                  <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#4b5563]">
                    <Languages className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-[#1a1a2e]">{languageLabel(l.code)}</span>
                    <span className="block text-[12.5px] text-[#6b7280]">/{l.code.toLowerCase()}</span>
                  </span>
                  <Pill tone={l.published ? "green" : "gray"}>{l.published ? tt("Published") : tt("Not published")}</Pill>
                  <span className="flex items-center gap-1">
                    <button type="button" className={BTN_GHOST} onClick={() => setTranslating(l.code)} disabled={dirty} title={dirty ? tt("Save your changes first") : undefined}>
                      {tt("Translate")}
                    </button>
                    <button
                      type="button"
                      className={BTN_GHOST}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          languages: draft.languages.map((x) => (x.code === l.code ? { ...x, published: !x.published } : x)),
                        })
                      }
                    >
                      {l.published ? tt("Unpublish") : tt("Publish")}
                    </button>
                    <button
                      type="button"
                      aria-label={tt("Remove {name}", { name: languageName(l.code, "en") })}
                      className={cn(BTN_GHOST, "w-9 px-0")}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          languages: draft.languages.filter((x) => x.code !== l.code),
                          markets: draft.markets.map((m) => (m.language === l.code ? { ...m, language: null } : m)),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <Field label={tt("Add a language")} className="min-w-[220px] flex-1">
              <SelectInput value={adding} onChange={setAdding}>
                <option value="">{tt("Choose a language")}</option>
                {offer.map((c) => (
                  <option key={c} value={c}>
                    {languageLabel(c)}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={!adding}
              onClick={() => {
                setDraft({
                  ...draft,
                  languages: [...draft.languages, { code: adding, published: false }],
                })
                setAdding("")
              }}
            >
              <Plus className="h-4 w-4" />
              {tt("Add")}
            </button>
          </div>
          <p className="text-[12.5px] leading-[18px] text-[#6b7280]">
            {tt("A new language starts unpublished: translate it, check it, then publish. Anything not translated yet shows in {name}.", { name: languageName(draft.defaultLanguage, "en") })}
          </p>
        </div>
      </Card>

      <Card title={tt("Markets")} help="markets" description={tt("Groups of countries you sell to the same way. Each can show prices in its own currency and start visitors in its own language.")}>
        <div className="space-y-4">
          <p className="text-[13px] leading-5 text-[#4b5563]" data-charge-currency="">
            {tt("Your prices are in {baseCurrency}. Cards are charged in {chargeCurrency}. A market in another currency shows an estimate converted at the European Central Bank's rate, and says so before payment.", { baseCurrency: data.baseCurrency, chargeCurrency: data.chargeCurrency })}
          </p>
          {data.fx ? (
            data.fx.fresh ? (
              <p className="text-[12.5px] text-[#6b7280]" data-fx="fresh">
                {tt("Exchange rates from {asOf}.", { asOf: data.fx.asOf })}
              </p>
            ) : (
              <Notice tone="amber">{tt("The newest exchange rates are from {asOf}, which is too old to use. Markets show your own prices until new rates arrive.", { asOf: data.fx.asOf })}</Notice>
            )
          ) : (
            <p className="text-[12.5px] text-[#6b7280]" data-fx="none">
              {tt("Exchange rates arrive with the next daily update. Until then, every market shows your own prices.")}
            </p>
          )}

          <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-markets="">
            {draft.markets.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3" data-market={m.id}>
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#4b5563]">
                  <Globe2 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
                    {m.name}
                    {m.primary ? <span className="text-[12px] font-normal text-[#6b7280]">· {tt("Home")}</span> : null}
                    {!m.active ? <span className="text-[12px] font-normal text-[#6b7280]">· {tt("Off")}</span> : null}
                  </span>
                  <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">
                    {m.countries.length === 0
                      ? m.primary
                        ? tt("Every country not in another market")
                        : tt("No countries yet")
                      : m.countries.length <= 3
                        ? m.countries.map(countryName).join(", ")
                        : tt("{length} countries", { length: m.countries.length })}
                    {" · "}
                    {m.currency ?? data.baseCurrency}
                    {m.language ? ` · ${languageName(m.language, "en")}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <button type="button" className={BTN_GHOST} onClick={() => setEditing(m)}>
                    {tt("Edit")}
                  </button>
                  {!m.primary ? (
                    <button
                      type="button"
                      aria-label={tt("Remove {name}", { name: m.name })}
                      className={cn(BTN_GHOST, "w-9 px-0")}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          markets: draft.markets.filter((x) => x.id !== m.id),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className={BTN_SECONDARY} onClick={() => setEditing("new")} data-add-market="">
            <Plus className="h-4 w-4" />
            {tt("Add a market")}
          </button>
          {home ? null : <Notice tone="amber">{tt("Choose one market as your home.")}</Notice>}
        </div>
      </Card>

      <div className="sticky bottom-3 z-10 flex items-center justify-end gap-3" data-markets-save="">
        {error ? <Notice className="mr-auto">{error}</Notice> : null}
        {saved ? <span className="text-[13px] text-[#166534]">{tt("Saved")}</span> : null}
        {dirty ? (
          <button type="button" className={BTN_SECONDARY} onClick={() => setDraft(data.localization)} disabled={busy}>
            {tt("Discard")}
          </button>
        ) : null}
        <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={!dirty || busy || !data.ready}>
          {busy ? tt("Saving") : tt("Save")}
        </button>
      </div>

      <MarketEditor
        market={editing}
        localization={draft}
        baseCurrency={data.baseCurrency}
        currencies={data.fx?.currencies ?? []}
        onClose={() => setEditing(null)}
        onDone={(m) => {
          const taken = new Set(draft.markets.filter((x) => x.id !== m.id).flatMap((x) => x.countries))
          const clean = {
            ...m,
            countries: m.countries.filter((c) => !taken.has(c)),
          }
          setDraft({
            ...draft,
            markets: draft.markets.some((x) => x.id === m.id) ? draft.markets.map((x) => (x.id === m.id ? clean : x)) : [...draft.markets, clean],
          })
          setEditing(null)
        }}
      />
      <TranslateSheet locale={translating} defaultLanguage={draft.defaultLanguage} onClose={() => setTranslating(null)} />
    </div>
  )
}

/** One market: its name, its countries, the currency and language its visitors start in, and how converted prices are rounded. */
function MarketEditor({
  market,
  localization,
  baseCurrency,
  currencies,
  onClose,
  onDone,
}: {
  market: Market | "new" | null
  localization: Localization
  baseCurrency: string
  currencies: string[]
  onClose: () => void
  onDone: (m: Market) => void
}) {
  const fresh = React.useCallback(
    (): Market =>
      market && market !== "new"
        ? market
        : {
            id: `m${Date.now().toString(36)}`,
            name: "",
            countries: [],
            currency: null,
            language: null,
            active: true,
            primary: false,
            rounding: "none",
            adjustBps: 0,
          },
    [market],
  )
  const [m, setM] = React.useState<Market>(fresh)
  const [query, setQuery] = React.useState("")
  React.useEffect(() => {
    if (market) {
      setM(fresh())
      setQuery("")
    }
  }, [market, fresh])
  const elsewhere = new Map(localization.markets.filter((x) => x.id !== m.id).flatMap((x) => x.countries.map((c) => [c, x.name] as const)))
  const shown = COUNTRIES.filter((c) => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()) || c.code.toLowerCase() === query.trim().toLowerCase())
  const toggle = (code: string) =>
    setM((x) => ({
      ...x,
      countries: x.countries.includes(code) ? x.countries.filter((c) => c !== code) : [...x.countries, code],
    }))
  const languages = [localization.defaultLanguage, ...localization.languages.map((l) => l.code)]
  return (
    <Modal
      open={market !== null}
      onClose={onClose}
      wide
      title={market === "new" ? tt("Add a market") : tt("Edit {value}", { value: m.name || "market" })}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={!m.name.trim()} onClick={() => onDone({ ...m, name: m.name.trim() })}>
            {tt("Done")}
          </button>
        </div>
      }
    >
      <div className="space-y-4" data-market-editor="">
        <Field label={tt("Name")}>
          <TextInput value={m.name} onChange={(e) => setM({ ...m, name: e.target.value.slice(0, 60) })} placeholder={tt("Europe")} maxLength={60} />
        </Field>
        {!m.primary ? (
          <Field label={tt("Countries")} hint={tt("{length} chosen. A country can be in one market only.", { length: m.countries.length })}>
            <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search countries")} aria-label={tt("Search countries")} />
            <ul className="mt-2 max-h-[240px] divide-y divide-[#f4f4f6] overflow-y-auto rounded-xl border border-[#eceef1]" data-market-countries="">
              {shown.map((c) => {
                const other = elsewhere.get(c.code)
                const on = m.countries.includes(c.code)
                return (
                  <li key={c.code}>
                    <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-[13.5px]", other && "cursor-not-allowed opacity-50")}>
                      <input type="checkbox" checked={on} disabled={!!other} onChange={() => toggle(c.code)} className="h-4 w-4 accent-[#1a1a2e]" />
                      <span className="flex-1 text-[#1a1a2e]">{c.name}</span>
                      {other ? <span className="text-[12px] text-[#9ca3af]">{tt("In {other}", { other })}</span> : null}
                    </label>
                  </li>
                )
              })}
            </ul>
          </Field>
        ) : (
          <p className="text-[13px] text-[#6b7280]">{tt("Your home market sells in {baseCurrency} at your own prices, to every country that isn't in another market.", { baseCurrency })}</p>
        )}
        {!m.primary ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tt("Prices shown in")} hint={currencies.length ? tt("Converted from your prices at the day's rate.") : tt("Available once exchange rates arrive.")}>
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
            <Field label={tt("Visitors start in")} hint={tt("On their first visit, once the language is published. After that, what they pick.")}>
              <SelectInput value={m.language ?? ""} onChange={(v) => setM({ ...m, language: v || null })}>
                <option value="">{tt("{name} (default)", { name: languageName(localization.defaultLanguage, "en") })}</option>
                {languages
                  .filter((l) => l !== localization.defaultLanguage)
                  .map((l) => (
                    <option key={l} value={l}>
                      {languageName(l, "en")}
                    </option>
                  ))}
              </SelectInput>
            </Field>
            <Field label={tt("Rounding")} hint={tt("How a converted price is tidied up.")}>
              <SelectInput value={m.rounding} onChange={(v) => setM({ ...m, rounding: v as PriceRounding })} disabled={!m.currency}>
                {(Object.keys(ROUNDING_LABEL) as PriceRounding[]).map((r) => (
                  <option key={r} value={r}>
                    {ROUNDING_LABEL[r]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label={tt("Price adjustment")} hint={tt("Raise or lower prices in this market, in percent.")}>
              <TextInput
                inputMode="decimal"
                value={m.adjustBps ? String(m.adjustBps / 100) : ""}
                placeholder="0"
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."))
                  setM({
                    ...m,
                    adjustBps: Number.isFinite(n) ? Math.max(-5000, Math.min(10000, Math.round(n * 100))) : 0,
                  })
                }}
              />
            </Field>
          </div>
        ) : null}
        {!m.primary ? <Toggle label={tt("On")} description={tt("Off keeps the market and sells to its countries as your home market.")} checked={m.active} onChange={(v) => setM({ ...m, active: v })} /> : null}
      </div>
    </Modal>
  )
}

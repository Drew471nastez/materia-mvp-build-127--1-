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

const PATH = "/api/store/markets"

interface Loaded {
  ready: boolean
  localization: Localization
  baseCurrency: string
  chargeCurrency: string
  fx: { asOf: string; fresh: boolean; currencies: string[] } | null
}

const ROUNDING_LABEL: Record<PriceRounding, string> = {
  none: "As converted",
  whole: "Up to a whole number",
  nine_nine: "Ending in .99",
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
        <Card title="Markets and languages" description="Sell to other countries in their language and currency.">
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
      {!data.ready ? <Notice tone="amber">Markets and languages aren&apos;t set up yet. Run SQL part 136 in Supabase, then come back here.</Notice> : null}

      <Card title="Languages" help="languages" description="The languages your website is offered in. Visitors pick theirs from the language selector, and each language has its own address, like /fr.">
        <div className="space-y-4">
          <Field label="Default language" hint="What your website is written in now. It keeps its addresses as they are.">
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
                  <Pill tone={l.published ? "green" : "gray"}>{l.published ? "Published" : "Not published"}</Pill>
                  <span className="flex items-center gap-1">
                    <button type="button" className={BTN_GHOST} onClick={() => setTranslating(l.code)} disabled={dirty} title={dirty ? "Save your changes first" : undefined}>
                      Translate
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
                      {l.published ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${languageName(l.code, "en")}`}
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
            <Field label="Add a language" className="min-w-[220px] flex-1">
              <SelectInput value={adding} onChange={setAdding}>
                <option value="">Choose a language</option>
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
              Add
            </button>
          </div>
          <p className="text-[12.5px] leading-[18px] text-[#6b7280]">
            A new language starts unpublished: translate it, check it, then publish. Anything not translated yet shows in {languageName(draft.defaultLanguage, "en")}.
          </p>
          <div className="border-t border-[#f1f2f4] pt-4" data-visitor-language="">
            <Toggle
              id="visitor-language"
              label="Show visitors their own language"
              description={
                draft.languages.some((l) => l.published)
                  ? "On a first visit, your website and your storelib.com page open in the language the visitor's browser asks for, once. A close match, or only their country to go by, gets a small offer on the page instead. Search engines and the language selector are unchanged."
                  : "Works once a language is published. A first visit then opens in the language the visitor's browser asks for, or offers the closest one."
              }
              checked={draft.visitorLanguage === true}
              onChange={(v) => setDraft({ ...draft, visitorLanguage: v })}
            />
          </div>
        </div>
      </Card>

      <Card title="Markets" help="markets" description="Groups of countries you sell to the same way. Each can show prices in its own currency and start visitors in its own language.">
        <div className="space-y-4">
          <p className="text-[13px] leading-5 text-[#4b5563]" data-charge-currency="">
            Your prices are in {data.baseCurrency}. Cards are charged in {data.chargeCurrency}. A market in another currency shows an estimate converted at the European Central Bank&apos;s rate, and
            says so before payment.
          </p>
          {data.fx ? (
            data.fx.fresh ? (
              <p className="text-[12.5px] text-[#6b7280]" data-fx="fresh">
                Exchange rates from {data.fx.asOf}.
              </p>
            ) : (
              <Notice tone="amber">The newest exchange rates are from {data.fx.asOf}, which is too old to use. Markets show your own prices until new rates arrive.</Notice>
            )
          ) : (
            <p className="text-[12.5px] text-[#6b7280]" data-fx="none">
              Exchange rates arrive with the next daily update. Until then, every market shows your own prices.
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
                    {m.primary ? <span className="text-[12px] font-normal text-[#6b7280]">· Home</span> : null}
                    {!m.active ? <span className="text-[12px] font-normal text-[#6b7280]">· Off</span> : null}
                  </span>
                  <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">
                    {m.countries.length === 0
                      ? m.primary
                        ? "Every country not in another market"
                        : "No countries yet"
                      : m.countries.length <= 3
                        ? m.countries.map(countryName).join(", ")
                        : `${m.countries.length} countries`}
                    {" · "}
                    {m.currency ?? data.baseCurrency}
                    {m.language ? ` · ${languageName(m.language, "en")}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <button type="button" className={BTN_GHOST} onClick={() => setEditing(m)}>
                    Edit
                  </button>
                  {!m.primary ? (
                    <button
                      type="button"
                      aria-label={`Remove ${m.name}`}
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
            Add a market
          </button>
          {home ? null : <Notice tone="amber">Choose one market as your home.</Notice>}
        </div>
      </Card>

      <div className="sticky bottom-3 z-10 flex items-center justify-end gap-3" data-markets-save="">
        {error ? <Notice className="mr-auto">{error}</Notice> : null}
        {saved ? <span className="text-[13px] text-[#166534]">Saved</span> : null}
        {dirty ? (
          <button type="button" className={BTN_SECONDARY} onClick={() => setDraft(data.localization)} disabled={busy}>
            Discard
          </button>
        ) : null}
        <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={!dirty || busy || !data.ready}>
          {busy ? "Saving" : "Save"}
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
      title={market === "new" ? "Add a market" : `Edit ${m.name || "market"}`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={!m.name.trim()} onClick={() => onDone({ ...m, name: m.name.trim() })}>
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-4" data-market-editor="">
        <Field label="Name">
          <TextInput value={m.name} onChange={(e) => setM({ ...m, name: e.target.value.slice(0, 60) })} placeholder="Europe" maxLength={60} />
        </Field>
        {!m.primary ? (
          <Field label="Countries" hint={`${m.countries.length} chosen. A country can be in one market only.`}>
            <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search countries" aria-label="Search countries" />
            <ul className="mt-2 max-h-[240px] divide-y divide-[#f4f4f6] overflow-y-auto rounded-xl border border-[#eceef1]" data-market-countries="">
              {shown.map((c) => {
                const other = elsewhere.get(c.code)
                const on = m.countries.includes(c.code)
                return (
                  <li key={c.code}>
                    <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-[13.5px]", other && "cursor-not-allowed opacity-50")}>
                      <input type="checkbox" checked={on} disabled={!!other} onChange={() => toggle(c.code)} className="h-4 w-4 accent-[#1a1a2e]" />
                      <span className="flex-1 text-[#1a1a2e]">{c.name}</span>
                      {other ? <span className="text-[12px] text-[#9ca3af]">In {other}</span> : null}
                    </label>
                  </li>
                )
              })}
            </ul>
          </Field>
        ) : (
          <p className="text-[13px] text-[#6b7280]">Your home market sells in {baseCurrency} at your own prices, to every country that isn&apos;t in another market.</p>
        )}
        {!m.primary ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prices shown in" hint={currencies.length ? "Converted from your prices at the day's rate." : "Available once exchange rates arrive."}>
              <SelectInput value={m.currency ?? ""} onChange={(v) => setM({ ...m, currency: v || null })}>
                <option value="">{baseCurrency} (your prices)</option>
                {currencies
                  .filter((c) => c !== baseCurrency)
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </SelectInput>
            </Field>
            <Field label="Visitors start in" hint="On their first visit, once the language is published. After that, what they pick.">
              <SelectInput value={m.language ?? ""} onChange={(v) => setM({ ...m, language: v || null })}>
                <option value="">{languageName(localization.defaultLanguage, "en")} (default)</option>
                {languages
                  .filter((l) => l !== localization.defaultLanguage)
                  .map((l) => (
                    <option key={l} value={l}>
                      {languageName(l, "en")}
                    </option>
                  ))}
              </SelectInput>
            </Field>
            <Field label="Rounding" hint="How a converted price is tidied up.">
              <SelectInput value={m.rounding} onChange={(v) => setM({ ...m, rounding: v as PriceRounding })} disabled={!m.currency}>
                {(Object.keys(ROUNDING_LABEL) as PriceRounding[]).map((r) => (
                  <option key={r} value={r}>
                    {ROUNDING_LABEL[r]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Price adjustment" hint="Raise or lower prices in this market, in percent.">
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
        {!m.primary ? <Toggle label="On" description="Off keeps the market and sells to its countries as your home market." checked={m.active} onChange={(v) => setM({ ...m, active: v })} /> : null}
      </div>
    </Modal>
  )
}

"use client"

/**
 * ===========================================================================
 *  SETTINGS › CHECKOUT › CHECKOUT TEXT
 * ===========================================================================
 * The store's own wording for the cart's and checkout's buttons, headings,
 * helper lines and messages (lib/markets/checkout-text.ts), per language of
 * its website. Each word shows what buyers read now (Storelib's, written by
 * hand where there is a hand written one) beside a field for the store's
 * own; the sketch beside the list shows the page the word is on, with the
 * store's words in it as they are typed.
 *
 * Saved when a field is left, as the store's own translation (source
 * "manual"): no automatic translation ever replaces it. Reset takes it away
 * and Storelib's shows again. Amounts, taxes, the terms, payment and security
 * notes are not listed, so they cannot be reworded into something untrue.
 */
import * as React from "react"
import { ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_GHOST, Card, Notice, api } from "@/components/physical/ui"
import { languageName } from "@/lib/markets/locales"
import { CHECKOUT_TEXT_GROUPS, CHECKOUT_TEXT_MAX, checkoutTextWord, checkWording, type CheckoutTextGroup, type WordingProblem } from "@/lib/markets/checkout-text"
import { activeLocale, tt } from "@/lib/i18n/text"

interface Item {
  key: string
  source: string
  group: CheckoutTextGroup
  /** What buyers read without the store's wording. */
  fallback: string
  /** The store's own wording; empty when it has none. */
  value: string
}
interface Loaded {
  ready: boolean
  locale: string
  defaultLanguage: string
  languages: string[]
  shop: string
  items: Item[]
}

type Screen = "cart" | "checkout" | "thanks"
type RowState = "saving" | "saved" | { problem: string }

const GROUP_TITLE: Record<CheckoutTextGroup, () => string> = {
  buttons: () => tt("Buttons"),
  headings: () => tt("Headings"),
  helper: () => tt("Helper text"),
  messages: () => tt("Messages"),
}

const SCREENS: { id: Screen; label: () => string }[] = [
  { id: "cart", label: () => tt("Cart") },
  { id: "checkout", label: () => tt("Checkout") },
  { id: "thanks", label: () => tt("Thank you page") },
]

/** The page each word is on, so focusing a field shows it. */
const CART_KEYS = new Set(["ui:add_to_cart", "ui:buy_now", "ui:check_out", "ui:view_cart", "ui:cart_title", "ui:note_for_shop", "ui:cart_empty", "ui:cart_nothing", "ui:added_to_cart"])
const THANKS_SOURCES = new Set(["View your order", "Thank you, {name}", "Thank you for your order", "Your order is confirmed", "We'll email you when it ships.", "Your receipt is on its way to {email}.", "Continue shopping"]) // i18n-ignore: the buyer's words by their English key, shown in the chosen language
const screenOf = (i: Item): Screen => (CART_KEYS.has(i.key) ? "cart" : THANKS_SOURCES.has(i.source) ? "thanks" : "checkout")

function problemText(problem: WordingProblem, need: string[]): string {
  if (problem === "long") return tt("Up to {max} characters.", { max: CHECKOUT_TEXT_MAX })
  if (problem === "symbols") return tt("Plain words only, without < > or { }.")
  return tt("Keep {placeholders} in it. It shows the real value.", { placeholders: need.join(" ") })
}

/** A copy of `o` without `key`. */
function without<T>(o: Record<string, T>, key: string): Record<string, T> {
  const next = { ...o }
  delete next[key]
  return next
}

/* Opened again in the same visit: the language last looked at, at once, while it is read again. */
const kept = new Map<string, Loaded>()
let lastLocale: string | null = null

export function CheckoutTextCard() {
  const [data, setData] = React.useState<Loaded | null>(() => (lastLocale ? (kept.get(lastLocale) ?? null) : null))
  const [edits, setEdits] = React.useState<Record<string, string>>({})
  const [rows, setRows] = React.useState<Record<string, RowState>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [focus, setFocus] = React.useState<string | null>(null)
  const [screen, setScreen] = React.useState<Screen>("checkout")

  const load = React.useCallback(async (code: string | null) => {
    const r = await api<Loaded>(`/api/store/checkout-text${code ? `?locale=${encodeURIComponent(code)}` : ""}`, { method: "GET" })
    if (!r.ok) return setError(r.error)
    setError(null)
    kept.set(r.data.locale, r.data)
    lastLocale = r.data.locale
    setData(r.data)
  }, [])

  React.useEffect(() => {
    void load(lastLocale)
  }, [load])

  const shown = (i: Item) => (i.key in edits ? edits[i.key] : i.value)
  const name = data ? languageName(data.locale, activeLocale()) : ""

  /* Saved when the field is left: the store's own wording, or none (Reset), which brings Storelib's back. */
  const save = async (i: Item, raw: string) => {
    if (!data) return
    const word = checkoutTextWord(i.key)
    if (!word) return
    const checked = checkWording(word, raw)
    if (checked.ok === false) return setRows((s) => ({ ...s, [i.key]: { problem: problemText(checked.problem, checked.need) } }))
    if (checked.value === i.value) {
      setEdits((e) => without(e, i.key))
      return setRows((s) => without(s, i.key))
    }
    setRows((s) => ({ ...s, [i.key]: "saving" }))
    const r = await api<{ saved: number; removed: number }>("/api/store/checkout-text", { method: "PUT", body: { locale: data.locale, items: [{ key: i.key, value: checked.value }] } })
    if (!r.ok) return setRows((s) => ({ ...s, [i.key]: { problem: r.error } }))
    setData((d) => {
      if (!d || d.locale !== data.locale) return d
      const next = { ...d, items: d.items.map((x) => (x.key === i.key ? { ...x, value: checked.value } : x)) }
      kept.set(next.locale, next)
      return next
    })
    setEdits((e) => without(e, i.key))
    setRows((s) => ({ ...s, [i.key]: "saved" }))
  }

  const languagePicker =
    data && data.languages.length > 1 ? (
      <label className="relative inline-flex">
        <span className="sr-only">{tt("Language")}</span>
        <select
          value={data.locale}
          onChange={(e) => {
            const v = e.target.value
            setEdits({})
            setRows({})
            const hit = kept.get(v)
            if (hit) setData(hit)
            void load(v)
          }}
          data-checkout-text-language=""
          className="h-9 cursor-pointer appearance-none rounded-lg border border-[#e5e7eb] bg-white pl-3 pr-8 text-[13px] font-medium text-[#1a1a2e] outline-none hover:border-[#d1d5db] focus-visible:border-[#1a1a2e]"
        >
          {data.languages.map((c) => (
            <option key={c} value={c}>
              {languageName(c, activeLocale())}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]" />
      </label>
    ) : null

  return (
    <Card title={tt("Checkout text")} description={tt("Reword the buttons, headings and messages on your cart and checkout. Prices, taxes, terms and payment notes stay as they are.")} action={languagePicker}>
      {error ? <Notice className="mb-4">{error}</Notice> : null}
      {data && !data.ready ? (
        <Notice tone="amber" className="mb-4">
          {tt("Translations aren't set up yet. Run SQL part 136 in Supabase, then try again.")}
        </Notice>
      ) : null}
      {!data ? (
        <div aria-busy="true" className="space-y-2.5" data-checkout-text-loading="">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="h-10 rounded-lg bg-[#f5f6f7]" />
          ))}
        </div>
      ) : (
        <div className="@container" data-checkout-text={data.locale}>
          <div className="grid gap-6 @[760px]:grid-cols-[minmax(0,1fr)_300px]">
            <aside className="@[760px]:order-last" aria-label={tt("Preview")}>
              <div className="@[760px]:sticky @[760px]:top-4">
                <div role="tablist" aria-label={tt("Preview")} className="mb-2.5 flex gap-1 rounded-lg bg-[#f1f2f4] p-0.5">
                  {SCREENS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={screen === s.id}
                      onClick={() => setScreen(s.id)}
                      data-preview-screen={s.id}
                      className={cn("h-8 flex-1 whitespace-nowrap rounded-md px-2 text-[12.5px] font-medium transition-colors", screen === s.id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(17,24,39,0.12)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
                    >
                      {s.label()}
                    </button>
                  ))}
                </div>
                <Preview items={data.items} text={(i) => shown(i).trim() || i.fallback} shop={data.shop} screen={screen} focus={focus} />
              </div>
            </aside>

            <div className="min-w-0 space-y-5">
              {CHECKOUT_TEXT_GROUPS.map((g) => (
                <section key={g} aria-labelledby={`ct-${g}`} className="space-y-2">
                  <h3 id={`ct-${g}`} className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9ca3af]">
                    {GROUP_TITLE[g]()}
                  </h3>
                  <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]">
                    {data.items
                      .filter((i) => i.group === g)
                      .map((i) => {
                        const st = rows[i.key]
                        const problem = st && typeof st === "object" ? st.problem : null
                        return (
                          <li key={i.key} className="px-3.5 py-3" data-checkout-word={i.key}>
                            <div className="grid gap-2 sm:grid-cols-2 sm:items-center">
                              <p className="break-words rounded-lg bg-[#f8f9fa] px-3 py-2 text-[13px] leading-[19px] text-[#4b5563]">{i.fallback}</p>
                              <div className="flex items-center gap-1.5">
                                <input
                                  value={shown(i)}
                                  maxLength={CHECKOUT_TEXT_MAX + 20}
                                  aria-label={tt("{label} in {name}", { label: i.fallback, name })}
                                  aria-invalid={problem ? true : undefined}
                                  onFocus={() => {
                                    setFocus(i.key)
                                    setScreen(screenOf(i))
                                  }}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setEdits((x) => ({ ...x, [i.key]: v }))
                                    if (problem) setRows((s) => without(s, i.key))
                                  }}
                                  onBlur={() => {
                                    setFocus((f) => (f === i.key ? null : f))
                                    if (i.key in edits) void save(i, edits[i.key])
                                  }}
                                  className={cn(
                                    "h-10 min-w-0 flex-1 rounded-lg border bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-colors placeholder:text-[#b4b9c2] focus:border-[#1a1a2e] sm:h-[38px] sm:text-[13.5px]",
                                    problem ? "border-[#fca5a5]" : "border-[#e5e7eb]",
                                  )}
                                />
                                {st === "saving" ? (
                                  <Loader2 aria-label={tt("Saving")} className="h-4 w-4 shrink-0 animate-spin text-[#9ca3af]" />
                                ) : i.value ? (
                                  <button type="button" className={cn(BTN_GHOST, "h-9 shrink-0 px-2.5 text-[12.5px]")} onClick={() => void save(i, "")} data-reset-word={i.key}>
                                    {tt("Reset")}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {problem ? (
                              <p className="mt-1.5 text-[12.5px] text-[#b42318]" role="alert">
                                {problem}
                              </p>
                            ) : st === "saved" ? (
                              <p className="mt-1.5 text-[12.5px] text-[#6b7280]" aria-live="polite">
                                {tt("Saved. Your checkout shows it within a few seconds.")}
                              </p>
                            ) : null}
                          </li>
                        )
                      })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

/* ── The sketch ───────────────────────────────────────────────────────── */

function Bar({ w, h = "h-2.5" }: { w: string; h?: string }) {
  return <div className={cn("rounded-full bg-[#eceef1]", h, w)} />
}
function Box({ children }: { children?: React.ReactNode }) {
  return <div className="flex h-8 items-center rounded-md border border-[#e5e7eb] bg-white px-2.5 text-[11.5px] text-[#9ca3af]">{children}</div>
}
function Primary({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-9 items-center justify-center rounded-lg bg-[#1a1a2e] px-3 py-2 text-center text-[12.5px] font-semibold text-white">{children}</div>
}
function Secondary({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-8 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-center text-[12px] font-medium text-[#1a1a2e]">{children}</div>
}

const SLOT = /(\{[A-Za-z_][\w.]*\})/g

/** One of the store's words in the sketch: a blank the store's name fills shows it, a blank the order fills shows what it stands for. */
function Word({ item, text, shop, focused }: { item: Item | undefined; text: string; shop: string; focused: boolean }) {
  if (!item) return null
  const ownName = (slot: string) => slot === "{shop}" || (slot === "{name}" && item.source === "{name} sees it with your order.")
  return (
    <span data-preview-word={item.key} className={cn("rounded-[4px] transition-shadow duration-150", focused && "shadow-[0_0_0_2px_rgba(139,92,246,0.45)]")}>
      {text.split(SLOT).map((part, n) =>
        /^\{[A-Za-z_][\w.]*\}$/.test(part) ? (
          ownName(part) && shop ? (
            <React.Fragment key={n}>{shop}</React.Fragment>
          ) : (
            <span key={n} className="rounded bg-current/10 px-1 font-mono text-[0.86em] opacity-70">
              {part.slice(1, -1)}
            </span>
          )
        ) : (
          <React.Fragment key={n}>{part}</React.Fragment>
        ),
      )}
    </span>
  )
}

/**
 * The page a word is on, drawn small: the store's words where they stand,
 * grey bars for everything that is the buyer's or the order's. Each w("…")
 * names a buyer's word by its English and draws it in the chosen language.
 */
// i18n-ignore-start: the buyer's words by their English key, never shown in English unless the chosen language is English
function Preview({ items, text, shop, screen, focus }: { items: Item[]; text: (i: Item) => string; shop: string; screen: Screen; focus: string | null }) {
  const bySource = new Map(items.map((i) => [i.source, i]))
  const byKey = new Map(items.map((i) => [i.key, i]))
  /* By its English, or a cart word by its key. */
  const w = (id: string) => {
    const item = id.startsWith("ui:") ? byKey.get(id) : bySource.get(id)
    return <Word item={item} text={item ? text(item) : ""} shop={shop} focused={!!item && focus === item.key} />
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#eceef1] bg-white text-[#1a1a2e]" data-checkout-preview={screen} aria-hidden="true">
      {screen === "checkout" ? (
        <div className="space-y-4 p-4">
          <div className="rounded-lg bg-[#f8f9fa] p-3">
            <p className="text-[12px] font-medium text-[#6b7280]">{w("Pay {shop}")}</p>
            <Bar w="w-24" h="mt-2 h-5" />
            <p className="mt-3 text-[11.5px] font-semibold">{w("Order summary")}</p>
            <div className="mt-2 space-y-1.5">
              <Bar w="w-3/4" />
              <Bar w="w-1/2" />
            </div>
            <p className="mt-3 text-[11.5px] font-medium underline decoration-[#d1d5db] underline-offset-2">{w("Add promotion code")}</p>
            <div className="mt-2 flex gap-1.5">
              <div className="flex-1">
                <Box>{w("Enter discount code")}</Box>
              </div>
              <Secondary>{w("Apply")}</Secondary>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[13px] font-semibold">{w("Contact information")}</p>
            <Box />
          </div>
          <div className="space-y-2">
            <p className="text-[13px] font-semibold">{w("Delivery")}</p>
            <Box />
            <p className="pt-1 text-[12px] font-semibold">{w("Shipping method")}</p>
            <Box />
          </div>
          <div className="space-y-2">
            <p className="text-[13px] font-semibold">{w("Payment method")}</p>
            <Box />
          </div>
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium">{w("Add a note for the shop")}</p>
            <div className="min-h-12 rounded-md border border-[#e5e7eb] px-2.5 py-2 text-[11.5px] text-[#9ca3af]">{w("Gift wrap, delivery instructions...")}</div>
            <p className="text-[11px] text-[#6b7280]">{w("{name} sees it with your order.")}</p>
          </div>
          <div className="space-y-1.5">
            <Primary>{w("Pay {amount}")}</Primary>
            <div className="grid grid-cols-2 gap-1.5">
              <Secondary>{w("Place order")}</Secondary>
              <Secondary>{w("Get it free")}</Secondary>
            </div>
          </div>
        </div>
      ) : screen === "cart" ? (
        <div className="space-y-4 p-4">
          <div className="flex gap-3">
            <div className="h-16 w-16 shrink-0 rounded-lg bg-[#f1f2f4]" />
            <div className="min-w-0 flex-1 space-y-1.5 pt-1">
              <Bar w="w-3/4" />
              <Bar w="w-1/3" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Primary>{w("ui:add_to_cart")}</Primary>
            <Secondary>{w("ui:buy_now")}</Secondary>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-[#1a1a2e] px-3 py-2 text-[11.5px] text-white">
            {w("ui:added_to_cart")}
            <span className="font-medium underline underline-offset-2">{w("ui:view_cart")}</span>
          </div>
          <div className="space-y-2.5 rounded-lg border border-[#eceef1] p-3">
            <p className="text-[14px] font-semibold">{w("ui:cart_title")}</p>
            <div className="space-y-1.5">
              <Bar w="w-2/3" />
              <Bar w="w-1/3" />
            </div>
            <p className="pt-1 text-[11.5px] font-medium text-[#4b5563]">{w("ui:note_for_shop")}</p>
            <Box />
            <Primary>{w("ui:check_out")}</Primary>
          </div>
          <div className="rounded-lg border border-dashed border-[#e5e7eb] px-3 py-3 text-center">
            <p className="text-[12.5px] font-semibold">{w("ui:cart_empty")}</p>
            <p className="mt-0.5 text-[11.5px] text-[#6b7280]">{w("ui:cart_nothing")}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <p className="text-[18px] font-semibold leading-6 tracking-[-0.01em]">{w("Thank you, {name}")}</p>
          <p className="text-[12px] text-[#6b7280]">{w("Your receipt is on its way to {email}.")}</p>
          <p className="text-[12px] text-[#6b7280]">{w("We'll email you when it ships.")}</p>
          <div className="space-y-1.5 rounded-lg bg-[#f8f9fa] p-3">
            <Bar w="w-2/3" />
            <Bar w="w-1/2" />
          </div>
          <Primary>{w("View your order")}</Primary>
          <Secondary>{w("Continue shopping")}</Secondary>
          <div className="border-t border-[#f1f2f4] pt-3">
            <p className="text-[11px] text-[#9ca3af]">{w("Thank you for your order")}</p>
            <p className="mt-1 text-[13px] font-semibold">{w("Your order is confirmed")}</p>
          </div>
        </div>
      )}
    </div>
  )
}
// i18n-ignore-end

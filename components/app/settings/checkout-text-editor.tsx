"use client"

/**
 * ===========================================================================
 *  SETTINGS › CHECKOUT › CHECKOUT TEXT
 * ===========================================================================
 * A store's own words on its checkout, one language at a time. Each text a
 * store may reword (lib/checkout-text/registry.ts), grouped the way the
 * checkout reads top to bottom, shows what checkout says by default in that
 * language and a field for the store's own. Beside it on a computer, under
 * it on a phone, the checkout itself drawn with the words as they are typed;
 * the text being edited is outlined there.
 *
 * Locked texts (consent, amounts, payment status, the payment provider's
 * words, refund policies) are listed at the foot with why, never offered.
 * Every field is checked as it is typed with the same rule the server keeps
 * (validateOverride), so Save never surprises. "Default changed since you
 * edited" appears when Storelib's own words for a text changed after the
 * store wrote theirs; theirs still shows until they choose.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, Loader2, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_PRIMARY, BTN_SECONDARY, Notice, api } from "@/components/physical/ui"
import { formatMessage, tt } from "@/lib/i18n/text"
import { editableById, validateOverride, type TextGroupId } from "@/lib/checkout-text/registry"

interface Item {
  id: string
  group: TextGroupId
  source: string
  note: string
  max: number
  placeholders: string[]
  default: string
  value: string
  defaultChanged: boolean
}
interface Loaded {
  ready: boolean
  lang: string
  languages: { code: string; name: string; own: string }[]
  shopName: string
  currency: string
  groups: { id: TextGroupId; title: string }[]
  items: Item[]
  locked: { source: string; reason: string }[]
}

const GROUP_TITLE: Record<TextGroupId, () => string> = {
  header: () => tt("Header"),
  contact: () => tt("Contact"),
  delivery: () => tt("Delivery"),
  payment: () => tt("Payment"),
  buttons: () => tt("Buttons"),
  summary: () => tt("Order summary"),
  messages: () => tt("Messages"),
}

export function CheckoutTextEditor({ onClose }: { onClose: (changed: number) => void }) {
  const [data, setData] = React.useState<Loaded | null>(null)
  const [lang, setLang] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<Record<string, string>>({})
  const [focus, setFocus] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [savedNote, setSavedNote] = React.useState<string | null>(null)
  const [mounted, setMounted] = React.useState(false)

  const load = React.useCallback(async (which: string | null) => {
    setError(null)
    const r = await api<Loaded>(`/api/store/checkout-text${which ? `?lang=${encodeURIComponent(which)}` : ""}`, { method: "GET" })
    if (!r.ok) {
      setError(r.error)
      return
    }
    setData(r.data)
    setLang(r.data.lang)
    setDraft(Object.fromEntries(r.data.items.map((i) => [i.id, i.value])))
  }, [])

  React.useEffect(() => {
    setMounted(true)
    void load(null)
    const was = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = was
    }
  }, [load])

  const dirty = data ? data.items.filter((i) => (draft[i.id] ?? "") !== i.value) : []
  const problems = new Map<string, string>()
  for (const i of data?.items ?? []) {
    const entry = editableById(i.id)
    if (!entry) continue
    const v = validateOverride(entry, draft[i.id] ?? "")
    if (!v.ok) problems.set(i.id, v.error)
  }
  const changedCount = data ? data.items.filter((i) => i.value).length : 0

  const close = React.useCallback(() => {
    if (dirty.length && !window.confirm(tt("Leave without saving your changes?"))) return
    onClose(changedCount)
  }, [dirty.length, changedCount, onClose])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close])

  const save = async () => {
    if (!data || !lang || dirty.length === 0 || problems.size) return
    setSaving(true)
    setError(null)
    const r = await api<{ ok: true }>("/api/store/checkout-text", { method: "PUT", body: { lang, changes: dirty.map((i) => ({ id: i.id, text: draft[i.id] ?? "" })) } })
    setSaving(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setSavedNote(tt("Saved. Your checkout shows it now."))
    await load(lang)
  }

  /* "Keep mine": saved again, so it is kept against the new default. "Use default": cleared. */
  const settle = async (item: Item, keep: boolean) => {
    if (!lang) return
    const r = await api<{ ok: true }>("/api/store/checkout-text", { method: "PUT", body: { lang, changes: [{ id: item.id, text: keep ? item.value : "" }] } })
    if (!r.ok) setError(r.error)
    else await load(lang)
  }

  const switchLanguage = (next: string) => {
    if (next === lang) return
    if (dirty.length && !window.confirm(tt("Switch language without saving your changes?"))) return
    setSavedNote(null)
    setLang(next)
    void load(next)
  }

  if (!mounted) return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={tt("Checkout text")} data-checkout-text-editor="" className="fixed inset-0 z-[70] flex flex-col bg-[#f8f9fa]">
      <header className="flex shrink-0 items-center gap-2 border-b border-[#e5e7eb] bg-white px-3 pb-2.5 pt-[calc(10px+env(safe-area-inset-top,0px))] sm:gap-3 sm:px-5">
        <button type="button" onClick={close} aria-label={tt("Back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#1a1a2e] hover:bg-[#f1f2f4]">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-semibold text-[#1a1a2e] sm:text-[17px]">{tt("Checkout text")}</h1>
          <p className="hidden truncate text-[13px] text-[#6b7280] sm:block">{tt("Your own words on your checkout, in each language.")}</p>
        </div>
        {data && data.languages.length > 1 ? (
          <label className="flex shrink-0 items-center">
            <span className="sr-only">{tt("Language")}</span>
            <select
              value={lang ?? ""}
              onChange={(e) => switchLanguage(e.target.value)}
              data-checkout-text-language=""
              className="h-10 max-w-[40vw] rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[14px] text-[#1a1a2e] outline-none focus:border-[#9ca3af]"
            >
              {data.languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.own}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" onClick={save} disabled={!dirty.length || problems.size > 0 || saving} className={cn(BTN_PRIMARY, "shrink-0")} data-checkout-text-save="">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {tt("Save")}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!data ? (
          error ? (
            <div className="mx-auto max-w-[720px] p-4"><Notice>{error}</Notice></div>
          ) : (
            <div className="mx-auto max-w-[1200px] space-y-3 p-4 sm:p-6" aria-busy="true">
              <div className="h-[200px] animate-pulse rounded-2xl border border-[#e5e7eb]/60 bg-white" />
              <div className="h-[320px] animate-pulse rounded-2xl border border-[#e5e7eb]/60 bg-white" />
            </div>
          )
        ) : (
          <div className="mx-auto grid max-w-[1200px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-8 lg:px-8 lg:py-6">
            <div className="min-w-0 space-y-5">
              {!data.ready ? <Notice tone="amber">{tt("Checkout text needs its database update (SQL part 212). Until it runs, checkout shows Storelib's words and changes here are not kept.")}</Notice> : null}
              {error ? <Notice>{error}</Notice> : null}
              {savedNote && !dirty.length ? <Notice tone="green">{savedNote}</Notice> : null}
              {data.groups.map((g) => {
                const items = data.items.filter((i) => i.group === g.id)
                if (!items.length) return null
                return (
                  <section key={g.id} className="rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-text-group={g.id}>
                    <h2 className="px-4 pb-1 pt-4 text-[15px] font-semibold text-[#1a1a2e] sm:px-5">{GROUP_TITLE[g.id]()}</h2>
                    <ul>
                      {items.map((i) => (
                        <TextRow
                          key={i.id}
                          item={i}
                          value={draft[i.id] ?? ""}
                          problem={problems.get(i.id) ?? null}
                          onChange={(v) => {
                            setSavedNote(null)
                            setDraft((d) => ({ ...d, [i.id]: v }))
                          }}
                          onFocus={() => setFocus(i.id)}
                          onSettle={(keep) => void settle(i, keep)}
                        />
                      ))}
                    </ul>
                  </section>
                )
              })}
              <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-5" data-text-locked="">
                <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-[#1a1a2e]">
                  <Lock className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
                  {tt("Locked")}
                </h2>
                <p className="mt-1 text-[13px] leading-5 text-[#6b7280]">{tt("Legal and consent text, amounts, payment results and refund policies always read as Storelib writes them, so buyers are never misled.")}</p>
                <ul className="mt-3 space-y-2">
                  {data.locked.map((l) => (
                    <li key={l.source} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="min-w-0 text-[#4b5563]">{l.source}</span>
                      <span className="shrink-0 text-[#9ca3af]">{tt(l.reason)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start" aria-label={tt("Preview")}>
              <p className="mb-2 px-1 text-[13px] font-medium text-[#6b7280]">{tt("Preview")}</p>
              <CheckoutPreview data={data} draft={draft} focus={focus} />
            </aside>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function TextRow({ item, value, problem, onChange, onFocus, onSettle }: { item: Item; value: string; problem: string | null; onChange: (v: string) => void; onFocus: () => void; onSettle: (keep: boolean) => void }) {
  const id = `ct-${item.id}`
  return (
    <li className="border-t border-[#f0f1f3] px-4 py-3.5 first:border-t-0 sm:px-5" data-text-row={item.id}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="min-w-0 text-[14px] font-medium leading-5 text-[#1a1a2e]">
          {item.default}
        </label>
        {value ? (
          <button type="button" onClick={() => onChange("")} className="shrink-0 text-[13px] font-medium text-[#6b7280] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
            {tt("Use default")}
          </button>
        ) : null}
      </div>
      <p className="mt-0.5 text-[12.5px] leading-[18px] text-[#6b7280]">{item.note}</p>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        maxLength={item.max + 20}
        placeholder={item.default}
        aria-invalid={!!problem}
        aria-describedby={problem ? `${id}-problem` : undefined}
        className={cn(
          "mt-2 h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-[15px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#b0b5bd] focus:ring-[3px] sm:h-10 sm:text-[14px]",
          problem ? "border-[#f04438] focus:ring-[rgba(240,68,56,0.12)]" : "border-[#e5e7eb] focus:border-[#9ca3af] focus:ring-[rgba(17,24,39,0.06)]",
        )}
      />
      <div className="mt-1 flex items-start justify-between gap-3">
        {problem ? (
          <p id={`${id}-problem`} className="text-[12.5px] text-[#b42318]">{problem}</p>
        ) : item.placeholders.length ? (
          <p className="text-[12.5px] text-[#9ca3af]">{tt("Keep {list} in it.", { list: item.placeholders.map((p) => `{${p}}`).join(" ") })}</p>
        ) : (
          <span />
        )}
        {value ? <span className={cn("shrink-0 text-[12px] tabular-nums", value.length > item.max ? "text-[#b42318]" : "text-[#9ca3af]")}>{value.length}/{item.max}</span> : null}
      </div>
      {item.defaultChanged && item.value ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[#fffaeb] px-3 py-2 text-[13px] text-[#93370d]" data-default-changed="">
          <span>{tt("Default changed since you edited.")}</span>
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => onSettle(false)}>{tt("Use the new default")}</button>
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => onSettle(true)}>{tt("Keep mine")}</button>
        </div>
      ) : null}
    </li>
  )
}

/* ── The preview ────────────────────────────────────────────────────── */

function moneyIn(cents: number, currency: string, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

/**
 * The checkout as a buyer sees it, small: the words as they read now (the
 * draft, else the default), sample amounts in the store's currency. The text
 * being edited is outlined. Messages show their own panel (after paying,
 * and a field with its error), since they are not on the page until then.
 */
function CheckoutPreview({ data, draft, focus }: { data: Loaded; draft: Record<string, string>; focus: string | null }) {
  const lang = data.lang
  const byId = new Map(data.items.map((i) => [i.id, i]))
  const money = (c: number) => moneyIn(c, data.currency, lang)
  const vars = { shop: data.shopName, site: data.shopName, amount: money(4900), name: "Ana", code: "SAVE10" }
  const w = (id: string) => {
    const i = byId.get(id)
    if (!i) return ""
    const typed = (draft[id] ?? "").trim()
    const ok = typed && validateOverride(editableById(id)!, typed).ok
    try {
      return formatMessage(ok ? typed : i.default, vars, lang)
    } catch {
      return ok ? typed : i.default
    }
  }
  const mark = (id: string) => cn("rounded-[4px] transition-[box-shadow,background-color] duration-150", focus === id && "bg-[#fef3c7] shadow-[0_0_0_3px_#fde68a]")
  const after = focus ? byId.get(focus)?.group === "messages" : false

  if (after) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-preview="messages">
        <p className={cn("text-[20px] font-semibold text-[#1a1a2e]", mark("messages.thanks_name"))}>{w("messages.thanks_name")}</p>
        <p className={cn("mt-1 text-[14px] text-[#6b7280]", mark("messages.confirmed"))}>{w("messages.confirmed")}</p>
        <p className="mt-4 text-[12px] font-medium uppercase tracking-wide text-[#9ca3af]">{tt("Also shown")}</p>
        <ul className="mt-2 space-y-1.5 text-[14px] text-[#1a1a2e]">
          <li className={mark("messages.thanks")}>{w("messages.thanks")}</li>
          <li className={mark("messages.placed")}>{w("messages.placed")}</li>
          <li className={mark("messages.empty_cart")}>{w("messages.empty_cart")}</li>
        </ul>
        <div className="mt-4 space-y-3">
          {(["messages.email_invalid", "messages.name_missing", "messages.street_missing", "messages.city_missing", "messages.phone_check"] as const).map((id) => (
            <div key={id}>
              <div className="h-9 rounded-lg border border-[#f04438] bg-white" />
              <p className={cn("mt-1 text-[12.5px] text-[#b42318]", mark(id))}>{w(id)}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-preview="checkout">
      <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2.5 text-[12.5px] text-[#6b7280]">
        <span className={mark("header.back_to")}>← {w("header.back_to")}</span>
        <span className={mark("header.secure")}>{w("header.secure")}</span>
      </div>
      <div className="bg-[#f8f9fa] px-4 pb-4 pt-4">
        <p className={cn("text-[13px] font-medium text-[#6b7280]", mark("header.pay_shop"))} data-preview-pay-shop="">{w("header.pay_shop")}</p>
        <p className="text-[24px] font-semibold tabular-nums text-[#1a1a2e]">{money(4900)}</p>
        <span className={cn("mt-1 inline-block rounded-[6px] bg-[#e9ebee] px-2 py-0.5 text-[12px] font-medium text-[#1a1a2e]", mark("header.details"))}>{w("header.details")}</span>
        <div className="mt-3 flex items-start gap-3">
          <div className="h-11 w-11 shrink-0 rounded-lg bg-[#e5e7eb]" />
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-medium text-[#1a1a2e]">{tt("Linen shirt")}</p>
            <p className="text-[#6b7280]">
              M <span className={cn("underline", mark("buttons.edit"))}>{w("buttons.edit")}</span> · <span className={cn("underline", mark("buttons.remove"))}>{w("buttons.remove")}</span>
            </p>
          </div>
          <p className="text-[13px] font-medium tabular-nums text-[#1a1a2e]">{money(4900)}</p>
        </div>
        <dl className="mt-3 space-y-1.5 border-t border-black/[0.07] pt-3 text-[13px]">
          <div className="flex justify-between"><dt className={mark("summary.subtotal")}>{w("summary.subtotal")}</dt><dd className="tabular-nums">{money(4900)}</dd></div>
          <div className={cn("text-[12.5px] text-[#4b5563] underline", mark("buttons.add_code"))}>{w("buttons.add_code")}</div>
          <div className="flex items-center gap-2">
            <span className={cn("flex h-8 flex-1 items-center rounded-md border border-[#e5e7eb] bg-white px-2 text-[12px] text-[#9ca3af]", mark("summary.enter_code"))}>{w("summary.enter_code")}</span>
            <span className={cn("rounded-md bg-[#1a1a2e] px-2.5 py-1.5 text-[12px] font-medium text-white", mark("buttons.apply"))}>{w("buttons.apply")}</span>
          </div>
          <div className="flex justify-between text-[#6b7280]"><dt className={mark("summary.discount")}>{w("summary.discount")} (SAVE10)</dt><dd className="tabular-nums">−{money(500)}</dd></div>
          <div className="flex justify-between text-[#6b7280]"><dt className={mark("summary.shipping")}>{w("summary.shipping")}</dt><dd className="tabular-nums">{money(500)}</dd></div>
          <div className="flex justify-between border-t border-black/[0.07] pt-2 font-semibold text-[#1a1a2e]"><dt className={mark("summary.total")}>{w("summary.total")}</dt><dd className="tabular-nums">{money(4900)}</dd></div>
        </dl>
        <p className={cn("mt-2 text-[12px] text-[#6b7280]", mark("summary.tip"))}>{w("summary.tip")} · <span className={mark("summary.free")}>{w("summary.free")}</span> · <span className={mark("summary.discount_code")}>{w("summary.discount_code")}</span></p>
      </div>
      <div className="space-y-3 px-4 py-4 text-[13px]">
        <p className={cn("text-center text-[12px] text-[#6b7280]", mark("payment.express"))}>{w("payment.express")}</p>
        <div className="flex items-baseline justify-between">
          <p className={cn("text-[15px] font-semibold text-[#1a1a2e]", mark("contact.heading"))}>{w("contact.heading")}</p>
          <span className={cn("text-[12px] text-[#4b5563] underline", mark("contact.sign_in"))}>{w("contact.sign_in")}</span>
        </div>
        <div className="rounded-lg border border-[#e5e7eb] px-2.5 py-1.5 text-[#9ca3af]"><span className={mark("contact.email")}>{w("contact.email")}</span></div>
        <div className="rounded-lg border border-[#e5e7eb] px-2.5 py-1.5 text-[#9ca3af]"><span className={mark("contact.phone")}>{w("contact.phone")}</span> / <span className={mark("contact.phone_optional")}>{w("contact.phone_optional")}</span></div>
        <p className={cn("pt-1 text-[15px] font-semibold text-[#1a1a2e]", mark("delivery.heading"))}>{w("delivery.heading")}</p>
        <p className={cn("text-[12px] text-[#6b7280]", mark("delivery.or_pickup"))}>{w("delivery.or_pickup")}</p>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#f1f2f4] p-1 text-center text-[12.5px] font-medium">
          <span className={cn("rounded-md bg-white py-1 text-[#1a1a2e]", mark("delivery.ship"))}>{w("delivery.ship")}</span>
          <span className={cn("py-1 text-[#6b7280]", mark("delivery.pick_up"))}>{w("delivery.pick_up")}</span>
        </div>
        <p className={cn("font-medium text-[#1a1a2e]", mark("delivery.method"))}>{w("delivery.method")}</p>
        <div className="flex justify-between rounded-lg border border-[#1a1a2e] px-2.5 py-2"><span>Standard</span><span className="tabular-nums">{money(500)}</span></div>
        <p className={cn("text-[12.5px] text-[#4b5563] underline", mark("delivery.note"))}>{w("delivery.note")}</p>
        <div className="rounded-lg border border-[#e5e7eb] px-2.5 py-1.5 text-[12px] text-[#9ca3af]"><span className={mark("delivery.note_hint")}>{w("delivery.note_hint")}</span></div>
        <p className={cn("pt-1 text-[15px] font-semibold text-[#1a1a2e]", mark("payment.heading"))}>{w("payment.heading")}</p>
        <p className={cn("text-[12px] text-[#6b7280]", mark("payment.how"))}>{w("payment.how")}</p>
        <div className="grid grid-cols-2 gap-1 text-[12.5px]">
          <span className="rounded-lg border border-[#1a1a2e] px-2 py-1.5">{tt("Card")}</span>
          <span className={cn("rounded-lg border border-[#e5e7eb] px-2 py-1.5", mark("payment.cod"))}>{w("payment.cod")}</span>
        </div>
        <div className={cn("grid h-11 place-items-center rounded-lg bg-[#1a1a2e] text-[14px] font-semibold text-white", mark("buttons.pay_amount"))} data-preview-pay="">{w("buttons.pay_amount")}</div>
        <p className="text-center text-[12px] text-[#6b7280]">
          <span className={mark("buttons.place_order")}>{w("buttons.place_order")}</span> · <span className={mark("buttons.get_free")}>{w("buttons.get_free")}</span> · <span className={mark("buttons.continue")}>{w("buttons.continue")}</span> · <span className={mark("header.hide_details")}>{w("header.hide_details")}</span>
        </p>
      </div>
    </div>
  )
}

"use client"

/**
 * ===========================================================================
 *  ONE WIDGET, CUSTOMIZED
 * ===========================================================================
 * The settings on one side and the widget on the other, drawn by the same
 * function the website uses, from the store's own reviews (samples only
 * while it has none, and the preview says so). Computer and phone preview.
 * A look is saved under a name; a widget can have several (Save, Save as
 * new), and a section on the website names the one it draws with, so
 * changing a saved look here changes every page that uses it.
 */
import { useMemo, useState } from "react"
import { ArrowLeft, Monitor, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { UI_WORDS } from "@/lib/markets/ui-words"
import { languageName } from "@/lib/markets/locales"
import { WIDGET_INFO, resolveWidgetSettings, type WidgetConfig, type WidgetSettings, type WidgetType } from "@/lib/reviews/widgets/config"
import { EDITABLE_LABELS, fieldsFor, rangeOf, type CustomizerField } from "@/lib/reviews/widgets/fields"
import { renderReviewWidget, type WidgetReviews } from "@/lib/reviews/widgets/render"
import { buttonPrimary, buttonSecondary, card } from "@/app/app/orders/order-parts"
import { DESKTOP_WIDTH, PHONE_WIDTH, WidgetPreview } from "./widget-preview"

const LABEL = "text-[13px] font-medium text-[#1a1a2e]"
const INPUT = "h-9 w-full rounded-lg border border-[#e3e4e8] bg-white px-3 text-[14px] text-[#1a1a2e] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 md:text-[13px]"

export interface CustomizerProps {
  type: WidgetType
  /** The saved look being changed, or null for a new one. */
  config: WidgetConfig | null
  configs: WidgetConfig[]
  reviews: WidgetReviews | null
  shopName: string
  languages: { defaultLanguage: string; others: string[] }
  ready: boolean
  busy: boolean
  onBack: () => void
  onPick: (id: string | null) => void
  onSave: (input: { id: string | null; name: string; settings: WidgetSettings }) => Promise<WidgetConfig | null>
  onDelete: (id: string) => void
  onAdd: (type: WidgetType, configId: string | null) => void
}

export function WidgetCustomizer(props: CustomizerProps) {
  const { type, config, configs, reviews } = props
  const info = WIDGET_INFO[type]
  const [settings, setSettings] = useState<WidgetSettings>(() => resolveWidgetSettings(type, config?.settings))
  const [name, setName] = useState(config?.name ?? info.name)
  const [device, setDevice] = useState<"desktop" | "phone">("desktop")
  const [lang, setLang] = useState("default")
  const [saved, setSaved] = useState(() => JSON.stringify([config?.name ?? info.name, resolveWidgetSettings(type, config?.settings)]))
  const dirty = JSON.stringify([name, settings]) !== saved
  const mine = configs.filter((c) => c.type === type)

  const set = <K extends keyof WidgetSettings>(k: K, v: WidgetSettings[K]) => setSettings((s) => ({ ...s, [k]: v }))
  const html = useMemo(
    () =>
      renderReviewWidget({
        type,
        settings,
        /* The words as a page in the language being edited would show them. */
        reviews: reviews ? { ...reviews, locale: lang === "default" ? null : lang, default_locale: lang === "default" } : null,
        shopName: props.shopName,
        inEditor: true,
        uid: "preview",
      }),
    [type, settings, reviews, lang, props.shopName],
  )

  const save = async (asNew: boolean) => {
    const out = await props.onSave({ id: asNew ? null : config?.id ?? null, name: name.trim() || info.name, settings })
    if (out) setSaved(JSON.stringify([out.name, resolveWidgetSettings(type, out.settings)]))
  }
  const add = async () => {
    if (dirty || !config) {
      const out = await props.onSave({ id: config?.id ?? null, name: name.trim() || info.name, settings })
      if (!out) return
      props.onAdd(type, out.id)
      return
    }
    props.onAdd(type, config.id)
  }

  const labels = settings.labels[lang] ?? {}
  const setLabel = (key: string, value: string) =>
    setSettings((s) => {
      const forLang = { ...(s.labels[lang] ?? {}) }
      if (value) forLang[key] = value
      else delete forLang[key]
      const next = { ...s.labels }
      if (Object.keys(forLang).length) next[lang] = forLang
      else delete next[lang]
      return { ...s, labels: next }
    })

  return (
    <div className="pb-24 md:pb-10" data-widget-customizer={type}>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <button type="button" onClick={props.onBack} className={buttonSecondary} data-customizer-back="">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {tt("Widgets")}
        </button>
        <h2 className="mr-auto text-[18px] font-semibold text-[#1a1a2e]">{info.name}</h2>
        {mine.length > 0 ? (
          <select aria-label={tt("Saved looks")} className={cn(INPUT, "w-auto max-w-[220px]")} value={config?.id ?? ""} onChange={(e) => props.onPick(e.target.value || null)} data-customizer-looks="">
            <option value="">{tt("New look")}</option>
            {mine.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
        <div className={cn(card, "order-2 lg:order-1")}>
          <div className="border-b border-[#eef0f2] p-4">
            <label className="grid gap-1.5">
              <span className={LABEL}>{tt("Name")}</span>
              <input className={INPUT} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} data-customizer-name="" />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={buttonPrimary} disabled={props.busy || !props.ready || (!dirty && !!config)} onClick={() => save(false)} data-customizer-save="">
                {config ? (dirty ? tt("Save") : tt("Saved")) : tt("Save look")}
              </button>
              {config ? (
                <button type="button" className={buttonSecondary} disabled={props.busy || !props.ready} onClick={() => save(true)}>
                  {tt("Save as new")}
                </button>
              ) : null}
              {config ? (
                <button type="button" className={cn(buttonSecondary, "text-[#b42318]")} disabled={props.busy} onClick={() => props.onDelete(config.id)} data-customizer-delete="">
                  {tt("Delete")}
                </button>
              ) : null}
            </div>
            {!props.ready ? <p className="mt-2 text-[12.5px] text-[#6b7280]">{tt("Saving looks needs the database update (SQL part 216).")}</p> : null}
          </div>
          <div className="max-h-none divide-y divide-[#eef0f2] lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto">
            {fieldsFor(type).map((g, i) => (
              <details key={g.id} open={i < 2} className="group">
                <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-semibold text-[#1a1a2e] [&::-webkit-details-marker]:hidden">
                  {tt(g.label)}
                  <span aria-hidden className="text-[#9ca3af] transition-transform group-open:rotate-90">›</span>
                </summary>
                <div className="grid gap-3 px-4 pb-4">
                  {g.fields.map((f) => (
                    <Field key={f.key} field={f} value={settings[f.key]} onChange={(v) => set(f.key, v as never)} />
                  ))}
                </div>
              </details>
            ))}
            <details className="group">
              <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-semibold text-[#1a1a2e] [&::-webkit-details-marker]:hidden">
                {tt("Words")}
                <span aria-hidden className="text-[#9ca3af] transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="grid gap-3 px-4 pb-4" data-customizer-words="">
                <p className="text-[12.5px] leading-relaxed text-[#6b7280]">{tt("Empty uses your website's words in that language. What you write here wins.")}</p>
                <label className="grid gap-1.5">
                  <span className={LABEL}>{tt("Language")}</span>
                  <select className={INPUT} value={lang} onChange={(e) => setLang(e.target.value)} data-customizer-lang="">
                    <option value="default">{tt("{name} (your website's)", { name: languageName(props.languages.defaultLanguage, "en") })}</option>
                    {props.languages.others.map((l) => (
                      <option key={l} value={l}>
                        {languageName(l, "en")}
                      </option>
                    ))}
                  </select>
                </label>
                {EDITABLE_LABELS.map((k) => (
                  <label key={k} className="grid gap-1.5">
                    <span className="text-[12.5px] text-[#6b7280]">{UI_WORDS[k]}</span>
                    <input className={INPUT} value={labels[k] ?? ""} placeholder={UI_WORDS[k]} maxLength={200} onChange={(e) => setLabel(k, e.target.value)} data-label-key={k} />
                  </label>
                ))}
              </div>
            </details>
          </div>
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-[80px]">
          <div className={cn(card, "overflow-hidden")}>
            <div className="flex items-center justify-between gap-2 border-b border-[#eef0f2] px-3 py-2">
              <div role="radiogroup" aria-label={tt("Preview on")} className="flex gap-1 rounded-lg bg-[#f3f4f6] p-1">
                {(["desktop", "phone"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={device === d}
                    onClick={() => setDevice(d)}
                    data-preview-device={d}
                    className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium", device === d ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280]")}
                  >
                    {d === "desktop" ? <Monitor className="h-3.5 w-3.5" aria-hidden /> : <Smartphone className="h-3.5 w-3.5" aria-hidden />}
                    {d === "desktop" ? tt("Computer") : tt("Phone")}
                  </button>
                ))}
              </div>
              <button type="button" className={buttonPrimary} disabled={props.busy} onClick={add} data-customizer-add="">
                {dirty || !config ? tt("Save and add to website") : tt("Add to website")}
              </button>
            </div>
            <div className={cn("bg-[#f3f4f6] p-3 sm:p-5", device === "phone" && "flex justify-center")} data-customizer-preview={device}>
              <div className={cn("overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(16,24,40,0.06)]", device === "phone" ? "w-full max-w-[390px]" : "w-full")}>
                {html ? (
                  <WidgetPreview html={html} width={device === "phone" ? PHONE_WIDTH : DESKTOP_WIDTH} label={info.name} interactive />
                ) : (
                  <p className="px-6 py-16 text-center text-[14px] text-[#6b7280]">{tt("Nothing to show with these settings. Try a lower rating or turn off a filter.")}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ field, value, onChange }: { field: CustomizerField; value: unknown; onChange: (v: unknown) => void }) {
  const id = `wf-${field.key}`
  if (field.kind === "toggle") {
    return (
      <label className="flex items-center justify-between gap-3" htmlFor={id}>
        <span className="grid">
          <span className={LABEL}>{tt(field.label)}</span>
          {field.hint ? <span className="text-[12px] text-[#9ca3af]">{tt(field.hint)}</span> : null}
        </span>
        <input id={id} type="checkbox" role="switch" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 shrink-0 accent-[#1a1a2e]" data-field={field.key} />
      </label>
    )
  }
  if (field.kind === "select") {
    return (
      <label className="grid gap-1.5" htmlFor={id}>
        <span className={LABEL}>{tt(field.label)}</span>
        <select id={id} className={INPUT} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} data-field={field.key}>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {tt(o.label)}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (field.kind === "range") {
    const r = rangeOf(field.key)
    const n = typeof value === "number" ? value : r.min
    return (
      <label className="grid gap-1.5" htmlFor={id}>
        <span className="flex items-center justify-between">
          <span className={LABEL}>{tt(field.label)}</span>
          <span className="text-[12.5px] tabular-nums text-[#6b7280]">
            {n}
            {field.unit && field.unit !== "stars" ? field.unit : field.unit === "stars" ? "+" : ""}
          </span>
        </span>
        <input id={id} type="range" min={r.min} max={r.max} step={r.step} value={n} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#1a1a2e]" data-field={field.key} />
        {field.hint ? <span className="text-[12px] text-[#9ca3af]">{tt(field.hint)}</span> : null}
      </label>
    )
  }
  if (field.kind === "color") {
    const v = typeof value === "string" ? value : ""
    return (
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className={LABEL}>
          {tt(field.label)}
        </label>
        <span className="flex items-center gap-2">
          {v ? (
            <button type="button" onClick={() => onChange("")} className="text-[12px] text-[#6b7280] underline underline-offset-2">
              {tt("Theme's")}
            </button>
          ) : (
            <span className="text-[12px] text-[#9ca3af]">{tt("Theme's")}</span>
          )}
          <input id={id} type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000"} onChange={(e) => onChange(e.target.value)} className={cn("h-8 w-10 cursor-pointer rounded-md border border-[#e3e4e8] bg-white p-0.5", !v && "opacity-50")} data-field={field.key} />
        </span>
      </div>
    )
  }
  return (
    <label className="grid gap-1.5" htmlFor={id}>
      <span className={LABEL}>{tt(field.label)}</span>
      <input id={id} className={INPUT} value={typeof value === "string" ? value : ""} maxLength={160} onChange={(e) => onChange(e.target.value)} data-field={field.key} />
    </label>
  )
}

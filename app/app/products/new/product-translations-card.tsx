"use client"

/**
 * ===========================================================================
 *  TRANSLATIONS, ON A PRODUCT'S OWN PAGE
 * ===========================================================================
 * For a store whose website has more than one language: this product's
 * title, description and search engine text in each of the others, beside
 * the product and never in it (lib/markets/product-translations.ts).
 *
 *   a field left empty      the website shows the original there
 *   a field typed           that language's translation, saved a moment
 *                           after the typing stops; no other language and
 *                           none of the product's own words change
 *   Translate automatically fills the empty ones in the language shown, by
 *                           Storelib AI, only when pressed. A translation a
 *                           person wrote is never replaced.
 *   Outdated                the original changed since it was translated
 *   Always show the original
 *                           every language shows the product as written; its
 *                           translations are kept for when it is turned off
 *
 * Nothing here is part of the product's own Save: each change is saved on
 * its own, as the website builder's translations are.
 */
import * as React from "react"
import { ChevronDown, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RichTextEditor } from "@/components/app/rich-text-editor"
import { cn } from "@/lib/utils"
import { languageName } from "@/lib/markets/locales"
import { activeLocale, tt } from "@/lib/i18n/text"
import { SWITCH_GROUP, SwitchRow } from "./editor-controls"
import { barButton } from "./editor-buttons"

type Field = "title" | "description" | "seo_title" | "seo_description"
type Status = "missing" | "outdated" | "draft" | "done"
interface View {
  ready: boolean
  defaultLanguage: string
  languages: { code: string; published: boolean }[]
  showOriginal: boolean
  showOriginalReady: boolean
  canTranslate: boolean
  fields: { field: Field; source: string; rich: boolean }[]
  values: Record<string, Partial<Record<Field, { value: string; status: Status; ai: boolean }>>>
}

const LABELS: Record<Field, () => string> = {
  title: () => tt("Title"),
  description: () => tt("Description"),
  seo_title: () => tt("SEO title"),
  seo_description: () => tt("SEO description"),
}

const SAVE_AFTER_MS = 700

const plain = (html: string) => html.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|li|h[1-6])>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()

async function call<T>(method: string, body?: unknown, query = ""): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(`/api/store/translations/product${query}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" })
    const d = (await r.json().catch(() => ({}))) as T & { error?: string }
    return r.ok ? { ok: true, data: d } : { ok: false, error: typeof d.error === "string" ? d.error : tt("Could not save. Try again.") }
  } catch {
    return { ok: false, error: tt("Could not save. Check the connection.") }
  }
}

export function ProductTranslationsCard({ productId, cardClass, titleClass }: { productId: string; cardClass: string; titleClass: string }) {
  const [view, setView] = React.useState<View | null>(null)
  const [locale, setLocale] = React.useState<string | null>(null)
  const [state, setState] = React.useState<{ busy: "save" | "auto" | null; error: string | null; note: string | null }>({ busy: null, error: null, note: null })
  const timers = React.useRef(new Map<string, number>())

  const load = React.useCallback(async () => {
    const r = await call<View>("GET", undefined, `?id=${encodeURIComponent(productId)}`)
    if (r.ok === false) return
    setView(r.data)
    setLocale((now) => (now && r.data.languages.some((l) => l.code === now) ? now : (r.data.languages[0]?.code ?? null)))
  }, [productId])

  React.useEffect(() => {
    void load()
    const pending = timers.current
    return () => {
      for (const t of pending.values()) window.clearTimeout(t)
    }
  }, [load])

  if (!view || view.languages.length === 0 || !locale) return null
  const here = activeLocale()
  const original = languageName(view.defaultLanguage, here)
  const values = view.values[locale] ?? {}

  const type = (field: Field, value: string) => {
    /* Shown at once; the field's status says Done only once it is saved. */
    setView((v) => (v ? { ...v, values: { ...v.values, [locale]: { ...v.values[locale], [field]: { value, status: v.values[locale]?.[field]?.status ?? "missing", ai: false } } } } : v))
    const id = `${locale}:${field}`
    const old = timers.current.get(id)
    if (old) window.clearTimeout(old)
    const lang = locale
    timers.current.set(
      id,
      window.setTimeout(async () => {
        timers.current.delete(id)
        setState((s) => ({ ...s, busy: "save", error: null }))
        const r = await call<{ status: Status }>("PUT", { id: productId, locale: lang, field, value })
        if (r.ok === false) return setState({ busy: null, error: (r as { error: string }).error, note: null })
        setView((v) => (v && v.values[lang]?.[field]?.value === value ? { ...v, values: { ...v.values, [lang]: { ...v.values[lang], [field]: { value, status: r.data.status, ai: false } } } } : v))
        setState({ busy: null, error: null, note: null })
      }, SAVE_AFTER_MS),
    )
  }

  const translateAuto = async () => {
    setState({ busy: "auto", error: null, note: null })
    const r = await call<{ translated: number }>("POST", { id: productId, locale })
    if (r.ok === false) return setState({ busy: null, error: (r as { error: string }).error, note: null })
    await load()
    setState({ busy: null, error: null, note: r.data.translated ? null : tt("Everything here is already translated.") })
  }

  const showOriginal = async (on: boolean) => {
    setView((v) => (v ? { ...v, showOriginal: on } : v))
    const r = await call<{ showOriginal: boolean }>("PATCH", { id: productId, showOriginal: on })
    if (r.ok === false) {
      setView((v) => (v ? { ...v, showOriginal: !on } : v))
      setState({ busy: null, error: (r as { error: string }).error, note: null })
    }
  }

  const empty = view.fields.some((f) => !values[f.field]?.value?.trim())

  return (
    <div className={cardClass} data-product-translations="" data-locale={locale}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={titleClass}>{tt("Translations")}</h2>
        {view.languages.length > 1 ? (
          <div className="relative">
            <select
              aria-label={tt("Language")}
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="h-9 cursor-pointer appearance-none rounded-lg border border-[#e5e7eb] bg-white pl-3 pr-8 text-[14px] text-[#1a1a2e] outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15"
            >
              {view.languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {languageName(l.code, here)}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          </div>
        ) : (
          <span className="text-[14px] text-[#6b7280]">{languageName(locale, here)}</span>
        )}
      </div>

      <div className={SWITCH_GROUP}>
        <SwitchRow title={tt("Always show in {language}", { language: original })} checked={view.showOriginal} onChange={(on) => void showOriginal(on)} />
      </div>

      {view.showOriginal ? null : (
        <div className="space-y-4">
          {view.fields.map((f) => {
            const v = values[f.field]
            const id = `translation-${f.field}`
            return (
              <div key={f.field} className="space-y-1.5" data-product-translation={f.field} data-translation-status={v?.status ?? "missing"}>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={id} className="text-xs font-medium text-gray-700 sm:text-sm">
                    {LABELS[f.field]()}
                  </Label>
                  {v?.status === "outdated" ? (
                    <span className="text-[12px] font-medium text-[#b45309]" title={tt("{language} changed after this was translated.", { language: original })}>
                      {tt("Outdated")}
                    </span>
                  ) : v?.ai && v.value ? (
                    <span className="text-[12px] text-[#6b7280]">{tt("Automatic")}</span>
                  ) : null}
                </div>
                {f.rich ? (
                  <RichTextEditor id={id} value={v?.value ?? ""} onChange={(html) => type(f.field, html)} label={LABELS[f.field]()} placeholder={plain(f.source).slice(0, 160)} minHeight={120} />
                ) : f.field === "seo_description" || f.field === "description" ? (
                  <textarea
                    id={id}
                    value={v?.value ?? ""}
                    placeholder={plain(f.source)}
                    onChange={(e) => type(f.field, e.target.value)}
                    className="min-h-[88px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15 sm:text-base"
                  />
                ) : (
                  <Input id={id} value={v?.value ?? ""} placeholder={plain(f.source)} onChange={(e) => type(f.field, e.target.value)} className="h-11 border-gray-200 text-sm sm:text-base" />
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!view.showOriginal && view.canTranslate && empty ? (
          <button type="button" className={cn(barButton, "inline-flex items-center gap-2")} disabled={state.busy === "auto"} onClick={() => void translateAuto()} data-product-translate-auto="">
            {state.busy === "auto" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
            {tt("Translate automatically")}
          </button>
        ) : null}
        <p className="text-[13px] text-[#6b7280]" aria-live="polite">
          {state.error ? <span className="text-[#b91c1c]">{state.error}</span> : state.busy === "save" ? tt("Saving") : state.note}
        </p>
      </div>
    </div>
  )
}

"use client"

/**
 * ===========================================================================
 *  TRANSLATIONS, ON A PRODUCT'S OWN PAGE
 * ===========================================================================
 * For a store whose website has more than one language: this product's
 * title, description and search engine text in each of the others, beside
 * the product and never in it (lib/markets/product-translations.ts).
 *
 * ONE LIST, THEN ONE LANGUAGE AT A TIME (the owner: translations "add a lot
 * of complexity", "make it simple and clean, not overwhelming"). The card is
 * a short list: each language and how far along it is ("Translated", "2 of 4
 * translated", "Outdated", "Not translated"). A press on one opens that
 * language alone, in a dialog on a computer and the shared sheet on a phone,
 * with its fields and Translate automatically. No wall of fields in the
 * product's own form.
 *
 *   a field left empty      the website shows the original there
 *   a field typed           that language's translation, saved a moment
 *                           after the typing stops; no other language and
 *                           none of the product's own words change
 *   Translate automatically fills the empty ones in the language open, by
 *                           Storelib AI, only when pressed. A translation a
 *                           person wrote is never replaced.
 *   Outdated                the original changed since it was translated
 *   Always show the original
 *                           every language shows the product as written; its
 *                           translations are kept for when it is turned off,
 *                           and the list folds away while it is on
 *
 * Nothing here is part of the product's own Save: each change is saved on
 * its own, as the website builder's translations are.
 */
import * as React from "react"
import { ChevronRight, Loader2, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { RichTextEditor } from "@/components/app/rich-text-editor"
import { cn } from "@/lib/utils"
import { languageName } from "@/lib/markets/locales"
import { activeLocale, tt } from "@/lib/i18n/text"
import { SWITCH_GROUP, SwitchRow } from "./editor-controls"
import { barButton } from "./editor-buttons"

type Field = "title" | "description" | "seo_title" | "seo_description"
type Status = "missing" | "outdated" | "draft" | "done"
type Values = Partial<Record<Field, { value: string; status: Status; ai: boolean }>>
interface View {
  ready: boolean
  defaultLanguage: string
  languages: { code: string; published: boolean }[]
  showOriginal: boolean
  /** Settings › Glossary keeps product names as written: Translate automatically leaves the title, and a title typed here still shows. */
  keepName?: boolean
  showOriginalReady: boolean
  canTranslate: boolean
  fields: { field: Field; source: string; rich: boolean }[]
  values: Record<string, Values>
}

const LABELS: Record<Field, () => string> = {
  title: () => tt("Title"),
  description: () => tt("Description"),
  seo_title: () => tt("SEO title"),
  seo_description: () => tt("SEO description"),
}

const SAVE_AFTER_MS = 700
/** The width under which the language opens in the shared sheet rather than a dialog (confirm-sheet.tsx's). */
const PHONE = "(max-width: 639px)"

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

export type LanguageProgress = { done: number; total: number; outdated: number }

/**
 * How far one language is: the fields with words of their own, out of the ones
 * it needs. A title left to the glossary (product names kept as written) is
 * not one it needs, unless someone typed one.
 */
export function languageProgress(fields: { field: Field }[], values: Values, keepName = false): LanguageProgress {
  let done = 0
  let total = 0
  let outdated = 0
  for (const f of fields) {
    const v = values[f.field]
    const has = !!v?.value?.trim()
    if (keepName && f.field === "title" && !has) continue
    total++
    if (has) done++
    if (has && v?.status === "outdated") outdated++
  }
  return { done, total, outdated }
}

/** The few words a language's row says. Outdated first: it is the one to act on. */
export function progressLabel(p: LanguageProgress): { text: string; tone: "warn" | "done" | "muted" } {
  if (p.outdated > 0) return { text: tt("Outdated"), tone: "warn" }
  if (p.total > 0 && p.done >= p.total) return { text: tt("Translated"), tone: "done" }
  if (p.done === 0) return { text: tt("Not translated"), tone: "muted" }
  return { text: tt("{done} of {total} translated", { done: p.done, total: p.total }), tone: "muted" }
}

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mql = window.matchMedia(PHONE)
    const check = () => setPhone(mql.matches)
    check()
    mql.addEventListener("change", check)
    return () => mql.removeEventListener("change", check)
  }, [])
  return phone
}

const CLOSE =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_#9ca3af] [-webkit-tap-highlight-color:transparent]"

export function ProductTranslationsCard({ productId, cardClass, titleClass }: { productId: string; cardClass: string; titleClass: string }) {
  const [view, setView] = React.useState<View | null>(null)
  /** The language open in the sheet, or null when the card is only its list. */
  const [locale, setLocale] = React.useState<string | null>(null)
  /** The last one opened, kept while the sheet leaves so its words do not blank out on the way down. */
  const [shown, setShown] = React.useState<string | null>(null)
  const [state, setState] = React.useState<{ busy: "save" | "auto" | null; error: string | null; note: string | null }>({ busy: null, error: null, note: null })
  const timers = React.useRef(new Map<string, number>())
  const opener = React.useRef<HTMLButtonElement | null>(null)
  const phone = usePhone()

  const load = React.useCallback(async () => {
    const r = await call<View>("GET", undefined, `?id=${encodeURIComponent(productId)}`)
    if (r.ok === false) return
    setView(r.data)
  }, [productId])

  React.useEffect(() => {
    void load()
    const pending = timers.current
    return () => {
      for (const t of pending.values()) window.clearTimeout(t)
    }
  }, [load])

  if (!view || view.languages.length === 0) return null
  const here = activeLocale()
  const original = languageName(view.defaultLanguage, here)
  const open = locale && view.languages.some((l) => l.code === locale) ? locale : null
  const editing = open ?? shown

  const openLanguage = (code: string, from: HTMLButtonElement) => {
    opener.current = from
    setShown(code)
    setLocale(code)
    setState({ busy: null, error: null, note: null })
  }

  const type = (lang: string, field: Field, value: string) => {
    /* Shown at once; the field's status says Done only once it is saved. */
    setView((v) => (v ? { ...v, values: { ...v.values, [lang]: { ...v.values[lang], [field]: { value, status: v.values[lang]?.[field]?.status ?? "missing", ai: false } } } } : v))
    const id = `${lang}:${field}`
    const old = timers.current.get(id)
    if (old) window.clearTimeout(old)
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

  const translateAuto = async (lang: string) => {
    setState({ busy: "auto", error: null, note: null })
    const r = await call<{ translated: number }>("POST", { id: productId, locale: lang })
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

  const values = editing ? (view.values[editing] ?? {}) : {}
  /* What Translate automatically would fill: the title is not its to write while product names are kept as written. */
  const empty = view.fields.some((f) => !(view.keepName && f.field === "title") && !values[f.field]?.value?.trim())
  const name = editing ? languageName(editing, here) : ""

  return (
    <div className={cardClass} data-product-translations="" data-open={open ?? ""}>
      <h2 className={titleClass}>{tt("Translations")}</h2>

      <div className={SWITCH_GROUP}>
        {/* Each language and how far along it is; a press opens it. Folded away while every language shows the original. */}
        {view.showOriginal
          ? null
          : view.languages.map((l) => {
              const p = progressLabel(languageProgress(view.fields, view.values[l.code] ?? {}, view.keepName))
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={(e) => openLanguage(l.code, e.currentTarget)}
                  aria-haspopup="dialog"
                  data-product-translation-language={l.code}
                  data-translation-progress={p.tone}
                  className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-[#f9fafb] focus-visible:bg-[#f6f7f8] active:bg-[#f6f7f8] sm:min-h-[52px] [-webkit-tap-highlight-color:transparent]"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-5 text-[#1a1a2e] sm:text-[14px]">{languageName(l.code, here)}</span>
                  <span className={cn("shrink-0 text-[13px]", p.tone === "warn" ? "font-medium text-[#b45309]" : "text-[#6b7280]")}>{p.text}</span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                </button>
              )
            })}
        <SwitchRow title={tt("Always show in {language}", { language: original })} checked={view.showOriginal} onChange={(on) => void showOriginal(on)} />
      </div>
      {!open && state.error ? (
        <p className="text-[13px] text-[#b91c1c]" role="alert">
          {state.error}
        </p>
      ) : null}

      <SheetDialog
        open={!!open}
        onClose={() => setLocale(null)}
        phone={phone}
        label={name}
        showCloseButton={false}
        sheet={{ fill: false, aboveKeyboard: true, maxHeight: "min(88dvh, 760px)", dismissible: true }}
        dialog={{
          "aria-describedby": undefined,
          onCloseAutoFocus: (e) => {
            const back = opener.current
            if (!back?.isConnected) return
            e.preventDefault()
            back.focus({ preventScroll: true })
          },
        }}
        className="w-[calc(100%-32px)] max-w-[600px] gap-0 sm:max-w-[600px] rounded-2xl border-[#e5e7eb] bg-white p-0 shadow-[0_24px_64px_-16px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)]"
      >
        {editing ? (
          <div className="flex min-h-0 flex-col" data-product-translation-sheet={editing}>
            <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4 sm:px-6 sm:pt-5">
              <SheetDialogTitle className="text-[17px] font-semibold leading-6 text-[#1a1a2e]">{name}</SheetDialogTitle>
              <button type="button" onClick={() => setLocale(null)} aria-label={tt("Close")} className={cn(CLOSE, "max-sm:hidden")}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="px-5 text-[13px] leading-[18px] text-[#6b7280] sm:px-6">{tt("Leave a field empty to show it in {language}.", { language: original })}</p>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-4 sm:max-h-[60vh] sm:px-6">
              {view.fields.map((f) => {
                const v = values[f.field]
                const id = `translation-${editing}-${f.field}`
                return (
                  <div key={f.field} className="space-y-1.5" data-product-translation={f.field} data-translation-status={v?.status ?? "missing"}>
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={id} className="text-[13px] font-medium text-[#374151] sm:text-sm">
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
                      <RichTextEditor id={id} value={v?.value ?? ""} onChange={(html) => type(editing, f.field, html)} label={LABELS[f.field]()} placeholder={plain(f.source).slice(0, 160)} minHeight={120} />
                    ) : f.field === "seo_description" || f.field === "description" ? (
                      <textarea
                        id={id}
                        value={v?.value ?? ""}
                        placeholder={plain(f.source)}
                        onChange={(e) => type(editing, f.field, e.target.value)}
                        className="min-h-[88px] w-full rounded-lg border border-gray-200 px-3 py-2 text-base outline-none transition-[border-color,box-shadow] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15 sm:text-sm"
                      />
                    ) : (
                      <Input id={id} value={v?.value ?? ""} placeholder={plain(f.source)} onChange={(e) => type(editing, f.field, e.target.value)} className="h-11 border-gray-200 text-base sm:h-10 sm:text-sm" />
                    )}
                    {f.field === "title" && view.keepName && !v?.value?.trim() ? (
                      <p className="text-[12.5px] leading-[18px] text-[#6b7280]" data-product-keep-name="">
                        {tt("Product names are kept as written in every language. Type a title here to translate this one.")}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-[#eef0f2] px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6 sm:pb-3">
              {view.canTranslate && empty ? (
                <button type="button" className={cn(barButton, "inline-flex items-center gap-2")} disabled={state.busy === "auto"} onClick={() => void translateAuto(editing)} data-product-translate-auto="">
                  {state.busy === "auto" ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                  {tt("Translate automatically")}
                </button>
              ) : null}
              <p className="min-w-0 flex-1 text-[13px] text-[#6b7280]" aria-live="polite">
                {state.error ? <span className="text-[#b91c1c]">{state.error}</span> : state.busy === "save" ? tt("Saving") : state.note}
              </p>
              <button type="button" onClick={() => setLocale(null)} className={barButton} data-product-translation-done="">
                {tt("Done")}
              </button>
            </div>
          </div>
        ) : null}
      </SheetDialog>
    </div>
  )
}

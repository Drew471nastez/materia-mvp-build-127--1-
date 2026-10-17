"use client"

/**
 * ===========================================================================
 *  THE SIDEBAR IN ANOTHER LANGUAGE: EDIT THE TRANSLATION, NOT THE ORIGINAL
 * ===========================================================================
 * With the canvas in another language of the website (the language switch in
 * the top bar or at the top of the sidebar), a text setting in the sidebar
 * shows and writes THAT language's translation of it, by the same key the
 * live website lays over (lib/markets/translate.ts sectionKey, blockKey,
 * theme:<id>). The original is under the field, for reference. Everything
 * that is not words (colours, pictures, sizes, layout) is the same in every
 * language: drawn, dimmed and not editable, so nothing typed here can change
 * the website's own language by accident.
 *
 * WHAT HAPPENS TO A TRANSLATION:
 *
 *   typed here           the merchant's own ("Edited"). Storelib AI never
 *                        replaces it, whatever changes later.
 *   original changes     the merchant's stays on the website as written and
 *                        is badged "Original changed" until they edit it,
 *                        press Keep mine, or press Use automatic. Storelib
 *                        AI's own is rewritten by the next automatic run,
 *                        for that text only ("Updating").
 *   Reset to automatic   a fresh translation from Storelib AI for this one
 *                        text, put in place only once it has come back.
 *   Don't translate      the original shows in every language; Storelib AI
 *                        leaves it alone (Settings › Glossary lists them).
 *
 * Typing updates the canvas at once and is saved half a second after the
 * last key, one small write per text (PUT /api/store/translations): never
 * the website as a whole, and never a translation run.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { activeLocale, tt } from "@/lib/i18n/text"
import { languageName } from "@/lib/markets/locales"
import { isWordsField, shownText, sourceHash } from "@/lib/markets/translate"
import { fieldTranslationState, isExcluded, type FieldTranslationState, type TranslationRules } from "@/lib/markets/translation-rules"
import type { SchemaField } from "@/lib/website-builder/types"
import type { PreviewLanguage, Values } from "@/components/website-builder/use-preview-language"

/** The sidebar's label, as controls/dynamic-source-field.tsx FIELD_LABEL draws it (not imported, so this file stays small). */
const FIELD_LABEL = "text-xs font-medium text-muted-foreground mb-1.5 block"

export interface TranslationEditing {
  /** The language being written. Never the website's own. */
  locale: string
  defaultLanguage: string
  /** Both named in the dashboard's language ("Romanian", "English"). */
  name: string
  defaultName: string
  raw: Values
  excluded: (key: string) => boolean
  /** The merchant's own words for one text, saved after a short pause. An empty value takes the translation away. */
  write: (key: string, value: string, source: string, rich: boolean) => void
  /** The merchant's own, kept for the original as it is now. */
  keepMine: (key: string, source: string, rich: boolean) => void
  /** Storelib AI's translation of this one text, now; `replace` lets it take the merchant's place (their own press). */
  auto: (key: string, source: string, rich: boolean, replace: boolean) => void
  exclude: (key: string, on: boolean) => void
  busy: Record<string, "saving" | "translating" | undefined>
  errors: Record<string, string | undefined>
}

const EditingContext = createContext<TranslationEditing | null>(null)
export const TranslationEditingProvider = EditingContext.Provider
/** The language the sidebar writes, or null in the website's own. */
export const useTranslationEditing = () => useContext(EditingContext)

const ScopeContext = createContext<((fieldId: string) => string | null) | null>(null)
/** Which texts the fields under it are: a section's, a block's, the theme's. Without one, a field is the same in every language. */
export function TranslationScope({ keyFor, children }: { keyFor: ((fieldId: string) => string | null) | null; children: ReactNode }) {
  return <ScopeContext.Provider value={keyFor}>{children}</ScopeContext.Provider>
}
export const useTranslationScope = () => useContext(ScopeContext)

const SAVE_AFTER_MS = 600

async function send(path: string, method: string, body: unknown): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) return { ok: false, error: typeof data.error === "string" ? data.error : tt("Couldn't save. Try again.") }
    return { ok: true, data }
  } catch {
    return { ok: false, error: tt("Couldn't reach Storelib. Check your connection and try again.") }
  }
}

/**
 * The editing state for the language the canvas shows, or null in the
 * website's own. Owns the pending writes: one timer per text, flushed when
 * the language changes or the editor closes, so nothing typed is lost.
 */
export function useTranslationEditor(lang: PreviewLanguage): TranslationEditing | null {
  const locale = lang.locale && lang.locale !== lang.defaultLanguage ? lang.locale : null
  const [busy, setBusy] = useState<Record<string, "saving" | "translating" | undefined>>({})
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  /* Don't translate switched here, before the next read brings the rules back. */
  const [excludedHere, setExcludedHere] = useState<Record<string, boolean>>({})
  const timers = useRef(new Map<string, { timer: number; run: () => void; before: Values[string] | undefined }>())
  const { patch } = lang
  const rawRef = useRef(lang.raw)
  rawRef.current = lang.raw

  const flush = useCallback(() => {
    for (const [, t] of timers.current) {
      window.clearTimeout(t.timer)
      t.run()
    }
    timers.current.clear()
  }, [])
  useEffect(() => flush, [locale, flush])
  useEffect(() => {
    const away = () => flush()
    window.addEventListener("pagehide", away)
    return () => window.removeEventListener("pagehide", away)
  }, [flush])

  const mark = (key: string, b: "saving" | "translating" | undefined, error?: string) => {
    setBusy((x) => ({ ...x, [key]: b }))
    setErrors((x) => ({ ...x, [key]: error }))
  }

  const write = useCallback(
    (key: string, value: string, source: string, rich: boolean) => {
      if (!locale) return
      const now = rawRef.current[key]
      /* A control that hands back what it was given (a rich text editor settling its markup) is not an edit. */
      if ((now?.v ?? "") === value) return
      /* What was saved before this run of typing began: what a failed save puts back. */
      const before = timers.current.has(key) ? timers.current.get(key)!.before : now
      patch(key, value.trim() ? { v: value, h: sourceHash(source) } : null)
      const run = () => {
        timers.current.delete(key)
        mark(key, "saving")
        void send("/api/store/translations", "PUT", { locale, items: [{ key, value, source, approved: true, rich }] }).then((r) => {
          if (r.ok) return mark(key, undefined)
          /* Not saved: what was there before is put back, and the field says why. */
          patch(key, before ?? null)
          mark(key, undefined, (r as { error: string }).error)
        })
      }
      const old = timers.current.get(key)
      if (old) window.clearTimeout(old.timer)
      timers.current.set(key, { timer: window.setTimeout(run, SAVE_AFTER_MS), run, before })
    },
    [locale, patch],
  )

  const keepMine = useCallback(
    (key: string, source: string, rich: boolean) => {
      const row = rawRef.current[key]
      if (!locale || !row) return
      patch(key, { v: row.v, h: sourceHash(source) })
      mark(key, "saving")
      void send("/api/store/translations", "PUT", { locale, items: [{ key, value: row.v, source, approved: true, rich }] }).then((r) => {
        if (r.ok) return mark(key, undefined)
        patch(key, row)
        mark(key, undefined, (r as { error: string }).error)
      })
    },
    [locale, patch],
  )

  const auto = useCallback(
    (key: string, source: string, rich: boolean, replace: boolean) => {
      if (!locale) return
      /* A pending edit of this text goes first, so the answer is not read over by it. */
      const pending = timers.current.get(key)
      if (pending) {
        window.clearTimeout(pending.timer)
        timers.current.delete(key)
      }
      mark(key, "translating")
      void send("/api/store/translations/auto", "POST", { locale, items: [{ key, source, rich }], replaceManual: replace }).then((r) => {
        if (!r.ok) return mark(key, undefined, (r as { error: string }).error)
        const values = (r.data.values ?? {}) as Values
        if (values[key]) {
          patch(key, values[key])
          mark(key, undefined)
        } else mark(key, undefined, tt("Couldn't translate that right now. Your text stays as it is."))
      })
    },
    [locale, patch],
  )

  const exclude = useCallback(
    (key: string, on: boolean) => {
      if (!locale) return
      setExcludedHere((x) => ({ ...x, [key]: on }))
      mark(key, "saving")
      void (async () => {
        const got = await fetch("/api/store/translations/rules", { cache: "no-store" })
          .then((r) => (r.ok ? (r.json() as Promise<{ rules?: TranslationRules }>) : null))
          .catch(() => null)
        if (!got?.rules) {
          setExcludedHere((x) => ({ ...x, [key]: !on }))
          return mark(key, undefined, tt("Couldn't save. Try again."))
        }
        const list = new Set(got.rules.noTranslate)
        if (on) list.add(key)
        else list.delete(key)
        const r = await send("/api/store/translations/rules", "PUT", { rules: { ...got.rules, noTranslate: [...list] } })
        if (!r.ok) {
          setExcludedHere((x) => ({ ...x, [key]: !on }))
          return mark(key, undefined, (r as { error: string }).error)
        }
        /* Storelib AI's translation of it is gone on the server: the original shows. The merchant's own stays. */
        if (on && rawRef.current[key]?.s === "ai") patch(key, null)
        mark(key, undefined)
      })()
    },
    [locale, patch],
  )

  const rules = useMemo<TranslationRules>(() => ({ glossary: [], noTranslate: lang.noTranslate, keepProductNames: lang.keepProductNames }), [lang.noTranslate, lang.keepProductNames])
  const excluded = useCallback((key: string) => (key in excludedHere ? excludedHere[key] : isExcluded(rules, key)), [excludedHere, rules])

  return useMemo(() => {
    if (!locale) return null
    const ui = activeLocale()
    return { locale, defaultLanguage: lang.defaultLanguage, name: languageName(locale, ui), defaultName: languageName(lang.defaultLanguage, ui), raw: lang.raw, excluded, write, keepMine, auto, exclude, busy, errors }
  }, [locale, lang.defaultLanguage, lang.raw, excluded, write, keepMine, auto, exclude, busy, errors])
}

/* ── Drawing ───────────────────────────────────────────────────────────── */

const BADGE: Record<FieldTranslationState, { label: () => string; dot: string }> = {
  auto: { label: () => tt("Auto"), dot: "bg-[#8b5cf6]" },
  updating: { label: () => tt("Updating"), dot: "bg-[#d1d5db]" },
  edited: { label: () => tt("Edited"), dot: "bg-[#10b981]" },
  outdated: { label: () => tt("Original changed"), dot: "bg-[#f59e0b]" },
  missing: { label: () => tt("Not translated"), dot: "bg-[#d1d5db]" },
  excluded: { label: () => tt("Kept as written"), dot: "bg-[#9ca3af]" },
}

export function TranslationBadge({ state }: { state: FieldTranslationState }) {
  const b = BADGE[state]
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground" data-translation-badge={state}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", b.dot)} />
      {b.label()}
    </span>
  )
}

/** Plain words of a rich text original, for the line under the field. */
const plainText = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()

const RICH = new Set(["richtext", "inline_richtext", "html_text"])

const linkClass = "text-[11.5px] font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50 disabled:no-underline"

/**
 * One setting while another language is edited: its translation when it is
 * words and the panel says whose they are, else the same in every language.
 * `render` draws the setting's own control with the value and change given.
 */
export function TranslatedFieldEditor({
  tr,
  keyFor,
  field,
  label,
  value,
  render,
}: {
  tr: TranslationEditing
  keyFor: ((fieldId: string) => string | null) | null
  field: SchemaField
  label?: string
  value: unknown
  render: (value: unknown, onChange: (v: unknown) => void, field: SchemaField) => ReactNode
}) {
  /* A divider or a note reads the same in every language. */
  if (field.type === "header" || field.type === "paragraph") return <>{render(value, () => undefined, field)}</>
  const key = keyFor && isWordsField(field) ? keyFor(field.id) : null
  const source = key ? shownText(field, value) : null
  if (!key || source === null) return <SharedField label={label} imported={!!key && source === null}>{render(value ?? field.default, () => undefined, field)}</SharedField>

  const row = tr.raw[key]
  const rich = RICH.has(field.type) || /<[a-z][\s\S]*>/i.test(source)
  const excluded = tr.excluded(key)
  const state = fieldTranslationState(row ? { value: row.v, sourceHash: row.h, source: row.s === "ai" ? "ai" : "manual" } : null, sourceHash(source), excluded)
  const busy = tr.busy[key]
  const error = tr.errors[key]
  const original = rich ? plainText(source) : source
  const shownField: SchemaField = { ...field, placeholder: original.slice(0, 140) }

  return (
    <div data-translated-field={key} data-translation-state={state}>
      <div className="mb-1.5 flex min-h-[18px] items-center justify-between gap-2">
        {label ? <label className="min-w-0 truncate text-xs font-medium text-muted-foreground">{label}</label> : <span />}
        {busy ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {busy === "translating" ? tt("Translating") : tt("Saving")}
          </span>
        ) : (
          <TranslationBadge state={state} />
        )}
      </div>
      {/* Drawn again for each language, so a field holding its own state (rich text) never keeps another language's words. */}
      <div key={tr.locale}>{render(row?.v ?? "", (v) => tr.write(key, typeof v === "string" ? v : "", source, rich), shownField)}</div>
      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-[16px] text-muted-foreground" data-translation-source="">
        <span className="font-medium">{tr.defaultName}:</span> {original}
      </p>
      {error ? (
        <p className="mt-1 text-[11.5px] leading-[16px] text-[#b45309]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-translation-actions="">
        {state === "outdated" ? (
          <>
            <button type="button" className={linkClass} disabled={!!busy} onClick={() => tr.keepMine(key, source, rich)} data-translation-keep="">
              {tt("Keep mine")}
            </button>
            <button type="button" className={linkClass} disabled={!!busy} onClick={() => tr.auto(key, source, rich, true)} data-translation-accept="">
              {tt("Use automatic")}
            </button>
          </>
        ) : null}
        {state === "edited" ? (
          <button type="button" className={linkClass} disabled={!!busy} onClick={() => tr.auto(key, source, rich, true)} data-translation-reset="">
            {tt("Reset to automatic")}
          </button>
        ) : null}
        {state === "missing" || state === "updating" ? (
          <button type="button" className={linkClass} disabled={!!busy} onClick={() => tr.auto(key, source, rich, false)} data-translation-auto="">
            {tt("Translate now")}
          </button>
        ) : null}
        {state !== "edited" && state !== "outdated" ? (
          <button type="button" className={cn(linkClass, "text-muted-foreground")} disabled={!!busy} onClick={() => tr.exclude(key, !excluded)} data-translation-exclude={excluded ? "on" : "off"}>
            {excluded ? tt("Translate this text") : tt("Don't translate")}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** A setting that is the same in every language, drawn as it is and not editable here. */
function SharedField({ label, imported, children }: { label?: string; imported?: boolean; children: ReactNode }) {
  return (
    <div data-shared-setting="" title={tt("Same in all languages")}>
      {label ? <label className={FIELD_LABEL}>{label}</label> : null}
      <div inert className="pointer-events-none select-none opacity-50">
        {children}
      </div>
      {imported ? <p className="mt-1 text-[11px] text-muted-foreground">{tt("Translated with the theme's own words in Settings.")}</p> : null}
    </div>
  )
}

/**
 * A panel or control that is the same in every language (colours, the
 * theme's fonts, a section's design, the menus): drawn as it is, not
 * editable while another language is edited. In the website's own
 * language it is drawn exactly as before, with nothing around it.
 */
export function SharedInAllLanguages({ children, note, when = true }: { children: ReactNode; note?: string; when?: boolean }) {
  const tr = useTranslationEditing()
  if (!tr || !when) return <>{children}</>
  return (
    <div data-shared-in-all-languages="">
      {note ? <p className="mb-2 text-[11.5px] leading-[16px] text-muted-foreground">{note}</p> : null}
      <div inert className="pointer-events-none select-none opacity-50">
        {children}
      </div>
    </div>
  )
}

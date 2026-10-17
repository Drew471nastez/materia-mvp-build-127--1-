"use client"

/**
 * ===========================================================================
 *  THE SIDEBAR IN ANOTHER LANGUAGE OF THE WEBSITE
 * ===========================================================================
 * Picked in the language row under the sidebar's tabs (or in the theme's
 * own selector in the canvas), a language other than the website's own
 * turns every text control in the sidebar into that language's control,
 * the way Shopify's theme editor does when its language is changed:
 *
 *   a text, long text, rich text or alt text setting
 *              shows the language's own value, with the original as its
 *              placeholder, and writes only that language's translation
 *              of that one setting (use-preview-language.ts write). The
 *              original, and every other language, are never touched.
 *   everything else (colours, pictures, numbers, toggles, layout)
 *              is the same in every language: drawn as it is, dimmed and
 *              out of reach, with the reason said once in the language row.
 *
 * Where a control writes is said by the panel around it (TranslationScope):
 * a section's own settings, a block's, or the theme's. A control with no
 * scope is locked, so nothing can write an original by mistake while
 * another language is shown.
 *
 * These are the website's words. The sidebar's own labels ("Heading",
 * "Language") are Storelib's, translated with lib/i18n for the person
 * using the editor, and are never mixed with these.
 */
import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { languageName } from "@/lib/markets/locales"
import { blockKey, isTranslatableField, menuTranslatables, sectionKey, shownText, themeKeyFor, translationOf, type FieldTranslation, type TranslationMap } from "@/lib/markets/translate"
import { wholeSource } from "@/lib/storelib-theme/dynamic"
import { activeLocale, tt } from "@/lib/i18n/text"
import type { SchemaField } from "@/lib/website-builder/types"
import type { TranslationSaveState } from "@/components/website-builder/use-preview-language"

export interface TranslationEditing {
  /** The language being edited: never the website's own. */
  locale: string
  defaultLanguage: string
  rows: TranslationMap
  write: (key: string, value: string, original: string, rich?: boolean) => void
}

const EditContext = React.createContext<TranslationEditing | null>(null)
/** Which key a setting of this panel writes, or why it cannot be translated here. */
type Scope = { keyOf: (settingId: string) => string | null; locked?: string }
const ScopeContext = React.createContext<Scope | null>(null)
const InsideLocked = React.createContext(false)
/** Settings whose words are markup: saved cleaned as rich text, as the original is. */
const RICH_TYPES: ReadonlySet<string> = new Set(["richtext", "inline_richtext", "html_text"])

export function TranslationEditProvider({ value, children }: { value: TranslationEditing | null; children: React.ReactNode }) {
  return <EditContext.Provider value={value}>{children}</EditContext.Provider>
}

/** The language being edited, or null in the website's own. */
export function useTranslationEdit(): TranslationEditing | null {
  return React.useContext(EditContext)
}

/** A panel's settings and where each writes: `keyOf` names the key (lib/markets/translate.ts sectionKey, blockKey, themeKey), null for one that is not words. `locked` says why nothing here can be translated yet. */
export function TranslationScope({ keyOf, locked, children }: Scope & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ keyOf, locked }), [keyOf, locked])
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

/** A section's own settings: `section:<section>:<setting>`. */
export function SectionTranslationScope({ sectionId, children }: { sectionId: string; children: React.ReactNode }) {
  const keyOf = React.useCallback((id: string) => sectionKey(sectionId, id), [sectionId])
  return <TranslationScope keyOf={keyOf}>{children}</TranslationScope>
}

/**
 * A block's: `block:<section>:<block>:<setting>`. A block the section places
 * that nobody has changed yet is only its defaults, kept nowhere: it is
 * written once in the website's own language before it can be translated,
 * as the live site only lays over the blocks a section has.
 */
export function BlockTranslationScope({ sectionId, blockId, virtual, children }: { sectionId: string; blockId: string; virtual: boolean; children: React.ReactNode }) {
  const edit = useTranslationEdit()
  const keyOf = React.useCallback((id: string) => blockKey(sectionId, blockId, id), [sectionId, blockId])
  const locked = virtual && edit ? tt("Change this block once in {language} to translate it.", { language: languageName(edit.defaultLanguage, activeLocale()) }) : undefined
  return (
    <TranslationScope keyOf={keyOf} locked={locked}>
      {children}
    </TranslationScope>
  )
}

/** A row of a settings list whose control is not the sidebar's FieldEditor: locked in another language unless the setting is words (FieldEditor then decides) or a divider. */
export function SettingRow({ field, children }: { field: Pick<SchemaField, "type" | "id">; children: React.ReactNode }) {
  return <Locked off={isTranslatableField(field) || field.type === "header" || field.type === "paragraph"}>{children}</Locked>
}

/** The theme's settings: `theme:<setting>`, except the shop's own name. */
export function ThemeTranslationScope({ children }: { children: React.ReactNode }) {
  return <TranslationScope keyOf={themeKeyFor}>{children}</TranslationScope>
}

/** Plain words of an original, for a placeholder or the line under a field. */
export function plainWords(text: string): string {
  return text
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
}

export type FieldTranslationState =
  | { mode: "edit"; key: string; original: string; rich: boolean; translation: FieldTranslation; write: (value: string) => void }
  | { mode: "locked"; reason: string }

/**
 * What one setting is in the language being edited: null in the website's
 * own language (the control is drawn as always), "edit" for words with a
 * key, "locked" for the rest. A divider or a note is neither, and stays.
 */
export function useFieldTranslation(field: Pick<SchemaField, "type" | "id" | "default">, value: unknown): FieldTranslationState | null {
  const edit = useTranslationEdit()
  const scope = React.useContext(ScopeContext)
  const original = shownText(field as SchemaField, value) ?? ""
  const key = edit && scope && !scope.locked && isTranslatableField(field) ? scope.keyOf(field.id) : null
  const write = React.useCallback(
    (v: string) => {
      if (edit && key) edit.write(key, v, original, RICH_TYPES.has(field.type))
    },
    [edit, key, original, field.type],
  )
  if (!edit) return null
  if (field.type === "header" || field.type === "paragraph") return null
  const name = languageName(edit.defaultLanguage, activeLocale())
  if (scope?.locked && isTranslatableField(field)) return { mode: "locked", reason: scope.locked }
  if (!key) return { mode: "locked", reason: tt("The same in every language.") }
  /* A setting that is one piece of shop data ({{ product.title }}) reads the data's own translation. */
  if (wholeSource(original)) return { mode: "locked", reason: tt("Filled in from your shop, so it follows the shop's own translation.") }
  if (!original.trim()) return { mode: "locked", reason: tt("Write it in {language} first.", { language: name }) }
  return { mode: "edit", key, original, rich: RICH_TYPES.has(field.type), translation: translationOf(edit.rows, key, original), write }
}

/** Drawn as it is and out of reach while another language is edited; untouched in the website's own. One dimming however deep. */
export function Locked({ children, reason, className, off = false }: { children: React.ReactNode; reason?: string; className?: string; off?: boolean }) {
  const edit = useTranslationEdit()
  const inside = React.useContext(InsideLocked)
  if (!edit || inside || off) return <>{children}</>
  return (
    <InsideLocked.Provider value={true}>
      <div inert aria-disabled="true" title={reason ?? tt("The same in every language.")} data-translation-locked="" className={cn("opacity-45 select-none", className)}>
        {children}
      </div>
    </InsideLocked.Provider>
  )
}

const LABEL = "text-xs font-medium text-muted-foreground"

/**
 * A setting in the language being edited: its label, where it stands, the
 * control itself (drawn by the sidebar's own FieldControl, so it is the
 * same box as in the original) and, once written, the original under it.
 */
export function TranslatedField({
  label,
  field,
  state,
  render,
}: {
  label?: string
  field: SchemaField
  state: Extract<FieldTranslationState, { mode: "edit" }>
  render: (field: SchemaField, value: string, onChange: (v: unknown) => void) => React.ReactNode
}) {
  const edit = useTranslationEdit()
  const plain = plainWords(state.original)
  const status = state.translation.status
  /* Its own box: no schema default, the original as the placeholder, one value for every screen. */
  const shownField = React.useMemo(() => ({ ...field, default: "", placeholder: plain.slice(0, 160), responsive: false }) as SchemaField, [field, plain])
  const onChange = React.useCallback((v: unknown) => state.write(typeof v === "string" ? v : ""), [state])
  const original = edit ? languageName(edit.defaultLanguage, activeLocale()) : ""
  return (
    <div data-translated-field={state.key} data-translation-status={status}>
      <div className="mb-1.5 flex min-h-[16px] items-center justify-between gap-2">
        {label ? <label className={cn(LABEL, "truncate")}>{label}</label> : <span />}
        {status === "outdated" ? (
          <span className="shrink-0 text-[11px] font-medium text-[#b45309]" title={tt("{language} changed after this was translated.", { language: original })} data-translation-outdated="">
            {tt("Outdated")}
          </span>
        ) : state.translation.ai && state.translation.value ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">{tt("Automatic")}</span>
        ) : null}
      </div>
      {render(shownField, state.translation.value, onChange)}
      {state.translation.value ? (
        <p className="mt-1 truncate text-[11px] leading-4 text-muted-foreground" title={plain} data-translation-original="">
          {original}: {plain}
        </p>
      ) : null}
    </div>
  )
}

/**
 * THE MENUS IN ANOTHER LANGUAGE: each link's label, by menu and place
 * (`menu:<menu>:<place>`, lib/markets/translate.ts menuTranslatables). The
 * links themselves, where they go and their order are the same in every
 * language, so the menu editor gives way to this list while one is edited.
 */
export function MenuTranslations({ menus }: { menus: Parameters<typeof menuTranslatables>[0] }) {
  const edit = useTranslationEdit()
  const items = React.useMemo(() => menuTranslatables(menus), [menus])
  if (!edit) return null
  if (items.length === 0) return <p className="text-[12.5px] leading-5 text-muted-foreground">{tt("No menu links yet.")}</p>
  const groups = new Map<string, typeof items>()
  for (const i of items) groups.set(i.where, [...(groups.get(i.where) ?? []), i])
  return (
    <div className="space-y-5" data-menu-translations="">
      {[...groups].map(([where, links]) => (
        <div key={where} className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{where}</p>
          {links.map((l) => {
            const t = translationOf(edit.rows, l.key, l.source)
            return (
              <div key={l.key} data-translated-field={l.key} data-translation-status={t.status}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={cn(LABEL, "truncate")}>{l.source}</span>
                  {t.status === "outdated" ? <span className="shrink-0 text-[11px] font-medium text-[#b45309]">{tt("Outdated")}</span> : null}
                </div>
                <MenuLabelInput value={t.value} placeholder={l.source} onChange={(v) => edit.write(l.key, v, l.source)} />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function MenuLabelInput({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const [shown, setShown] = React.useState(value)
  const typing = React.useRef(false)
  React.useEffect(() => {
    if (!typing.current) setShown(value)
  }, [value])
  return (
    <input
      type="text"
      value={shown}
      placeholder={placeholder}
      onFocus={() => (typing.current = true)}
      onBlur={() => (typing.current = false)}
      onChange={(e) => {
        setShown(e.target.value)
        onChange(e.target.value)
      }}
      className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-[13px] transition-colors focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
    />
  )
}

/**
 * THE LANGUAGE ROW, under the sidebar's tabs, for a website in more than one
 * language. Not in the black bar over the canvas: the owner keeps that bar
 * free of selectors. Picking a language here is the same as picking it in
 * the theme's own selector on the canvas, and the canvas follows at once.
 */
export function EditLanguageRow({
  languages,
  published,
  defaultLanguage,
  locale,
  onChange,
  save,
  onRetry,
}: {
  languages: string[]
  published: string[]
  defaultLanguage: string
  locale: string | null
  onChange: (code: string | null) => void
  save: { state: TranslationSaveState; error: string | null }
  onRetry: () => void
}) {
  if (languages.length < 2) return null
  const here = activeLocale()
  const editing = !!locale && locale !== defaultLanguage
  const name = (code: string) => languageName(code, here)
  return (
    <div className="shrink-0 px-3 pb-2" data-wb-edit-language={locale ?? defaultLanguage}>
      <div className="flex items-center gap-2">
        <label htmlFor="wb-edit-language" className="shrink-0 text-[12px] text-muted-foreground">
          {tt("Language")}
        </label>
        <div className="relative min-w-0 flex-1">
          <select
            id="wb-edit-language"
            value={locale ?? defaultLanguage}
            onChange={(e) => onChange(e.target.value === defaultLanguage ? null : e.target.value)}
            className={cn(
              "h-8 w-full cursor-pointer appearance-none rounded-md border bg-background pl-2.5 pr-8 text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/20",
              editing ? "border-[#8b5cf6]/60 bg-[#8b5cf6]/[0.05] text-[#1a1a2e]" : "border-border",
            )}
          >
            {languages.map((code) => (
              <option key={code} value={code}>
                {code === defaultLanguage ? tt("{language} (original)", { language: name(code) }) : published.includes(code) ? name(code) : tt("{language} (not live yet)", { language: name(code) })}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
      {editing ? (
        <p className="mt-1.5 text-[11.5px] leading-4 text-muted-foreground" data-wb-edit-language-note="" aria-live="polite">
          {save.state === "error" ? (
            <>
              <span className="text-[#b91c1c]">{save.error ?? tt("Could not save.")}</span>{" "}
              <button type="button" onClick={onRetry} className="font-medium text-[#1a1a2e] underline underline-offset-2">
                {tt("Try again")}
              </button>
            </>
          ) : save.state === "saving" ? (
            tt("Saving")
          ) : published.includes(locale!) ? (
            tt("Only text changes in {language}. Saved as you type, live at once.", { language: name(locale!) })
          ) : (
            tt("Only text changes in {language}. Saved as you type.", { language: name(locale!) })
          )}
        </p>
      ) : null}
    </div>
  )
}

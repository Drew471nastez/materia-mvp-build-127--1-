"use client"

/**
 * ===========================================================================
 *  GLOSSARY: WORDS AUTOMATIC TRANSLATION KEEPS, OR ALWAYS TRANSLATES ONE WAY
 * ===========================================================================
 * Settings › Markets and languages. A term is either kept as written in
 * every language (a brand, a product line) or given its translation per
 * language; "Keep product names as written" leaves every product title
 * alone. The texts marked Don't translate in the theme editor are counted
 * here. Only Storelib AI follows these: a translation the merchant wrote is
 * never changed by them (lib/markets/translation-rules.ts).
 */
import * as React from "react"
import { Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_PRIMARY, BTN_SECONDARY, Modal, Notice, SelectInput, TextInput, Toggle, api } from "@/components/physical/ui"
import { activeLocale, tt } from "@/lib/i18n/text"
import { languageName } from "@/lib/markets/locales"
import type { GlossaryTerm, TranslationRules } from "@/lib/markets/translation-rules"

type Draft = { term: string; keep: boolean; to: Record<string, string> }

const toDraft = (g: GlossaryTerm): Draft => ({ term: g.term, keep: g.keep === true || !g.to, to: { ...(g.to ?? {}) } })

export function GlossaryButton({ languages, disabled }: { languages: string[]; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button type="button" className={cn(BTN_SECONDARY, "mt-3 ml-2")} onClick={() => setOpen(true)} disabled={disabled} data-open-glossary="">
        {tt("Glossary")}
      </button>
      <GlossarySheet open={open} languages={languages} onClose={() => setOpen(false)} />
    </>
  )
}

export function GlossarySheet({ open, languages, onClose }: { open: boolean; languages: string[]; onClose: () => void }) {
  const [rules, setRules] = React.useState<TranslationRules | null>(null)
  const [terms, setTerms] = React.useState<Draft[]>([])
  const [keepNames, setKeepNames] = React.useState(false)
  const [ready, setReady] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setError(null)
    setNote(null)
    void api<{ ready: boolean; rules: TranslationRules }>("/api/store/translations/rules", { method: "GET" }).then((r) => {
      if (!r.ok) return setError(r.error)
      setReady(r.data.ready)
      setRules(r.data.rules)
      setTerms(r.data.rules.glossary.map(toDraft))
      setKeepNames(r.data.rules.keepProductNames === true)
    })
  }, [open])

  const save = async () => {
    if (!rules) return
    setSaving(true)
    setError(null)
    const glossary: GlossaryTerm[] = terms
      .filter((t) => t.term.trim().length >= 2)
      .map((t) => {
        const to = Object.fromEntries(Object.entries(t.to).filter(([code, v]) => languages.includes(code) && v.trim()))
        return t.keep || Object.keys(to).length === 0 ? { term: t.term.trim(), keep: true } : { term: t.term.trim(), to }
      })
    const r = await api<{ rules: TranslationRules }>("/api/store/translations/rules", { method: "PUT", body: { rules: { ...rules, glossary, keepProductNames: keepNames } } })
    setSaving(false)
    if (!r.ok) return setError(r.error)
    setRules(r.data.rules)
    setTerms(r.data.rules.glossary.map(toDraft))
    setNote(tt("Saved. New automatic translations follow it."))
  }

  const set = (i: number, next: Partial<Draft>) => setTerms((list) => list.map((t, n) => (n === i ? { ...t, ...next } : t)))
  const untranslated = rules?.noTranslate.length ?? 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={tt("Glossary")}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {note ? <span className="mr-auto text-[13px] text-[#4b5563]">{note}</span> : null}
          <button type="button" className={BTN_PRIMARY} disabled={saving || !rules} onClick={() => void save()} data-save-glossary="">
            {saving ? tt("Saving") : tt("Save")}
          </button>
        </div>
      }
    >
      <div className="space-y-4" data-glossary="">
        {!ready ? <Notice tone="amber">{tt("The glossary needs a database update. Run SQL part 230 in Supabase, then try again.")}</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
        <p className="text-[13.5px] leading-[20px] text-[#6b7280]">{tt("Automatic translation keeps these words as written, or always uses your translation. Translations you write yourself are never changed.")}</p>
        <Toggle id="keep-product-names" label={tt("Keep product names as written")} description={tt("Product titles stay the same in every language.")} checked={keepNames} onChange={setKeepNames} />
        <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-glossary-terms="">
          {terms.length === 0 ? <li className="px-3.5 py-4 text-[13.5px] text-[#6b7280]">{tt("No terms yet. Add your brand or product line names.")}</li> : null}
          {terms.map((t, i) => (
            <li key={i} className="space-y-2 px-3.5 py-3" data-glossary-term={t.term}>
              <div className="flex items-center gap-2">
                <TextInput value={t.term} maxLength={80} placeholder={tt("Word or phrase")} aria-label={tt("Word or phrase")} onChange={(e) => set(i, { term: e.target.value })} className="min-w-0 flex-1" />
                <SelectInput value={t.keep ? "keep" : "translate"} onChange={(v) => set(i, { keep: v === "keep" })} aria-label={tt("How it is translated")} className="w-[170px] shrink-0">
                  <option value="keep">{tt("Keep as written")}</option>
                  <option value="translate">{tt("Translate as")}</option>
                </SelectInput>
                <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a2e]" aria-label={tt("Remove {term}", { term: t.term || tt("term") })} onClick={() => setTerms((list) => list.filter((_, n) => n !== i))}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              {!t.keep ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {languages.map((code) => (
                    <label key={code} className="flex items-center gap-2 text-[12.5px] text-[#4b5563]">
                      <span className="w-24 shrink-0 truncate">{languageName(code, activeLocale())}</span>
                      <TextInput value={t.to[code] ?? ""} maxLength={160} onChange={(e) => set(i, { to: { ...t.to, [code]: e.target.value } })} className="min-w-0 flex-1" />
                    </label>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <button type="button" className={BTN_SECONDARY} onClick={() => setTerms((list) => [...list, { term: "", keep: true, to: {} }])} data-add-glossary-term="">
          <Plus className="h-4 w-4" />
          {tt("Add term")}
        </button>
        {untranslated ? (
          <p className="text-[12.5px] text-[#6b7280]" data-glossary-untranslated={untranslated}>
            {tt("{count} texts are marked Don't translate. Change them in the theme editor, in the language you translate into.", { count: untranslated })}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

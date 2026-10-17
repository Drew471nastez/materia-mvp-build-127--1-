"use client"

/**
 * ===========================================================================
 *  GLOSSARY: WORDS AUTOMATIC TRANSLATION KEEPS, OR ALWAYS TRANSLATES ONE WAY
 * ===========================================================================
 * Settings › Languages & Currency › Glossary. Two things, top to bottom:
 *
 *   Keep product names as written   automatic translation leaves product
 *                titles alone (on for a store that never chose, see
 *                lib/markets/translation-rules.ts keepProductNamesDefault);
 *                a title can still be written on a product's Translations
 *                card
 *   Terms        a word or phrase, kept as written in every language (a
 *                brand, "Storelib Pro") or translated one way per language
 *                ("Gift card" is always "Carte cadeau" in French)
 *
 * A term is added or changed in a small form in the list itself, checked as
 * the server keeps it (checkTerm: tidied, 2 to 80 characters, no duplicate,
 * a translation for at least one language unless kept), and every change is
 * saved at once, the way the rest of Languages & Currency is. When a term
 * changes, the server writes again Storelib AI's translations that use it
 * (app/api/store/translations/rules), so the live website follows. Only
 * Storelib AI follows these: a translation the merchant wrote is never
 * changed by them. The texts marked Don't translate in the theme editor are
 * counted at the foot.
 */
import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Modal, Notice, TextInput, Toggle, api } from "@/components/physical/ui"
import { activeLocale, tt } from "@/lib/i18n/text"
import { languageName } from "@/lib/markets/locales"
import { MAX_GLOSSARY, MAX_TERM, MAX_TERM_TRANSLATION, checkTerm, type GlossaryTerm, type TermProblem, type TranslationRules } from "@/lib/markets/translation-rules"

type Draft = { term: string; keep: boolean; to: Record<string, string> }

const blank = (): Draft => ({ term: "", keep: true, to: {} })
const toDraft = (g: GlossaryTerm): Draft => ({ term: g.term, keep: g.keep === true || !g.to, to: { ...(g.to ?? {}) } })

/** What a term does, in one line: "Kept as written", or each language's words. */
function termLine(g: GlossaryTerm, languages: string[]): string {
  if (g.keep || !g.to) return tt("Kept as written in every language")
  const ui = activeLocale()
  return languages
    .filter((code) => g.to?.[code])
    .map((code) => `${languageName(code, ui)}: ${g.to![code]}`)
    .join(" · ")
}

function problemText(problem: TermProblem, term: string): string {
  switch (problem) {
    case "short":
      return tt("Write a word or phrase of at least 2 characters.")
    case "long":
      return tt("Keep it to {max} characters.", { max: MAX_TERM })
    case "duplicate":
      return tt("“{term}” is already in your glossary.", { term: term.trim() })
    case "noTranslation":
      return tt("Write how it reads in at least one language, or choose Keep as written.")
    case "translationLong":
      return tt("Keep each translation to {max} characters.", { max: MAX_TERM_TRANSLATION })
  }
}

/** The Glossary button, beside Add language. Its own size, no margins: the row it sits in places it. */
export function GlossaryButton({ languages, disabled, className }: { languages: string[]; disabled?: boolean; className?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button type="button" className={cn(BTN_SECONDARY, className)} onClick={() => setOpen(true)} disabled={disabled} data-open-glossary="">
        {tt("Glossary")}
      </button>
      <GlossarySheet open={open} languages={languages} onClose={() => setOpen(false)} />
    </>
  )
}

export function GlossarySheet({ open, languages, onClose }: { open: boolean; languages: string[]; onClose: () => void }) {
  const [rules, setRules] = React.useState<TranslationRules | null>(null)
  const [ready, setReady] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle")
  const [note, setNote] = React.useState<string | null>(null)
  /* The term being written: a new one ("new"), one of the list by its place, or none. */
  const [editing, setEditing] = React.useState<number | "new" | null>(null)
  const [form, setForm] = React.useState<Draft>(blank)
  const [problem, setProblem] = React.useState<{ problem: TermProblem; field: string } | null>(null)
  /* The last term removed, for Undo. */
  const [removed, setRemoved] = React.useState<{ term: GlossaryTerm; at: number } | null>(null)
  const saved = React.useRef<TranslationRules | null>(null)
  const queue = React.useRef<Promise<void>>(Promise.resolve())

  React.useEffect(() => {
    if (!open) return
    setError(null)
    setNote(null)
    setState("idle")
    setEditing(null)
    setProblem(null)
    setRemoved(null)
    void api<{ ready: boolean; rules: TranslationRules }>("/api/store/translations/rules", { method: "GET" }).then((r) => {
      if (!r.ok) return setError(r.error)
      setReady(r.data.ready)
      setRules(r.data.rules)
      saved.current = r.data.rules
    })
  }, [open])

  /* SAVED AS IT IS MADE, one at a time and in order; a refusal puts back what was saved last and says why. */
  const commit = (next: TranslationRules, done?: (rewriting: number) => string | null): Promise<boolean> => {
    setRules(next)
    setError(null)
    setNote(null)
    setState("saving")
    let landed = false
    queue.current = queue.current.then(async () => {
      const r = await api<{ rules: TranslationRules; rewriting?: number }>("/api/store/translations/rules", { method: "PUT", body: { rules: next } })
      if (!r.ok) {
        setError(r.error)
        setRules(saved.current)
        setState("idle")
        return
      }
      landed = true
      saved.current = r.data.rules
      setRules(r.data.rules)
      setState("saved")
      const rewriting = r.data.rewriting ?? 0
      setNote(done?.(rewriting) ?? (rewriting > 0 ? tt("Saved. {count} translations that use it are being updated.", { count: rewriting }) : null))
    })
    return queue.current.then(() => landed)
  }

  const terms = rules?.glossary ?? []
  const startNew = () => {
    setEditing("new")
    setForm(blank())
    setProblem(null)
    setRemoved(null)
  }
  const startEdit = (i: number) => {
    setEditing(i)
    setForm(toDraft(terms[i]))
    setProblem(null)
    setRemoved(null)
  }
  const cancel = () => {
    setEditing(null)
    setProblem(null)
  }
  const submit = async () => {
    if (!rules || editing === null) return
    const was = editing === "new" ? null : terms[editing]
    const others = terms.filter((_, n) => n !== editing)
    const checked = checkTerm(form, others, languages, was)
    if (checked.ok === false) return setProblem({ problem: checked.problem, field: checked.field })
    const glossary = editing === "new" ? [...terms, checked.value] : terms.map((t, n) => (n === editing ? checked.value : t))
    setEditing(null)
    setProblem(null)
    const ok = await commit({ ...rules, glossary })
    /* Turned down by the server: the form comes back as it was typed. */
    if (!ok) {
      setEditing(was ? terms.indexOf(was) : "new")
      setForm(form)
    }
  }
  const remove = (i: number) => {
    if (!rules) return
    const term = terms[i]
    if (editing !== null) cancel()
    void commit({ ...rules, glossary: terms.filter((_, n) => n !== i) }, (rewriting) =>
      rewriting > 0 ? tt("Removed “{term}”. {count} translations that use it are being updated.", { term: term.term, count: rewriting }) : tt("Removed “{term}”.", { term: term.term }),
    ).then((ok) => setRemoved(ok ? { term, at: i } : null))
  }
  const undo = () => {
    if (!rules || !removed) return
    const glossary = [...terms]
    glossary.splice(Math.min(removed.at, glossary.length), 0, removed.term)
    setRemoved(null)
    void commit({ ...rules, glossary })
  }

  const untranslated = rules?.noTranslate.length ?? 0
  const status = state === "saving" ? tt("Saving") : note ?? (state === "saved" ? tt("Saved") : null)
  const form_ = editing !== null ? <TermForm form={form} setForm={(d) => { setForm(d); setProblem(null) }} languages={languages} problem={problem} isNew={editing === "new"} onCancel={cancel} onSubmit={() => void submit()} /> : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={tt("Glossary")}
      footer={
        <div className="flex min-h-10 items-center justify-end gap-3">
          <p className="mr-auto min-w-0 text-[13px] leading-[18px] text-[#4b5563]" aria-live="polite" data-glossary-status={state}>
            {status}
            {removed && state !== "saving" ? (
              <button type="button" className="ml-2 font-medium text-[#1a1a2e] underline-offset-2 hover:underline" onClick={undo} data-glossary-undo="">
                {tt("Undo")}
              </button>
            ) : null}
          </p>
          <button type="button" className={BTN_PRIMARY} onClick={onClose} data-close-glossary="">
            {tt("Done")}
          </button>
        </div>
      }
    >
      <div className="space-y-5" data-glossary="">
        {!ready ? <Notice tone="amber">{tt("The glossary needs a database update. Run SQL part 213 in Supabase, then try again.")}</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
        <p className="text-[13.5px] leading-[20px] text-[#6b7280]">{tt("Automatic translation keeps these words as written, or always uses your translation. Translations you write yourself are never changed.")}</p>

        <div data-keep-product-names={rules ? String(rules.keepProductNames === true) : ""}>
          <Toggle
            id="keep-product-names"
            label={tt("Keep product names as written")}
            description={tt("Automatic translation leaves product titles as you wrote them. You can still translate a title yourself on the product's Translations card.")}
            checked={rules?.keepProductNames === true}
            disabled={!rules || !ready}
            onChange={(v) => {
              if (rules) void commit({ ...rules, keepProductNames: v })
            }}
          />
        </div>

        <section aria-labelledby="glossary-terms" className="space-y-2.5">
          <h3 id="glossary-terms" className="text-[14px] font-medium text-[#1a1a2e]">
            {tt("Words and phrases")}
          </h3>
          {rules === null && !error ? (
            /* The list's own shape while it is read. */
            <div aria-busy="true" className="h-[52px] rounded-xl border border-[#eceef1] bg-[#fafafb]" data-glossary-loading="" />
          ) : terms.length === 0 && editing !== "new" ? (
            <p className="rounded-xl border border-dashed border-[#e5e7eb] px-3.5 py-3 text-[13.5px] leading-[20px] text-[#6b7280]" data-glossary-empty="">
              {tt("No terms yet. Add your brand, like “Storelib Pro”, to keep it as written in every language.")}
            </p>
          ) : (
            <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-glossary-terms="">
              {terms.map((t, i) =>
                editing === i ? (
                  <li key={`${t.term}-${i}`} className="bg-[#fafafb] px-3.5 py-3">
                    {form_}
                  </li>
                ) : (
                  <li key={`${t.term}-${i}`} className="flex items-center gap-1 py-2 pl-3.5 pr-1.5" data-glossary-term={t.term}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium leading-5 text-[#1a1a2e]">{t.term}</span>
                      <span className="block truncate text-[12.5px] leading-[18px] text-[#6b7280]">{termLine(t, languages)}</span>
                    </span>
                    <button type="button" className={cn(BTN_GHOST, "shrink-0 px-2.5")} onClick={() => startEdit(i)} aria-label={tt("Edit {term}", { term: t.term })} data-edit-glossary-term={t.term}>
                      {tt("Edit")}
                    </button>
                    <button type="button" className={cn(BTN_GHOST, "w-9 shrink-0 px-0 text-[#6b7280]")} onClick={() => remove(i)} aria-label={tt("Remove {term}", { term: t.term })} data-remove-glossary-term={t.term}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ),
              )}
              {editing === "new" ? <li className="bg-[#fafafb] px-3.5 py-3">{form_}</li> : null}
            </ul>
          )}
          {editing === "new" ? null : (
            <button type="button" className={BTN_SECONDARY} onClick={startNew} disabled={!rules || !ready || terms.length >= MAX_GLOSSARY} data-add-glossary-term="">
              <Plus className="h-4 w-4" />
              {tt("Add term")}
            </button>
          )}
        </section>

        <div className="space-y-1.5 border-t border-[#f1f2f4] pt-4 text-[12.5px] leading-[18px] text-[#6b7280]">
          {untranslated ? (
            <p data-glossary-untranslated={untranslated}>
              {untranslated === 1 ? tt("1 text is marked Don't translate. Change it in the theme editor, in the language you translate into.") : tt("{count} texts are marked Don't translate. Change them in the theme editor, in the language you translate into.", { count: untranslated })}
            </p>
          ) : null}
          <p>
            <a href="/app/settings?tab=checkout#checkout-text" className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline" data-glossary-checkout-text="">
              {tt("Change the words on your checkout")}
            </a>
          </p>
        </div>
      </div>
    </Modal>
  )
}

/**
 * One term, being written: the word or phrase, then Keep as written or
 * Translate as, then a field per language. Enter adds it; the first
 * problem is said under the field it is about.
 */
function TermForm({ form, setForm, languages, problem, isNew, onCancel, onSubmit }: { form: Draft; setForm: (d: Draft) => void; languages: string[]; problem: { problem: TermProblem; field: string } | null; isNew: boolean; onCancel: () => void; onSubmit: () => void }) {
  const ui = activeLocale()
  const termRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    termRef.current?.focus()
  }, [])
  const said = problem ? problemText(problem.problem, form.term) : null
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onSubmit()
    }
    if (e.key === "Escape") {
      e.stopPropagation()
      onCancel()
    }
  }
  return (
    <div className="space-y-3" data-glossary-form={isNew ? "new" : "edit"} onKeyDown={onKey}>
      <div className="space-y-1.5">
        <label htmlFor="glossary-term" className="block text-[13px] font-medium text-[#374151]">
          {tt("Word or phrase")}
        </label>
        <TextInput
          id="glossary-term"
          ref={termRef}
          value={form.term}
          maxLength={MAX_TERM + 20}
          placeholder={tt("Gift card")}
          aria-invalid={problem?.field === "term" || undefined}
          onChange={(e) => setForm({ ...form, term: e.target.value })}
        />
        {problem?.field === "term" ? <p className="text-[12.5px] text-[#b42318]" data-glossary-problem={problem.problem}>{said}</p> : null}
      </div>
      <div role="radiogroup" aria-label={tt("How it is translated")} className="inline-flex w-full gap-1 rounded-xl bg-[#f1f2f4] p-1 sm:w-auto" data-glossary-mode={form.keep ? "keep" : "translate"}>
        {[
          { keep: true, label: tt("Keep as written") },
          { keep: false, label: tt("Translate as") },
        ].map((o) => (
          <button
            key={String(o.keep)}
            type="button"
            role="radio"
            aria-checked={form.keep === o.keep}
            onClick={() => setForm({ ...form, keep: o.keep })}
            className={cn(
              "h-8 flex-1 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:flex-none",
              form.keep === o.keep ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {form.keep ? null : (
        <div className="grid gap-2 sm:grid-cols-2" data-glossary-translations="">
          {languages.map((code) => (
            <div key={code} className="min-w-0 space-y-1">
              <label htmlFor={`glossary-to-${code}`} className="block truncate text-[12.5px] font-medium text-[#4b5563]">
                {languageName(code, ui)}
              </label>
              <TextInput
                id={`glossary-to-${code}`}
                value={form.to[code] ?? ""}
                maxLength={MAX_TERM_TRANSLATION + 20}
                aria-invalid={problem?.field === code || undefined}
                onChange={(e) => setForm({ ...form, to: { ...form.to, [code]: e.target.value } })}
              />
              {problem && problem.field === code ? <p className="text-[12.5px] text-[#b42318]" data-glossary-problem={problem.problem}>{said}</p> : null}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button type="button" className={BTN_GHOST} onClick={onCancel} data-cancel-glossary-term="">
          {tt("Cancel")}
        </button>
        <button type="button" className={cn(BTN_PRIMARY, "h-9 px-3.5")} onClick={onSubmit} data-save-glossary-term="">
          {isNew ? tt("Add term") : tt("Save term")}
        </button>
      </div>
    </div>
  )
}

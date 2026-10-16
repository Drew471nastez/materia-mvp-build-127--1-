"use client"

/**
 * ===========================================================================
 *  SETTINGS › LANGUAGES › WORDS NOT TO TRANSLATE
 * ===========================================================================
 * Brand names, product names and any word the owner lists stay exactly as
 * written in every language (lib/markets/glossary.ts). A word can have a
 * fixed translation in a language instead ("Gift card" is always "Carte
 * cadeau" in French). Saved as it is changed, like the rest of the page;
 * the server marks Storelib AI's translations of the texts with that word
 * to be written again, never the owner's own.
 */
import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_GHOST, BTN_SECONDARY, FIELD_COMPACT, Notice, TextInput, api } from "@/components/physical/ui"
import { languageName } from "@/lib/markets/locales"
import { MAX_TERM_LENGTH, MAX_TERMS, readGlossary, type Glossary } from "@/lib/markets/glossary"
import { activeLocale, tt } from "@/lib/i18n/text"

const PATH = "/api/store/translations/glossary"

/** `languages`: the ones the website is translated into, for fixed translations. */
export function TranslationGlossary({ languages, disabled = false }: { languages: string[]; disabled?: boolean }) {
  const [list, setList] = React.useState<Glossary | null>(null)
  const [ready, setReady] = React.useState(true)
  const [typed, setTyped] = React.useState("")
  const [open, setOpen] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const saved = React.useRef<Glossary>([])
  const queue = React.useRef<Promise<void>>(Promise.resolve())

  React.useEffect(() => {
    void api<{ ready: boolean; glossary: unknown }>(PATH, { method: "GET" }).then((r) => {
      if (!r.ok) return setError(r.error)
      const g = readGlossary(r.data.glossary)
      saved.current = g
      setList(g)
      setReady(r.data.ready !== false)
    })
  }, [])

  /* One save at a time, in order; a refusal puts back what was saved last and says why. */
  const commit = (next: Glossary) => {
    setList(next)
    setError(null)
    queue.current = queue.current.then(async () => {
      const r = await api<{ glossary: unknown; refreshed: number }>(PATH, { method: "PUT", body: { glossary: next } })
      if (!r.ok) {
        setError(r.error)
        setList(saved.current)
        return
      }
      const g = readGlossary(r.data.glossary)
      saved.current = g
      setList(g)
      setNote(r.data.refreshed > 0 ? (r.data.refreshed === 1 ? tt("1 machine translation will update.") : tt("{count} machine translations will update.", { count: r.data.refreshed })) : tt("Saved"))
      window.setTimeout(() => setNote(null), 2400)
    })
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const term = typed.replace(/\s+/g, " ").trim()
    if (!list || term.length < 2) return
    setTyped("")
    if (list.some((t) => t.term.toLocaleLowerCase() === term.toLocaleLowerCase())) return
    commit([...list, { term }])
  }

  const setFixed = (term: string, code: string, word: string) => {
    if (!list) return
    const next = list.map((t) => {
      if (t.term !== term) return t
      const as = { ...(t.as ?? {}) }
      const w = word.replace(/\s+/g, " ").trim()
      if (w) as[code] = w
      else delete as[code]
      return Object.keys(as).length ? { term: t.term, as } : { term: t.term }
    })
    if (JSON.stringify(next) !== JSON.stringify(list)) commit(next)
  }

  const summary = (t: Glossary[number]) => {
    const fixed = languages.filter((c) => t.as?.[c]).map((c) => `${languageName(c, activeLocale())}: ${t.as![c]}`)
    return fixed.length ? fixed.join(" · ") : tt("Same in every language")
  }

  return (
    <div className="mt-4 border-t border-[#f1f2f4] pt-4" data-translation-glossary="">
      <span className="block text-[14px] font-medium leading-5 text-[#1a1a2e]">{tt("Words not to translate")}</span>
      <p className="mt-0.5 text-[13px] leading-[18px] text-[#6b7280]">{tt("Brand and product names you list stay exactly as you write them, in every language.")}</p>
      {!ready ? <Notice tone="amber" className="mt-3">{tt("Words not to translate needs a database update. Run SQL part 203 in Supabase, then try again.")}</Notice> : null}
      {error ? <Notice className="mt-3">{error}</Notice> : null}
      <form onSubmit={add} className="mt-3 flex gap-2">
        <TextInput
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          maxLength={MAX_TERM_LENGTH}
          placeholder={tt("Brand or product name")}
          aria-label={tt("Add a word not to translate")}
          disabled={disabled || !ready || !list || list.length >= MAX_TERMS}
          data-glossary-input=""
        />
        <button type="submit" className={cn(BTN_SECONDARY, "shrink-0")} disabled={disabled || !ready || !list || typed.trim().length < 2} data-glossary-add="">
          {tt("Add")}
        </button>
      </form>
      {/* What the last change did, under the field it came from. */}
      {note ? (
        <p className="mt-2 text-[12.5px] leading-[18px] text-[#6b7280]" aria-live="polite" data-glossary-note="">
          {note}
        </p>
      ) : null}
      {list && list.length ? (
        <ul className="mt-3 divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-glossary="">
          {list.map((t) => (
            <li key={t.term} className="px-3.5 py-2.5" data-glossary-term={t.term}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[14px] font-medium text-[#1a1a2e]">{t.term}</span>
                  {/* Wraps rather than cut: on a phone, "Same in every language" beside Fixed translation is two short lines, never "Same in every la…". */}
                  <span className="block break-words text-[12.5px] leading-[18px] text-[#6b7280]">{summary(t)}</span>
                </span>
                {languages.length ? (
                  <button type="button" className={cn(BTN_GHOST, "shrink-0 px-2.5")} aria-expanded={open === t.term} onClick={() => setOpen((o) => (o === t.term ? null : t.term))} data-glossary-fixed={t.term}>
                    {open === t.term ? tt("Done") : tt("Fixed translation")}
                  </button>
                ) : null}
                <button type="button" aria-label={tt("Remove {term}", { term: t.term })} className={cn(BTN_GHOST, "w-9 shrink-0 px-0 text-[#6b7280]")} onClick={() => list && commit(list.filter((x) => x.term !== t.term))} data-glossary-remove={t.term}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              {open === t.term ? (
                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {languages.map((code) => (
                    <label key={code} className="block min-w-0">
                      <span className="mb-1 block text-[12.5px] text-[#4b5563]">{tt("In {name}", { name: languageName(code, activeLocale()) })}</span>
                      <input
                        defaultValue={t.as?.[code] ?? ""}
                        placeholder={t.term}
                        maxLength={120}
                        onBlur={(e) => setFixed(t.term, code, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                        }}
                        className={FIELD_COMPACT}
                        data-glossary-as={code}
                      />
                    </label>
                  ))}
                  <p className="text-[12px] leading-[17px] text-[#9ca3af] sm:col-span-2">{tt("Left empty, it stays as written.")}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

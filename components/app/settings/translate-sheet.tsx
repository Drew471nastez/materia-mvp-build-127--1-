"use client"

/**
 * ===========================================================================
 *  TRANSLATE: ONE LANGUAGE OF THE WEBSITE, TEXT BY TEXT
 * ===========================================================================
 * Opened from Settings › Markets and languages. Every piece of text the
 * website shows (its pages' sections, the header and footer once, its
 * products and collections), each with the original above and the
 * translation under it, and where it stands:
 *
 *   To translate   no translation yet: the original shows on the website
 *   Changed        Storelib AI's, and the original changed since: the new
 *                  original shows until it is translated again (by the
 *                  automatic run, or Translate the rest)
 *   Needs review   the merchant's own, and the original changed since: still
 *                  on the website as they wrote it, never replaced by
 *                  Storelib AI. Editing it, or Keep as is, settles it.
 *   Draft          translated automatically, not on the website until approved
 *   Auto           Storelib AI's, on the website
 *   Edited         the merchant's own, on the website; never replaced
 *   Kept as written  marked Don't translate (Settings › Glossary): the
 *                  original shows in every language
 *
 * Quick actions on a row: Keep as is (Needs review), and Use automatic on
 * one the merchant wrote (Needs review or Edited), which asks Storelib AI
 * for that one text and replaces theirs only once it has come back.
 *
 * "Translate the rest" drafts the ones to translate and Storelib AI's
 * changed ones, never one a person wrote or edited. Save keeps what was
 * typed, approved. An empty translation shows the original again. Opened
 * from a Needs review count (`focus`), the list starts on those.
 */
import * as React from "react"
import { Languages, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_PRIMARY, BTN_SECONDARY, Modal, Notice, api } from "@/components/physical/ui"
import { Switch } from "@/components/ui/switch"
import { languageName } from "@/lib/markets/locales"
import { activeLocale, tt } from "@/lib/i18n/text"
import { startTranslation, useTranslationJobs } from "./translation-jobs-store"
import { TranslateBar, useRollingNumber } from "./translate-progress"

type Status = "missing" | "outdated" | "draft" | "done"
/** What the row says: the server's status, with the merchant's own outdated ones as Needs review. */
type Shown = Status | "review" | "auto" | "edited" | "kept"
interface Item {
  key: string
  source: string
  label: string
  where: string
  multiline: boolean
  rich: boolean
  value: string
  status: Status
  ai: boolean
  /** The merchant's own, its original changed since (lib/markets/translate.ts needsReview). */
  review?: boolean
  /** Kept untranslated on purpose (lib/markets/translation-rules.ts isExcluded). */
  excluded?: boolean
}
interface Group {
  id: string
  title: string
  items: Item[]
}
interface Loaded {
  ready: boolean
  locale: string | null
  groups: Group[]
  progress?: { done: number; total: number }
}

const STATUS: Record<Shown, { label: string; tone: "gray" | "amber" | "blue" | "green" }> = {
  missing: { get label() { return tt("To translate") }, tone: "gray" },
  outdated: { get label() { return tt("Changed") }, tone: "amber" },
  review: { get label() { return tt("Needs review") }, tone: "amber" },
  draft: { get label() { return tt("Draft") }, tone: "blue" },
  done: { get label() { return tt("Done") }, tone: "green" },
  auto: { get label() { return tt("Auto") }, tone: "blue" },
  edited: { get label() { return tt("Edited") }, tone: "green" },
  kept: { get label() { return tt("Kept as written") }, tone: "gray" },
}

const DOT: Record<"gray" | "amber" | "blue" | "green", string> = { gray: "bg-[#d1d5db]", amber: "bg-[#f59e0b]", blue: "bg-[#8b5cf6]", green: "bg-[#10b981]" }

type Filter = "todo" | "review" | "edited" | "all"

/** How long one AI press is waited for: the route stops starting batches at 85s and is allowed 120s in all. */
const DRAFT_WAIT_MS = 125_000

/*
  OPENED AGAIN, AT ONCE. What a language last loaded is kept for the visit:
  the sheet opens on it while it is read again, never on an empty box.
*/
const loadedCache = new Map<string, Loaded>()

const isEdited = (i: Item) => !i.ai && !!i.value && i.status === "done" && !i.review
const shownStatus = (i: Item): Shown => (i.review ? "review" : i.excluded && (!i.value || i.ai) ? "kept" : i.status === "done" ? (i.ai ? "auto" : "edited") : i.status)
/** What Translate the rest can do: missing, or Storelib AI's with a changed original. Never the merchant's own, never one kept as written. */
const aiCanDo = (i: Item) => !i.excluded && (i.status === "missing" || (i.status === "outdated" && !i.review))

/** The words of a rich text original, for reading above the field. */
const plain = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim()

/**
 * `published` and `onPublish`: the language's own switch in the footer, so
 * translating and putting it live happen in one place (round AE).
 */
export function TranslateSheet({ locale, defaultLanguage, waiting = false, published = false, focus = null, onPublish, onClose }: { locale: string | null; defaultLanguage: string; waiting?: boolean; published?: boolean; focus?: "review" | null; onPublish?: (v: boolean) => void; onClose: () => void }) {
  const [data, setData] = React.useState<Loaded | null>(null)
  const [edits, setEdits] = React.useState<Record<string, string>>({})
  const [approve, setApprove] = React.useState<Set<string>>(new Set())
  const [filter, setFilter] = React.useState<Filter>("todo")
  const [busy, setBusy] = React.useState<"save" | "ai" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)

  const load = React.useCallback(async (code: string) => {
    /* A language saved a moment ago can take a beat to be read back (a cache, a replica): asked again twice before saying so. */
    for (let attempt = 0; ; attempt++) {
      const r = await api<Loaded>(`/api/store/translations?locale=${encodeURIComponent(code)}${attempt ? `&t=${attempt}` : ""}`, { method: "GET" })
      if (!r.ok) return setError(r.error)
      if (r.data.locale) {
        setError(null)
        loadedCache.set(code, r.data)
        return setData(r.data)
      }
      if (attempt >= 2) return setError(tt("{name} isn't on your website's languages. Add it in Languages & Currency, then open it again.", { name: languageName(code, activeLocale()) }))
      await new Promise((ok) => window.setTimeout(ok, 1200))
    }
  }, [])

  /* A language just added is read once its save has landed (`waiting`, Settings › Markets and languages). */
  React.useEffect(() => {
    if (!locale) return
    setData(loadedCache.get(locale) ?? null)
    setEdits({})
    setApprove(new Set())
    setError(null)
    setNote(null)
    setFilter(focus === "review" ? "review" : "todo")
    if (!waiting) void load(locale)
  }, [locale, waiting, load, focus])

  const items = React.useMemo(() => data?.groups.flatMap((g) => g.items) ?? [], [data])
  const byKey = React.useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const changed = Object.keys(edits).filter((k) => edits[k] !== byKey.get(k)?.value)
  const drafts = items.filter((i) => i.status === "draft")
  const reviews = items.filter((i) => i.review)
  const edited = items.filter(isEdited)
  const todoCount = items.filter((i) => aiCanDo(i)).length
  /* The last one settled while on Needs review: back to the rest of the list. */
  const filterShown: Filter = (filter === "review" && reviews.length === 0) || (filter === "edited" && edited.length === 0) ? "todo" : filter
  const pending = changed.length + [...approve].filter((k) => !changed.includes(k)).length

  const save = async (alsoApprove: string[] = []) => {
    if (!locale) return
    const keys = new Set([...changed, ...approve, ...alsoApprove])
    const body = [...keys]
      .map((k) => byKey.get(k))
      .filter((i): i is Item => !!i)
      /* An AI draft approved as it stands stays Storelib AI's; edited, it is the merchant's own, which AI never replaces. */
      .map((i) => ({ key: i.key, value: edits[i.key] ?? i.value, source: i.source, approved: true, rich: i.rich, ai: i.ai && !changed.includes(i.key) }))
    if (body.length === 0) return
    setBusy("save")
    setError(null)
    for (let at = 0; at < body.length; at += 400) {
      const r = await api(`/api/store/translations`, { method: "PUT", body: { locale, items: body.slice(at, at + 400) } })
      if (!r.ok) {
        setBusy(null)
        return setError(r.error)
      }
    }
    setEdits({})
    setApprove(new Set())
    await load(locale)
    setBusy(null)
    setNote(tt("Saved"))
    window.setTimeout(() => setNote(null), 1800)
  }

  /* One text at a time: Use automatic, Reset to automatic. */
  const [rowBusy, setRowBusy] = React.useState<string | null>(null)
  const takeAutomatic = async (i: Item) => {
    if (!locale) return
    setRowBusy(i.key)
    setError(null)
    const r = await api<{ values: Record<string, unknown> }>(`/api/store/translations/auto`, { method: "POST", body: { locale, items: [{ key: i.key, source: i.source, rich: i.rich }], replaceManual: true }, timeoutMs: 60_000 })
    setRowBusy(null)
    if (!r.ok) return setError(r.error)
    if (!r.data.values?.[i.key]) return setError(tt("Couldn't translate that right now. Your text stays as it is."))
    setEdits((x) => {
      const n = { ...x }
      delete n[i.key]
      return n
    })
    await load(locale)
  }

  /*
    TRANSLATE EVERYTHING, ON THE SERVER (./translation-jobs-store.ts): the job
    runs whether this sheet stays open or not, and its bar is the job's own
    count. When it finishes the texts are read again here.
  */
  const { jobs } = useTranslationJobs()
  const job = locale ? jobs[locale] : undefined
  const jobRunning = job?.status === "running"
  const wasRunning = React.useRef(jobRunning)
  React.useEffect(() => {
    if (wasRunning.current && !jobRunning && locale) {
      void load(locale)
      setNote(job?.status === "done" ? (job.error ? job.error : job.drafted ? tt("{total} translated and live on your website.", { total: job.drafted }) : tt("Everything is translated.")) : null)
      if (job?.status === "failed" && job.error) setError(job.error)
    }
    wasRunning.current = jobRunning
  }, [jobRunning, job, locale, load])
  /* Each round in while it runs: the new drafts appear in the list, unless something typed here would be read over. */
  const jobDone = job?.done ?? 0
  const typing = Object.keys(edits).length > 0
  React.useEffect(() => {
    if (jobRunning && locale && !typing && jobDone > 0) void load(locale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobDone])
  const draftWithAi = async () => {
    if (!locale) return
    setError(null)
    setNote(null)
    const r = await startTranslation(locale)
    if (r.ok) return
    if (!("fallback" in r)) return setError(r.error)
    await draftByRounds()
  }

  /* Without the jobs table (SQL part 177): drafted in rounds from this sheet, asked again until nothing is left. */
  const draftByRounds = async () => {
    if (!locale) return
    setBusy("ai")
    setError(null)
    let total = 0
    for (let round = 0; round < 12; round++) {
      /* A press is the model's time, up to the route's own window (app/api/store/translations/draft): not the 25s a save is given, after which the browser said "That took too long" while the drafts were still being written. */
      const r = await api<{ drafted: number; left: number }>(`/api/store/translations/draft`, { method: "POST", body: { locale }, timeoutMs: DRAFT_WAIT_MS })
      if (!r.ok) {
        setError(r.error)
        break
      }
      total += r.data.drafted
      setNote(r.data.left ? tt("{total} drafted, {left} to go", { total, left: r.data.left }) : null)
      if (!r.data.left || r.data.drafted === 0) break
    }
    await load(locale)
    setBusy(null)
    setNote(total ? tt("{total} translated and live on your website.", { total }) : tt("Everything is translated."))
  }

  const name = locale ? languageName(locale, activeLocale()) : ""
  /* The bar: the running job's own count once its first round is in, else where the language stands. */
  const shown = jobRunning && job && job.total > 0 ? { done: job.done, total: job.total } : (data?.progress ?? { done: 0, total: 0 })
  const rolled = useRollingNumber(shown.done)
  const shownGroups = (data?.groups ?? [])
    .map((g) => ({ ...g, items: g.items.filter((i) => (filterShown === "review" ? i.review || i.key in edits : filterShown === "edited" ? isEdited(i) || i.key in edits : filterShown === "all" || aiCanDo(i) || (i.status === "draft" && !i.review) || i.key in edits)) }))
    .filter((g) => g.items.length)

  return (
    <Modal
      open={!!locale}
      onClose={onClose}
      wide
      title={tt("Translate to {name}", { name })}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onPublish ? (
            /* One label whatever the state: the switch says on or off, and the footer never changes width under the press (it flipped between "Publish" and "Live on your website", and the buttons beside it jumped). */
            <label className="mr-auto flex min-h-[40px] cursor-pointer select-none items-center gap-2.5 whitespace-nowrap text-[13px] font-medium text-[#1a1a2e] [-webkit-tap-highlight-color:transparent]" data-translate-publish="" data-published={published ? "true" : "false"}>
              <Switch checked={published} onCheckedChange={onPublish} aria-label={tt("Publish {name}", { name })} className="!min-h-0 shrink-0" />
              <span className={cn("transition-colors duration-200", published ? "text-[#1a1a2e]" : "text-[#6b7280]")}>{tt("Live on your website")}</span>
            </label>
          ) : note ? (
            <span className="mr-auto text-[13px] text-[#4b5563]">{note}</span>
          ) : null}
          {drafts.length ? (
            <button type="button" className={BTN_SECONDARY} disabled={!!busy} onClick={() => void save(drafts.map((d) => d.key))}>
              {tt("Approve all ({length})", { length: drafts.length })}
            </button>
          ) : null}
          <button type="button" className={BTN_PRIMARY} disabled={!!busy || pending === 0} onClick={() => void save()} data-save-translations="">
            {busy === "save" ? tt("Saving") : pending ? tt("Save {pending}", { pending }) : tt("Save")}
          </button>
        </div>
      }
    >
      <div className="space-y-4" data-translate-sheet={locale ?? ""}>
        {data && !data.ready ? <Notice tone="amber">{tt("Translations aren't set up yet. Run SQL part 136 in Supabase, then try again.")}</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
        {data ? (
          <div className="space-y-3">
            {jobRunning || (data.progress && data.progress.total > 0) ? (
              <div data-translate-progress={jobRunning ? "running" : ""} className={cn("rounded-xl px-4 py-3.5 transition-colors", jobRunning ? "bg-[#f5f3ff]" : "bg-[#f8f9fa]")}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold tabular-nums text-[#1a1a2e]">
                    {jobRunning ? tt("Translating {done} of {total}", { done: rolled, total: shown.total }) : tt("{done} of {total} translated", { done: rolled, total: shown.total })}
                  </span>
                  <span className="text-[13px] tabular-nums text-[#6b7280]">{shown.total ? `${Math.min(100, Math.round((rolled / shown.total) * 100))}%` : ""}</span>
                </div>
                <TranslateBar done={shown.done} total={shown.total} running={jobRunning} tone={jobRunning ? "violet" : "ink"} className="mt-2.5 bg-white" />
                <p className="mt-2 text-[12.5px] text-[#6b7280]" aria-live="polite">
                  {jobRunning
                    ? job?.error && /^Waiting/.test(job.error)
                      ? tt("Waiting for the translator's allowance. It carries on by itself.")
                      : tt("Runs on Storelib's servers. You can close this or the tab.")
                    : tt("The rest shows in {name}", { name: languageName(locale === defaultLanguage ? "en" : defaultLanguage, activeLocale()) })}
                </p>
              </div>
            ) : null}
            {note && onPublish ? <p className="text-[13px] text-[#4b5563]" aria-live="polite">{note}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              {/* While a job runs the strip above says so: no second, greyed button saying it again. */}
              {!jobRunning && items.some(aiCanDo) ? (
                <button type="button" className={cn(BTN_PRIMARY, "h-10")} onClick={() => void draftWithAi()} disabled={!!busy || jobRunning} data-translate-ai="">
                  {busy === "ai" || jobRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                  {busy === "ai" || jobRunning ? tt("Translating") : tt("Translate the rest")}
                </button>
              ) : null}
              <div className="ml-auto flex items-center gap-1 rounded-lg bg-[#f1f2f4] p-0.5" role="tablist" aria-label={tt("Show")}>
                {/* Needs review only while there is one: the merchant's own translations whose original changed. */}
                {(["todo", ...(reviews.length ? ["review"] : []), ...(edited.length ? ["edited"] : []), "all"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filterShown === f}
                    onClick={() => setFilter(f)}
                    data-translate-filter={f}
                    className={cn("h-8 rounded-md px-3 text-[13px] font-medium transition-colors", filterShown === f ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(17,24,39,0.12)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
                  >
                    {f === "todo" ? (todoCount ? tt("To do ({count})", { count: todoCount }) : tt("To do")) : f === "review" ? tt("Needs review ({count})", { count: reviews.length }) : f === "edited" ? tt("Edited ({count})", { count: edited.length }) : tt("All")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : !error ? (
          /* The sheet's own shape while the texts are read: the bar, then a few rows, never an empty white box. */
          <div aria-busy="true" data-translate-loading="" className="space-y-3">
            <div className="h-4 w-44 rounded-md bg-[#f1f2f4]" />
            <div className="h-1.5 rounded-full bg-[#f1f2f4]" />
            <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]">
              {[0, 1, 2, 3].map((n) => (
                <li key={n} className="space-y-2 px-3.5 py-3">
                  <div className="h-3 w-32 rounded bg-[#f1f2f4]" />
                  <div className="h-3 w-3/4 rounded bg-[#f5f6f7]" />
                  <div className="h-9 rounded-lg bg-[#f7f8f9]" />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data && shownGroups.length === 0 ? <p className="py-6 text-center text-[13.5px] text-[#6b7280]">{items.length ? tt("Everything is translated.") : tt("Your website has no text to translate yet.")}</p> : null}

        {shownGroups.map((g) => (
          <section key={g.id} aria-labelledby={`tr-${g.id}`} className="space-y-2">
            <h3 id={`tr-${g.id}`} className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9ca3af]">
              {g.title}
            </h3>
            <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]">
              {g.items.map((i) => {
                /* Rich text shows its words; untouched, its own formatting is what is saved (save() sends i.value). */
                const value = edits[i.key] ?? (i.rich && /<[a-z][\s\S]*>/i.test(i.value) ? plain(i.value) : i.value)
                const st = STATUS[shownStatus(i)]
                return (
                  <li key={i.key} className="px-3.5 py-3" data-translation={i.key}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[#4b5563]">
                        {i.where !== g.title && i.where ? `${i.where} · ` : ""}
                        {i.label}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-[#6b7280]" data-status={shownStatus(i)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", DOT[st.tone])} aria-hidden="true" />
                        {st.label}
                      </span>
                      {i.review || isEdited(i) ? (
                        /* Storelib AI's translation of this one text in place of the merchant's, only once it has come back (POST /api/store/translations/auto). */
                        <button type="button" className="text-[12.5px] font-medium text-[#4b5563] underline-offset-2 hover:text-[#1a1a2e] hover:underline disabled:opacity-50" disabled={!!busy || rowBusy === i.key} onClick={() => void takeAutomatic(i)} data-use-automatic={i.key}>
                          {rowBusy === i.key ? tt("Translating") : i.review ? tt("Use automatic") : tt("Reset to automatic")}
                        </button>
                      ) : null}
                      {i.status === "draft" || i.review ? (
                        /* A draft approved as it is, or the merchant's own kept as it is for the changed original (saved with it, so it is no longer outdated). */
                        <label className="flex items-center gap-1.5 text-[12.5px] text-[#4b5563]" data-keep-translation={i.review ? i.key : undefined}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[#1a1a2e]"
                            checked={approve.has(i.key)}
                            onChange={(e) =>
                              setApprove((s) => {
                                const n = new Set(s)
                                if (e.target.checked) n.add(i.key)
                                else n.delete(i.key)
                                return n
                              })
                            }
                          />
                          {i.review ? tt("Keep as is") : tt("Approve")}
                        </label>
                      ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <p className="whitespace-pre-wrap break-words rounded-lg bg-[#f8f9fa] px-3 py-2 text-[13px] leading-[19px] text-[#4b5563]">{i.rich ? plain(i.source) : i.source}</p>
                      {i.multiline ? (
                        <textarea
                          value={value}
                          onChange={(e) => setEdits((x) => ({ ...x, [i.key]: e.target.value }))}
                          rows={Math.min(8, Math.max(2, Math.ceil(i.source.length / 60)))}
                          placeholder={tt("In {name}", { name })}
                          aria-label={tt("{label} in {name}", { label: i.label, name })}
                          className="w-full resize-y rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-[16px] leading-6 sm:text-[13.5px] sm:leading-[19px] text-[#1a1a2e] outline-none transition-colors focus:border-[#1a1a2e]"
                        />
                      ) : (
                        <input
                          value={value}
                          onChange={(e) => setEdits((x) => ({ ...x, [i.key]: e.target.value }))}
                          placeholder={tt("In {name}", { name })}
                          aria-label={tt("{label} in {name}", { label: i.label, name })}
                          className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-[16px] text-[#1a1a2e] sm:h-auto sm:min-h-[38px] sm:text-[13.5px] outline-none transition-colors focus:border-[#1a1a2e]"
                        />
                      )}
                    </div>
                    {i.rich ? <p className="mt-1.5 text-[12px] text-[#9ca3af]">{tt("Edited here, it's saved as plain text: a blank line starts a new paragraph.")}</p> : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}

"use client"

/**
 * ===========================================================================
 *  SETTINGS › LANGUAGES
 * ===========================================================================
 * For the store's own website (lib/markets). Simple by default: a website
 * with nothing set here is exactly as it was, one language and the store's
 * own prices. What can be added, in the order a creator meets it:
 *
 *   Languages   the default language, and others the website is offered
 *               in, each published or not, each with "Translate" (the
 *               website's texts, products and collections, by hand or
 *               drafted by AI to review)
 *   Markets     the store's home, and groups of countries that see prices
 *               in their own currency (converted at the day's ECB rate,
 *               with the rounding and adjustment set here), starting in
 *               their own language
 *
 * EASY BY DEFAULT (round AE): every change is saved as it is made (no Save
 * bar to forget), a language is added from a searchable list and opens
 * straight into Translate, publishing is a switch on its row, a market's
 * countries are added a region at a time or searched, and the longer
 * explanations live behind How it works. Saved whole, checked on the
 * server (lib/markets/model validateLocalization); a save the server turns
 * down puts the page back as it was and says why.
 *
 * A market's currency is live on the website: a visitor from one of its
 * countries (or who picks it) sees prices converted at the day's rate on
 * builder and imported themes alike (lib/markets/pricing.ts, live.ts,
 * compat.ts), and checkout says what the card is charged in.
 */
import * as React from "react"
import { Check, ChevronDown, ChevronRight, Ellipsis, Globe2, Plus, Search, Trash2, X } from "lucide-react"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Card, Field, Modal, Notice, Pill, SelectInput, TextInput, Toggle, api, peekGet } from "@/components/physical/ui"
import { REGIONS } from "@/lib/markets/regions"
import { naturalCountry } from "@/lib/markets/market-countries"
import { SITE_LANGUAGE_CODES, baseLanguage, languageFlag, languageName } from "@/lib/markets/locales"
import { CountryFlag } from "./country-picker"
import type { Localization, Market } from "@/lib/markets/model"
import { isEnglish } from "@/lib/markets/translate"
import type { PriceRounding } from "@/lib/markets/money"
import { COUNTRIES, countryName } from "@/lib/checkout/countries"
import { TranslateSheet } from "./translate-sheet"
import { CountryCurrency } from "./country-currency"
import { STORE_CURRENCY_EVENT } from "@/lib/store/currency-context"
import { activeLocale, tt, ttx } from "@/lib/i18n/text"
import { chargeableCurrency } from "@/lib/markets/checkout-charge"
import { startTranslation, useTranslationJobs } from "./translation-jobs-store"
import { TranslateBar, useRollingNumber } from "./translate-progress"

/** "Waiting for the translator's allowance…" without the provider's own words, which are kept for the failure line. */
const waitingLine = (error: string) => (/^Waiting/.test(error) ? tt("Waiting for the translator's allowance. It carries on by itself.") : null)

function RollingCount({ done, total }: { done: number; total: number }) {
  return <>{tt("{done} of {total} texts", { done: useRollingNumber(done), total })}</>
}

const PATH = "/api/store/markets"

interface Loaded {
  ready: boolean
  localization: Localization
  /** Translate changes automatically: its last run (lib/markets/auto-translate.ts), whether changes are waiting for the next, and whether Storelib AI is on for this deployment. */
  autoTranslate?: { run: AutoRun | null; available: boolean }
  baseCurrency: string
  /** The store's own country (Store currency): it always sees the store currency, so no extra currency holds it. */
  homeCountry?: string | null
  chargeCurrency: string
  fx: { asOf: string; fresh: boolean; currencies: string[]; rates?: Record<string, number> } | null
}

const ROUNDING_LABEL: Record<PriceRounding, string> = {
  get none() { return tt("As converted") },
  get whole() { return tt("Up to a whole number") },
  get nine_nine() { return tt("Ending in .99") },
}

/** "French · Français", "Französisch · Français": the creator's word for it, in the dashboard's language, and the visitor's. */
function languageLabel(code: string): string {
  const mine = languageName(code, activeLocale())
  const own = languageName(code)
  return mine === own ? mine : `${mine} · ${own}`
}

/** The market every store starts with is named "Home" in its data; it reads in the dashboard's language until the creator renames it. */
const marketName = (m: { name: string; primary?: boolean }) => (m.primary && m.name.trim().toLowerCase() === "home" ? ttx("market", "Home") : m.name)

type AutoRun = { at: string; translated: number; left: number; error?: string; pending?: boolean }

/** Where automatic translation stands, in one line under its switch: up to date, working, or the translator out of reach. */
function autoTranslateLine(run: AutoRun | null): { text: string; state: "error" | "working" | "left" | "done" } | null {
  if (!run) return null
  const when = run.at ? new Date(run.at) : null
  const at = when && !Number.isNaN(when.getTime()) ? when.toLocaleString(activeLocale(), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""
  if (run.error) return { text: tt("The translator couldn't be reached. It tries again in a few minutes."), state: "error" }
  if (run.pending) return { text: run.left > 0 ? tt("{left} waiting, translating now", { left: run.left }) : tt("Translating your latest changes"), state: "working" }
  if (run.left > 0) return { text: tt("{left} left for the next run", { left: run.left }), state: "left" }
  return { text: at ? tt("Up to date, checked {at}", { at }) : tt("Up to date"), state: "done" }
}

/**
 * Under the switch: where it stands, and the merchant's own translations
 * whose original changed since (lib/markets/translate.ts needsReview). Those
 * stay live and are never replaced, so they are the merchant's to look at.
 */
function AutoTranslateStatus({ run, review, onReview }: { run: AutoRun | null; review: number; onReview: () => void }) {
  const line = autoTranslateLine(run)
  if (!line && review === 0) return null
  return (
    <div className="mt-2 space-y-1.5 text-[12.5px] leading-[18px]">
      {line ? (
        <p className={line.state === "error" ? "text-[#b45309]" : "text-[#6b7280]"} data-auto-translate-run={line.state}>
          {line.text}
        </p>
      ) : null}
      {review > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 text-[#b45309]" data-auto-translate-review={review}>
          <span>{review === 1 ? tt("1 of your translations needs a look because the original changed.") : tt("{count} of your translations need a look because the original changed.", { count: review })}</span>
          <button type="button" className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline" onClick={onReview} data-review-translations="">
            {tt("Review")}
          </button>
        </p>
      ) : null}
    </div>
  )
}

export function MarketsPanel() {
  const [data, setData] = React.useState<Loaded | null>(() => peekGet<Loaded>(PATH))
  const [draft, setDraft] = React.useState<Localization | null>(() => peekGet<Loaded>(PATH)?.localization ?? null)
  const [error, setError] = React.useState<string | null>(null)
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle")
  const [picking, setPicking] = React.useState(false)
  const [editing, setEditing] = React.useState<Market | "new" | null>(null)
  const [translating, setTranslating] = React.useState<string | null>(null)
  /* Opened from a Needs review count: the sheet starts on those. */
  const [sheetFocus, setSheetFocus] = React.useState<"review" | null>(null)
  const reviewLanguage = (code: string) => {
    setSheetFocus("review")
    setTranslating(code)
  }
  /* A language just picked, while its save is on its way: Translate waits for it. */
  const [adding, setAdding] = React.useState<string | null>(null)
  const savedRef = React.useRef<Localization | null>(draft)
  const queue = React.useRef<Promise<void>>(Promise.resolve())
  /* Each added language's texts: translated and live, drafted to review, still to do (/api/store/translations?summary=1). */
  const [progress, setProgress] = React.useState<Record<string, { done: number; draft: number; todo: number; review?: number; total: number }> | null>(null)
  /* A translation running now, by language: how far it is, or why it stopped. */
  const [drafting, setDrafting] = React.useState<Record<string, { state: "running"; done: number; total: number } | { state: "error"; message: string }>>({})

  /* The language the website's text is actually written in (lib/markets/detect-language.ts), when it can be told. */
  const [writtenIn, setWrittenIn] = React.useState<string | null>(null)
  const loadProgress = React.useCallback(async () => {
    const r = await api<{ progress: Record<string, { done: number; draft: number; todo: number; review?: number; total: number }>; writtenIn?: string | null }>("/api/store/translations?summary=1")
    if (r.ok) {
      setProgress(r.data.progress)
      setWrittenIn(r.data.writtenIn ?? null)
    }
  }, [])
  React.useEffect(() => {
    void loadProgress()
  }, [loadProgress])

  /*
    TRANSLATE WITH AI, ON THE SERVER (./translation-jobs-store.ts): the job
    goes on whatever this page does, and its row shows how many texts are
    translated out of all of them, read from the job itself. Closing
    Settings or refreshing shows the same row. A finished job reads the
    language's counts again.
  */
  const { jobs } = useTranslationJobs()
  const jobStates = JSON.stringify(Object.values(jobs).map((j) => [j.locale, j.status]))
  const lastStates = React.useRef(jobStates)
  React.useEffect(() => {
    if (lastStates.current !== jobStates) void loadProgress()
    lastStates.current = jobStates
  }, [jobStates, loadProgress])
  const translateWithAi = async (code: string) => {
    setDrafting((d) => {
      const next = { ...d }
      delete next[code]
      return next
    })
    const r = await startTranslation(code)
    if (r.ok) return
    if ("fallback" in r) return translateByRounds(code)
    setDrafting((d) => ({ ...d, [code]: { state: "error", message: r.error } }))
  }
  /* Without the jobs table (SQL part 177): the drafts in rounds from this page, as before, with the count on the row. */
  const translateByRounds = async (code: string) => {
    const before = progress?.[code]
    let total = before ? before.total : 0
    let done = before ? before.done + before.draft : 0
    setDrafting((d) => ({ ...d, [code]: { state: "running", done, total } }))
    for (let press = 0; press < 12; press++) {
      const r = await api<{ drafted: number; left: number }>("/api/store/translations/draft", { method: "POST", body: { locale: code }, timeoutMs: 110_000 })
      if (!r.ok) {
        setDrafting((d) => ({ ...d, [code]: { state: "error", message: r.error } }))
        void loadProgress()
        return
      }
      done += r.data.drafted
      total = Math.max(total, done + r.data.left)
      setDrafting((d) => ({ ...d, [code]: { state: "running", done, total } }))
      if (!r.data.left || r.data.drafted === 0) break
    }
    setDrafting((d) => {
      const next = { ...d }
      delete next[code]
      return next
    })
    void loadProgress()
  }

  React.useEffect(() => {
    const read = () =>
      void api<Loaded>(PATH, { method: "GET" }).then((r) => {
        if (r.ok) {
          setData(r.data)
          setDraft(r.data.localization)
          savedRef.current = r.data.localization
        } else setError(r.error)
      })
    read()
    /* The store's currency changed in the card above: the extra currencies are converted from it, so they are read again. */
    window.addEventListener(STORE_CURRENCY_EVENT, read)
    return () => window.removeEventListener(STORE_CURRENCY_EVENT, read)
  }, [])

  /* SAVED AS IT IS MADE: one at a time, in order; a refusal puts back what was saved last and says why. */
  const commit = (next: Localization): Promise<boolean> => {
    setDraft(next)
    setError(null)
    setState("saving")
    let landed = false
    queue.current = queue.current.then(async () => {
      const r = await api<{ localization: Localization }>(PATH, { method: "PUT", body: { localization: next } })
      if (!r.ok) {
        setError(r.error)
        setDraft(savedRef.current)
        setState("idle")
        return
      }
      landed = true
      savedRef.current = r.data.localization
      setDraft(r.data.localization)
      setData((d) => (d ? { ...d, localization: r.data.localization } : d))
      setState("saved")
      window.setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1600)
    })
    return queue.current.then(() => landed)
  }

  if (!data || !draft) {
    return (
      <div className="space-y-4 sm:space-y-6" data-markets-panel="" aria-busy={!error}>
        <CountryCurrency />
        <Card title={tt("Languages")} description={tt("Your website in more languages.")}>
          {error ? (
            <Notice>{error}</Notice>
          ) : (
            /* The list's own shape while it is read: a row for the website's language, never an empty box. */
            <div className="overflow-hidden rounded-xl border border-[#eceef1]" data-languages-loading="">
              <div className="flex items-center gap-3 px-3.5 py-3">
                <span className="h-8 w-8 shrink-0 rounded-full bg-[#f1f2f4]" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-3.5 w-28 rounded bg-[#f1f2f4]" />
                  <span className="block h-3 w-40 rounded bg-[#f5f6f7]" />
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>
    )
  }

  /* The default language translated from the language the website is written in (lib/markets/detect-language.ts), with its own progress like any other. */
  const translateDefault = !!writtenIn && baseLanguage(writtenIn) !== baseLanguage(draft.defaultLanguage)
  const defaultProgress = progress?.[draft.defaultLanguage] ?? null
  const defaultJob = jobs[draft.defaultLanguage]
  const defaultRun = drafting[draft.defaultLanguage] ?? (defaultJob?.status === "running" ? { state: "running" as const, done: defaultJob.total ? defaultJob.done : (defaultProgress ? defaultProgress.done + defaultProgress.draft : 0), total: defaultJob.total || defaultProgress?.total || 0 } : defaultJob?.status === "failed" && defaultJob.error ? { state: "error" as const, message: defaultJob.error } : null)
  const used = new Set([draft.defaultLanguage, ...draft.languages.map((l) => l.code)])
  const offer = SITE_LANGUAGE_CODES.filter((c) => !used.has(c))
  const home = draft.markets.find((m) => m.primary)
  const status = state === "saving" ? tt("Saving") : state === "saved" ? tt("Saved") : null
  const setPublished = (code: string, published: boolean) => commit({ ...draft, languages: draft.languages.map((x) => (x.code === code ? { ...x, published } : x)) })

  return (
    <div className="space-y-4 sm:space-y-6" data-markets-panel="">
      {!data.ready ? <Notice tone="amber">{tt("Languages aren't set up yet. Run SQL part 136 in Supabase, then come back here.")}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}

      {/* ONE CURRENCY FOR EVERYTHING: the store's prices, its website, the builder's canvas and checkout. The currencies below are extra ones a visitor can switch to. */}
      <CountryCurrency />

      <Card
        title={tt("Languages")}
        help="languages"
        description={tt("Your website in more languages, each at its own address like /fr.")}
        action={status ? <span className="text-[12.5px] text-[#6b7280]" aria-live="polite" data-markets-status="">{status}</span> : null}
      >
        <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-languages="">
          <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3" data-language-default={draft.defaultLanguage}>
            <LanguageBadge code={draft.defaultLanguage} />
            <span className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
              <span className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium text-[#1a1a2e]">{languageLabel(draft.defaultLanguage)}</span>
                <Pill tone="gray">{tt("Default")}</Pill>
              </span>
              <span className="block text-[12.5px] text-[#6b7280]" data-language-progress="">
                {defaultRun?.state === "running" ? (
                  <RollingCount done={defaultRun.done} total={defaultRun.total} />
                ) : translateDefault && writtenIn ? (
                  [tt("Translated from {written}", { written: languageName(writtenIn, activeLocale()) }), defaultProgress ? tt("{done} of {total} translated", { done: defaultProgress.done + defaultProgress.draft, total: defaultProgress.total }) : null].filter(Boolean).join(" · ")
                ) : (
                  tt("Your website as it is written")
                )}
              </span>
            </span>
            {/*
              THE DEFAULT LANGUAGE, TRANSLATED. Written in another language
              (an English theme on a Spanish store): every text is translated
              into it, in the background, and the website shows it. Written in
              it, and not English: only the cart's and checkout's built-in
              words, which Storelib writes in English.
            */}
            {defaultRun?.state === "running" ? null : translateDefault && defaultProgress && defaultProgress.todo > 0 ? (
              <button type="button" className={cn(BTN_PRIMARY, "ml-12 h-9 px-3 sm:ml-0")} onClick={() => void translateWithAi(draft.defaultLanguage)} data-start-translation={draft.defaultLanguage}>
                {tt("Translate")}
              </button>
            ) : translateDefault || !isEnglish(draft.defaultLanguage) ? (
              <button type="button" className={cn(BTN_SECONDARY, "ml-12 h-9 px-3 sm:ml-0")} onClick={() => setTranslating(draft.defaultLanguage)} data-translate-language={draft.defaultLanguage}>
                {translateDefault ? tt("Review") : tt("Translate")}
              </button>
            ) : null}
            <label className="relative ml-12 inline-flex sm:ml-0">
              <span className="sr-only">{tt("Default language")}</span>
              <select
                value={draft.defaultLanguage}
                onChange={(e) => {
                  const v = e.target.value
                  commit({ ...draft, defaultLanguage: v, languages: draft.languages.filter((l) => l.code !== v) })
                }}
                className="h-9 cursor-pointer appearance-none rounded-lg border border-[#e5e7eb] bg-white pl-3 pr-8 text-[13px] font-medium text-[#1a1a2e] outline-none hover:border-[#d1d5db] focus-visible:border-[#1a1a2e]"
              >
                {[...new Set([draft.defaultLanguage, ...SITE_LANGUAGE_CODES])].map((c) => (
                  <option key={c} value={c}>
                    {languageName(c, activeLocale())}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]" />
            </label>
            {defaultRun?.state === "running" ? (
              <div className="basis-full pl-12">
                <TranslateBar done={defaultRun.done} total={defaultRun.total} running label={tt("Translating {name}", { name: languageName(draft.defaultLanguage, activeLocale()) })} className="h-1" />
              </div>
            ) : defaultRun?.state === "error" ? (
              <p className="basis-full pl-12 text-[12.5px] leading-[18px] text-[#b45309]" data-language-error="">{defaultRun.message}</p>
            ) : null}
          </li>
          {draft.languages.map((l) => {
            const p = progress?.[l.code] ?? null
            const job = jobs[l.code]
            /* The job's own count once its first round is in; before it, where the language stood. */
            /* A running job may be waiting for the translator's allowance: its note is said under the bar, and it carries on by itself. */
            const fromJob = job?.status === "running" ? { state: "running" as const, done: job.total ? job.done : (p ? p.done + p.draft : 0), total: job.total || p?.total || 0, waiting: job.error ? waitingLine(job.error) : null } : job?.status === "failed" && job.error ? { state: "error" as const, message: job.error } : null
            const run = drafting[l.code] ?? fromJob
            const name = languageName(l.code, activeLocale())
            const menu: ActionMenuItem[] = [
              { label: tt("Review and edit"), onClick: () => setTranslating(l.code) },
              ...(p && p.todo > 0 && !(run && run.state === "running") ? [{ label: tt("Translate the rest"), onClick: () => void translateWithAi(l.code) }] : []),
              { label: l.published ? tt("Unpublish") : tt("Publish"), onClick: () => setPublished(l.code, !l.published) },
              {
                label: tt("Remove"),
                variant: "destructive" as const,
                separatorBefore: true,
                onClick: () => {
                  if (!window.confirm(tt("Remove {name}? Its translations are kept, in case you add it again.", { name }))) return
                  commit({ ...draft, languages: draft.languages.filter((x) => x.code !== l.code), markets: draft.markets.map((m) => (m.language === l.code ? { ...m, language: null } : m)) })
                },
              },
            ]
            return (
              <li key={l.code} className="px-3.5 py-3" data-language={l.code} data-language-state={run?.state === "running" ? "translating" : l.published ? "published" : "hidden"}>
                <div className="flex items-center gap-3">
                  <LanguageBadge code={l.code} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-[#1a1a2e]">{languageLabel(l.code)}</span>
                      {run?.state === "running" ? <Pill tone="blue">{tt("Translating")}</Pill> : l.published ? <Pill tone="green">{tt("Published")}</Pill> : <Pill tone="gray">{tt("Hidden")}</Pill>}
                    </span>
                    <span className="block truncate text-[12.5px] leading-[18px] text-[#6b7280]" data-language-progress="">
                      {run?.state === "running"
                        ? <RollingCount done={run.done} total={run.total} />
                        : p
                          ? [
                              `/${l.code.toLowerCase()}`,
                              tt("{done} of {total} translated", { done: p.done, total: p.total }),
                              p.draft > 0 ? tt("{count} to review", { count: p.draft }) : null,
                              /* The merchant's own, its original changed since: still live, theirs to look at (translate.ts needsReview). */
                              p.review ? tt("{count} need a look", { count: p.review }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : `/${l.code.toLowerCase()}`}
                    </span>
                  </span>
                  {/* The next step, by where it is: drafts waiting to be read, or a language ready to go live. Everything else is in the menu. */}
                  {run?.state === "running" ? null : p && (p.draft > 0 || (p.review ?? 0) > 0) ? (
                    <button type="button" className={cn(BTN_SECONDARY, "h-9 shrink-0 px-3")} onClick={() => (p.draft > 0 ? setTranslating(l.code) : reviewLanguage(l.code))} data-translate-language={l.code}>
                      {tt("Review")}
                    </button>
                  ) : !l.published && p && p.done > 0 ? (
                    <button type="button" className={cn(BTN_PRIMARY, "h-9 shrink-0 px-3")} onClick={() => setPublished(l.code, true)} data-publish-language={l.code}>
                      {tt("Publish")}
                    </button>
                  ) : p && p.done === 0 && p.todo > 0 ? (
                    /* Nothing translated yet (AI stopped, or it was added without it): start it, by AI where it is on, else by hand. */
                    <button
                      type="button"
                      className={cn(BTN_SECONDARY, "h-9 shrink-0 px-3")}
                      onClick={() => (data.autoTranslate?.available === false ? setTranslating(l.code) : void translateWithAi(l.code))}
                      data-start-translation={l.code}
                    >
                      {tt("Translate")}
                    </button>
                  ) : null}
                  <ResponsiveActionMenu
                    title={name}
                    items={menu}
                    trigger={
                      <button type="button" aria-label={tt("More for {name}", { name })} className={cn(BTN_GHOST, "w-9 shrink-0 px-0 text-[#6b7280]")} data-language-menu={l.code}>
                        <Ellipsis className="h-4 w-4" />
                      </button>
                    }
                  />
                </div>
                {run?.state === "running" ? (
                  <div className="ml-12 mt-2">
                    <TranslateBar done={run.done} total={run.total} running label={tt("Translating {name}", { name })} className="h-1" />
                    {(run as { waiting?: string | null }).waiting ? <p className="mt-1.5 text-[12.5px] leading-[18px] text-[#6b7280]" data-language-waiting="">{(run as { waiting?: string | null }).waiting}</p> : null}
                  </div>
                ) : run?.state === "error" ? (
                  <p className="ml-12 mt-1.5 flex flex-wrap items-center gap-x-2 text-[12.5px] leading-[18px] text-[#b45309]" data-language-error="">
                    <span>{run.message}</span>
                    <button type="button" className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline" onClick={() => void translateWithAi(l.code)}>
                      {tt("Try again")}
                    </button>
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
        <button type="button" className={cn(BTN_SECONDARY, "mt-3")} onClick={() => setPicking(true)} disabled={!data.ready} data-add-language="">
          <Plus className="h-4 w-4" />
          {tt("Add language")}
        </button>
        {/* The two switches most stores never touch, folded away (both saved as they are switched, like the rest). */}
        <details className="group mt-4 border-t border-[#f1f2f4] pt-3" data-language-options="" open={draft.visitorLanguage === true || draft.autoTranslate === true ? true : undefined}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13.5px] font-medium text-[#1a1a2e] [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="h-4 w-4 text-[#6b7280] transition-transform group-open:rotate-90" />
            {tt("More options")}
          </summary>
          {/* Show visitors their own language (lib/markets/visitor-language.ts). */}
          <div className="mt-3" data-visitor-language="">
            <Toggle
              id="visitor-language"
              label={tt("Show visitors their own language")}
              description={
                draft.languages.some((l) => l.published)
                  ? tt("A first visit opens in the language the visitor's browser asks for, once, on your website and your storelib.com page. A close match gets a small offer instead.")
                  : tt("Works once a language is published: a first visit opens in the language the visitor's browser asks for.")
              }
              checked={draft.visitorLanguage === true}
              disabled={!data.ready}
              onChange={(v) => commit({ ...draft, visitorLanguage: v })}
            />
          </div>
          {/* Translate changes automatically (lib/markets/auto-translate.ts). */}
          <div className="mt-4 border-t border-[#f1f2f4] pt-4" data-auto-translate="">
            <Toggle
              id="auto-translate"
              label={tt("Translate changes automatically")}
              description={
                data.autoTranslate?.available === false
                  ? tt("Automatic translation isn't set up on Storelib yet. You can still write each translation yourself.")
                  : draft.languages.length === 0
                    ? tt("Works once you add a language. When you publish changes, new and edited text is translated within a few minutes.")
                    : tt("When you publish changes, new and edited text is translated into your other languages within a few minutes. Translations you edit yourself are never replaced.")
              }
              checked={draft.autoTranslate === true}
              disabled={!data.ready || (data.autoTranslate?.available === false && draft.autoTranslate !== true)}
              onChange={(v) => commit({ ...draft, autoTranslate: v })}
            />
            {draft.autoTranslate ? (
              <AutoTranslateStatus
                run={data.autoTranslate?.run ?? null}
                review={Object.values(progress ?? {}).reduce((n, p) => n + (p.review ?? 0), 0)}
                onReview={() => {
                  const first = Object.entries(progress ?? {}).find(([, p]) => (p.review ?? 0) > 0)?.[0]
                  if (first) reviewLanguage(first)
                }}
              />
            ) : null}
          </div>
        </details>
      </Card>

      {/* Optional: prices in a visitor's own currency, and checkout charges it (lib/markets/checkout-charge); one Storelib cannot charge is shown only. */}
      <Card
        title={tt("More currencies")}
        help="markets"
        description={tt("Optional. Visitors in the countries you list see prices in that currency and pay in it. Everyone else sees {currency}. Anyone can switch with your website's currency selector.", { currency: data.baseCurrency })}
      >
        {draft.markets.some((m) => !m.primary) ? (
          <ul className="mb-3 divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-markets="">
            {draft.markets
              .filter((m) => !m.primary)
              .map((m) => (
                <li key={m.id} data-market={m.id}>
                  <button type="button" onClick={() => setEditing(m)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#fafafb] active:bg-[#f3f4f6] [-webkit-tap-highlight-color:transparent]">
                    <span aria-hidden className="flex w-7 shrink-0 justify-center">
                      {!m.rest && m.countries.length ? <CountryFlag code={naturalCountry(m.currency, m.countries) ?? m.countries[0]} className="h-[16px] w-[24px]" /> : <Globe2 className="h-[18px] w-[18px] text-[#6b7280]" strokeWidth={1.8} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      {/* "BRL · Brazil", "EUR · Germany and 3 more", "BRL · All other countries": the currency and where it is seen, in one line. */}
                      <span className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
                        <span className="truncate" data-market-summary="">{`${m.currency ?? data.baseCurrency} · ${marketWhere(m)}`}</span>
                        {!m.active ? <Pill tone="gray">{tt("Off")}</Pill> : null}
                      </span>
                      {m.language || (m.currency && m.currency !== data.chargeCurrency && !chargeableCurrency(m.currency)) ? (
                        <span className="block truncate text-[12.5px] leading-[18px] text-[#6b7280]">
                          {[m.language ? languageName(m.language, activeLocale()) : null, m.currency && m.currency !== data.chargeCurrency && !chargeableCurrency(m.currency) ? tt("Shown only, paid in {currency}", { currency: data.chargeCurrency }) : null].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={BTN_SECONDARY} onClick={() => setEditing("new")} disabled={!data.ready} data-add-market="">
            <Plus className="h-4 w-4" />
            {tt("Add a currency")}
          </button>
          {draft.markets.some((m) => !m.primary) ? (
            <span className="text-[12.5px] text-[#6b7280]" data-fx={data.fx ? (data.fx.fresh ? "fresh" : "old") : "none"}>
              {data.fx ? (data.fx.fresh ? tt("Rates from {asOf}", { asOf: data.fx.asOf }) : tt("Rates from {asOf} are too old: your own prices show", { asOf: data.fx.asOf })) : tt("Exchange rates aren't in yet: your own prices show")}
            </span>
          ) : null}
        </div>
        {home ? null : <Notice tone="amber" className="mt-3">{tt("Choose one market as your home.")}</Notice>}
      </Card>

      <LanguagePicker
        open={picking}
        options={offer}
        onClose={() => setPicking(false)}
        onPick={(code) => {
          setPicking(false)
          /*
            Saved first, then translated: the server only knows the language
            once the save has landed (it used to answer "Your website has no
            text to translate yet" to a read made in the same moment). Then
            Storelib AI translates it, with its progress on the row; without
            AI, straight into translating by hand.
          */
          setAdding(code)
          void commit({ ...draft, languages: [...draft.languages, { code, published: false }] }).then((ok) => {
            setAdding(null)
            if (!ok) return
            if (data.autoTranslate?.available === false) setTranslating(code)
            else void translateWithAi(code)
          })
        }}
      />
      <MarketEditor
        market={editing}
        localization={draft}
        baseCurrency={data.baseCurrency}
        homeCountry={data.homeCountry ?? draft.markets.find((x) => x.primary)?.countries[0] ?? null}
        chargeCurrency={data.chargeCurrency}
        currencies={data.fx?.currencies ?? []}
        rates={data.fx?.fresh ? data.fx.rates ?? null : null}
        onClose={() => setEditing(null)}
        onRemove={(id) => {
          setEditing(null)
          commit({ ...draft, markets: draft.markets.filter((x) => x.id !== id) })
        }}
        onDone={(m) => {
          const taken = new Set(draft.markets.filter((x) => x.id !== m.id).flatMap((x) => x.countries))
          const clean = { ...m, countries: m.countries.filter((c) => !taken.has(c)) }
          setEditing(null)
          commit({ ...draft, markets: draft.markets.some((x) => x.id === m.id) ? draft.markets.map((x) => (x.id === m.id ? clean : x)) : [...draft.markets, clean] })
        }}
      />
      <TranslateSheet
        locale={translating}
        focus={sheetFocus}
        waiting={!!translating && adding === translating}
        defaultLanguage={draft.defaultLanguage}
        published={!!draft.languages.find((l) => l.code === translating)?.published}
        /* The website's own language has no publish switch: it is always live. */
        onPublish={translating && translating !== draft.defaultLanguage ? (v) => setPublished(translating, v) : undefined}
        onClose={() => {
          setTranslating(null)
          setSheetFocus(null)
          /* What was approved or drafted there shows on its row. */
          void loadProgress()
        }}
      />
    </div>
  )
}

/**
 * A language's flag (lib/markets/locales languageFlag), from the same one cached sprite every country list draws from,
 * on a quiet tile the size the letters had, so a row never changes height. The letters for a language with no flag.
 */
function LanguageBadge({ code }: { code: string }) {
  const flag = languageFlag(code)
  if (!flag) {
    return (
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[12px] font-semibold uppercase tracking-wide text-[#4b5563]">
        {code.slice(0, 2)}
      </span>
    )
  }
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#e5e7eb]/70 bg-[#f8f9fa]" data-language-flag={flag}>
      <CountryFlag code={flag} className="h-[16px] w-[24px]" />
    </span>
  )
}

/** Every language that can be added, searchable, each in its own words too. A bottom sheet on a phone. */
function LanguagePicker({ open, options, onClose, onPick }: { open: boolean; options: string[]; onClose: () => void; onPick: (code: string) => void }) {
  const [query, setQuery] = React.useState("")
  React.useEffect(() => {
    if (open) setQuery("")
  }, [open])
  const q = query.trim().toLowerCase()
  const shown = options.filter((c) => !q || languageName(c, activeLocale()).toLowerCase().includes(q) || languageName(c, "en").toLowerCase().includes(q) || languageName(c).toLowerCase().includes(q) || c.toLowerCase() === q)
  return (
    <Modal open={open} onClose={onClose} title={tt("Add a language")}>
      <div className="space-y-3" data-language-picker="">
        <label className="relative block">
          <span className="sr-only">{tt("Search languages")}</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search languages")} className="pl-9" />
        </label>
        <ul className="-mx-1 max-h-[min(420px,55vh)] overflow-y-auto overscroll-contain">
          {shown.map((c) => (
            <li key={c}>
              <button type="button" onClick={() => onPick(c)} className="flex h-11 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-[#f8f9fa] active:bg-[#f3f4f6]" data-pick-language={c}>
                <LanguageBadge code={c} />
                <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">
                  <span className="font-medium">{languageName(c, activeLocale())}</span>
                  {languageName(c) !== languageName(c, activeLocale()) ? <span className="text-[#6b7280]"> · {languageName(c)}</span> : null}
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 ? <li className="px-2 py-6 text-center text-[13.5px] text-[#6b7280]">{tt("No language matches.")}</li> : null}
        </ul>
      </div>
    </Modal>
  )
}

/** Where an extra currency is seen, in a few words: "Brazil", "Germany and France", "Germany and 3 more", "All other countries". */
function marketWhere(m: Market): string {
  if (m.rest) return tt("All other countries")
  if (m.countries.length === 0) return tt("No countries yet")
  const first = naturalCountry(m.currency, m.countries) ?? m.countries[0]
  const rest = m.countries.filter((c) => c !== first)
  if (rest.length === 0) return countryName(first)
  if (rest.length === 1) return tt("{first} and {second}", { first: countryName(first), second: countryName(rest[0]) })
  return tt("{first} and {count} more", { first: countryName(first), count: rest.length })
}

/** One market: its name, its countries (a region at a time, or searched), its currency and language; rounding and adjustment folded away. */
function MarketEditor({
  market,
  localization,
  baseCurrency,
  homeCountry,
  chargeCurrency,
  currencies,
  rates,
  onClose,
  onDone,
  onRemove,
}: {
  market: Market | "new" | null
  localization: Localization
  baseCurrency: string
  /** The store's own country: never in an extra currency, shown disabled with why. */
  homeCountry: string | null
  chargeCurrency: string
  currencies: string[]
  /** The day's rates per euro, for the exchange rate field's hint; null when they are not in. */
  rates?: Record<string, number> | null
  onClose: () => void
  onDone: (m: Market) => void
  onRemove: (id: string) => void
}) {
  const fresh = React.useCallback(
    (): Market =>
      market && market !== "new"
        ? market
        : { id: `m${Date.now().toString(36)}`, name: "", countries: [], currency: null, language: null, active: true, primary: false, rounding: "none", adjustBps: 0 },
    [market],
  )
  const [m, setM] = React.useState<Market>(fresh)
  const [query, setQuery] = React.useState("")
  const [more, setMore] = React.useState(false)
  /* The exchange rate as typed ("0.2", "0,2"), kept as text so a half typed number is not lost. */
  const [rateText, setRateText] = React.useState("")
  React.useEffect(() => {
    if (market) {
      const next = fresh()
      setM(next)
      setQuery("")
      setRateText(typeof next.rate === "number" ? String(next.rate) : "")
      setMore(next.rounding !== "none" || next.adjustBps !== 0 || typeof next.rate === "number")
    }
  }, [market, fresh])
  /* Today's rate, 1 of the store's currency in this market's, as the field's hint (per euro, as the ECB writes them). */
  const perEuro = (c: string) => (c === "EUR" ? 1 : rates?.[c] ?? null)
  const todays = m.currency && perEuro(baseCurrency) && perEuro(m.currency) ? Number((perEuro(m.currency)! / perEuro(baseCurrency)!).toPrecision(4)) : null
  const elsewhere = new Map(localization.markets.filter((x) => x.id !== m.id).flatMap((x) => x.countries.map((c) => [c, x.name] as const)))
  /* The store's own country sees the store currency, always (lib/markets/market-countries.ts). */
  if (homeCountry && !m.primary) elsewhere.set(homeCountry, "")
  /* Another currency already for all other countries: this one picks its countries. */
  const restElsewhere = localization.markets.find((x) => x.id !== m.id && !x.primary && x.rest)
  const q = query.trim().toLowerCase()
  const shown = q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q) : []
  const toggle = (code: string) => setM((x) => ({ ...x, countries: x.countries.includes(code) ? x.countries.filter((c) => c !== code) : [...x.countries, code] }))
  const addRegion = (codes: readonly string[]) => setM((x) => ({ ...x, countries: [...new Set([...x.countries, ...codes.filter((c) => !elsewhere.has(c) && COUNTRIES.some((k) => k.code === c))])] }))
  const regionFull = (codes: readonly string[]) => codes.filter((c) => !elsewhere.has(c) && COUNTRIES.some((k) => k.code === c)).every((c) => m.countries.includes(c))
  const languages = [localization.defaultLanguage, ...localization.languages.map((l) => l.code)]
  const existing = market && market !== "new" && !market.primary
  return (
    <Modal
      open={market !== null}
      onClose={onClose}
      wide
      title={market === "new" ? tt("Add a currency") : tt("Edit {value}", { value: marketName(m) || tt("market") })}
      footer={
        <div className="flex items-center gap-2">
          {existing ? (
            <button
              type="button"
              className={cn(BTN_GHOST, "mr-auto text-[#6b7280]")}
              onClick={() => {
                if (window.confirm(tt("Remove {value}? Its countries go back to your home market.", { value: m.name || tt("this market") }))) onRemove(m.id)
              }}
              data-remove-market=""
            >
              <Trash2 className="h-4 w-4" />
              {tt("Remove")}
            </button>
          ) : null}
          <button type="button" className={cn(BTN_SECONDARY, !existing && "ml-auto")} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={!m.name.trim() || (!m.primary && !m.rest && m.countries.length === 0)} onClick={() => onDone(m.rest ? { ...m, name: m.name.trim(), countries: [] } : { ...m, name: m.name.trim() })}>
            {market === "new" ? tt("Add a currency") : tt("Done")}
          </button>
        </div>
      }
    >
      <div className="space-y-5" data-market-editor="">
        <Field label={tt("Name")}>
          <TextInput value={m.name} onChange={(e) => setM({ ...m, name: e.target.value.slice(0, 60) })} placeholder={tt("Europe")} maxLength={60} />
        </Field>

        {!m.primary ? (
          <div className="space-y-3">
            <p className="text-[13.5px] font-medium text-[#1a1a2e]">{tt("Countries")}</p>
            {/* WHO SEES IT: a list, or everyone else in one choice, instead of ticking 239 countries (the owner). */}
            <div role="radiogroup" aria-label={tt("Countries")} className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-market-scope="">
              {[
                { rest: false, label: tt("Countries you pick"), hint: null as string | null },
                {
                  rest: true,
                  label: tt("All other countries"),
                  hint: restElsewhere
                    ? tt("{name} is already for all other countries.", { name: restElsewhere.currency ?? restElsewhere.name })
                    : homeCountry
                      ? tt("Every country except {country} and the ones in your other currencies.", { country: countryName(homeCountry) })
                      : tt("Every country not in your other currencies."),
                },
              ].map((o) => {
                const on = !!m.rest === o.rest
                const off = o.rest && !!restElsewhere && !m.rest
                return (
                  <button
                    key={String(o.rest)}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={off}
                    onClick={() => setM((x) => ({ ...x, rest: o.rest || undefined }))}
                    className={cn("flex w-full items-start gap-3 px-3.5 py-3 text-left", off ? "cursor-not-allowed opacity-50" : "hover:bg-[#fafafb]")}
                    data-scope={o.rest ? "rest" : "pick"}
                  >
                    <span aria-hidden className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-[#1a1a2e]" : "border-[#d1d5db]")}>
                      {on ? <span className="h-2 w-2 rounded-full bg-[#1a1a2e]" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] text-[#1a1a2e]">{o.label}</span>
                      {o.hint ? <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{o.hint}</span> : null}
                    </span>
                  </button>
                )
              })}
            </div>
            {m.rest ? null : (
            <>
            <div className="flex flex-wrap gap-1.5" data-market-regions="">
              {REGIONS.map((r) => {
                const full = regionFull(r.countries)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => (full ? setM((x) => ({ ...x, countries: x.countries.filter((c) => !r.countries.includes(c)) })) : addRegion(r.countries))}
                    className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors", full ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db]")}
                    data-region={r.id}
                  >
                    {full ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {r.name}
                  </button>
                )
              })}
            </div>
            <label className="relative block">
              <span className="sr-only">{tt("Search countries")}</span>
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search a country to add")} className="pl-9" />
            </label>
            {q ? (
              <ul className="max-h-[220px] divide-y divide-[#f4f4f6] overflow-y-auto overscroll-contain rounded-xl border border-[#eceef1]" data-market-countries="">
                {shown.map((c) => {
                  const other = elsewhere.get(c.code)
                  const on = m.countries.includes(c.code)
                  return (
                    <li key={c.code}>
                      <button type="button" disabled={other !== undefined} onClick={() => toggle(c.code)} className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px]", other !== undefined ? "cursor-not-allowed opacity-50" : "hover:bg-[#fafafb]")} data-country-home={c.code === homeCountry ? "" : undefined}>
                        <CountryFlag code={c.code} near={false} />
                        <span className="flex-1 text-[#1a1a2e]">{c.name}</span>
                        {c.code === homeCountry ? <span className="text-[12px] text-[#9ca3af]">{tt("Your store's country")}</span> : other ? <span className="text-[12px] text-[#9ca3af]">{tt("In {other}", { other })}</span> : on ? <Check className="h-4 w-4 text-[#1a1a2e]" /> : <Plus className="h-4 w-4 text-[#9ca3af]" />}
                      </button>
                    </li>
                  )
                })}
                {shown.length === 0 ? <li className="px-3 py-4 text-center text-[13px] text-[#6b7280]">{tt("No country matches.")}</li> : null}
              </ul>
            ) : null}
            {m.countries.length ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12.5px] text-[#6b7280]">{m.countries.length} {m.countries.length === 1 ? "country" : "countries"}</span>
                  <button type="button" className="text-[12.5px] font-medium text-[#6b7280] hover:text-[#1a1a2e]" onClick={() => setM({ ...m, countries: [] })}>
                    {tt("Clear")}
                  </button>
                </div>
                <ul className="flex max-h-[148px] flex-wrap gap-1.5 overflow-y-auto overscroll-contain" data-market-chosen="">
                  {m.countries.map((c) => (
                    <li key={c}>
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f3f4f6] pl-2.5 pr-1 text-[12.5px] font-medium text-[#1a1a2e]">
                        <CountryFlag code={c} className="h-[12px] w-[18px]" />
                        {countryName(c)}
                        <button type="button" aria-label={tt("Remove {count}", { count: countryName(c) })} onClick={() => toggle(c)} className="grid h-6 w-6 place-items-center rounded-full text-[#6b7280] hover:bg-[#e5e7eb]">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[12.5px] text-[#6b7280]">{tt("Pick a region or search for a country. A country can be in one market only.")}</p>
            )}
            </>
            )}
            {homeCountry ? (
              <p className="text-[12.5px] leading-[18px] text-[#6b7280]" data-market-home-note="">
                {tt("{country} is your store's country: its visitors always see {currency}.", { country: countryName(homeCountry), currency: baseCurrency })}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-[13.5px] leading-5 text-[#4b5563]">{tt("Your home market: every country not in another market, at your own prices in {baseCurrency}.", { baseCurrency })}</p>
        )}

        {!m.primary ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tt("Currency")} hint={currencies.length ? tt("Converted from {baseCurrency} at the day's rate. Cards are charged in {chargeCurrency}.", { baseCurrency, chargeCurrency }) : tt("Exchange rates aren't in yet: try again in a minute.")}>
              <SelectInput value={m.currency ?? ""} onChange={(v) => setM({ ...m, currency: v || null })}>
                <option value="">{tt("{baseCurrency} (your prices)", { baseCurrency })}</option>
                {currencies
                  .filter((c) => c !== baseCurrency)
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </SelectInput>
            </Field>
            <Field label={tt("Language")} hint={tt("What its visitors see first.")}>
              <SelectInput value={m.language ?? ""} onChange={(v) => setM({ ...m, language: v || null })}>
                <option value="">{tt("{name} (default)", { name: languageName(localization.defaultLanguage, activeLocale()) })}</option>
                {languages
                  .filter((l) => l !== localization.defaultLanguage)
                  .map((l) => (
                    <option key={l} value={l}>
                      {languageName(l, activeLocale())}
                    </option>
                  ))}
              </SelectInput>
            </Field>
          </div>
        ) : null}

        {!m.primary && m.currency ? (
          <div className="rounded-xl border border-[#eceef1]">
            <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="flex w-full items-center justify-between px-3.5 py-3 text-left text-[13.5px] font-medium text-[#1a1a2e]">
              {tt("Rounding, adjustment and exchange rate")}
              <ChevronDown aria-hidden className={cn("h-4 w-4 text-[#6b7280] transition-transform", more && "rotate-180")} />
            </button>
            {more ? (
              <div className="grid gap-4 border-t border-[#f1f2f4] px-3.5 py-3.5 sm:grid-cols-2">
                <Field label={tt("Rounding")}>
                  <SelectInput value={m.rounding} onChange={(v) => setM({ ...m, rounding: v as PriceRounding })}>
                    {(Object.keys(ROUNDING_LABEL) as PriceRounding[]).map((r) => (
                      <option key={r} value={r}>
                        {ROUNDING_LABEL[r]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label={tt("Adjustment (%)")} hint={tt("Raise or lower prices here.")}>
                  <TextInput
                    inputMode="decimal"
                    value={m.adjustBps ? String(m.adjustBps / 100) : ""}
                    placeholder="0"
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(",", "."))
                      setM({ ...m, adjustBps: Number.isFinite(n) ? Math.max(-5000, Math.min(10000, Math.round(n * 100))) : 0 })
                    }}
                  />
                </Field>
                {/* The store's own rate instead of the day's (lib/markets/pricing.ts pricingFor): empty, the day's. */}
                <Field
                  label={tt("Exchange rate")}
                  hint={todays ? tt("1 {base} = this many {currency}. Empty uses today's rate, {rate}.", { base: baseCurrency, currency: m.currency, rate: todays }) : tt("1 {base} = this many {currency}. Empty uses the day's rate.", { base: baseCurrency, currency: m.currency })}
                  className="sm:col-span-2"
                >
                  <TextInput
                    inputMode="decimal"
                    value={rateText}
                    placeholder={todays ? String(todays) : ""}
                    data-market-rate=""
                    onChange={(e) => {
                      const text = e.target.value.replace(/[^0-9.,]/g, "").slice(0, 14)
                      setRateText(text)
                      const n = Number(text.replace(",", "."))
                      setM({ ...m, rate: text && Number.isFinite(n) && n > 0 ? n : null })
                    }}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}

        {!m.primary ? <Toggle label={tt("Active")} description={tt("Off, its countries see your home market.")} checked={m.active} onChange={(v) => setM({ ...m, active: v })} /> : null}
      </div>
    </Modal>
  )
}

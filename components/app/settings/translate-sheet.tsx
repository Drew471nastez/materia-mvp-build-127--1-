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
 *   Changed        the original was changed after this was written: still
 *                  shown, until it is looked at again
 *   AI draft       written by Storelib AI, not on the website until approved
 *   Done           on the website
 *
 * "Translate with AI" drafts the ones to translate and the changed ones
 * (never a translation a person approved whose original did not change).
 * Save keeps what was typed, approved. An empty translation shows the
 * original again.
 */
import * as React from "react"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_PRIMARY, BTN_SECONDARY, Modal, Notice, Pill, api } from "@/components/physical/ui"
import { Switch } from "@/components/ui/switch"
import { languageName } from "@/lib/markets/locales"

type Status = "missing" | "outdated" | "draft" | "done"
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

const STATUS: Record<Status, { label: string; tone: "gray" | "amber" | "blue" | "green" }> = {
  missing: { label: "To translate", tone: "gray" },
  outdated: { label: "Changed", tone: "amber" },
  draft: { label: "AI draft", tone: "blue" },
  done: { label: "Done", tone: "green" },
}

type Filter = "todo" | "all"

/** The words of a rich text original, for reading above the field. */
const plain = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim()

/**
 * `published` and `onPublish`: the language's own switch in the footer, so
 * translating and putting it live happen in one place (round AE).
 */
export function TranslateSheet({ locale, defaultLanguage, waiting = false, published = false, onPublish, onClose }: { locale: string | null; defaultLanguage: string; waiting?: boolean; published?: boolean; onPublish?: (v: boolean) => void; onClose: () => void }) {
  const [data, setData] = React.useState<Loaded | null>(null)
  const [edits, setEdits] = React.useState<Record<string, string>>({})
  const [approve, setApprove] = React.useState<Set<string>>(new Set())
  const [filter, setFilter] = React.useState<Filter>("todo")
  const [busy, setBusy] = React.useState<"save" | "ai" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)

  const load = React.useCallback(async (code: string) => {
    const r = await api<Loaded>(`/api/store/translations?locale=${encodeURIComponent(code)}`, { method: "GET" })
    if (!r.ok) return setError(r.error)
    /* The server answers with no language when it does not have this one: say so, rather than "no text". */
    if (!r.data.locale) return setError(`${languageName(code, "en")} isn't saved on your website yet. Close this and try again.`)
    setData(r.data)
  }, [])

  /* A language just added is read once its save has landed (`waiting`, Settings › Markets and languages). */
  React.useEffect(() => {
    if (!locale) return
    setData(null)
    setEdits({})
    setApprove(new Set())
    setError(null)
    setNote(null)
    setFilter("todo")
    if (!waiting) void load(locale)
  }, [locale, waiting, load])

  const items = React.useMemo(() => data?.groups.flatMap((g) => g.items) ?? [], [data])
  const byKey = React.useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const changed = Object.keys(edits).filter((k) => edits[k] !== byKey.get(k)?.value)
  const drafts = items.filter((i) => i.status === "draft")
  const pending = changed.length + [...approve].filter((k) => !changed.includes(k)).length

  const save = async (alsoApprove: string[] = []) => {
    if (!locale) return
    const keys = new Set([...changed, ...approve, ...alsoApprove])
    const body = [...keys]
      .map((k) => byKey.get(k))
      .filter((i): i is Item => !!i)
      .map((i) => ({ key: i.key, value: edits[i.key] ?? i.value, source: i.source, approved: true, rich: i.rich }))
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
    setNote("Saved")
    window.setTimeout(() => setNote(null), 1800)
  }

  /* EVERYTHING AT ONCE: the AI drafts in batches, so it is asked again until nothing is left (or it stops making progress). */
  const draftWithAi = async () => {
    if (!locale) return
    setBusy("ai")
    setError(null)
    let total = 0
    for (let round = 0; round < 12; round++) {
      const r = await api<{ drafted: number; left: number }>(`/api/store/translations/draft`, { method: "POST", body: { locale } })
      if (!r.ok) {
        setError(r.error)
        break
      }
      total += r.data.drafted
      setNote(r.data.left ? `${total} drafted, ${r.data.left} to go` : null)
      if (!r.data.left || r.data.drafted === 0) break
    }
    await load(locale)
    setBusy(null)
    setNote(total ? `${total} drafted. Read them, then approve.` : "Nothing left to draft.")
  }

  const name = locale ? languageName(locale, "en") : ""
  const shownGroups = (data?.groups ?? [])
    .map((g) => ({ ...g, items: g.items.filter((i) => filter === "all" || i.status !== "done" || i.key in edits) }))
    .filter((g) => g.items.length)

  return (
    <Modal
      open={!!locale}
      onClose={onClose}
      wide
      title={`Translate to ${name}`}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onPublish ? (
            <label className="mr-auto flex items-center gap-2 text-[13px] font-medium text-[#1a1a2e]" data-translate-publish="">
              <Switch checked={published} onCheckedChange={onPublish} aria-label={`Publish ${name}`} className="!min-h-0 shrink-0" />
              {published ? "Live on your website" : "Publish"}
            </label>
          ) : note ? (
            <span className="mr-auto text-[13px] text-[#4b5563]">{note}</span>
          ) : null}
          {drafts.length ? (
            <button type="button" className={BTN_SECONDARY} disabled={!!busy} onClick={() => void save(drafts.map((d) => d.key))}>
              Approve all ({drafts.length})
            </button>
          ) : null}
          <button type="button" className={BTN_PRIMARY} disabled={!!busy || pending === 0} onClick={() => void save()} data-save-translations="">
            {busy === "save" ? "Saving" : pending ? `Save ${pending}` : "Save"}
          </button>
        </div>
      }
    >
      <div className="space-y-4" data-translate-sheet={locale ?? ""}>
        {data && !data.ready ? <Notice tone="amber">Translations aren&apos;t set up yet. Run SQL part 136 in Supabase, then try again.</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
        {data ? (
          <div className="space-y-3">
            {data.progress && data.progress.total > 0 ? (
              <div data-translate-progress="">
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="font-medium text-[#1a1a2e]">
                    {data.progress.done} of {data.progress.total} translated
                  </span>
                  <span className="text-[#6b7280]">The rest shows in {languageName(defaultLanguage, "en")}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f1f2f4]">
                  <div className="h-full rounded-full bg-[#1a1a2e] transition-[width] duration-500" style={{ width: `${Math.round((data.progress.done / data.progress.total) * 100)}%` }} />
                </div>
              </div>
            ) : null}
            {note && onPublish ? <p className="text-[13px] text-[#4b5563]" aria-live="polite">{note}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              {items.some((i) => i.status === "missing" || i.status === "outdated") ? (
                <button type="button" className={cn(BTN_PRIMARY, "h-10")} onClick={() => void draftWithAi()} disabled={!!busy} data-translate-ai="">
                  <Sparkles className="h-4 w-4" />
                  {busy === "ai" ? "Translating" : "Translate everything with AI"}
                </button>
              ) : null}
              <div className="ml-auto flex items-center gap-1 rounded-lg bg-[#f1f2f4] p-0.5" role="tablist" aria-label="Show">
                {(["todo", "all"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn("h-8 rounded-md px-3 text-[13px] font-medium transition-colors", filter === f ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(17,24,39,0.12)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
                  >
                    {f === "todo" ? "To do" : "All"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : !error ? (
          <div className="h-40" aria-busy="true" />
        ) : null}

        {data && shownGroups.length === 0 ? <p className="py-6 text-center text-[13.5px] text-[#6b7280]">{items.length ? "Everything is translated." : "Your website has no text to translate yet."}</p> : null}

        {shownGroups.map((g) => (
          <section key={g.id} aria-labelledby={`tr-${g.id}`} className="space-y-2">
            <h3 id={`tr-${g.id}`} className="text-[13px] font-semibold text-[#6b7280]">
              {g.title}
            </h3>
            <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]">
              {g.items.map((i) => {
                /* Rich text shows its words; untouched, its own formatting is what is saved (save() sends i.value). */
                const value = edits[i.key] ?? (i.rich && /<[a-z][\s\S]*>/i.test(i.value) ? plain(i.value) : i.value)
                const st = STATUS[i.status]
                return (
                  <li key={i.key} className="space-y-2 px-3.5 py-3" data-translation={i.key}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[#4b5563]">
                        {i.where !== g.title && i.where ? `${i.where} · ` : ""}
                        {i.label}
                      </span>
                      <Pill tone={st.tone}>{st.label}</Pill>
                      {i.status === "draft" ? (
                        <label className="flex items-center gap-1.5 text-[12.5px] text-[#4b5563]">
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
                          Approve
                        </label>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap break-words rounded-lg bg-[#f8f9fa] px-3 py-2 text-[13px] leading-[19px] text-[#4b5563]">{i.rich ? plain(i.source) : i.source}</p>
                    {i.multiline ? (
                      <textarea
                        value={value}
                        onChange={(e) => setEdits((x) => ({ ...x, [i.key]: e.target.value }))}
                        rows={Math.min(8, Math.max(2, Math.ceil(i.source.length / 70)))}
                        placeholder={`In ${name}`}
                        aria-label={`${i.label} in ${name}`}
                        className="w-full resize-y rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-[16px] leading-6 sm:text-[14px] sm:leading-5 text-[#1a1a2e] outline-none transition-colors focus:border-[#1a1a2e]"
                      />
                    ) : (
                      <input
                        value={value}
                        onChange={(e) => setEdits((x) => ({ ...x, [i.key]: e.target.value }))}
                        placeholder={`In ${name}`}
                        aria-label={`${i.label} in ${name}`}
                        className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-[16px] text-[#1a1a2e] sm:text-[14px] outline-none transition-colors focus:border-[#1a1a2e]"
                      />
                    )}
                    {i.rich ? <p className="text-[12px] text-[#9ca3af]">Edited here, it&apos;s saved as plain text: a blank line starts a new paragraph.</p> : null}
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

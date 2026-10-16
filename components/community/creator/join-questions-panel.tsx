"use client"

/**
 * ===========================================================================
 *  QUESTIONS BEFORE JOINING (round 32), Settings › Access
 * ===========================================================================
 * Up to eight questions people answer when they join, ask to join or go to
 * pay: a short answer, a paragraph, one choice, several choices or an email
 * address, each required or not, with an optional line under it. The list
 * is edited in place, one question after another with a hairline between
 * (no card in the card): the question's words, its kind, Required, the line
 * under it, and for a choice its choices. Arrows move a question; the cross
 * takes it out. Preview opens the questions exactly as people will see them
 * (components/community/public/join-questions-form.tsx, the same fields).
 * The /app save bar saves the whole list (PUT join-questions).
 *
 * Mounted by Settings beside the approval switch: <JoinQuestionsPanel head={head} />.
 * It reads and writes its own data (app/api/app/community/[id]/join-questions).
 */
import * as React from "react"
import { ArrowDown, ArrowUp, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { JOIN_OPTIONS_MAX, JOIN_QUESTIONS_MAX, JOIN_QUESTION_HELP_MAX, JOIN_QUESTION_LABEL_MAX, JOIN_OPTION_MAX, isChoiceKind, type AnswerDraft, type JoinQuestion, type JoinQuestionKind } from "@/lib/communities/join-questions"
import { JoinQuestionFields } from "@/components/community/public/join-questions-form"
import type { CommunityHead } from "./view-types"
import { CheckRow, Dialog, EditorFoot, ListLoading, Notice, RemoveButton, Section, SelectField, buttonSecondary, errorText, field, label, send, useToast } from "./parts"

/** A question as the editor holds it: the server's id once saved, a local key before. */
interface Draft extends Omit<JoinQuestion, "id"> {
  id: string
  key: string
}

let keys = 0
const keyOf = () => `k${++keys}`

const KINDS: { value: JoinQuestionKind; get label(): string }[] = [
  { value: "short", get label() { return tt("Short answer") } },
  { value: "long", get label() { return tt("Paragraph") } },
  { value: "choice", get label() { return tt("One choice") } },
  { value: "multi", get label() { return tt("Several choices") } },
  { value: "email", get label() { return tt("Email address") } },
]

const toDrafts = (qs: JoinQuestion[]): Draft[] => qs.map((q) => ({ ...q, options: q.options.length ? q.options : [], key: keyOf() }))
const toSend = (ds: Draft[]) => ds.map((d) => ({ id: d.id || undefined, kind: d.kind, label: d.label, help: d.help, required: d.required, options: isChoiceKind(d.kind) ? d.options.filter((o) => o.trim()) : [] }))
const same = (a: Draft[], b: Draft[]) => JSON.stringify(toSend(a)) === JSON.stringify(toSend(b))

const ARROW = "grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg text-[#9ca3af] outline-none transition-colors duration-100 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] active:bg-[#e8e9ec] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.25)] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent sm:h-8 sm:w-8"

export function JoinQuestionsPanel({ head }: { head: CommunityHead }) {
  const toast = useToast()
  const [ready, setReady] = React.useState<boolean | null>(null)
  const [saved, setSaved] = React.useState<Draft[]>([])
  const [list, setList] = React.useState<Draft[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [badIndex, setBadIndex] = React.useState<number | null>(null)
  const [preview, setPreview] = React.useState(false)
  const [previewDraft, setPreviewDraft] = React.useState<AnswerDraft>({})
  const [loadError, setLoadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    void send<{ ready: boolean; questions: JoinQuestion[] }>(`/api/app/community/${head.id}/join-questions`, "GET").then((res) => {
      if (!live) return
      if (!res.ok) return setLoadError(errorText(res.data.error, tt("The questions did not load. Refresh the page.")))
      const ds = toDrafts(res.data.questions ?? [])
      setReady(res.data.ready !== false)
      setSaved(ds)
      setList(ds)
    })
    return () => {
      live = false
    }
  }, [head.id])

  const dirty = !same(list, saved)
  const set = (i: number, patch: Partial<Draft>) => setList((l) => l.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  const move = (i: number, by: -1 | 1) =>
    setList((l) => {
      const j = i + by
      if (j < 0 || j >= l.length) return l
      const next = [...l]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const add = () => setList((l) => (l.length >= JOIN_QUESTIONS_MAX ? l : [...l, { id: "", key: keyOf(), kind: "short", label: "", help: "", required: true, options: [] }]))

  const save = async () => {
    setBusy(true)
    setError(null)
    setBadIndex(null)
    const res = await send<{ questions: JoinQuestion[]; index?: number }>(`/api/app/community/${head.id}/join-questions`, "PUT", { questions: toSend(list) })
    setBusy(false)
    if (!res.ok) {
      setBadIndex(typeof res.data.index === "number" ? res.data.index : null)
      return setError(res.data.error === "not_ready" ? tt("Questions need the database update (run-now part 189).") : errorText(res.data.error))
    }
    /* The server's ids, kept with the editor's keys so nothing redraws. */
    const back = res.data.questions ?? []
    const next = list.map((d, i) => ({ ...d, id: back[i]?.id ?? d.id, label: back[i]?.label ?? d.label, help: back[i]?.help ?? d.help, options: back[i]?.options ?? d.options }))
    setSaved(next)
    setList(next)
    toast(tt("Saved"))
  }

  const previewQuestions: JoinQuestion[] = toSend(list)
    .map((q, i) => ({ id: list[i].id || list[i].key, kind: q.kind, label: q.label.trim() || tt("Question {value}", { value: i + 1 }), help: q.help.trim(), required: q.required, options: q.options }))
    .filter((q) => !isChoiceKind(q.kind) || q.options.length > 0)

  return (
    <Section
      title={tt("Questions before joining")}
      hint={tt("People answer these when they join or ask to join. You read the answers in Requests, under Members.")}
      action={
        list.length ? (
          <button type="button" onClick={() => { setPreviewDraft({}); setPreview(true) }} className={buttonSecondary} data-join-questions-preview="">
            {tt("Preview")}
          </button>
        ) : null
      }
    >
      <div data-join-questions-panel="">
        {loadError ? <Notice>{loadError}</Notice> : ready === null ? <ListLoading /> : !ready ? (
          <Notice tone="warn">{tt("Questions need the database update (run-now part 189). Until then people join without answering anything.")}</Notice>
        ) : (
          <>
            {list.length === 0 ? <p className="text-[13.5px] text-[#6b7280]">{tt("No questions. People join without answering anything.")}</p> : null}
            <ol className="-my-1 divide-y divide-[#f1f2f4]">
              {list.map((q, i) => (
                <li key={q.key} className={cn("py-3.5 first:pt-1", badIndex === i && "rounded-lg bg-[#fef7f6] px-2 -mx-2")} data-join-question-row={i}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium tabular-nums text-[#6b7280]">{tt("Question {value}", { value: i + 1 })}</span>
                    <div className="-mr-2 flex shrink-0 items-center">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tt("Move question {value} up", { value: i + 1 })} className={ARROW}>
                        <ArrowUp aria-hidden className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={tt("Move question {value} down", { value: i + 1 })} className={ARROW}>
                        <ArrowDown aria-hidden className="h-4 w-4" />
                      </button>
                      <RemoveButton label={tt("Remove question {value}", { value: i + 1 })} onClick={() => setList((l) => l.filter((_, j) => j !== i))} />
                    </div>
                  </div>
                  <div className="mt-1 space-y-2.5">
                    <input
                      value={q.label}
                      onChange={(e) => set(i, { label: e.target.value.slice(0, JOIN_QUESTION_LABEL_MAX) })}
                      placeholder={tt("What would you like to ask?")}
                      aria-label={tt("Question {value}", { value: i + 1 })}
                      className={cn(field, "h-11 font-medium sm:h-10")}
                      data-join-question-label=""
                    />
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,220px)_auto] sm:items-center">
                      <SelectField name={`join-question-kind-${i}`} title={tt("Answer")} value={q.kind} options={KINDS} onChange={(kind) => set(i, { kind, options: isChoiceKind(kind) && q.options.length < 2 ? [...q.options, "", ""].slice(0, Math.max(2, q.options.length)) : q.options })} />
                      <CheckRow checked={q.required} onChange={(required) => set(i, { required })} title={tt("Required")} />
                    </div>
                    {isChoiceKind(q.kind) ? (
                      <div className="space-y-2" data-join-question-options="">
                        {q.options.map((o, k) => (
                          <div key={k} className="flex items-center gap-2">
                            <span aria-hidden className={cn("h-4 w-4 shrink-0 border border-[#c9ccd2]", q.kind === "multi" ? "rounded-[4px]" : "rounded-full")} />
                            <input
                              value={o}
                              onChange={(e) => set(i, { options: q.options.map((x, j) => (j === k ? e.target.value.slice(0, JOIN_OPTION_MAX) : x)) })}
                              placeholder={tt("Choice {value}", { value: k + 1 })}
                              aria-label={tt("Choice {value}", { value: k + 1 })}
                              className={cn(field, "h-11 sm:h-9")}
                            />
                            <RemoveButton label={tt("Remove choice {value}", { value: k + 1 })} onClick={() => set(i, { options: q.options.filter((_, j) => j !== k) })} />
                          </div>
                        ))}
                        {q.options.length < JOIN_OPTIONS_MAX ? (
                          <button type="button" onClick={() => set(i, { options: [...q.options, ""] })} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1.5 text-[13px] font-medium text-[#4b5563] outline-none hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.25)]">
                            <Plus aria-hidden className="h-4 w-4" />
                            {tt("Add choice")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    <input
                      value={q.help}
                      onChange={(e) => set(i, { help: e.target.value.slice(0, JOIN_QUESTION_HELP_MAX) })}
                      placeholder={tt("A line under it (optional)")}
                      aria-label={tt("A line under question {value}", { value: i + 1 })}
                      className={cn(field, "h-11 text-[#4b5563] sm:h-9")}
                    />
                  </div>
                </li>
              ))}
            </ol>
            <div className={cn("flex flex-wrap items-center gap-3", list.length ? "mt-3 border-t border-[#f1f2f4] pt-3" : "mt-3")}>
              <button type="button" onClick={add} disabled={list.length >= JOIN_QUESTIONS_MAX} className={buttonSecondary} data-join-question-add="">
                <Plus aria-hidden className="mr-1 h-4 w-4" />
                {tt("Add question")}
              </button>
              {list.length >= JOIN_QUESTIONS_MAX ? <span className="text-[12.5px] text-[#6b7280]">{tt("Up to {value} questions.", { value: JOIN_QUESTIONS_MAX })}</span> : null}
            </div>
          </>
        )}
      </div>

      <EditorFoot dirty={dirty} busy={busy} error={error} onSave={() => void save()} onCancel={() => { setList(saved); setError(null); setBadIndex(null) }} />

      <Dialog open={preview} onClose={() => setPreview(false)} title={tt("Before you join")} footer={<button type="button" onClick={() => setPreview(false)} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>{tt("Close")}</button>}>
        <p className={cn(label, "mb-4 font-normal text-[#6b7280]")}>{tt("This is what people see when they join {value}. Nothing you type here is sent.", { value: head.name })}</p>
        <JoinQuestionFields questions={previewQuestions} draft={previewDraft} onChange={setPreviewDraft} idPrefix="jq-preview" />
      </Dialog>
    </Section>
  )
}

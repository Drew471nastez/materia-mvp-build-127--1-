"use client"

/**
 * /help/questions, the list itself (lib/help/questions.ts).
 *
 * A search across every question; the topics down the side on a computer and
 * as a row of pills on a phone, the one being read marked as it scrolls; and
 * each question opening in place, with what happens, what the store does and
 * what the buyer does side by side, and a drawing where one helps. A link to
 * #a-question opens it.
 */
import * as React from "react"
import { ChevronDown, Search } from "lucide-react"
import { RichText } from "@/components/help/help-parts"
import { HelpFigure } from "@/components/help/help-figures"
import type { HelpQuestion, HelpTopic } from "@/lib/help/questions"
import { cn } from "@/lib/utils"

const match = (q: HelpQuestion, words: string[]) => {
  const hay = `${q.q} ${q.a} ${(q.store ?? []).join(" ")} ${(q.buyer ?? []).join(" ")}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

export function QuestionsBrowser({ topics }: { topics: HelpTopic[] }) {
  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState<Set<string>>(new Set())
  const [active, setActive] = React.useState(topics[0]?.id ?? "")
  const pillsRef = React.useRef<HTMLDivElement>(null)

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = words.length ? topics.map((t) => ({ ...t, questions: t.questions.filter((q) => match(q, words)) })).filter((t) => t.questions.length) : topics
  const count = shown.reduce((n, t) => n + t.questions.length, 0)

  /* Arriving on #a-question opens it and brings it into view. */
  React.useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (!id || !topics.some((t) => t.questions.some((q) => q.id === id))) return
    setOpen(new Set([id]))
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }))
  }, [topics])

  /* The topic being read: the last whose heading has passed the top third of the screen. */
  React.useEffect(() => {
    const els = shown.map((t) => document.getElementById(`topic-${t.id}`)).filter((e): e is HTMLElement => !!e)
    if (!els.length) return
    const io = new IntersectionObserver(
      () => {
        const line = window.innerHeight * 0.33
        let current = els[0].id
        for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id
        setActive(current.replace(/^topic-/, ""))
      },
      { rootMargin: "0px 0px -60% 0px", threshold: [0, 1] },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [shown.map((t) => t.id).join()]) // eslint-disable-line react-hooks/exhaustive-deps

  /* The active pill stays in view in the phone's row. */
  React.useEffect(() => {
    const pill = pillsRef.current?.querySelector<HTMLElement>(`[data-pill="${active}"]`)
    pill?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
  }, [active])

  const goTo = (id: string) => {
    setActive(id)
    document.getElementById(`topic-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14" data-questions="">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <label className="relative block">
          <span className="sr-only">Search the questions</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the questions"
            className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:ring-[3px] focus:ring-[rgba(17,24,39,0.06)] sm:text-[14px]"
            data-questions-search=""
          />
        </label>
        {/* A row of pills on a phone, a list on a computer: the same buttons. */}
        <nav aria-label="Topics" className="sticky top-0 z-10 -mx-4 mt-3 bg-white/95 px-4 py-2 backdrop-blur lg:static lg:mx-0 lg:mt-6 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div ref={pillsRef} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:gap-0.5 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            {shown.map((t) => {
              const on = active === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  data-pill={t.id}
                  aria-current={on ? "true" : undefined}
                  onClick={() => goTo(t.id)}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 lg:rounded-lg lg:border-0 lg:px-2.5 lg:py-2 lg:text-left lg:text-[14px]",
                    on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white lg:bg-[#f3f4f6] lg:text-[#1a1a2e]" : "border-[#e5e7eb] bg-white text-[#4b5563] hover:bg-[#f8f9fa] lg:bg-transparent lg:hover:text-[#1a1a2e]",
                  )}
                >
                  {t.title}
                </button>
              )
            })}
          </div>
        </nav>
      </aside>

      <div className="min-w-0">
        {words.length ? (
          <p className="mb-6 text-[14px] text-[#6b7280]" aria-live="polite">
            {count === 0 ? "No question matches. Try another word, or write to support below." : `${count} ${count === 1 ? "question" : "questions"} match`}
          </p>
        ) : null}
        <div className="space-y-12">
          {shown.map((t) => (
            <section key={t.id} id={`topic-${t.id}`} aria-labelledby={`h-${t.id}`} className="scroll-mt-20 lg:scroll-mt-24">
              <h2 id={`h-${t.id}`} className="text-[20px] font-semibold tracking-tight text-[#1a1a2e]">
                {t.title}
              </h2>
              <p className="mt-1 text-[14px] text-[#6b7280]">{t.line}</p>
              <ul className="mt-4 divide-y divide-[#eceef1] rounded-2xl border border-[#e5e7eb]/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {t.questions.map((q) => (
                  <Question key={q.id} q={q} open={open.has(q.id) || words.length > 0} onToggle={() => toggle(q.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function Question({ q, open, onToggle }: { q: HelpQuestion; open: boolean; onToggle: () => void }) {
  const panel = `${q.id}-answer`
  return (
    <li id={q.id} className="scroll-mt-24" data-question={q.id}>
      <h3>
        <button type="button" aria-expanded={open} aria-controls={panel} onClick={onToggle} className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left sm:px-5">
          <span className="text-[15.5px] font-medium leading-6 text-[#1a1a2e]">{q.q}</span>
          <ChevronDown aria-hidden className={cn("mt-1 h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-300 ease-out", open && "rotate-180")} />
        </button>
      </h3>
      {/* Opens by its own height (grid rows 0fr to 1fr), so the answer slides rather than jumps. */}
      <div id={panel} role="region" aria-labelledby={q.id} className={cn("grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="space-y-4 px-4 pb-5 sm:px-5">
            <p className="text-[15px] leading-relaxed text-[#374151]">
              <RichText text={q.a} />
            </p>
            {q.store?.length || q.buyer?.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {q.store?.length ? <Side title="If you're the store" items={q.store} /> : null}
                {q.buyer?.length ? <Side title="If you're the buyer" items={q.buyer} /> : null}
              </div>
            ) : null}
            {q.figure && open ? <HelpFigure figure={q.figure.figure} caption={q.figure.caption} /> : null}
          </div>
        </div>
      </div>
    </li>
  )
}

function Side({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-[#f8f9fa] px-4 py-3.5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">{title}</p>
      <ul className="mt-2 space-y-2">
        {items.map((s) => (
          <li key={s} className="flex gap-2.5 text-[14px] leading-[21px] text-[#374151]">
            <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#9ca3af]" />
            <span>
              <RichText text={s} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

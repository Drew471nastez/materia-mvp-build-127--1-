"use client"

/**
 * ===========================================================================
 *  THE SETUP PILL ON A COMMUNITY'S PAGES (round 33)
 * ===========================================================================
 * The owner saw "Setup 71%" floating over a community's admin pages: that was
 * the store's setup (components/app/sidebar.tsx), counting things that have
 * nothing to do with the community open under it. On /app/community/<slug>
 * the sidebar now draws this one instead: the same 32px pill in the same
 * place, with this community's own list (lib/communities/setup-checklist.ts,
 * GET /api/app/community/<slug>/setup).
 *
 * Pressed, it opens the list above itself: what is left first, each with its
 * one action and Skip, then what is done, quietly. Download the app has both
 * stores and "I have it"; the intro opens its video and counts as watched.
 * "Hide this" puts the pill away for this person and community; the
 * Overview's Set up card stays until the list is done.
 *
 * A computer only, like the store's pill: a phone has the Overview card at
 * the top of the community. It asks again for the list when the page
 * changes (at most every eight seconds) and when the tab comes back, so a
 * post written or a rule added ticks without a reload.
 */
import * as React from "react"
import Link from "next/link"
import { ArrowRight, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { APP_CONFIRMED, INTRO_WATCHED, PILL_HIDDEN, skipKey, type SetupChecklistView, type SetupStepView } from "@/lib/communities/setup-keys"
import { tt } from "@/lib/i18n/text"

const SLUG = /^\/app\/community\/([^/?#]+)/
const REFRESH_MS = 8_000
const HIDDEN_KEY = (slug: string) => `storelib:community-setup-hidden:${slug}`

/** The community a path is about, or null for the list and New community. */
export function communitySlugOf(pathname: string): string | null {
  const m = SLUG.exec(pathname || "")
  if (!m || m[1] === "new") return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return null
  }
}

function Ring({ percent, size = 20, stroke = 2.5 }: { percent: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#8b5cf6" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} className="transition-[stroke-dashoffset] duration-500 ease-out" />
    </svg>
  )
}

const quietButton = "inline-flex h-8 items-center rounded-lg px-2 text-[12.5px] font-medium text-[#6b7280] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e]"
const actionButton = "inline-flex h-8 items-center gap-1 rounded-lg bg-[#1a1a2e] px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-[#2a2a40]"
const secondaryButton = "inline-flex h-8 items-center gap-1 rounded-lg border border-[#e1e3e7] bg-white px-3 text-[12.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]"
const storeButton = "inline-flex h-8 items-center rounded-lg border border-[#e1e3e7] bg-white px-3 text-[12.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]"

function StepRow({ s, next, onMark }: { s: SetupStepView; next: boolean; onMark: (key: string) => void }) {
  const finished = s.done || s.skipped
  return (
    <li data-setup-step={s.id} data-setup-done={finished ? "" : undefined} className="flex gap-3 py-3">
      <span aria-hidden className={cn("mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full", finished ? "bg-[#1a1a2e] text-white" : cn("border-[1.5px]", next ? "border-[#1a1a2e]" : "border-[#d5d8de]"))}>
        {finished ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13.5px] font-medium leading-5", finished ? "text-[#9ca3af]" : "text-[#1a1a2e]")}>
          {s.title}
          {s.skipped ? <span className="font-normal"> · {tt("skipped")}</span> : null}
        </p>
        {!finished ? (
          <>
            <p className="mt-0.5 text-[12.5px] leading-[18px] text-[#6b7280]">{s.detail}</p>
            {s.progress ? (
              <span aria-hidden className="mt-2 flex gap-1" data-setup-progress={`${s.progress.n}/${s.progress.of}`}>
                {Array.from({ length: s.progress.of }, (_, i) => (
                  <span key={i} className={cn("h-1 w-6 rounded-full", i < s.progress!.n ? "bg-[#1a1a2e]" : "bg-[#e5e7eb]")} />
                ))}
              </span>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {s.id === "app" && s.links?.length ? (
                <>
                  {s.links.map((l) => (
                    <a key={l.store} href={l.href} target="_blank" rel="noopener noreferrer" className={storeButton} data-setup-store={l.store}>
                      {l.label}
                    </a>
                  ))}
                  <button type="button" onClick={() => onMark(APP_CONFIRMED)} className={quietButton}>
                    {tt("I have it")}
                  </button>
                </>
              ) : s.external ? (
                <a href={s.href} target="_blank" rel="noopener noreferrer" onClick={() => s.id === "intro" && onMark(INTRO_WATCHED)} className={next ? actionButton : secondaryButton}>
                  {s.action}
                </a>
              ) : (
                <Link href={s.href} className={next ? actionButton : secondaryButton}>
                  {s.action}
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              )}
              <button type="button" onClick={() => onMark(skipKey(s.id))} className={quietButton} data-setup-skip="">
                {tt("Skip")}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </li>
  )
}

export function CommunitySetupPill({ pathname, hidden = false }: { pathname: string; hidden?: boolean }) {
  const slug = communitySlugOf(pathname)
  const [list, setList] = React.useState<(SetupChecklistView & { slug: string }) | null>(null)
  const [open, setOpen] = React.useState(false)
  const [localHidden, setLocalHidden] = React.useState(false)
  const readAt = React.useRef(0)
  const box = React.useRef<HTMLDivElement>(null)

  const read = React.useCallback(
    async (force = false) => {
      if (!slug) return
      if (!force && Date.now() - readAt.current < REFRESH_MS) return
      readAt.current = Date.now()
      try {
        const res = await fetch(`/api/app/community/${encodeURIComponent(slug)}/setup`, { cache: "no-store" })
        if (!res.ok) return setList(null)
        setList((await res.json()) as SetupChecklistView & { slug: string })
      } catch {
        /* Offline: keep what is shown. */
      }
    },
    [slug],
  )

  React.useEffect(() => {
    setOpen(false)
    try {
      setLocalHidden(!!slug && window.localStorage.getItem(HIDDEN_KEY(slug)) === "1")
    } catch {
      setLocalHidden(false)
    }
  }, [slug])

  React.useEffect(() => {
    void read()
  }, [read, pathname])

  React.useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && void read(true)
    const onChange = () => void read(true)
    document.addEventListener("visibilitychange", onShow)
    window.addEventListener("storelib:community-setup-changed", onChange)
    return () => {
      document.removeEventListener("visibilitychange", onShow)
      window.removeEventListener("storelib:community-setup-changed", onChange)
    }
  }, [read])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onDown)
    }
  }, [open])

  /* Shown at once, kept on the server; before part 202 the browser remembers it instead. */
  const mark = (key: string) => {
    if (!list || !slug) return
    setList((l) => {
      if (!l) return l
      if (key === PILL_HIDDEN) return { ...l, pillHidden: true }
      const steps = l.steps.map((s) => (key === skipKey(s.id) ? { ...s, skipped: true } : key === APP_CONFIRMED && s.id === "app" ? { ...s, done: true } : key === INTRO_WATCHED && s.id === "intro" ? { ...s, done: true } : s))
      const done = steps.filter((s) => s.done || s.skipped).length
      return { ...l, steps, done, percent: steps.length ? Math.round((done / steps.length) * 100) : 100 }
    })
    if (key === PILL_HIDDEN) {
      setOpen(false)
      try {
        window.localStorage.setItem(HIDDEN_KEY(slug), "1")
      } catch {
        /* Private window: hidden for this visit. */
      }
      setLocalHidden(true)
    }
    void fetch(`/api/app/community/${encodeURIComponent(slug)}/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: key }) }).catch(() => undefined)
  }

  if (!slug || !list || hidden || localHidden || list.pillHidden || list.done >= list.total) return null
  const left = list.steps.filter((s) => !s.done && !s.skipped)
  const finished = list.steps.filter((s) => s.done || s.skipped)

  return (
    <div ref={box} data-shell-chrome="" data-community-setup="" className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,_0px))] right-4 z-40 hidden md:right-6 md:block">
      {open ? (
        <section
          role="dialog"
          aria-label={tt("Set up {name}", { name: list.name })}
          data-community-setup-panel=""
          className="absolute bottom-10 right-0 flex max-h-[min(70vh,600px)] w-[360px] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_12px_32px_-8px_rgba(15,23,42,0.18)] motion-safe:animate-[community-setup-in_160ms_cubic-bezier(0.32,0.72,0,1)]"
        >
          <style>{"@keyframes community-setup-in{from{opacity:0;translate:0 6px;scale:.98}to{opacity:1;translate:0 0;scale:1}}"}</style>
          <header className="shrink-0 border-b border-[#f1f2f4] px-4 pb-3 pt-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-semibold leading-6 text-[#1a1a2e]">{tt("Set up {name}", { name: list.name })}</h2>
                <p className="text-[12.5px] tabular-nums text-[#6b7280]">{tt("{done} of {total} done", { done: list.done, total: list.total })}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={tt("Close")} className="-mr-1.5 -mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <span aria-hidden className="mt-2.5 block h-1 overflow-hidden rounded-full bg-[#eef0f2]">
              <span className="block h-full rounded-full bg-[#8b5cf6] transition-[width] duration-500 ease-out" style={{ width: `${list.percent}%` }} />
            </span>
          </header>
          <ol className="min-h-0 flex-1 divide-y divide-[#f1f2f4] overflow-y-auto overscroll-contain px-4" data-community-setup-list="">
            {left.map((s, i) => (
              <StepRow key={s.id} s={s} next={i === 0} onMark={mark} />
            ))}
            {finished.map((s) => (
              <StepRow key={s.id} s={s} next={false} onMark={mark} />
            ))}
          </ol>
          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-[#f1f2f4] px-2.5 py-2">
            <button type="button" onClick={() => mark(PILL_HIDDEN)} className={quietButton} data-community-setup-hide="">
              {tt("Hide this")}
            </button>
            <Link href={`/app/community/${encodeURIComponent(slug)}`} onClick={() => setOpen(false)} className={quietButton}>
              {tt("Overview")}
            </Link>
          </footer>
        </section>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={tt("Community setup, {percent}% done", { percent: list.percent })}
        data-community-setup-pill=""
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white pl-1.5 pr-3 text-[12.5px] leading-none",
          "shadow-[0_1px_2px_rgba(15,23,42,0.05),0_2px_8px_rgba(15,23,42,0.06)] transition-colors duration-150 hover:bg-[#f7f7f8] active:bg-[#f1f2f4]",
          "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6] [-webkit-tap-highlight-color:transparent]",
          open && "bg-[#f7f7f8]",
        )}
      >
        <Ring percent={list.percent} />
        <span className="whitespace-nowrap font-medium text-[#374151]">{tt("Setup")}</span>
        <span className="font-medium tabular-nums text-violet-600">{list.percent}%</span>
      </button>
    </div>
  )
}

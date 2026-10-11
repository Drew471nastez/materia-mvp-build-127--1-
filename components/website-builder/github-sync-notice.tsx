"use client"

/**
 * ===========================================================================
 *  WHAT CAME IN FROM GITHUB, WHAT DIDN'T, AND THE ONE THING TO DO
 * ===========================================================================
 * The line at the top of the canvas that says what a push (or a connected
 * agent) did to this site, read from the server's own record of the last
 * sync (app/api/.../sync-status, lib/github-sync/editor-status.ts), so it is
 * the same after a reload and on any device:
 *
 *   came in      "3 files updated from GitHub. Publish to make them live."
 *                with Publish, while the draft is ahead of the live site.
 *   didn't       "2 files didn't sync" with Details: each file, what is
 *                wrong in plain words, and Open in GitHub, Try again, or put
 *                back Storelib's version where that applies.
 *   failed       the whole sync: what happened and the one button that
 *                fixes it (Reconnect, Try again, Bring them in).
 *   both edited  GitHub changed the page open here while it had an edit not
 *                saved yet: Keep mine or Use GitHub's. Nothing is saved over
 *                either until one is picked.
 *
 * Quiet on purpose, the same white line as a save that did not go through
 * (editor/save-problem-banner.tsx). Details open under it on a desktop and
 * as a bottom sheet on a phone. A notice that was closed stays closed until
 * something new happens (remembered in this browser, by the report's key).
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, ExternalLink, Loader2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { plainWords, type EditorSyncReport, type PendingChanges, type ReportFile, type SyncAction } from "@/lib/github-sync/editor-status"

/* ── reading it ────────────────────────────────────────────────────────── */

export interface SyncStatus {
  pending: PendingChanges | null
  github: EditorSyncReport | null
  linked: boolean
}

/**
 * The sync report and whether there is anything to publish. Read once on
 * open; `refresh` reads again (after an agent writes, when the link changes,
 * after Publish). Two refreshes at once become one read and one after it.
 */
export function useSyncStatus(installId: string): { status: SyncStatus; refresh: () => Promise<SyncStatus | null> } {
  const [status, setStatus] = useState<SyncStatus>({ pending: null, github: null, linked: false })
  const inFlight = useRef<Promise<SyncStatus | null> | null>(null)
  const again = useRef(false)

  const read = useCallback(async (): Promise<SyncStatus | null> => {
    try {
      const r = await fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/sync-status`, { cache: "no-store" })
      if (!r.ok) return null
      const d = (await r.json()) as Partial<SyncStatus>
      const next: SyncStatus = { pending: d.pending ?? null, github: d.github ?? null, linked: !!d.linked }
      setStatus(next)
      return next
    } catch {
      return null
    }
  }, [installId])

  const refresh = useCallback(async (): Promise<SyncStatus | null> => {
    if (inFlight.current) {
      again.current = true
      return inFlight.current
    }
    const run = (async () => {
      let out = await read()
      while (again.current) {
        again.current = false
        out = (await read()) ?? out
      }
      return out
    })()
    inFlight.current = run
    try {
      return await run
    } finally {
      inFlight.current = null
    }
  }, [read])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { status, refresh }
}

/* ── what it says ──────────────────────────────────────────────────────── */

export interface SyncConflict {
  /** "the Home page", "the theme settings". */
  what: string
  by: string
}

export interface AgentNote {
  who: string
  count: number
}

type Tone = "info" | "warn" | "error" | "quiet"

interface Shown {
  key: string
  tone: Tone
  title: string
  body: string
  primary: { label: string; run: () => void } | null
  details: boolean
}

const ACTION_LABEL: Record<SyncAction, string> = {
  retry: "Try again",
  pull: "Bring them in",
  push: "Send to GitHub",
  reconnect: "Reconnect GitHub",
  repo: "Pick repository",
  open: "Open in GitHub",
  reset: "Put back Storelib's version",
}

const DOT: Record<Tone, string> = {
  info: "bg-[#3b82f6]",
  warn: "bg-[#f59e0b]",
  error: "bg-[#ef4444]",
  quiet: "bg-[#9ca3af]",
}

const SEEN_KEY = (installId: string) => `wb-sync-seen:${installId}`

function readSeen(installId: string): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY(installId))
    const v = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-20) : []
  } catch {
    return []
  }
}

function writeSeen(installId: string, keys: string[]) {
  try {
    window.localStorage.setItem(SEEN_KEY(installId), JSON.stringify(keys.slice(-20)))
  } catch {
    /* a private window: it shows again after a reload, which is fine */
  }
}

const later = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a) return false
  if (!b) return true
  return Date.parse(a) > Date.parse(b)
}

export function SyncNotice({
  installId,
  report,
  pending,
  live,
  publishedAt,
  unpublished,
  agentNote,
  conflict,
  phone,
  onPublish,
  onAction,
  onKeepMine,
  onUseTheirs,
  onAgentNoteSeen,
}: {
  installId: string
  report: EditorSyncReport | null
  pending: PendingChanges | null
  live: boolean
  publishedAt: string | null
  /** The editor's own answer to "is the draft ahead of the live site". */
  unpublished: boolean
  /** Changes a connected agent (not GitHub) made in this visit. */
  agentNote: AgentNote | null
  conflict: SyncConflict | null
  phone: boolean
  onPublish: () => void
  /** Runs one action. Resolves to an error to show, or null. */
  onAction: (action: SyncAction, file?: ReportFile) => Promise<string | null>
  onKeepMine: () => void
  onUseTheirs: () => void
  onAgentNoteSeen: () => void
}) {
  const [seen, setSeen] = useState<string[]>([])
  useEffect(() => setSeen(readSeen(installId)), [installId])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (action: SyncAction, file?: ReportFile) => {
      const id = `${action}:${file?.path ?? ""}`
      setBusy(id)
      setError(null)
      try {
        const e = await onAction(action, file)
        if (e) setError(plainWords(e))
      } finally {
        setBusy(null)
      }
    },
    [onAction],
  )

  const dismiss = (key: string) => {
    const next = [...seen.filter((k) => k !== key), key]
    setSeen(next)
    writeSeen(installId, next)
    setOpen(false)
    setError(null)
  }

  /* Which one thing to say, most urgent first. */
  let shown: Shown | null = null
  const r = report
  const failedCount = (r?.files.length ?? 0) + (r?.moreFiles ?? 0)
  if (conflict) {
    shown = {
      key: "conflict",
      tone: "warn",
      title: `GitHub changed ${conflict.what} while you were editing it`,
      body: "Keep your edits, or use the version from GitHub. Nothing is saved until you pick.",
      primary: null,
      details: false,
    }
  } else if (r && (r.problem || failedCount > 0) && !seen.includes(r.key)) {
    const p = r.problem
    const first = p?.actions[0]
    shown = {
      key: r.key,
      tone: p && p.kind !== "unread" && p.kind !== "too-many" ? "error" : "warn",
      title: p ? p.title : `${failedCount} file${failedCount === 1 ? "" : "s"} didn't sync`,
      body: p
        ? p.body
        : r.taken > 0
          ? `${r.taken} came in${live ? " and are ready to publish" : ""}. Fix the rest on GitHub and push again.`
          : "Fix them on GitHub and push again. Your site is unchanged.",
      primary: first ? { label: ACTION_LABEL[first], run: () => void run(first) } : null,
      details: failedCount > 0 || (r.notes.length > 0),
    }
  } else if (r && r.direction === "from_github" && r.taken > 0 && unpublished && (pending?.any ?? true) && later(r.at, publishedAt) && !seen.includes(r.key)) {
    const n = r.taken
    shown = {
      key: r.key,
      tone: "info",
      title: `${n} file${n === 1 ? "" : "s"} updated from GitHub`,
      body: live ? "Publish to make them live." : "They're saved in your draft.",
      primary: live ? { label: "Publish", run: onPublish } : null,
      details: r.takenNames.length > 0 || r.notes.length > 0,
    }
  } else if (agentNote && unpublished) {
    shown = {
      key: "agent",
      tone: "info",
      title: `${agentNote.count} change${agentNote.count === 1 ? "" : "s"} from ${agentNote.who}`,
      body: live ? "Publish to make them live." : "They're saved in your draft.",
      primary: live ? { label: "Publish", run: onPublish } : null,
      details: false,
    }
  } else if (r?.ignored && later(r.ignored.at, r.at) && !seen.includes(`ignored|${r.ignored.at}`)) {
    shown = {
      key: `ignored|${r.ignored.at}`,
      tone: "quiet",
      title: `A push to ${r.ignored.branch} wasn't brought in`,
      body: `This site follows ${r.branch ?? "another branch"}. Merge it into ${r.branch ?? "that branch"} on GitHub to bring it in.`,
      primary: null,
      details: false,
    }
  }

  /* A notice that went away takes its open details with it. */
  const shownKey = shown?.key ?? null
  useEffect(() => {
    setOpen(false)
    setError(null)
  }, [shownKey])

  if (!shown) return null
  const s = shown

  const close = () => {
    if (s.key === "conflict") return
    if (s.key === "agent") {
      onAgentNoteSeen()
      return
    }
    dismiss(s.key)
  }

  const list = r ? <SyncDetails report={r} busy={busy} onRun={run} showTaken={s.tone === "info"} /> : null
  const footer = r && s.key === r.key && (r.files.length > 0 || r.problem) ? (
    <div className="flex flex-wrap items-center gap-2 border-t border-[#eceef1] px-3.5 py-3">
      {r.problem
        ? r.problem.actions.map((a) => (
            <ActionButton key={a} label={ACTION_LABEL[a]} busy={busy === `${a}:`} onClick={() => void run(a)} primary={a === r.problem!.actions[0]} />
          ))
        : (
            <>
              <ActionButton label="Try again" busy={busy === "pull:"} onClick={() => void run("pull")} primary />
              {r.canSendSite && <ActionButton label="Replace them on GitHub with your site's version" busy={busy === "push:"} onClick={() => void run("push")} />}
            </>
          )}
    </div>
  ) : null

  const errorLine = error ? <p role="alert" className="px-3.5 pb-3 text-[12px] text-[#b91c1c]">{error}</p> : null

  const bar = (
    <div
      role={s.tone === "error" || s.tone === "warn" ? "alert" : "status"}
      aria-live="polite"
      data-sync-notice={s.tone}
      className={cn(
        "pointer-events-auto mx-auto w-[min(560px,calc(100%-24px))] overflow-hidden rounded-xl border border-[#eceef1] bg-white/95 shadow-[0_8px_24px_-12px_rgba(16,24,40,0.25)] backdrop-blur animate-in fade-in-0 slide-in-from-top-1 duration-200",
      )}
    >
      <div className="flex items-center gap-3 py-2 pl-3.5 pr-1.5">
        <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", DOT[s.tone])} />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[13px] font-semibold text-[#1a1a2e]", phone ? "line-clamp-2" : "truncate")}>{s.title}</span>
          <span className={cn("block text-[12px] text-[#6b7280]", phone ? "line-clamp-2" : "truncate")}>{s.body}</span>
        </span>
        {s.key === "conflict" ? (
          <>
            <button type="button" onClick={onKeepMine} className={secondaryBtn}>
              Keep mine
            </button>
            <button type="button" onClick={onUseTheirs} className={primaryBtn}>
              Use GitHub's
            </button>
          </>
        ) : (
          <>
            {s.details && !(phone && s.tone === "info") && (
              <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={secondaryBtn}>
                <span>Details</span>
                {!phone && <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />}
              </button>
            )}
            {s.primary && (!phone || !s.details || s.tone === "info") && (
              <button type="button" onClick={s.primary.run} disabled={busy !== null} className={primaryBtn}>
                {busy && s.primary.label !== "Publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : s.primary.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={close}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#9ca3af] outline-none transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] max-sm:h-10 max-sm:w-10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      {!phone && open && (
        <div className="border-t border-[#eceef1]">
          <div className="max-h-[min(50vh,420px)] overflow-y-auto overscroll-contain">{list}</div>
          {errorLine}
          {footer}
          {s.primary?.label === "Publish" && (
            <div className="flex justify-end border-t border-[#eceef1] px-3.5 py-3">
              <ActionButton label="Publish" onClick={s.primary.run} primary />
            </div>
          )}
        </div>
      )}
      {!open && errorLine}
    </div>
  )

  return (
    <>
      {bar}
      {phone && (
        <BottomSheet
          isOpen={open}
          onClose={() => setOpen(false)}
          label={s.title}
          header={
            <div className="px-5 pb-3 pt-3">
              <h2 className="text-[17px] font-semibold text-[#1a1a2e]">{s.title}</h2>
              <p className="mt-1 text-[14px] leading-[1.45] text-[#6b7280]">{s.body}</p>
            </div>
          }
        >
          <div data-sync-details="" className="pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            {list}
            {errorLine}
            {footer}
            {s.primary?.label === "Publish" && (
              <div className="border-t border-[#eceef1] px-4 py-3">
                <ActionButton label="Publish" onClick={() => { setOpen(false); s.primary!.run() }} primary wide />
              </div>
            )}
          </div>
        </BottomSheet>
      )}
    </>
  )
}

const primaryBtn =
  "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-[#1a1a2e] px-3 py-1.5 text-[12px] font-medium text-white outline-none transition-colors hover:bg-black focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 disabled:opacity-60 max-sm:min-h-10 max-sm:px-3.5 max-sm:text-[13px]"
const secondaryBtn =
  "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[#1a1a2e] outline-none transition-colors hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 max-sm:min-h-10 max-sm:text-[13px]"

function ActionButton({ label, onClick, busy, primary, wide }: { label: string; onClick: () => void; busy?: boolean; primary?: boolean; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium outline-none transition-colors disabled:opacity-60 max-sm:min-h-11",
        primary ? "bg-[#1a1a2e] text-white hover:bg-black" : "border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f9fafb]",
        wide && "w-full",
      )}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {label}
    </button>
  )
}

/** Each file that did not come in, and what came in. Shared by the desktop panel and the phone's sheet. */
function SyncDetails({ report, busy, onRun, showTaken }: { report: EditorSyncReport; busy: string | null; onRun: (a: SyncAction, f?: ReportFile) => void; showTaken: boolean }) {
  return (
    <div className="text-[13px]">
      {showTaken && report.takenNames.length > 0 && (
        <div className="px-3.5 py-3">
          <p className="text-[12px] font-medium text-[#6b7280]">Updated</p>
          <p className="mt-1 text-[13px] text-[#1a1a2e]">
            {report.takenNames.join(", ")}
            {report.taken > report.takenNames.length ? ` and ${report.taken - report.takenNames.length} more` : ""}
          </p>
        </div>
      )}
      {report.files.length > 0 && (
        <ul className="divide-y divide-[#f1f2f4]">
          {report.files.map((f) => (
            <li key={f.path} className="px-3.5 py-3" data-sync-file={f.path}>
              <p className="break-all font-mono text-[12px] text-[#6b7280]">{f.path}</p>
              <p className="mt-1 font-medium text-[#1a1a2e]">{f.title}</p>
              <p className="mt-0.5 text-[#6b7280]">{f.fix}</p>
              {f.detail && <p className="mt-1.5 rounded-md bg-[#f8f9fa] px-2 py-1.5 text-[12px] text-[#4b5563]">{f.detail}</p>}
              {f.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {f.actions.includes("open") && f.url && (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[12px] font-medium text-[#1a1a2e] hover:bg-[#f9fafb] max-sm:min-h-10"
                    >
                      Open in GitHub
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {f.actions.filter((a) => a !== "open").map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => onRun(a, f)}
                      className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[12px] font-medium text-[#1a1a2e] hover:bg-[#f9fafb] disabled:opacity-60 max-sm:min-h-10"
                    >
                      {busy === `${a}:${f.path}` && <Loader2 className="h-3 w-3 animate-spin" />}
                      {ACTION_LABEL[a]}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
          {report.moreFiles > 0 && <li className="px-3.5 py-2.5 text-[12px] text-[#6b7280]">and {report.moreFiles} more, listed on the commit on GitHub</li>}
        </ul>
      )}
      {report.notes.length > 0 && (
        <div className="border-t border-[#eceef1] px-3.5 py-3">
          <p className="text-[12px] font-medium text-[#6b7280]">Good to know</p>
          <ul className="mt-1 space-y-1">
            {report.notes.map((n, i) => (
              <li key={i} className="text-[12px] text-[#4b5563]">{n}</li>
            ))}
          </ul>
        </div>
      )}
      {report.commitUrl && (
        <div className="border-t border-[#eceef1] px-3.5 py-2.5">
          <a href={report.commitUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[#6b7280] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
            Commit {report.commit} on GitHub
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  )
}

"use client"

/**
 * ===========================================================================
 *  WEBSITE SETTINGS › CONNECTIONS › GITHUB
 * ===========================================================================
 * One repository per website. Storelib writes the site's whole theme (its
 * settings, pages, header and footer, sections and blocks, or an imported
 * theme in Shopify's own folders) and an AGENTS.md into it; Codex in ChatGPT, Claude Code on the web or a person
 * edits them and pushes; every push to the linked branch lands here as a
 * draft, and an open builder shows it within seconds. See lib/github-sync.
 *
 * One line on Connections (./website-settings/connection-row), whose status
 * is where GitHub stands and whose one button is the next thing to do:
 *
 *   not switched on here   says so, and has no button
 *   not connected          Connect: the three steps, the first one being
 *                          the button that goes to GitHub
 *   connected, no repo     Continue: pick the repository
 *   linked                 Manage: Pull, Push, which way changes travel,
 *                          what the last sync did file by file (each file a
 *                          push could not bring in, with its fix), the
 *                          built-in files this site has its own copy of
 *                          (Edited in GitHub, Reset to Storelib's version),
 *                          how to work with an AI on it, what happened
 *                          lately, change or disconnect
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ExternalLink, Loader2 } from "lucide-react"
import { plainWords } from "@/lib/github-sync/editor-status"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { Step, Steps } from "@/components/website-builder/setup-steps"
import { ConnectionRow, InlineButton, RowNote, type ConnectionTone } from "@/components/website-builder/website-settings/connection-row"
import { buttonClass, primaryButtonClass } from "@/components/website-builder/website-settings/parts"
import { tt, msg } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"

interface Link {
  account: string
  repo: string | null
  branch: string | null
  folder: string
  lastSyncedAt: string | null
  lastSyncedSha: string | null
  lastError: string | null
  pushOnSave: boolean
  pullOnPush: boolean
  /** The newest push to a branch this site does not follow. */
  ignored?: { branch: string; at: string } | null
  /** What the last whole sync ran into, e.g. "branch-protected". */
  problem?: string | null
  /** What the last sync did, file by file (part 132). */
  last?: {
    at: string
    direction: "to_github" | "from_github"
    ok: boolean
    commit: string | null
    saved: number
    failed: { path: string; error: string }[]
    notes: { path: string; note: string }[]
    skipped: { path: string; reason: string }[]
  } | null
}

/** A built-in section or block this site has its own copy of. */
interface Edited {
  path: string
  type: string
  kind: "section" | "block"
  from: "github" | "builder"
}

interface SyncEvent {
  id: number
  direction: "to_github" | "from_github"
  ok: boolean
  summary: string
  commit_sha: string | null
  created_at: string
}

interface Status {
  configured: boolean
  ready: boolean
  link: Link | null
  repos: { fullName: string; defaultBranch: string; private: boolean }[]
  reposError?: string | null
  accounts: { installationId: number; account: string }[]
  events: SyncEvent[]
  overrides?: Edited[]
}

/** What GitHub's round trip came back with, from ?github= on the editor's URL. */
const RETURNED: Record<string, string> = {
  get expired() { return tt("That GitHub link expired. Press Continue to GitHub again.") },
  get cancelled() { return tt("GitHub was not connected.") },
  get denied() { return tt("GitHub did not confirm that your account can reach that installation, so nothing was linked.") },
  get "not-set-up"() { return tt("GitHub needs a database update first. Run supabase/sql/RUN_GITHUB_SYNC.sql.") },
  get error() { return tt("Something went wrong saving the link. Try again.") },
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

type Action = "select" | "export" | "disconnect" | "reuse" | "pull" | "settings" | "reset" | "branch"

/** Rows of Recent shown before Show all. */
export const RECENT_SHOWN = 5

/**
 * RECENT, FIVE AT A TIME. The newest five, the fifth fading out under a mask
 * (no colour of its own, so it is right in the light look and the dark), and
 * Show all opening the rest by animating the list's height from those five
 * rows to all of them. Measured from the rows themselves, so a summary that
 * wraps on a phone is not cut in half.
 */
function RecentList({ events, repo }: { events: SyncEvent[]; repo: string | null }) {
  const [open, setOpen] = useState(false)
  const list = useRef<HTMLUListElement>(null)
  const [closedHeight, setClosedHeight] = useState<number | null>(null)
  const [fullHeight, setFullHeight] = useState<number | null>(null)
  const more = events.length > RECENT_SHOWN
  const id = useId()

  useLayoutEffect(() => {
    const el = list.current
    if (!el || !more) return
    const measure = () => {
      const rows = el.children
      const last = rows[RECENT_SHOWN - 1] as HTMLElement | undefined
      if (last) setClosedHeight(last.offsetTop + last.offsetHeight)
      setFullHeight(el.scrollHeight)
    }
    measure()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [events, more])

  return (
    <div className="mt-6" data-recent="">
      <p className="text-[13px] font-medium text-white/50">{tt("Recent")}</p>
      <ul
        ref={list}
        id={id}
        data-recent-list={more ? (open ? "open" : "closed") : "all"}
        className="relative mt-1.5 divide-y divide-white/[0.05] overflow-hidden transition-[max-height,mask-size,-webkit-mask-size] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
        style={
          more
            ? {
                maxHeight: open ? (fullHeight ?? undefined) : (closedHeight ?? RECENT_SHOWN * 40),
                /* The fade: the bottom of the fifth row under a mask, stretched away when the list is open. */
                maskImage: "linear-gradient(to bottom, #000 0%, #000 calc(100% - 44px), transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 calc(100% - 44px), transparent 100%)",
                maskSize: open ? "100% 400%" : "100% 100%",
                WebkitMaskSize: open ? "100% 400%" : "100% 100%",
                maskRepeat: "no-repeat",
                WebkitMaskRepeat: "no-repeat",
              }
            : undefined
        }
      >
        {events.map((ev, i) => (
          <li key={ev.id} className="flex items-center gap-3 py-2 text-[13px]" inert={more && !open && i >= RECENT_SHOWN ? true : undefined}>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${ev.ok ? "bg-white/[0.06] text-white/60" : "bg-red-500/15 text-red-300"}`}
              aria-label={ev.direction === "to_github" ? tt("To GitHub") : tt("From GitHub")}
            >
              {ev.direction === "to_github" ? <ArrowUpFromLine className="h-3.5 w-3.5" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
            </span>
            <span className={`min-w-0 flex-1 truncate ${ev.ok ? "text-white/80" : "text-red-200"}`} title={plainWords(ev.summary, 600)}>{plainWords(ev.summary)}</span>
            {ev.commit_sha && repo && (
              <a
                href={`https://github.com/${repo}/commit/${ev.commit_sha}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden shrink-0 font-mono text-[12px] text-white/50 hover:text-white sm:inline"
              >
                {ev.commit_sha.slice(0, 7)}
              </a>
            )}
            <span className="shrink-0 text-[12px] text-white/50">{relativeTime(ev.created_at)}</span>
          </li>
        ))}
      </ul>
      {more && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="mt-1 inline-flex h-11 items-center gap-1 text-[13px] font-medium text-white/70 transition-colors hover:text-white md:h-8 [-webkit-tap-highlight-color:transparent]"
        >
          {open ? tt("Show less") : tt("Show all {n}", { n: events.length })}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  )
}

/**
 * A direction and its switch. The switch is drawn here rather than borrowed:
 * the thumb is placed with `left`, then moved by exactly the track's width
 * less the thumb and both gaps, so it cannot land outside the track.
 */
function SyncRow({ title, detail, on, busy, onChange }: {
  title: string
  detail: string
  on: boolean
  busy: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex min-h-[60px] cursor-pointer items-center gap-4 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium text-white/90 md:text-[14px]">{title}</span>
        <span className="block text-[13px] text-white/50">{on ? detail : tt("Off")}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={busy}
        onClick={() => onChange(!on)}
        className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-60 ${on ? "bg-emerald-500" : "bg-white/15"}`}
      >
        <span
          aria-hidden
          className={`absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-[18px]" : "translate-x-0"}`}
        />
      </button>
    </label>
  )
}

const STEPS = [
  [msg("Connect a repository"), msg("Storelib writes this website's whole theme into it: settings, pages, header and footer, sections and blocks, with an AGENTS.md your tool reads first.")],
  [msg("Ask your agent for a change"), msg("Open the repository in Codex in ChatGPT or Claude Code on the web and ask for a section, a page or a settings change.")],
  [msg("It appears here"), msg("Each push arrives within seconds, as a draft. Publish when you like it.")],
] as const

/** Where an AI works on the repository, from the web. */
const AI_TOOLS = [
  { name: "Claude Code", href: "https://claude.ai/code" },
  { name: "Codex", href: "https://chatgpt.com/codex" },
] as const

/** A built-in's line: which file, and where its copy came from. Pure, tested as words. */
export function editedLabel(e: Pick<Edited, "path" | "from">): { name: string; badge: string } {
  return { name: e.path, badge: e.from === "github" ? tt("Edited in GitHub") : tt("Edited in the builder") }
}

/** What GitHub's line says. Pure, so the words are tested as words. */
export function githubStatus(
  status: Pick<Status, "configured" | "ready" | "link"> | null,
  failed: boolean,
): { tone: ConnectionTone; status?: string; detail?: string; action?: string; loading?: boolean } {
  if (!status) return failed ? { tone: "attention", status: "Could not check GitHub", action: tt("Open") } : { tone: "off", loading: true }
  if (!status.configured) return { tone: "none", status: "Not switched on for this Storelib yet" }
  if (!status.ready) return { tone: "none", status: "Needs a database update first" }
  const link = status.link
  if (!link) return { tone: "off", status: "Not connected", action: tt("Connect") }
  if (!link.repo) return { tone: "attention", status: "Pick a repository", detail: link.account || undefined, action: tt("Continue") }
  if (link.lastError) return { tone: "attention", status: "Last sync failed", detail: link.repo, action: tt("Manage") }
  return { tone: "on", status: "Connected", detail: link.repo, action: tt("Manage") }
}

export function GitHubSyncPanel({
  installId,
  returned,
  open,
  onToggle,
  recommended = false,
}: {
  installId: string
  returned?: string | null
  open: boolean
  onToggle: () => void
  /** First on Connections, marked Recommended: one repository every coding tool can work in. */
  recommended?: boolean
}) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(returned && RETURNED[returned] ? RETURNED[returned] : null)
  const [busy, setBusy] = useState<null | Action>(null)
  const [repo, setRepo] = useState("")
  const [branch, setBranch] = useState("")
  const [folder, setFolder] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [confirmReset, setConfirmReset] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/github`)
      const d = (await res.json().catch(() => ({}))) as Status & { error?: string }
      if (!res.ok) throw new Error(d.error || tt("Could not load GitHub"))
      setStatus(d)
      if (d.repos?.length && !repo) {
        setRepo(d.repos[0].fullName)
        setBranch(d.repos[0].defaultBranch)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not load GitHub"))
    }
  }, [installId, repo])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installId])

  const post = async (body: Record<string, unknown>, kind: Action) => {
    setBusy(kind)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; upToDate?: boolean; saved?: number; failed?: unknown[] }
      if (!res.ok) throw new Error(d.error || tt("GitHub did not answer"))
      if (kind === "export" || kind === "select") setNotice(d.upToDate ? tt("GitHub already has the whole theme.") : tt("Sent the whole theme to GitHub."))
      if (kind === "pull") {
        const n = d.saved ?? 0
        const bad = d.failed?.length ?? 0
        setNotice(n === 0 && bad === 0 ? tt("Already up to date.") : tt("{n, plural, one {# file} other {# files}} pulled as a draft{value}.", { n, value: bad ? tt(", {bad} not taken (listed below)", { bad }) : "" }))
      }
      if (kind === "reset") setNotice(tt("Back to Storelib's version. GitHub gets it too."))
      if (kind === "branch") setNotice(tt("This site follows {branch} now.", { branch: String(body.branch) }))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("GitHub did not answer"))
      await load()
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    setBusy("disconnect")
    setError(null)
    const res = await fetch(`/api/website-builder/themes/${installId}/github`, { method: "DELETE" }).catch(() => null)
    setBusy(null)
    setConfirmDisconnect(false)
    if (!res?.ok) {
      setError(tt("Could not disconnect. Try again."))
      return
    }
    setNotice(null)
    await load()
  }

  const link = status?.link ?? null
  const linked = Boolean(link?.repo)
  const line = githubStatus(status, error !== null)

  const connectButtons = status ? (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
      <a href={`/api/github/connect?installId=${encodeURIComponent(installId)}`} className={primaryButtonClass}>
        <GitHubMark className="h-4 w-4" />
        {tt("Continue to GitHub")}
      </a>
      {status.accounts.map((a) => (
        <button
          key={a.installationId}
          type="button"
          disabled={busy !== null}
          onClick={() => void post({ action: "reuse", installationId: a.installationId }, "reuse")}
          className={buttonClass}
        >
          {busy === "reuse" && <Loader2 className="h-4 w-4 animate-spin" />}
          {tt("Use")} {a.account || tt("your GitHub")}
        </button>
      ))}
    </div>
  ) : null

  const picker = status && link ? (
    <div>
      <p className="text-[14px] text-white/60">
        <Rich text={tt("Connected to {account}. Pick the repository for this website.")} parts={{ account: <span className="text-white">{link.account || "GitHub"}</span> }} />
      </p>
      {status.reposError ? (
        <p className="mt-3 text-[14px] text-red-300">{status.reposError}</p>
      ) : status.repos.length === 0 ? (
        <p className="mt-3 text-[14px] text-white/60">
          {tt("Storelib cannot see any repositories. Give it access to one on GitHub, then")} <InlineButton onClick={() => void load()}>{tt("check again")}</InlineButton>.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
          <label className="block">
            <span className="text-[13px] text-white/50">{tt("Repository")}</span>
            <select
              value={repo}
              onChange={(e) => {
                setRepo(e.target.value)
                setBranch(status.repos.find((r) => r.fullName === e.target.value)?.defaultBranch ?? "")
              }}
              className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#171717] px-3 text-[16px] text-white outline-none focus:border-white/35 md:h-10 md:text-[14.5px]"
            >
              {status.repos.map((r) => (
                <option key={r.fullName} value={r.fullName}>{r.fullName}{r.private ? " (private)" : ""}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[13px] text-white/50">{tt("Branch")}</span>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#171717] px-3 font-mono text-[16px] text-white outline-none focus:border-white/35 md:h-10 md:text-[14px]"
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-white/50">{tt("Folder")}</span>
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder={tt("Top of the repository")}
              className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#171717] px-3 font-mono text-[16px] text-white outline-none placeholder:font-sans placeholder:text-white/30 focus:border-white/35 md:h-10 md:text-[14px]"
            />
          </label>
          <p className="text-[13px] leading-relaxed text-white/50 md:col-span-3">
            {tt("An empty repository works best. If the branch is protected on GitHub, type a new one, such as storelib, and Storelib makes it.")}
          </p>
          <button
            type="button"
            disabled={busy !== null || !repo}
            onClick={() => void post({ action: "select", repo, branch, folder }, "select")}
            className={`${primaryButtonClass} md:col-span-3 md:justify-self-start`}
          >
            {busy === "select" && <Loader2 className="h-4 w-4 animate-spin" />}
            {tt("Link and send the theme")}
          </button>
        </div>
      )}
    </div>
  ) : null

  const messages = (
    <>
      {notice && <RowNote tone="good">{notice}</RowNote>}
      {error && <RowNote tone="bad">{error}</RowNote>}
    </>
  )

  /*
    NOT LINKED YET: the same steps as Claude Code and Codex, and the first
    one is where you act. The two after it say what happens next, in a line
    each, drawn quieter until there is a repository.
  */
  const setup = () => (
    <>
      {status === null ? null : !status.configured ? (
        <p className="text-[14px] text-white/60">{tt("GitHub is not switched on for this Storelib yet.")}</p>
      ) : !status.ready ? (
        <p className="text-[14px] text-white/60">{tt("GitHub needs a database update first. Run supabase/sql/RUN_GITHUB_SYNC.sql.")}</p>
      ) : (
        <Steps>
          <Step n={1} title={tt(STEPS[0][0])}>
            {!link ? (
              <>
                <p className="mb-3.5 text-[13.5px] leading-relaxed text-white/55">{tt(STEPS[0][1])}</p>
                {connectButtons}
              </>
            ) : (
              picker
            )}
          </Step>
          <Step n={2} title={tt(STEPS[1][0])} muted>
            <p className="text-[13.5px] leading-relaxed text-white/60">{tt(STEPS[1][1])}</p>
          </Step>
          <Step n={3} title={tt(STEPS[2][0])} muted>
            <p className="text-[13.5px] leading-relaxed text-white/60">{tt(STEPS[2][1])}</p>
          </Step>
        </Steps>
      )}
      {messages}
    </>
  )

  /* LINKED: the repository, what to press, which way changes travel, what happened. */
  const manage = () =>
    status && link ? (
      <>
        <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <a
              href={`https://github.com/${link.repo}/tree/${encodeURIComponent(link.branch ?? "")}${link.folder ? `/${link.folder}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 truncate text-[15px] font-medium text-white hover:underline"
            >
              {link.repo}
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-white/50" />
            </a>
            <p className="mt-0.5 text-[13px] text-white/50">
              <span className="font-mono">{link.branch}</span>
              {link.folder && <span className="font-mono"> · {link.folder}</span>}
              <span className="text-white/30"> · </span>
              {link.lastSyncedAt ? tt("Synced {time}", { time: relativeTime(link.lastSyncedAt) }) : tt("Not synced yet")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" disabled={busy !== null} onClick={() => void post({ action: "pull" }, "pull")} className={buttonClass}>
              {busy === "pull" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              {tt("Pull")}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void post({ action: "export" }, "export")} className={buttonClass}>
              {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
              {tt("Push")}
            </button>
          </div>
        </div>

        {link.lastError && !error && <RowNote tone="bad">{plainWords(link.lastError, 400)}</RowNote>}
        {/* A protected branch: one press sends the site to a branch of its own and follows it there. */}
        {link.problem === "branch-protected" && link.branch !== "storelib" && (
          <div className="mt-2.5">
            <button type="button" disabled={busy !== null} onClick={() => void post({ action: "use-branch", branch: "storelib", then: "push" }, "branch")} className={buttonClass}>
              {busy === "branch" && <Loader2 className="h-4 w-4 animate-spin" />}
              {tt("Use a storelib branch")}
            </button>
          </div>
        )}
        {/* A push to a branch this site does not follow, usually an agent's own: follow it and bring it in. */}
        {link.ignored && (
          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] leading-relaxed text-white/60">
              <Rich
                text={tt("A push to {pushed} wasn't brought in. This site follows {branch}.")}
                parts={{ pushed: <span className="font-mono text-white/80">{link.ignored.branch}</span>, branch: <span className="font-mono text-white/80">{link.branch}</span> }}
              />
            </p>
            <button type="button" disabled={busy !== null} onClick={() => void post({ action: "use-branch", branch: link.ignored!.branch, then: "pull" }, "branch")} className={`${buttonClass} shrink-0`}>
              {busy === "branch" && <Loader2 className="h-4 w-4 animate-spin" />}
              {tt("Follow {branch}", { branch: link.ignored.branch })}
            </button>
          </div>
        )}
        {messages}

        {/* Every file the last sync could not bring in, with what to fix. The rest of that push is already in. */}
        {link.last && link.last.failed.length > 0 && (
          <div className="mt-4">
            <p className="text-[13px] font-medium text-white/60">
              {tt("Not taken from")} {link.last.commit ? <span className="font-mono">{link.last.commit.slice(0, 7)}</span> : tt("the last sync")}{tt(". Fix these in the repository and push again:")}
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {link.last.failed.map((f) => (
                <li key={f.path + f.error} className="text-[13px] leading-relaxed text-red-200/90">
                  {plainWords(f.error, 400)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {link.last && link.last.notes.length > 0 && (
          <ul className="mt-3 space-y-1">
            {link.last.notes.slice(0, 6).map((n) => (
              <li key={n.path + n.note} className="text-[13px] leading-relaxed text-white/50">{plainWords(n.note, 400)}</li>
            ))}
          </ul>
        )}

        {/* Built-ins this site has its own copy of: drawn here only, and one press from Storelib's again. */}
        {(status.overrides?.length ?? 0) > 0 && (
          <div className="mt-6">
            <p className="text-[13px] font-medium text-white/50">{tt("Built-in files this site has its own copy of")}</p>
            <ul className="mt-1.5 divide-y divide-white/[0.05]">
              {status.overrides!.map((o) => {
                const label = editedLabel(o)
                return (
                  <li key={o.path} className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate font-mono text-white/80">{label.name}</span>
                    <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-0.5 text-[12px] text-white/60">{label.badge}</span>
                    {confirmReset === o.path ? (
                      <span className="flex shrink-0 items-center gap-3">
                        <button type="button" onClick={() => setConfirmReset(null)} className="h-11 text-white/70 hover:text-white md:h-auto">{tt("Keep")}</button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void post({ action: "reset-override", path: o.path }, "reset").then(() => setConfirmReset(null))}
                          className="h-11 font-medium text-red-300 hover:text-red-200 md:h-auto"
                        >
                          {busy === "reset" ? tt("Resetting") : tt("Reset")}
                        </button>
                      </span>
                    ) : (
                      <InlineButton onClick={() => setConfirmReset(o.path)}>{tt("Reset to Storelib's version")}</InlineButton>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Which way changes travel: two switches, named as the two directions they are. */}
        <div className="mt-5 divide-y divide-white/[0.07] border-y border-white/[0.07]">
          <SyncRow
            title={tt("Builder to GitHub")}
            detail={tt("Code you save here is committed, and the whole theme on Publish")}
            on={link.pushOnSave}
            busy={busy === "settings"}
            onChange={(v) => void post({ action: "settings", pushOnSave: v }, "settings")}
          />
          <SyncRow
            title={tt("GitHub to builder")}
            detail={tt("Every push to the branch arrives as a draft")}
            on={link.pullOnPush}
            busy={busy === "settings"}
            onChange={(v) => void post({ action: "settings", pullOnPush: v }, "settings")}
          />
        </div>

        {/* Working with an AI on it: the repository is the whole theme, and its AGENTS.md tells the tool the rest. */}
        <div className="mt-6">
          <p className="text-[13px] font-medium text-white/50">{tt("Use it with an AI")}</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13.5px] leading-relaxed text-white/70">
            <li>
              {tt("Open {repo} in", { repo: link.repo })}{" "}
              {AI_TOOLS.map((t, i) => (
                <span key={t.name}>
                  {i > 0 && " or "}
                  <a href={t.href} target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2 hover:text-white/80">{t.name}</a>
                </span>
              ))}
              .
            </li>
            <li>{tt("Ask for a change, such as “make the hero taller”. It reads AGENTS.md first.")}</li>
            <li><Rich text={tt("When it pushes to {branch}, the change shows here as a draft within seconds.")} parts={{ branch: <span className="font-mono">{link.branch}</span> }} /></li>
          </ol>
        </div>

        {/* What went each way, lately. */}
        {status.events.length > 0 && <RecentList events={status.events} repo={link.repo} />}

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] md:text-[13px]">
          <InlineButton onClick={() => void post({ action: "change-repo" }, "reuse")}>{tt("Change repository")}</InlineButton>
          {confirmDisconnect ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-white/60">{tt("Disconnect GitHub? The repository stays as it is.")}</span>
              <button type="button" onClick={() => setConfirmDisconnect(false)} className="h-11 text-white/70 hover:text-white md:h-auto">{tt("Keep")}</button>
              <button type="button" onClick={() => void disconnect()} className="h-11 font-medium text-red-300 hover:text-red-200 md:h-auto">{tt("Disconnect")}</button>
            </span>
          ) : (
            <InlineButton onClick={() => setConfirmDisconnect(true)}>{tt("Disconnect")}</InlineButton>
          )}
        </div>
      </>
    ) : null

  return (
    <ConnectionRow
      id="github"
      mark={<GitHubMark className="h-5 w-5" />}
      name="GitHub"
      badge={recommended ? tt("Recommended") : undefined}
      featured={recommended}
      tone={line.tone}
      status={line.status}
      detail={line.detail}
      loading={line.loading}
      action={line.action}
      open={open}
      onToggle={onToggle}
    >
      {() => (linked ? manage() : setup())}
    </ConnectionRow>
  )
}

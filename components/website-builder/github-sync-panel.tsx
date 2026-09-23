"use client"

/**
 * ===========================================================================
 *  WEBSITE SETTINGS › CONNECTIONS › GITHUB
 * ===========================================================================
 * One repository per website. Storelib writes the site's section files and an
 * AGENTS.md into it; Claude Code, Codex or a person edits them and pushes;
 * every push to the linked branch lands here as a draft, and an open builder
 * shows it within seconds. See lib/github-sync.
 *
 * Four states, each one screen: GitHub is not set up on this Storelib;
 * not connected; connected but no repository picked; linked. The first
 * three are the three steps, with the first one being where you act; the
 * last is the linked repository and its two switches.
 */
import { useCallback, useEffect, useState } from "react"
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, Loader2 } from "lucide-react"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { Step, Steps } from "@/components/website-builder/setup-steps"

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
}

/** What GitHub's round trip came back with, from ?github= on the editor's URL. */
const RETURNED: Record<string, string> = {
  expired: "That GitHub link expired. Press Connect GitHub again.",
  cancelled: "GitHub was not connected.",
  denied: "GitHub did not confirm that your account can reach that installation, so nothing was linked.",
  "not-set-up": "GitHub needs a database update first. Run supabase/sql/RUN_GITHUB_SYNC.sql.",
  error: "Something went wrong saving the link. Try again.",
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

type Action = "select" | "export" | "disconnect" | "reuse" | "pull" | "settings"

/**
 * A direction and its switch. The switch is drawn here rather than borrowed:
 * the thumb is placed with `left`, then moved by exactly the track's width
 * less the thumb and both gaps, so it cannot land outside the track.
 */
function SyncRow({ icon, title, detail, on, busy, onChange }: {
  icon: React.ReactNode
  title: string
  detail: string
  on: boolean
  busy: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 border-b border-white/[0.07] px-3.5 py-3 last:border-0">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${on ? "bg-white text-[#0f0f0f]" : "bg-white/[0.06] text-white/40"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{title}</span>
        <span className="block text-[13px] text-white/50">{on ? detail : "Off"}</span>
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
  ["Connect a repository", "Storelib writes this website's sections into it, with an AGENTS.md your tool reads first."],
  ["Ask your agent for a change", "Open the repository in ChatGPT Codex or Claude Code on the web and ask for a section."],
  ["It appears here", "Merge it and it arrives within seconds, as a draft. Publish when you like it."],
] as const

export function GitHubSyncPanel({ installId, returned }: { installId: string; returned?: string | null }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(returned && RETURNED[returned] ? RETURNED[returned] : null)
  const [busy, setBusy] = useState<null | Action>(null)
  const [repo, setRepo] = useState("")
  const [branch, setBranch] = useState("")
  const [folder, setFolder] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/github`)
      const d = (await res.json().catch(() => ({}))) as Status & { error?: string }
      if (!res.ok) throw new Error(d.error || "Could not load GitHub")
      setStatus(d)
      if (d.repos?.length && !repo) {
        setRepo(d.repos[0].fullName)
        setBranch(d.repos[0].defaultBranch)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load GitHub")
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
      if (!res.ok) throw new Error(d.error || "GitHub did not answer")
      if (kind === "export" || kind === "select") setNotice(d.upToDate ? "GitHub already has the latest." : "Pushed to GitHub.")
      if (kind === "pull") {
        const n = d.saved ?? 0
        const bad = d.failed?.length ?? 0
        setNotice(n === 0 && bad === 0 ? "Already up to date." : `${n} section${n === 1 ? "" : "s"} pulled as a draft${bad ? `, ${bad} did not compile` : ""}.`)
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "GitHub did not answer")
      await load()
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    setBusy("disconnect")
    setError(null)
    const res = await fetch(`/api/website-builder/themes/${installId}/github`, { method: "DELETE" })
    setBusy(null)
    setConfirmDisconnect(false)
    if (!res.ok) {
      setError("Could not disconnect. Try again.")
      return
    }
    setNotice(null)
    await load()
  }

  const link = status?.link ?? null
  const linked = Boolean(link?.repo)

  const connectButtons = status ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <a
              href={`/api/github/connect?installId=${encodeURIComponent(installId)}`}
              className="inline-flex h-11 items-center justify-center gap-2.5 rounded-xl bg-white px-5 text-[15px] font-medium text-[#0f0f0f] transition-opacity hover:opacity-90"
            >
              <GitHubMark className="h-4 w-4" />
              Connect GitHub
            </a>
            {status.accounts.map((a) => (
              <button
                key={a.installationId}
                type="button"
                disabled={busy !== null}
                onClick={() => void post({ action: "reuse", installationId: a.installationId }, "reuse")}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-5 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.08] disabled:opacity-50"
              >
                {busy === "reuse" && <Loader2 className="h-4 w-4 animate-spin" />}
                Use {a.account || "your GitHub"}
              </button>
            ))}
          </div>
  ) : null

  const picker = status && link ? (
          <div>
            <p className="text-[14px] text-white/60">
              Connected to <span className="text-white">{link.account || "GitHub"}</span>. Pick the repository for this website.
            </p>
            {status.reposError ? (
              <p className="mt-3 text-[14px] text-red-300">{status.reposError}</p>
            ) : status.repos.length === 0 ? (
              <p className="mt-3 text-[14px] text-white/60">
                Storelib cannot see any repositories. Give it access to one on GitHub, then{" "}
                <button type="button" onClick={() => void load()} className="underline underline-offset-2">check again</button>.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
                <label className="block">
                  <span className="text-[13px] text-white/50">Repository</span>
                  <select
                    value={repo}
                    onChange={(e) => {
                      setRepo(e.target.value)
                      setBranch(status.repos.find((r) => r.fullName === e.target.value)?.defaultBranch ?? "")
                    }}
                    className="mt-1.5 h-11 w-full rounded-xl border border-white/15 bg-[#1a1a1a] px-3 text-[15px] text-white outline-none focus:border-white/40"
                  >
                    {status.repos.map((r) => (
                      <option key={r.fullName} value={r.fullName}>{r.fullName}{r.private ? " (private)" : ""}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[13px] text-white/50">Branch</span>
                  <input
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 font-mono text-[14px] text-white outline-none focus:border-white/40"
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] text-white/50">Folder</span>
                  <input
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    placeholder="Top of the repository"
                    className="mt-1.5 h-11 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 font-mono text-[14px] text-white outline-none placeholder:font-sans placeholder:text-white/30 focus:border-white/40"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy !== null || !repo}
                  onClick={() => void post({ action: "select", repo, branch, folder }, "select")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[15px] font-medium text-[#0f0f0f] transition-opacity hover:opacity-90 disabled:opacity-50 md:col-span-3 md:justify-self-start"
                >
                  {busy === "select" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Link and send sections
                </button>
              </div>
            )}
          </div>
  ) : null

  const messages = (
    <>
      {notice && <p className="mt-4 text-[14px] text-emerald-300">{notice}</p>}
      {error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[14px] text-red-300">{error}</p>
      )}
    </>
  )

  /*
    NOT LINKED YET: the same three steps as connecting directly, and the
    first one is where you do it. The two after it say what happens next,
    in a line each, and are drawn quieter until there is a repository.
  */
  if (!linked) {
    return (
      <section aria-labelledby="github-title">
        <h2 id="github-title" className="sr-only">GitHub</h2>
        <Steps>
          <Step n={1} title={STEPS[0][0]}>
            {status === null ? (
              <div className="flex items-center gap-2 text-[14px] text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking GitHub
              </div>
            ) : !status.configured ? (
              <p className="text-[14px] text-white/60">GitHub is not switched on for this Storelib yet.</p>
            ) : !status.ready ? (
              <p className="text-[14px] text-white/60">GitHub needs a database update first. Run supabase/sql/RUN_GITHUB_SYNC.sql.</p>
            ) : !link ? (
              <>
                <p className="mb-3 text-[13.5px] text-white/55">{STEPS[0][1]}</p>
                {connectButtons}
              </>
            ) : (
              picker
            )}
          </Step>
          <Step n={2} title={STEPS[1][0]} muted>
            <p className="text-[13.5px] leading-relaxed text-white/60">{STEPS[1][1]}</p>
          </Step>
          <Step n={3} title={STEPS[2][0]} muted>
            <p className="text-[13.5px] leading-relaxed text-white/60">{STEPS[2][1]}</p>
          </Step>
        </Steps>
        {messages}
      </section>
    )
  }

  return (
    <section aria-labelledby="github-title" className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4 md:px-6">
        <GitHubMark className="h-5 w-5 shrink-0 text-white" />
        <h2 id="github-title" className="text-[15px] font-medium">GitHub</h2>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-300">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Linked
        </span>
      </div>

      <div className="p-5 md:p-6">
        {status && link && (
          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <a
                  href={`https://github.com/${link.repo}/tree/${encodeURIComponent(link.branch ?? "")}${link.folder ? `/${link.folder}` : ""}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-[15px] font-medium hover:underline"
                >
                  {link.repo}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-white/50" />
                </a>
                <p className="mt-0.5 text-[13px] text-white/50">
                  <span className="font-mono">{link.branch}</span>
                  {link.folder && <span className="font-mono"> · {link.folder}</span>}
                  <span className="text-white/30"> · </span>
                  {link.lastSyncedAt ? `Synced ${relativeTime(link.lastSyncedAt)}` : "Not synced yet"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void post({ action: "pull" }, "pull")}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 px-3.5 text-[14px] font-medium text-white transition-colors hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {busy === "pull" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                  Pull
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void post({ action: "export" }, "export")}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-[14px] font-medium text-[#0f0f0f] hover:opacity-90 disabled:opacity-50"
                >
                  {busy === "export" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                  Push
                </button>
              </div>
            </div>

            {/* Which way changes travel. Two switches, drawn as the two
                directions they are, so what they do needs no paragraph. */}
            <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
              <SyncRow
                icon={<ArrowUpFromLine className="h-4 w-4" />}
                title="Builder to GitHub"
                detail="Every section you save here is committed"
                on={link.pushOnSave}
                busy={busy === "settings"}
                onChange={(v) => void post({ action: "settings", pushOnSave: v }, "settings")}
              />
              <SyncRow
                icon={<ArrowDownToLine className="h-4 w-4" />}
                title="GitHub to builder"
                detail="Every push to the branch arrives as a draft"
                on={link.pullOnPush}
                busy={busy === "settings"}
                onChange={(v) => void post({ action: "settings", pullOnPush: v }, "settings")}
              />
            </div>

            {link.lastError && !error && (
              <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[13px] text-amber-200">{link.lastError}</p>
            )}

            {/* What went each way, lately. */}
            {status.events.length > 0 && (
              <div className="mt-5">
                <p className="text-[13px] font-medium text-white/50">Recent</p>
                <ul className="mt-2 space-y-px overflow-hidden rounded-xl border border-white/10">
                  {status.events.map((ev) => (
                    <li key={ev.id} className="flex items-center gap-3 bg-white/[0.02] px-3.5 py-2.5 text-[13px]">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${ev.ok ? "bg-white/[0.06] text-white/70" : "bg-red-500/15 text-red-300"}`}
                        aria-label={ev.direction === "to_github" ? "To GitHub" : "From GitHub"}
                      >
                        {ev.direction === "to_github" ? <ArrowUpFromLine className="h-3.5 w-3.5" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                      </span>
                      <span className={`min-w-0 flex-1 truncate ${ev.ok ? "text-white/80" : "text-red-200"}`}>{ev.summary}</span>
                      {ev.commit_sha && link.repo && (
                        <a
                          href={`https://github.com/${link.repo}/commit/${ev.commit_sha}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hidden shrink-0 font-mono text-[12px] text-white/40 hover:text-white sm:inline"
                        >
                          {ev.commit_sha.slice(0, 7)}
                        </a>
                      )}
                      <span className="shrink-0 text-[12px] text-white/35">{relativeTime(ev.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void post({ action: "change-repo" }, "reuse")}
                className="text-white/60 underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
              >
                Change repository
              </button>
              {confirmDisconnect ? (
                <span className="flex items-center gap-3">
                  <span className="text-white/60">Disconnect GitHub? The repository stays as it is.</span>
                  <button type="button" onClick={() => setConfirmDisconnect(false)} className="text-white/70 hover:text-white">Keep</button>
                  <button type="button" onClick={() => void disconnect()} className="font-medium text-red-300 hover:text-red-200">Disconnect</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDisconnect(true)} className="text-white/60 underline-offset-2 hover:text-white hover:underline">
                  Disconnect
                </button>
              )}
            </div>
          </div>
        )}

        {messages}
      </div>
    </section>
  )
}

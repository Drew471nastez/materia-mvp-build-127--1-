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
 * not connected; connected but no repository picked; linked.
 */
import { useCallback, useEffect, useState } from "react"
import { ExternalLink, Loader2 } from "lucide-react"
import { relativeTime } from "@/lib/website-builder/relative-time"

interface Link {
  account: string
  repo: string | null
  branch: string | null
  folder: string
  lastSyncedAt: string | null
  lastSyncedSha: string | null
  lastError: string | null
}

interface Status {
  configured: boolean
  ready: boolean
  link: Link | null
  repos: { fullName: string; defaultBranch: string; private: boolean }[]
  reposError?: string | null
  accounts: { installationId: number; account: string }[]
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

const STEPS = [
  ["Connect a repository", "Storelib writes this website's sections into it, with an AGENTS.md that tells Claude Code or Codex how they work."],
  ["Ask your agent for a change", "It edits a file in sections/ and pushes, like any other code change."],
  ["It appears here", "Within seconds, as a draft. A new section is placed on the page you have open. Publish when you like it."],
] as const

export function GitHubSyncPanel({ installId, returned }: { installId: string; returned?: string | null }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(returned && RETURNED[returned] ? RETURNED[returned] : null)
  const [busy, setBusy] = useState<null | "select" | "export" | "disconnect" | "reuse">(null)
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

  const post = async (body: Record<string, unknown>, kind: "select" | "export" | "reuse") => {
    setBusy(kind)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; upToDate?: boolean }
      if (!res.ok) throw new Error(d.error || "GitHub did not answer")
      if (kind !== "reuse") setNotice(d.upToDate ? "GitHub already has the latest." : "Sent to GitHub.")
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

  return (
    <section aria-labelledby="github-title" className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-start gap-4 p-5 md:p-6">
        <GitHubMark className="mt-0.5 h-6 w-6 shrink-0 text-white" />
        <div className="min-w-0 flex-1">
          <h2 id="github-title" className="text-[17px] font-medium">GitHub</h2>
          <p className="mt-1 max-w-[560px] text-[14px] leading-relaxed text-white/60">
            Keep this website&apos;s sections in a repository. Claude Code, Codex or anyone on your team pushes a change and it
            shows up here.
          </p>
        </div>
      </div>

      <ol className="grid gap-px border-t border-white/[0.07] bg-white/[0.07] md:grid-cols-3">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="bg-[#141414] px-5 py-4 md:px-6">
            <p className="text-[13px] font-medium text-white/40">{i + 1}</p>
            <p className="mt-1 text-[14px] font-medium">{title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-white/50">{body}</p>
          </li>
        ))}
      </ol>

      <div className="border-t border-white/[0.07] p-5 md:p-6">
        {status === null ? (
          <div className="flex items-center gap-2 text-[14px] text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking GitHub
          </div>
        ) : !status.configured ? (
          <p className="text-[14px] text-white/60">GitHub is not switched on for this Storelib yet.</p>
        ) : !status.ready ? (
          <p className="text-[14px] text-white/60">GitHub needs a database update first. Run supabase/sql/RUN_GITHUB_SYNC.sql.</p>
        ) : !link ? (
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
        ) : !linked ? (
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
        ) : (
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
              <div className="flex shrink-0 items-center gap-2">
                {confirmDisconnect ? (
                  <>
                    <button type="button" onClick={() => setConfirmDisconnect(false)} className="h-9 rounded-lg px-3 text-[14px] text-white/70 hover:text-white">
                      Keep
                    </button>
                    <button
                      type="button"
                      onClick={() => void disconnect()}
                      className="h-9 rounded-lg bg-red-500/90 px-4 text-[14px] font-medium text-white hover:bg-red-500"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void post({ action: "export" }, "export")}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-[14px] font-medium text-[#0f0f0f] hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === "export" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Send to GitHub
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(true)}
                      className="h-9 rounded-lg border border-white/15 px-4 text-[14px] font-medium text-white transition-colors hover:bg-white/[0.1]"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>
            {link.lastError && !error && <p className="mt-3 text-[14px] text-amber-300">Last push: {link.lastError}</p>}
            <p className="mt-4 text-[13px] leading-relaxed text-white/45">
              Only files named sections/&lt;name&gt;.storelib are read. Each push gets a Storelib check on GitHub: green when every
              file compiled, red with the first error when one did not. Deleting a file on GitHub leaves the section on your site.
            </p>
          </div>
        )}

        {notice && <p className="mt-4 text-[14px] text-emerald-300">{notice}</p>}
        {error && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[14px] text-red-300">{error}</p>
        )}
      </div>
    </section>
  )
}

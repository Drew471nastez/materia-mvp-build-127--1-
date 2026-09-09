"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, Check, Copy, ExternalLink, Globe, Loader2, Rocket, Settings } from "lucide-react"

import { relativeTime } from "@/components/website-builder/publish-panel"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  PROJECT SETTINGS — A PAGE OVER THE BUILDER, NOT A DIALOG IN IT
 * ===========================================================================
 *
 * The reference is a whole screen: a nav down the left, one subject at a
 * time on the right, and "Back to project" as the only way out. That shape
 * says "you have stepped out of the editor to look at the project itself",
 * which is what settings are. A dialog would say "here is a small thing to
 * adjust before you carry on", which they are not.
 *
 * It is still the same page underneath — no navigation, no reload, the draft
 * in the editor untouched — so the address is left alone. Pushing
 * `?page=project` into history would give the browser's Back button a job
 * the screen's own Back already does, and two Backs that mean different
 * things is how somebody loses an edit.
 *
 * ONLY WHAT IS REAL IS SHOWN. The reference has Analytics, Knowledge,
 * Skills, Backups. None of those exist here yet, and a nav entry that opens
 * an empty panel is a promise the product cannot keep. Three sections, each
 * backed by something: the name (PATCH exists), the address (it is what it
 * is), and publishing (status and time are on the install).
 */

type Section = "general" | "domains" | "publishing"

export function ProjectSettings({
  open,
  onClose,
  installId,
  name,
  onRenamed,
  websiteUrl,
  websiteUrlDisplay,
  live,
  publishedAt,
}: {
  open: boolean
  onClose: () => void
  installId: string
  name: string
  onRenamed: (name: string) => void
  websiteUrl: string
  websiteUrlDisplay: string
  live: boolean
  publishedAt: string | null
}) {
  const [section, setSection] = useState<Section>("general")
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(name)
      setError(null)
      setSaved(false)
    }
  }, [open, name])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const dirty = draft.trim() !== name.trim() && draft.trim().length > 0

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Could not save the name")
      onRenamed(json?.install?.name ?? draft.trim())
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    } catch (e: any) {
      setError(e?.message || "Could not save the name")
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(websiteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* a clipboard that refuses is not worth an error */
    }
  }

  const NAV: { id: Section; label: string; Icon: typeof Settings }[] = [
    { id: "general", label: "General", Icon: Settings },
    { id: "domains", label: "Domains & Hosting", Icon: Globe },
    { id: "publishing", label: "Publishing", Icon: Rocket },
  ]

  const ago = relativeTime(publishedAt)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Project settings"
      className="wb-settings-in fixed inset-0 z-[150] flex flex-col bg-[#0f0f0f] text-white md:flex-row"
    >
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <aside className="shrink-0 border-b border-white/10 md:w-[280px] md:border-b-0 md:border-r">
        <div className="px-5 pt-5 md:px-6 md:pt-7">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-lg text-[15px] font-medium text-white/85 transition-colors hover:text-white active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Back to project
          </button>
        </div>
        <div className="mx-5 my-4 border-t border-white/10 md:mx-6 md:my-6" />
        <p className="hidden px-6 pb-2 text-[12px] font-medium uppercase tracking-wider text-white/40 md:block">
          Project Settings
        </p>
        {/* Horizontal on a phone, vertical on a desktop. A vertical nav in a
            390px column pushes the content off the screen. */}
        <nav className="wb-slim-scroll flex gap-1 overflow-x-auto px-5 pb-4 md:flex-col md:px-3 md:pb-0">
          {NAV.map(({ id, label, Icon }) => {
            const active = section === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] transition-colors",
                  active ? "bg-white/[0.08] text-white" : "text-white/70 hover:bg-white/[0.05] hover:text-white",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ── Panel ───────────────────────────────────────────────────────── */}
      <main className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[880px] px-5 py-8 md:px-12 md:py-14">
          {section === "general" && (
            <>
              <h1 className="text-[26px] font-semibold tracking-[-0.01em] md:text-[30px]">Project General Settings</h1>

              <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:flex-row md:items-center md:justify-between md:p-6">
                <label htmlFor="wb-project-name" className="text-[17px] font-medium">
                  Project name
                </label>
                <div className="flex items-center gap-2.5">
                  <input
                    id="wb-project-name"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void save()
                    }}
                    className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#171717] px-4 text-[15px] text-white outline-none transition-colors focus:border-white/30 md:w-[300px]"
                  />
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={!dirty || saving}
                    className={cn(
                      "flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-[15px] font-medium transition-all",
                      dirty
                        ? "border-white/20 bg-white/[0.08] text-white hover:bg-white/[0.14]"
                        : "border-white/10 text-white/40",
                      "disabled:cursor-default",
                    )}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                    {saving ? "Saving" : saved ? "Saved" : "Save"}
                  </button>
                </div>
              </div>
              {error && <p className="mt-3 text-[14px] text-red-400">{error}</p>}

              <h2 className="mt-10 text-[17px] font-medium">Project</h2>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[15px] text-white/70 md:p-6">
                <p>
                  This is one of your websites. Each has its own theme, pages and settings, and publishes to its own address.
                </p>
              </div>
            </>
          )}

          {section === "domains" && (
            <>
              <h1 className="text-[26px] font-semibold tracking-[-0.01em] md:text-[30px]">Domains & Hosting</h1>
              <h2 className="mt-8 text-[17px] font-medium">Website URL</h2>
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-3 px-5 py-4">
                  <Globe className="h-4 w-4 shrink-0 text-white/50" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{websiteUrlDisplay || "No address yet"}</span>
                  {websiteUrl && (
                    <>
                      <button
                        type="button"
                        onClick={copy}
                        className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Copy address"
                      >
                        {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
                      </button>
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Open the live site"
                      >
                        <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                      </a>
                    </>
                  )}
                </div>
                <div className="border-t border-white/10 px-5 py-4 text-[14px] text-white/60">
                  Hosted by Storelib. Custom domains are connected from your account's domain settings and apply to this
                  address.
                </div>
              </div>
            </>
          )}

          {section === "publishing" && (
            <>
              <h1 className="text-[26px] font-semibold tracking-[-0.01em] md:text-[30px]">Publishing</h1>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <span className={cn("h-2.5 w-2.5 rounded-full", live ? "bg-emerald-500" : "bg-white/30")} />
                  <p className="text-[17px] font-medium">{live ? "Live" : "Not published yet"}</p>
                </div>
                <p className="mt-2 text-[15px] text-white/60">
                  {live
                    ? ago
                      ? `Last published ${ago}.`
                      : "Published. The time will show once the next publish goes out."
                    : "Nobody can see this website until it is published from the editor."}
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

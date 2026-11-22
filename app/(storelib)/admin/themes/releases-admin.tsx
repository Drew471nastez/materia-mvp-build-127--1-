"use client"

import * as React from "react"

import { Banner, Button, Filters, Panel } from "../_console/ui"
import { BASE_TARGET, compareVersions, isCodeTemplateSlug, parseVersion, releaseFamily, type ThemeRelease } from "@/lib/themes/releases-shared"

/**
 * ===========================================================================
 *  RELEASES: A THEME'S VERSIONS, AND A NEW ONE
 * ===========================================================================
 * For the shared base (every Storelib template is made from it), one
 * template, or one uploaded theme. A release is a version number, notes a
 * creator reads, and the theme's files: what the code has now, or a zip.
 * The server checks and converts the files the way an import does before
 * it keeps the release, so one that would not install never reaches a
 * creator (app/api/admin/themes/releases).
 *
 * Publishing changes no creator's website. Each creator's library says
 * Update available, shows these notes, and makes an updated copy when they
 * press Update; their live website stays as it is.
 */

export type AdminRelease = ThemeRelease & { layer: string; files: number }

const field = "h-9 w-full rounded-[7px] border border-white/[0.1] bg-[#0b0b0f] px-2.5 text-[13px] text-[#ededf0] outline-none focus:border-[#8b5cf6]/70"

/** The release a new one has to be higher than, for this target (the rule versionProblem applies on the server). */
function newestReaching(target: string, releases: readonly AdminRelease[]): string | null {
  const family = releaseFamily(target)
  const reach = releases.filter((r) => (target === BASE_TARGET ? r.family === family : r.target === target || (r.target === BASE_TARGET && isCodeTemplateSlug(target))))
  return reach.reduce<string | null>((best, r) => (best === null || compareVersions(r.version, best) > 0 ? r.version : best), null)
}

function nextVersion(top: string | null): string {
  const v = parseVersion(top)
  return v ? `${v[0]}.${v[1]}.${v[2] + 1}` : "1.0.0"
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "")

function putWithProgress(url: string, file: File, onProgress: (f: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type || "application/zip")
    xhr.setRequestHeader("x-upsert", "true")
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
    xhr.onerror = () => resolve(false)
    xhr.send(file)
  })
}

export function ReleasesPanel({
  target,
  title,
  releases,
  notice,
  onChanged,
}: {
  /** "base" or a listing's address. */
  target: string
  title: string
  releases: AdminRelease[]
  /** Set when the SQL has not run: the form is not offered. */
  notice: string | null
  onChanged: () => Promise<void> | void
}) {
  const fromCode = target === BASE_TARGET || isCodeTemplateSlug(target)
  const own = React.useMemo(() => releases.filter((r) => r.target === target).sort((a, b) => compareVersions(b.version, a.version)), [releases, target])
  const inherited = isCodeTemplateSlug(target) ? releases.filter((r) => r.target === BASE_TARGET && r.published).sort((a, b) => compareVersions(b.version, a.version))[0] ?? null : null
  const top = newestReaching(target, releases)

  const [version, setVersion] = React.useState(() => nextVersion(top))
  const [notes, setNotes] = React.useState("")
  const [source, setSource] = React.useState<"code" | "zip">(fromCode ? "code" : "zip")
  const [file, setFile] = React.useState<File | null>(null)
  const [publish, setPublish] = React.useState(true)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState<number | null>(null)
  const [note, setNote] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null)

  /* Another target, or a release just made: the next number to suggest. */
  React.useEffect(() => {
    setVersion(nextVersion(top))
  }, [top, target])
  React.useEffect(() => {
    setSource(fromCode ? "code" : "zip")
    setFile(null)
    setNotes("")
    setNote(null)
  }, [target, fromCode])

  const create = async () => {
    setBusy("create")
    setNote(null)
    try {
      let path: string | null = null
      if (source === "zip") {
        if (!file) return setNote({ tone: "bad", text: "Choose the release's zip." })
        const start = await fetch("/api/admin/themes/releases", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, size: file.size }) })
        const place = await start.json().catch(() => null)
        if (!start.ok || !place?.url) return setNote({ tone: "bad", text: place?.error || "Could not start the upload." })
        setProgress(0)
        const sent = await putWithProgress(place.url, file, setProgress)
        setProgress(null)
        if (!sent) return setNote({ tone: "bad", text: "The zip did not upload. Try again." })
        path = place.path
      }
      setBusy("check")
      const res = await fetch("/api/admin/themes/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, version: version.trim(), notes, source, path, publish }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "The release was not saved." })
      setNotes("")
      setFile(null)
      setNote({ tone: "good", text: publish ? `${version} is published. Creators with this theme see Update available.` : `${version} is saved, not published.` })
      await onChanged()
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const patch = async (r: AdminRelease, published: boolean) => {
    setBusy(r.id)
    setNote(null)
    try {
      const res = await fetch("/api/admin/themes/releases", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, published }) })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "The release was not changed." })
      await onChanged()
    } finally {
      setBusy(null)
    }
  }

  const remove = async (r: AdminRelease) => {
    if (!window.confirm(`Remove ${r.version}? Its files are deleted.`)) return
    setBusy(r.id)
    try {
      const res = await fetch(`/api/admin/themes/releases?id=${encodeURIComponent(r.id)}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "The release was not removed." })
      await onChanged()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel title={title} meta={top ? `Newest ${top}` : "No releases yet"} className="mt-4">
      <div data-admin-releases={target}>
        {inherited ? <p className="border-b border-white/[0.06] px-4 py-2.5 text-[12px] text-[#9b9ba6]">Made from the base, at {inherited.version}. A base release reaches this template too.</p> : null}

        {own.length ? (
          <ul className="divide-y divide-white/[0.06]">
            {own.map((r) => (
              <li key={r.id} className="px-4 py-3" data-admin-release={r.version}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="text-[13px] font-semibold tabular-nums">{r.version}</span>
                    <span className="truncate text-[12px] text-[#6b6b76]">
                      {day(r.publishedAt ?? r.createdAt)} · {r.source === "code" ? "from the code" : "zip"} · {r.files} files{r.layer === "overlay" ? ", over the base" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[12px] ${r.published ? "text-[#3fb950]" : "text-[#9b9ba6]"}`}>{r.published ? "Published" : "Not published"}</span>
                    <Button variant="quiet" disabled={!!busy} onClick={() => void patch(r, !r.published)}>
                      {busy === r.id ? "Saving" : r.published ? "Unpublish" : "Publish"}
                    </Button>
                    {!r.published ? (
                      <Button variant="quiet" disabled={!!busy} onClick={() => void remove(r)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-line text-[12.5px] leading-5 text-[#c9c9d1]">{r.notes}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {notice ? (
          <div className="p-4"><Banner>{notice}</Banner></div>
        ) : (
          <form
            className="space-y-3 border-t border-white/[0.08] p-4"
            data-admin-release-form=""
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <p className="text-[13px] font-medium">New release</p>
            {note ? <Banner tone={note.tone} onClose={() => setNote(null)}>{note.text}</Banner> : null}
            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <label className="block text-[12px] text-[#9b9ba6]">
                Version
                <input className={`${field} mt-1 tabular-nums`} value={version} maxLength={14} inputMode="decimal" onChange={(e) => setVersion(e.target.value.replace(/[^0-9.]/g, ""))} required />
              </label>
              <div className="block text-[12px] text-[#9b9ba6]">
                Files
                <div className="mt-1 flex min-h-9 flex-wrap items-center gap-2">
                  {fromCode ? <Filters label="Files" options={[{ id: "code", label: "From the code" }, { id: "zip", label: "Upload zip" }]} value={source} onChange={(v) => setSource(v)} /> : null}
                  {source === "zip" ? (
                    <label className="inline-flex h-8 cursor-pointer items-center rounded-[7px] border border-white/[0.1] bg-[#17171d] px-3 text-[13px] font-medium text-[#ededf0] hover:bg-[#1d1d24]">
                      {file ? "Change zip" : "Choose zip"}
                      <input type="file" accept=".zip,application/zip" className="sr-only" disabled={!!busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </label>
                  ) : null}
                  {source === "zip" && file ? <span className="min-w-0 truncate text-[12px] text-[#c9c9d1]">{file.name}</span> : null}
                </div>
              </div>
            </div>
            {source === "zip" ? (
              <p className="text-[12px] text-[#6b6b76]">
                {target === BASE_TARGET
                  ? "The whole base theme: layout, sections, snippets, assets, locales, config."
                  : isCodeTemplateSlug(target)
                    ? "The template's own files (templates, section groups, settings_data.json, assets) to lay over the base, or a whole theme."
                    : "The whole theme, as it would be imported. Up to 50 MB."}
              </p>
            ) : null}
            <label className="block text-[12px] text-[#9b9ba6]">
              Release notes, as creators read them
              <textarea
                rows={4}
                value={notes}
                maxLength={4000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={"Product pages load the second picture sooner.\nThe footer's newsletter field fits on a phone."}
                className="mt-1 w-full resize-y rounded-[7px] border border-white/[0.1] bg-[#0b0b0f] px-2.5 py-2 text-[13px] leading-5 text-[#ededf0] outline-none placeholder:text-[#6b6b76] focus:border-[#8b5cf6]/70"
                required
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-4 w-4 accent-[#8b5cf6]" />
                Publish now
              </label>
              <Button variant="primary" type="submit" disabled={!!busy || !notes.trim() || !parseVersion(version) || (source === "zip" && !file)}>
                {busy === "create" ? (progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Starting") : busy === "check" ? "Checking the theme" : "Add release"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Panel>
  )
}

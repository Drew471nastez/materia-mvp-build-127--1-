"use client"

import Link from "next/link"
import { useRef, useState } from "react"

import type { ReferenceRowView } from "@/lib/storelib-ai/references/admin"
import { Banner, Button, Figures, Panel, Status, TextArea } from "../_console/ui"

const API = "/api/admin/design-references"
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean)

export function DesignReferencesAdmin({
  initial,
  problem,
  library,
}: {
  initial: ReferenceRowView[]
  problem: "missing" | "unreadable" | null
  library: { seeds: number; systems: number; styles: number; principles: number }
}) {
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [source, setSource] = useState("")
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const replace = (row: ReferenceRowView) => setRows((all) => (all.some((r) => r.id === row.id) ? all.map((r) => (r.id === row.id ? row : r)) : [row, ...all]))

  async function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setMessage({ tone: "bad", text: "Pick a screenshot first." })
    setBusy("upload")
    setMessage(null)
    const form = new FormData()
    form.set("file", file)
    form.set("notes", note)
    form.set("source", source)
    try {
      const res = await fetch(API, { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (data.reference) replace(data.reference)
      if (!res.ok || data.error) setMessage({ tone: "bad", text: data.error ?? "That did not work. Try again." })
      else {
        setMessage({ tone: "good", text: data.duplicate ? "That picture is already in the library." : "Added and analysed." })
        setNote("")
        setSource("")
        if (fileRef.current) fileRef.current.value = ""
      }
    } catch {
      setMessage({ tone: "bad", text: "The upload did not reach the server. Try again." })
    } finally {
      setBusy(null)
    }
  }

  async function act(id: string, init: RequestInit, done?: string) {
    setBusy(id)
    setMessage(null)
    try {
      const res = await fetch(`${API}/${id}`, init)
      const data = await res.json().catch(() => ({}))
      if (init.method === "DELETE" && res.ok) setRows((all) => all.filter((r) => r.id !== id))
      else if (data.reference) replace(data.reference)
      setMessage(!res.ok || data.error ? { tone: "bad", text: data.error ?? "That did not work." } : done ? { tone: "good", text: done } : null)
    } finally {
      setBusy(null)
    }
  }
  const patch = (id: string, body: unknown, done?: string) => act(id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, done)

  const ready = rows.filter((r) => r.usable).length
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 text-[#ededf0] sm:px-6 lg:px-8">
      <div className="mb-5">
        <p className="text-[12px] text-[#6b6b76]">
          <Link href="/admin" className="hover:text-[#c9c9d1]">Admin</Link> / Design references
        </p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.01em]">Design references</h1>
        <p className="mt-1 max-w-[680px] text-[13px] text-[#9b9ba6]">
          Screenshots of websites done well. The AI reads each one once and keeps notes on it, then looks at the best few for every new website it designs. It learns from them, it never copies them.
        </p>
      </div>

      {problem === "missing" ? <Banner tone="bad">The library is not on this database yet. Run SQL part 431 (supabase/sql/run-now/431_design_references.sql).</Banner> : null}
      {problem === "unreadable" ? <Banner tone="bad">The library could not be read just now. Reload in a minute.</Banner> : null}
      {message ? <div className="mt-3"><Banner tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Banner></div> : null}

      <div className="mt-4 space-y-4">
        <Figures
          columns={4}
          items={[
            { label: "Your screenshots", value: rows.length, sub: `${ready} in use` },
            { label: "Built in patterns", value: library.seeds },
            { label: "Design system notes", value: library.systems, sub: "open source, analysis only" },
            { label: "Styles and principles", value: library.styles + library.principles },
          ]}
        />

        <Panel title="Add a screenshot" meta="PNG, JPEG or WebP, up to 4 MB. Full page captures work.">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] text-[#9b9ba6]">Screenshot</span>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-[13px] text-[#c9c9d1] file:mr-3 file:h-8 file:rounded-[7px] file:border file:border-white/[0.1] file:bg-[#17171d] file:px-3 file:text-[13px] file:text-[#ededf0]" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-[#9b9ba6]">Where it is from (kept as a note, never opened)</span>
              <input value={source} onChange={(e) => setSource(e.target.value)} maxLength={300} placeholder="site or gallery" className="h-9 w-full rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[14px] text-[#ededf0] outline-none placeholder:text-[#6b6b76] focus:border-[#8b5cf6]/70" />
            </label>
            <div className="sm:col-span-2">
              <TextArea label="What is good about it" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} placeholder="The hero crop, the booking flow, how the prices read" />
            </div>
            <div className="sm:col-span-2">
              <Button variant="primary" onClick={upload} disabled={busy === "upload"}>
                {busy === "upload" ? "Reading the picture..." : "Add and analyse"}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="Your screenshots" meta={rows.length ? `${rows.length}` : undefined}>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">None yet. Until you add some, the AI uses the built in patterns.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {rows.map((r) => (
                <ReferenceItem key={r.id} row={r} busy={busy === r.id} onPatch={patch} onAct={act} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  )
}

function ReferenceItem({
  row,
  busy,
  onPatch,
  onAct,
}: {
  row: ReferenceRowView
  busy: boolean
  onPatch: (id: string, body: unknown, done?: string) => void
  onAct: (id: string, init: RequestInit, done?: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const rec = row.record
  const [title, setTitle] = useState(rec?.title ?? "")
  const [tags, setTags] = useState(rec?.styleTags.join(", ") ?? "")
  const [industries, setIndustries] = useState(rec?.industries.join(", ") ?? "")
  const [quality, setQuality] = useState(String(rec?.quality ?? 3))
  const status = row.status === "ready" ? (row.enabled ? "ok" : "pending") : row.status === "failed" ? "failed" : "pending"
  const statusLabel = row.status === "ready" ? (row.enabled ? "In use" : "Turned off") : row.status === "failed" ? "Analysis failed" : "Analysing"
  return (
    <li className="grid gap-4 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)]">
      <a href={`${API}/${row.id}/image?size=original`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[8px] border border-white/[0.08] bg-[#0b0b0f]">
        {row.hasImage ? <img src={`${API}/${row.id}/image`} alt={rec?.title ?? "Reference screenshot"} className="aspect-[4/3] w-full object-cover object-top" loading="lazy" /> : <div className="aspect-[4/3]" />}
      </a>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="min-w-0 text-[14px] font-semibold">{rec?.title ?? "Not analysed yet"}</h3>
          <Status value={status} label={statusLabel} />
          <span className="text-[12px] text-[#6b6b76]">{when(row.createdAt)} · v{row.version}</span>
        </div>
        {rec ? <p className="text-[13px] text-[#c9c9d1]">{rec.summary}</p> : null}
        {row.error ? <p className="text-[13px] text-[#f47067]">{row.error}</p> : null}
        {rec ? (
          <p className="text-[12px] text-[#9b9ba6]">
            {[rec.industries.join(", "), rec.styleTags.join(", "), rec.palette.colors.map((c) => c.hex).join(" ")].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {rec?.borrow.length ? <p className="text-[12px] text-[#9b9ba6]">Learn: {rec.borrow.join("; ")}</p> : null}
        {row.notes ? <p className="text-[12px] text-[#6b6b76]">Your note: {row.notes}</p> : null}
        {editing && rec ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Title" value={title} onChange={setTitle} />
            <Field label="Quality, 1 to 5" value={quality} onChange={setQuality} />
            <Field label="Styles, comma separated" value={tags} onChange={setTags} />
            <Field label="Businesses it fits, comma separated" value={industries} onChange={setIndustries} />
            <div className="flex gap-2 sm:col-span-2">
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  onPatch(row.id, { record: { title, styleTags: list(tags), industries: list(industries), quality: Number(quality) } }, "Saved.")
                  setEditing(false)
                }}
              >
                Save
              </Button>
              <Button variant="quiet" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {rec ? <Button disabled={busy} onClick={() => setEditing((v) => !v)}>Edit</Button> : null}
          {row.status === "ready" ? (
            <Button disabled={busy} onClick={() => onPatch(row.id, { enabled: !row.enabled }, row.enabled ? "Turned off." : "In use again.")}>
              {row.enabled ? "Turn off" : "Use it"}
            </Button>
          ) : null}
          <Button disabled={busy} onClick={() => onAct(row.id, { method: "POST" }, "Analysed again.")}>{busy ? "Working..." : "Analyse again"}</Button>
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Remove this screenshot and its notes?")) onAct(row.id, { method: "DELETE" }, "Removed.")
            }}
          >
            Remove
          </Button>
        </div>
      </div>
    </li>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-[#9b9ba6]">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[14px] text-[#ededf0] outline-none focus:border-[#8b5cf6]/70" />
    </label>
  )
}

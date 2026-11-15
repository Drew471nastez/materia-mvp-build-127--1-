"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import type { BankRowView } from "@/lib/storelib-ai/bank/admin"
import type { LibrarySite } from "@/lib/storelib-ai/bank/store"
import { Banner, Button, Figures, Panel, Status } from "../_console/ui"

const API = "/api/admin/ai-bank"
const EMAIL_KEY = "storelib-admin-ai-bank-email"
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const FEATURE_WORD: Record<string, string> = { shop: "Shop", booking: "Bookings", courses: "Courses", community: "Community", blog: "Blog", reviews: "Reviews" }

export function AiBankAdmin({ initial, problem, industries }: { initial: BankRowView[]; problem: "missing" | "unreadable" | null; industries: string[] }) {
  const [rows, setRows] = useState(initial)
  const [email, setEmail] = useState("")
  const [sites, setSites] = useState<LibrarySite[] | null>(null)
  const [found, setFound] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(EMAIL_KEY)
      if (saved) setEmail(saved)
    } catch {
      /* No storage: the field starts empty. */
    }
  }, [])

  const replace = (row: BankRowView) => setRows((all) => (all.some((r) => r.id === row.id) ? all.map((r) => (r.id === row.id ? row : r)) : [row, ...all]))
  const inBank = (installId: string) => rows.find((r) => r.installId === installId)

  async function find() {
    const address = email.trim()
    if (!address) return setMessage({ tone: "bad", text: "Type the email of the account whose library to read." })
    setBusy("find")
    setMessage(null)
    try {
      window.localStorage.setItem(EMAIL_KEY, address)
    } catch {
      /* Not remembered; the search still runs. */
    }
    try {
      const res = await fetch(`${API}?email=${encodeURIComponent(address)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setMessage({ tone: "bad", text: data.error ?? "That did not work. Try again." })
      if (Array.isArray(data.bank)) setRows(data.bank)
      setSites(data.library?.sites ?? [])
      setFound(data.library?.found !== false)
    } finally {
      setBusy(null)
    }
  }

  async function snapshot(installId: string, again: boolean) {
    setBusy(installId)
    setMessage(null)
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ installId }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.entry) return setMessage({ tone: "bad", text: data.error ?? "That did not work. Try again." })
      replace(data.entry)
      setMessage({ tone: "good", text: again ? `${data.entry.name}: snapshot taken again.` : `${data.entry.name} is in the bank.` })
    } finally {
      setBusy(null)
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id)
    setMessage(null)
    try {
      const res = await fetch(`${API}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.entry) return setMessage({ tone: "bad", text: data.error ?? "That did not work." })
      replace(data.entry)
    } finally {
      setBusy(null)
    }
  }

  async function remove(row: BankRowView) {
    if (!window.confirm(`Take ${row.name} out of the bank? The website itself stays as it is.`)) return
    setBusy(row.id)
    try {
      const res = await fetch(`${API}/${row.id}`, { method: "DELETE" })
      if (res.ok) setRows((all) => all.filter((r) => r.id !== row.id))
      else setMessage({ tone: "bad", text: "It could not be removed just now." })
    } finally {
      setBusy(null)
    }
  }

  const starting = rows.filter((r) => r.kind === "starting" && r.enabled).length
  const references = rows.filter((r) => r.kind === "reference" && r.enabled).length
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 text-[#ededf0] sm:px-6 lg:px-8">
      <div className="mb-5">
        <p className="text-[12px] text-[#6b6b76]">
          <Link href="/admin" className="hover:text-[#c9c9d1]">Admin</Link> / AI source bank
        </p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.01em]">AI source bank</h1>
        <p className="mt-1 max-w-[720px] text-[13px] text-[#9b9ba6]">
          The websites the AI builds from. A new website starts from the one that suits its business best, with that business&apos;s own words, pictures and products, and without parts it can&apos;t use (no shop for a coach who doesn&apos;t sell). Imported Shopify themes are read for how their sections work.
        </p>
      </div>

      {problem === "missing" ? <Banner tone="bad">The bank is not on this database yet. Run SQL part 467 (supabase/sql/run-now/467_ai_template_bank.sql).</Banner> : null}
      {problem === "unreadable" ? <Banner tone="bad">The bank could not be read just now. Reload in a minute.</Banner> : null}
      {message ? <div className="mt-3"><Banner tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Banner></div> : null}

      <div className="mt-4 space-y-4">
        <Figures
          columns={3}
          items={[
            { label: "Starting sites", value: starting, sub: "poured in and adapted" },
            { label: "Pattern themes", value: references, sub: "read for how parts work" },
            { label: "Turned off", value: rows.filter((r) => !r.enabled).length },
          ]}
        />

        <Panel title="Pick from a library" meta="Websites, and themes imported with Import theme">
          <form
            className="flex flex-wrap items-end gap-2 p-4"
            onSubmit={(e) => {
              e.preventDefault()
              void find()
            }}
          >
            <label className="block min-w-[260px] flex-1">
              <span className="mb-1 block text-[12px] text-[#9b9ba6]">Account email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="the account the websites are in"
                autoComplete="off"
                className="h-9 w-full rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[14px] text-[#ededf0] outline-none placeholder:text-[#6b6b76] focus:border-[#8b5cf6]/70"
              />
            </label>
            <Button type="submit" variant="primary" disabled={busy === "find"}>
              {busy === "find" ? "Reading..." : "Show websites"}
            </Button>
          </form>
          {sites === null ? null : !found ? (
            <p className="border-t border-white/[0.06] px-4 py-4 text-[13px] text-[#9b9ba6]">No account has that email.</p>
          ) : sites.length === 0 ? (
            <p className="border-t border-white/[0.06] px-4 py-4 text-[13px] text-[#9b9ba6]">That account has no websites yet.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {sites.map((s) => {
                const entry = inBank(s.installId)
                return (
                  <li key={s.installId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium">{s.name}</p>
                      <p className="text-[12px] text-[#6b6b76]">
                        {[s.imported ? "Imported theme" : s.themeId === "storelib-default" || !s.themeId ? "Storelib website" : s.themeId, s.publishedAt ? `published ${when(s.publishedAt)}` : "not published"].join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {entry ? <Status value="ok" label="In the bank" /> : null}
                      <Button onClick={() => snapshot(s.installId, !!entry)} disabled={busy === s.installId}>
                        {busy === s.installId ? "Reading the site..." : entry ? "Take a fresh snapshot" : "Add to bank"}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel title="In the bank" meta={rows.length ? `${rows.length}` : undefined}>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">Nothing yet. Until you add websites, the AI starts from its built-in templates.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {rows.map((r) => (
                <BankItem key={r.id} row={r} busy={busy === r.id || busy === r.installId} industries={industries} onPatch={patch} onRefresh={() => snapshot(r.installId, true)} onRemove={() => remove(r)} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  )
}

function BankItem({
  row,
  busy,
  industries,
  onPatch,
  onRefresh,
  onRemove,
}: {
  row: BankRowView
  busy: boolean
  industries: string[]
  onPatch: (id: string, body: Record<string, unknown>) => void
  onRefresh: () => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState<string[]>(row.industries)
  const [keywords, setKeywords] = useState(row.tags.keywords.join(", "))
  const c = row.counts
  return (
    <li className="space-y-2 px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="min-w-0 text-[14px] font-semibold">{row.name}</h3>
        <Status value={row.enabled ? "ok" : "pending"} label={row.enabled ? (row.kind === "starting" ? "Starting site" : "Pattern theme") : "Turned off"} />
        <span className="text-[12px] text-[#6b6b76]">snapshot {when(row.snapshotAt)}</span>
      </div>
      <p className="text-[12px] text-[#9b9ba6]">
        {[row.industries.join(", ") || "no industry yet", row.features.map((f) => FEATURE_WORD[f] ?? f).join(", ") || "no shop, bookings or courses"].join(" · ")}
      </p>
      <p className="text-[12px] text-[#6b6b76]">
        {c.pages} pages, {c.sections} sections, {c.files} code files. Taken out: {c.imageSlots} pictures, {c.bindings} products, collections or forms, {c.removed} values in all.
      </p>
      {row.home.length ? <p className="text-[12px] text-[#6b6b76]">Home: {row.home.join(" → ")}</p> : null}
      {editing ? (
        <div className="space-y-2 rounded-[8px] border border-white/[0.08] p-3">
          <p className="text-[12px] text-[#9b9ba6]">Businesses it suits (best first, up to six)</p>
          <div className="flex flex-wrap gap-1.5">
            {industries.map((k) => {
              const on = picked.includes(k)
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked((all) => (on ? all.filter((x) => x !== k) : all.length >= 6 ? all : [...all, k]))}
                  className={`h-7 rounded-[6px] px-2 text-[12px] ${on ? "bg-[#ededf0] text-[#0b0b0f]" : "border border-white/[0.1] text-[#c9c9d1] hover:bg-white/[0.05]"}`}
                >
                  {k}
                </button>
              )
            })}
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#9b9ba6]">Words people use for it, comma separated</span>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="supplements, single product, sample packs" className="h-9 w-full rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[14px] text-[#ededf0] outline-none placeholder:text-[#6b6b76] focus:border-[#8b5cf6]/70" />
          </label>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                onPatch(row.id, { industries: picked, keywords: keywords.split(",").map((x) => x.trim()).filter(Boolean) })
                setEditing(false)
              }}
            >
              Save
            </Button>
            <Button variant="quiet" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onPatch(row.id, { enabled: !row.enabled })} disabled={busy}>{row.enabled ? "Turn off" : "Turn on"}</Button>
        {!editing ? <Button onClick={() => setEditing(true)} disabled={busy}>Edit what it suits</Button> : null}
        <Button onClick={onRefresh} disabled={busy}>Take a fresh snapshot</Button>
        <Button variant="quiet" onClick={onRemove} disabled={busy}>Remove</Button>
      </div>
    </li>
  )
}

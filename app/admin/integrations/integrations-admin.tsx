"use client"

import * as React from "react"

import { Banner, Button, Filters, Panel, Placeholder, SearchField } from "../_console/ui"
import { CATEGORY_NAMES, INTEGRATIONS, type IntegrationCategory } from "@/lib/integrations/catalog"
import type { Availability, CatalogOverride } from "@/lib/integrations/overrides"

/**
 * ===========================================================================
 *  INTEGRATIONS, FOR STORELIB
 * ===========================================================================
 * Three views over /api/admin/integrations:
 *
 *   Requests  every Request integration and Tell me when it's ready, newest
 *             first, searchable, each answered with a status (New, Planned,
 *             Done, Declined) and a note.
 *   Catalog   the directory every store sees. What an integration does is
 *             code; here is how it shows: its name, line, icon, category,
 *             order, and whether it is offered, paused (Coming soon for
 *             everyone) or hidden. A service the code doesn't know can be
 *             added so stores can find it and ask for it; it is always
 *             Coming soon until it is built.
 *   Health    how many stores have each one installed, the providers in
 *             error and their last error's words, and how often each is
 *             asked for.
 *
 * No key or secret a store saved is ever read or shown here.
 */

type Request = { id: string; name: string; note: string | null; integrationId: string | null; status: string; adminNote: string | null; createdAt: string; store: string }
type Health = { id: string; name: string; kind: string; category: IntegrationCategory; builtIn: boolean; comingSoon: boolean; installs: number; errors: number; lastError: string | null; asked: number }
type Data = { requestsReady: boolean; catalogReady: boolean; requests: Request[]; overrides: CatalogOverride[]; health: Health[]; categories: IntegrationCategory[] }
type View = "requests" | "catalog" | "health"

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
const STATUS_LABEL: Record<string, string> = { new: "New", planned: "Planned", done: "Done", declined: "Declined" }
const AVAIL_LABEL: Record<Availability, string> = { default: "Offered", coming_soon: "Paused", hidden: "Hidden" }
const FIELD = "h-9 w-full rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[13.5px] text-[#ededf0] outline-none placeholder:text-[#6b6b76] focus:border-[#8b5cf6]/70"

async function post(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const out = await res.json().catch(() => null)
    return res.ok ? null : out?.error || "That did not save."
  } catch {
    return "Could not reach Storelib."
  }
}

export function IntegrationsAdmin() {
  const [view, setView] = React.useState<View>("requests")
  const [data, setData] = React.useState<Data | null>(null)
  const [note, setNote] = React.useState<{ tone: "good" | "bad" | "plain"; text: string } | null>(null)

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/integrations", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "Integrations could not be read." })
      setData(body as Data)
    } catch {
      setNote({ tone: "bad", text: "Could not reach Storelib." })
    }
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  const say = (err: string | null, good: string) => {
    setNote(err ? { tone: "bad", text: err } : { tone: "good", text: good })
    if (!err) void load()
  }

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#ededf0] [font-family:Inter,system-ui,sans-serif]" data-admin-integrations="">
      <div className="mx-auto w-full max-w-[1040px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <a href="/admin" className="-ml-2 mb-1 inline-flex h-8 items-center rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]">
          Console
        </a>
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold tracking-[-0.015em] sm:text-[22px]">Integrations</h1>
            <p className="mt-0.5 text-[13px] text-[#9b9ba6]">What stores ask for, the directory they see, and how each one is doing.</p>
          </div>
          <Filters
            label="View"
            value={view}
            onChange={setView}
            options={[
              { id: "requests", label: `Requests${data ? ` ${data.requests.filter((r) => r.status === "new").length}` : ""}` },
              { id: "catalog", label: "Catalog" },
              { id: "health", label: "Health" },
            ]}
          />
        </div>

        {note ? (
          <div className="mb-4">
            <Banner tone={note.tone} onClose={() => setNote(null)}>
              {note.text}
            </Banner>
          </div>
        ) : null}
        {data && (!data.requestsReady || !data.catalogReady) ? (
          <div className="mb-4">
            <Banner tone="plain">
              {!data.requestsReady ? "Requests need SQL part 112. " : ""}
              {!data.catalogReady ? "Catalog changes and request notes need SQL part 115." : ""}
            </Banner>
          </div>
        ) : null}

        {data === null ? <Placeholder rows={5} /> : view === "requests" ? <Requests rows={data.requests} onSaved={say} /> : view === "catalog" ? <Catalog data={data} onSaved={say} /> : <HealthView rows={data.health} />}
      </div>
    </div>
  )
}

function Requests({ rows, onSaved }: { rows: Request[]; onSaved: (err: string | null, good: string) => void }) {
  const [q, setQ] = React.useState("")
  const [status, setStatus] = React.useState<"all" | "new" | "planned" | "done" | "declined">("new")
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = rows.filter((r) => (status === "all" || r.status === status) && words.every((w) => `${r.name} ${r.note ?? ""} ${r.store}`.toLowerCase().includes(w)))
  /* The most asked for, across every status, so what to build next is one glance. */
  const tally = [...rows.reduce((m, r) => m.set(r.name.toLowerCase(), { name: r.name, n: (m.get(r.name.toLowerCase())?.n ?? 0) + 1 }), new Map<string, { name: string; n: number }>()).values()].sort((a, b) => b.n - a.n).slice(0, 8)
  return (
    <div className="space-y-4">
      {tally.length ? (
        <Panel title="Most asked for">
          <ul className="flex flex-wrap gap-2 px-4 py-3">
            {tally.map((t) => (
              <li key={t.name} className="rounded-[7px] border border-white/[0.08] px-2.5 py-1 text-[12.5px] text-[#c9c9d1]">
                {t.name} <span className="tabular-nums text-[#6b6b76]">{t.n}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchField value={q} onChange={setQ} placeholder="Search requests" label="Search requests" />
        <Filters
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { id: "new", label: "New" },
            { id: "planned", label: "Planned" },
            { id: "done", label: "Done" },
            { id: "declined", label: "Declined" },
            { id: "all", label: "All" },
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <p className="rounded-[10px] border border-white/[0.06] px-4 py-8 text-center text-[13px] text-[#6b6b76]">No requests here.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <RequestRow key={r.id} r={r} onSaved={onSaved} />
          ))}
        </div>
      )}
    </div>
  )
}

function RequestRow({ r, onSaved }: { r: Request; onSaved: (err: string | null, good: string) => void }) {
  const [adminNote, setAdminNote] = React.useState(r.adminNote ?? "")
  const [busy, setBusy] = React.useState(false)
  const set = async (status: string) => {
    setBusy(true)
    const err = await post({ action: "request", id: r.id, status, adminNote })
    setBusy(false)
    onSaved(err, `Marked ${STATUS_LABEL[status]}.`)
  }
  return (
    <Panel title={r.name} meta={`${r.store} · ${when(r.createdAt)}${r.integrationId ? " · from its Coming soon page" : ""} · ${STATUS_LABEL[r.status] ?? r.status}`}>
      <div className="space-y-3 px-4 py-3">
        {r.note ? <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-[#ededf0] [overflow-wrap:anywhere]">{r.note}</p> : <p className="text-[13px] text-[#6b6b76]">No note.</p>}
        <input value={adminNote} onChange={(e) => setAdminNote(e.target.value)} maxLength={600} placeholder="Your note (only Storelib sees it)" className={FIELD} />
        <div className="flex flex-wrap gap-2">
          {(["planned", "done", "declined", "new"] as const)
            .filter((s) => s !== r.status)
            .map((s) => (
              <Button key={s} variant={s === "planned" ? "primary" : "plain"} disabled={busy} onClick={() => void set(s)}>
                {STATUS_LABEL[s]}
              </Button>
            ))}
        </div>
      </div>
    </Panel>
  )
}

function Catalog({ data, onSaved }: { data: Data; onSaved: (err: string | null, good: string) => void }) {
  const byId = new Map(data.overrides.map((o) => [o.id, o]))
  const custom = data.overrides.filter((o) => o.custom && !INTEGRATIONS.some((i) => i.id === o.id))
  const [q, setQ] = React.useState("")
  const [editing, setEditing] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = [
    ...INTEGRATIONS.map((i) => ({ id: i.id, name: byId.get(i.id)?.name ?? i.name, category: byId.get(i.id)?.category ?? i.category, kind: i.kind === "listed" ? "Coming soon in code" : i.builtIn ? "Built in" : i.kind === "tracker" ? "Installs by ID" : i.comingSoon ? "Key only" : "Connects", custom: false })),
    ...custom.map((o) => ({ id: o.id, name: o.name ?? o.id, category: o.category ?? ("automation" as IntegrationCategory), kind: "Added here", custom: true })),
  ].filter((r) => words.every((w) => `${r.name} ${r.id} ${CATEGORY_NAMES[r.category]}`.toLowerCase().includes(w)))
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchField value={q} onChange={setQ} placeholder="Search the catalog" label="Search the catalog" />
        <Button variant="primary" onClick={() => setAdding((v) => !v)}>
          {adding ? "Close" : "Add integration"}
        </Button>
      </div>
      {adding ? (
        <Panel title="Add an integration" meta="Shown to stores as Coming soon, so they can ask for it">
          <CatalogForm id="" categories={data.categories} isNew onDone={(err) => { onSaved(err, "Added. Stores see it as Coming soon."); if (!err) setAdding(false) }} />
        </Panel>
      ) : null}
      <Panel title="Directory" meta={`${rows.length} integrations`}>
        <ul className="divide-y divide-white/[0.06]">
          {rows.map((r) => {
            const o = byId.get(r.id)
            const avail: Availability = o?.availability ?? "default"
            return (
              <li key={r.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-[#ededf0]">
                      {r.name} <span className="text-[#6b6b76]">· {CATEGORY_NAMES[r.category]} · {r.kind}</span>
                    </p>
                  </div>
                  <select
                    aria-label={`${r.name} availability`}
                    value={avail}
                    onChange={async (e) => onSaved(await post({ action: "catalog", id: r.id, ...(o ? { name: o.name, summary: o.summary, category: o.category, logoUrl: o.logoUrl, docsUrl: o.docsUrl, sort: o.sort, physical: o.physical } : {}), availability: e.target.value }), "Saved. Stores see it within a minute.")}
                    className="h-8 rounded-[7px] border border-white/[0.1] bg-[#17171d] px-2 text-[12.5px] text-[#ededf0]"
                  >
                    {(Object.keys(AVAIL_LABEL) as Availability[]).map((a) => (
                      <option key={a} value={a}>
                        {AVAIL_LABEL[a]}
                      </option>
                    ))}
                  </select>
                  <Button variant="quiet" onClick={() => setEditing(editing === r.id ? null : r.id)}>
                    {editing === r.id ? "Close" : "Edit"}
                  </Button>
                  {o ? (
                    <Button variant="quiet" onClick={async () => onSaved(await post({ action: "remove", id: r.id }), r.custom ? "Removed from the directory." : "Back to how the code shows it.")}>
                      {r.custom ? "Remove" : "Reset"}
                    </Button>
                  ) : null}
                </div>
                {editing === r.id ? (
                  <div className="mt-2">
                    <CatalogForm id={r.id} initial={o} categories={data.categories} onDone={(err) => { onSaved(err, "Saved. Stores see it within a minute."); if (!err) setEditing(null) }} />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}

function CatalogForm({ id, initial, categories, isNew, onDone }: { id: string; initial?: CatalogOverride; categories: IntegrationCategory[]; isNew?: boolean; onDone: (err: string | null) => void }) {
  const [f, setF] = React.useState({
    id,
    name: initial?.name ?? "",
    summary: initial?.summary ?? "",
    category: initial?.category ?? "",
    logoUrl: initial?.logoUrl ?? "",
    docsUrl: initial?.docsUrl ?? "",
    sort: initial?.sort != null ? String(initial.sort) : "",
    availability: initial?.availability ?? "default",
    physical: initial?.physical ?? false,
  })
  const [busy, setBusy] = React.useState(false)
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  const save = async () => {
    setBusy(true)
    const err = await post({ action: "catalog", ...f, sort: f.sort.trim() ? Number(f.sort) : null, category: f.category || null })
    setBusy(false)
    onDone(err)
  }
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-2">
      {isNew ? <input value={f.id} onChange={(e) => set({ id: e.target.value.toLowerCase() })} placeholder="id, like sendcloud" className={FIELD} /> : null}
      <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={isNew ? "Name" : "Name (blank keeps the code's)"} className={FIELD} />
      <input value={f.summary} onChange={(e) => set({ summary: e.target.value })} maxLength={160} placeholder="One line for the card" className={`${FIELD} sm:col-span-2`} />
      <select value={f.category} onChange={(e) => set({ category: e.target.value })} className={FIELD} aria-label="Category">
        <option value="">{isNew ? "Category" : "Category (the code's)"}</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_NAMES[c]}
          </option>
        ))}
      </select>
      <input value={f.sort} onChange={(e) => set({ sort: e.target.value.replace(/[^0-9-]/g, "") })} placeholder="Order (lower first)" className={FIELD} inputMode="numeric" />
      <input value={f.logoUrl} onChange={(e) => set({ logoUrl: e.target.value })} placeholder="Icon: https image or /integrations/file.svg" className={FIELD} />
      <input value={f.docsUrl} onChange={(e) => set({ docsUrl: e.target.value })} placeholder="Help link (https)" className={FIELD} />
      {isNew ? (
        <label className="flex items-center gap-2 text-[13px] text-[#c9c9d1]">
          <input type="checkbox" checked={f.physical} onChange={(e) => set({ physical: e.target.checked })} />
          Only for stores selling physical products
        </label>
      ) : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="primary" disabled={busy || (isNew && (!f.id.trim() || !f.name.trim()))} onClick={() => void save()}>
          {busy ? "Saving" : "Save"}
        </Button>
      </div>
    </div>
  )
}

function HealthView({ rows }: { rows: Health[] }) {
  const sorted = [...rows].sort((a, b) => b.errors - a.errors || b.installs - a.installs || b.asked - a.asked)
  return (
    <Panel title="Health" meta="Installs, errors and requests for each integration">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead className="text-[12px] text-[#6b6b76]">
            <tr>
              <th className="px-4 py-2 font-medium">Integration</th>
              <th className="px-4 py-2 font-medium">Stores</th>
              <th className="px-4 py-2 font-medium">In error</th>
              <th className="px-4 py-2 font-medium">Asked for</th>
              <th className="px-4 py-2 font-medium">Last error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-[#ededf0]">
                  {r.name} <span className="text-[#6b6b76]">· {r.builtIn ? "Built in" : r.comingSoon ? "Coming soon" : CATEGORY_NAMES[r.category]}</span>
                </td>
                <td className="px-4 py-2 tabular-nums">{r.builtIn ? "Every store" : r.installs}</td>
                <td className={`px-4 py-2 tabular-nums ${r.errors ? "text-[#ff7b72]" : "text-[#6b6b76]"}`}>{r.errors}</td>
                <td className="px-4 py-2 tabular-nums text-[#c9c9d1]">{r.asked}</td>
                <td className="max-w-[280px] truncate px-4 py-2 text-[#9b9ba6]" title={r.lastError ?? undefined}>
                  {r.lastError ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

"use client"

/**
 * ===========================================================================
 *  SETTINGS › RETURNS AND REFUNDS: THE REASONS
 * ===========================================================================
 * The store's own lists (lib/store/reasons-server.ts, /api/store/reasons):
 *
 *   Return reasons   what a buyer picks on their order page when asking to
 *                    send something back, and the shop when it opens a
 *                    return for them (physical products only)
 *   Refund reasons   what the shop picks in either refund dialog, kept on
 *                    the order and shown on its timeline
 *
 * Each reason has a name people see and an optional line under it. Its
 * stored value is made from the first name and never changes, so renaming
 * a reason renames it on every return already made with it. "Other" stays:
 * it is where a reason nobody picked from the list is kept.
 */
import * as React from "react"
import { ChevronDown, ChevronUp, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Card, Field, Modal, Notice, TextInput, api } from "@/components/physical/ui"
import { FALLBACK_REASON, MAX_REASONS, type Reason, type ReasonKind } from "@/lib/store/reasons"
import { forgetReasons } from "@/lib/store/use-reasons"

type Lists = { return: Reason[]; refund: Reason[]; ready: boolean }

const COPY: Record<ReasonKind, { title: string; description: string; empty: string }> = {
  return: {
    title: "Return reasons",
    description: "What a buyer picks when they ask to send something back. You see it on the return.",
    empty: "No return reasons yet.",
  },
  refund: {
    title: "Refund reasons",
    description: "What you pick when you refund an order. It stays on the order's timeline.",
    empty: "No refund reasons yet.",
  },
}

export function ReasonsPanel({ kinds }: { kinds: ReasonKind[] }) {
  const [lists, setLists] = React.useState<Lists | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void api<Lists>("/api/store/reasons").then((r) => (r.ok ? setLists(r.data) : setError(r.error)))
  }, [])

  if (error && !lists) return <Notice>{error}</Notice>
  if (!lists) return <div className="min-h-[280px]" aria-busy="true" />
  return (
    <>
      {!lists.ready ? <Notice tone="amber">Reasons need their database update (SQL part 109). Until it runs, these are Storelib's and can't be changed.</Notice> : null}
      {kinds.map((kind) => (
        <ReasonsCard
          key={kind}
          kind={kind}
          reasons={lists[kind]}
          onChange={(next) => {
            forgetReasons()
            setLists((l) => (l ? { ...l, [kind]: next } : l))
          }}
        />
      ))}
    </>
  )
}

function ReasonsCard({ kind, reasons, onChange }: { kind: ReasonKind; reasons: Reason[]; onChange: (next: Reason[]) => void }) {
  const [editing, setEditing] = React.useState<Reason | "new" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [moving, setMoving] = React.useState(false)
  const copy = COPY[kind]

  const send = async (method: string, body: Record<string, unknown>): Promise<string | null> => {
    const r = await api<{ reasons: Reason[] }>("/api/store/reasons", { method, body: { kind, ...body } })
    if (!r.ok) return r.error
    onChange(r.data.reasons)
    return null
  }

  const move = async (at: number, by: -1 | 1) => {
    const to = at + by
    if (moving || to < 0 || to >= reasons.length) return
    const order = reasons.map((r) => r.value)
    ;[order[at], order[to]] = [order[to], order[at]]
    /* Moved at once; the server's answer is the list as kept. */
    const before = reasons
    onChange(order.map((v) => reasons.find((r) => r.value === v) as Reason))
    setMoving(true)
    const e = await send("PATCH", { order })
    setMoving(false)
    if (e) {
      setError(e)
      onChange(before)
    } else setError(null)
  }

  return (
    <Card
      title={copy.title}
      description={copy.description}
      help="reasons"
      action={
        <button type="button" className={cn(BTN_SECONDARY, "gap-1.5")} onClick={() => setEditing("new")} disabled={reasons.length >= MAX_REASONS} data-add-reason={kind}>
          <Plus className="h-4 w-4" aria-hidden />
          Add reason
        </button>
      }
    >
      {error ? <Notice className="mb-3">{error}</Notice> : null}
      {reasons.length === 0 ? (
        <p className="text-[13.5px] text-[#6b7280]">{copy.empty}</p>
      ) : (
        <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" data-reasons={kind}>
          {reasons.map((r, i) => (
            <li key={r.value} className="group flex items-center gap-2 pr-1.5" data-reason={r.value}>
              <button type="button" onClick={() => setEditing(r)} className="min-w-0 flex-1 px-3.5 py-3 text-left transition-colors hover:bg-[#fafafa]">
                <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{r.label}</span>
                {r.description ? <span className="mt-0.5 block truncate text-[12.5px] text-[#6b7280]">{r.description}</span> : null}
              </button>
              <div className="flex shrink-0 items-center">
                <button type="button" aria-label={`Move ${r.label} up`} disabled={i === 0 || moving} onClick={() => void move(i, -1)} className="grid h-9 w-9 place-items-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#f1f2f4] hover:text-[#4b5563] disabled:opacity-30 disabled:hover:bg-transparent">
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" aria-label={`Move ${r.label} down`} disabled={i === reasons.length - 1 || moving} onClick={() => void move(i, 1)} className="grid h-9 w-9 place-items-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#f1f2f4] hover:text-[#4b5563] disabled:opacity-30 disabled:hover:bg-transparent">
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ReasonForm
        kind={kind}
        reason={editing}
        onClose={() => setEditing(null)}
        onSave={async (label, description) => {
          const e = editing === "new" ? await send("POST", { label, description }) : editing ? await send("PUT", { value: editing.value, label, description }) : null
          if (!e) setEditing(null)
          return e
        }}
        onRemove={async () => {
          if (!editing || editing === "new") return null
          const e = await send("DELETE", { value: editing.value })
          if (!e) setEditing(null)
          return e
        }}
      />
    </Card>
  )
}

function ReasonForm({
  kind,
  reason,
  onClose,
  onSave,
  onRemove,
}: {
  kind: ReasonKind
  reason: Reason | "new" | null
  onClose: () => void
  onSave: (label: string, description: string | null) => Promise<string | null>
  onRemove: () => Promise<string | null>
}) {
  const [label, setLabel] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const isNew = reason === "new"
  const fixed = !isNew && reason?.value === FALLBACK_REASON

  React.useEffect(() => {
    if (!reason) return
    setLabel(reason === "new" ? "" : reason.label)
    setDescription(reason === "new" ? "" : (reason.description ?? ""))
    setError(null)
    setBusy(false)
  }, [reason])

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true)
    const e = await fn()
    setBusy(false)
    setError(e)
  }

  return (
    <Modal
      open={!!reason}
      onClose={onClose}
      title={isNew ? (kind === "return" ? "Add return reason" : "Add refund reason") : "Edit reason"}
      footer={
        <div className="flex w-full items-center gap-2">
          {!isNew && !fixed ? (
            <button type="button" className={cn(BTN_DANGER, "mr-auto")} disabled={busy} onClick={() => void run(onRemove)}>
              Remove
            </button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy || !label.trim()} onClick={() => void run(() => onSave(label.trim(), description.trim() || null))}>
              {busy ? "Saving" : isNew ? "Add reason" : "Save"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3" data-reason-form="">
        <Field label="Name" htmlFor="reason-label" hint={kind === "return" ? "What the buyer reads when they pick it." : undefined}>
          <TextInput id="reason-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder={kind === "return" ? "Too big" : "Item out of stock"} />
        </Field>
        <Field label="Description" htmlFor="reason-description" hint="Optional. A line under the name, for you.">
          <TextInput id="reason-description" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {fixed ? <p className="text-[12.5px] leading-[18px] text-[#6b7280]">This one stays on the list: a reason that isn't on it is kept as this.</p> : null}
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

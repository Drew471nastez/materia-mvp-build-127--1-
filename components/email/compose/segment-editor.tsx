"use client"

/**
 * NEW SEGMENT, from Send to. A name and three questions, each a plain
 * choice: when they joined, where they joined, what they bought. The count
 * under it is the server's, for the rules as they stand, read a moment after
 * the last change; Save keeps it and picks it for this email.
 */
import * as React from "react"
import { Modal, Field, TextInput, SelectInput, Notice, BTN_PRIMARY, BTN_SECONDARY } from "@/components/physical/ui"
import { JOINED_DAYS, NO_RULES, SEGMENT_SOURCES, SOURCE_LABEL, describeRules, type Purchased, type SegmentRules, type SegmentSource } from "@/lib/email-campaigns/segments"
import type { SegmentOption } from "./audience-picker"

export function SegmentEditor({ open, onClose, products, onSaved }: { open: boolean; onClose: () => void; products: { id: string; title: string }[]; onSaved: (s: SegmentOption) => void }) {
  const [name, setName] = React.useState("")
  const [rules, setRules] = React.useState<SegmentRules>(NO_RULES)
  const [count, setCount] = React.useState<number | null>(null)
  const [counting, setCounting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setName("")
    setRules(NO_RULES)
    setError(null)
  }, [open])

  /* The count, for the rules as they stand, a moment after the last change. */
  React.useEffect(() => {
    if (!open) return
    let live = true
    setCounting(true)
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/email/segments/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) })
        const d = await res.json().catch(() => null)
        if (live) setCount(res.ok && typeof d?.count === "number" ? d.count : null)
      } catch {
        if (live) setCount(null)
      } finally {
        if (live) setCounting(false)
      }
    }, 300)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [rules, open])

  const set = (patch: Partial<SegmentRules>) => setRules((r) => ({ ...r, ...patch }))
  const title = (id: string) => products.find((p) => p.id === id)?.title ?? null
  /* "Bought a product you pick" with none picked would be everyone: not saved (the server refuses it too). */
  const noProducts = rules.purchased === "products" && rules.productIds.length === 0

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/email/segments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, rules }) })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.segment) return setError(d?.error ?? "The segment could not be saved. Try again.")
      onSaved({ id: d.segment.id, name: d.segment.name, count: d.segment.count ?? null })
      onClose()
    } catch {
      setError("The segment could not be saved. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New segment"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[13px] text-[#6b7280]" data-segment-count="">
            {counting && count === null ? "Counting" : count === null ? "" : `${count.toLocaleString("en-US")} ${count === 1 ? "person" : "people"} subscribed`}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={busy || !name.trim() || noProducts}>
              {busy ? "Saving" : "Save segment"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4" data-segment-editor="">
        <Field label="Name" htmlFor="segment-name">
          <TextInput id="segment-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Bought in the last 90 days" autoFocus />
        </Field>
        <Field label="Joined your list" htmlFor="segment-joined">
          <SelectInput id="segment-joined" value={rules.joinedWithinDays ? String(rules.joinedWithinDays) : ""} onChange={(v) => set({ joinedWithinDays: v ? Number(v) : null })}>
            <option value="">Any time</option>
            {JOINED_DAYS.map((d) => (
              <option key={d} value={String(d)}>
                {d === 365 ? "In the last year" : `In the last ${d} days`}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Where they joined" htmlFor="segment-source">
          <SelectInput id="segment-source" value={rules.source ?? ""} onChange={(v) => set({ source: (v || null) as SegmentSource | null })}>
            <option value="">Anywhere</option>
            {SEGMENT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Purchases" htmlFor="segment-purchased">
          <SelectInput id="segment-purchased" value={rules.purchased} onChange={(v) => set({ purchased: v as Purchased, productIds: v === "products" ? rules.productIds : [] })}>
            <option value="any">Anyone</option>
            <option value="bought">Bought something from you</option>
            <option value="not_bought">Never bought from you</option>
            {products.length ? <option value="products">Bought a product you pick</option> : null}
          </SelectInput>
        </Field>
        {rules.purchased === "products" ? (
          <div className="max-h-[200px] space-y-1 overflow-y-auto rounded-xl border border-[#eceef1] p-2" role="group" aria-label="Products">
            {products.map((p) => {
              const on = rules.productIds.includes(p.id)
              return (
                <label key={p.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] text-[#1a1a2e] hover:bg-[#f6f7f9]">
                  <input type="checkbox" checked={on} onChange={() => set({ productIds: on ? rules.productIds.filter((x) => x !== p.id) : [...rules.productIds, p.id].slice(0, 50) })} />
                  <span className="min-w-0 truncate">{p.title}</span>
                </label>
              )
            })}
          </div>
        ) : null}
        {noProducts ? (
          <p className="text-[13px] text-[#6b7280]" data-segment-hint="">
            Pick at least one product to save this segment.
          </p>
        ) : null}
        <p className="text-[13px] text-[#6b7280]">{describeRules(rules, title)}. Only people still subscribed are ever sent to.</p>
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

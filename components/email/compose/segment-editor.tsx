"use client"

/**
 * NEW SEGMENT, from Send to. A name and three questions, each a plain
 * choice: when they joined, where they joined, what they bought. The count
 * under it is the server's, for the rules as they stand, read a moment after
 * the last change; Save keeps it and picks it for this email.
 *
 * ON A PHONE IT IS THE APP'S BOTTOM SHEET (round R8: "you can't close the
 * keyboard and the sheet isn't optimized, so it's unusable"). The sheet sits
 * on the keyboard (components/ui/bottom-sheet.tsx aboveKeyboard), so the
 * name and Save are above the keys and the questions scroll inside it; Done
 * in its top corner puts the keyboard away without closing it, as does a tap
 * on the sheet away from a field, and the name's own return key. The fields
 * are 16px there, so iOS does not zoom the page into them, and nothing takes
 * the caret while the sheet rises.
 */
import * as React from "react"
import { X } from "lucide-react"
import { Modal, Field, TextInput, SelectInput, Notice, BTN_PRIMARY, BTN_SECONDARY } from "@/components/physical/ui"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { usePhone } from "@/components/app/date-range-picker"
import { cn } from "@/lib/utils"
import { JOINED_DAYS, NO_RULES, SEGMENT_SOURCES, SOURCE_LABEL, describeRules, type Purchased, type SegmentRules, type SegmentSource } from "@/lib/email-campaigns/segments"
import type { SegmentOption } from "./audience-picker"

/** A field that brings the keyboard up (a checkbox or a select does not). */
function typesText(el: Element | null): el is HTMLElement {
  if (!el) return false
  if (el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable) return true
  return el.tagName === "INPUT" && /^(text|search|email|url|tel|number|password)$/.test((el as HTMLInputElement).type || "text")
}

export function SegmentEditor({ open, onClose, products, onSaved }: { open: boolean; onClose: () => void; products: { id: string; title: string }[]; onSaved: (s: SegmentOption) => void }) {
  const phone = usePhone()
  const sheetBody = React.useRef<HTMLDivElement>(null)
  /* A field in the phone's sheet has the keyboard: Done shows in place of the close button. */
  const [typing, setTyping] = React.useState(false)
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

  /* Whether the caret is in a field of this sheet, followed while it is open on a phone. */
  React.useEffect(() => {
    if (!open || !phone) return
    const check = () => {
      const panel = sheetBody.current?.closest("[data-sheet-panel]") ?? sheetBody.current
      const el = document.activeElement
      setTyping(!!panel && typesText(el) && panel.contains(el))
    }
    let raf = 0
    const later = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(check)
    }
    document.addEventListener("focusin", check)
    document.addEventListener("focusout", later)
    check()
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("focusin", check)
      document.removeEventListener("focusout", later)
      setTyping(false)
    }
  }, [open, phone])
  /* Done, the name's return key, or a tap on the sheet away from a field: the keyboard goes, the sheet stays. */
  const putKeyboardAway = () => {
    const el = document.activeElement
    if (typesText(el)) el.blur()
  }

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

  const countLine = (
    <p className="min-w-0 truncate text-[13px] text-[#6b7280]" data-segment-count="">
      {counting && count === null ? "Counting" : count === null ? "" : `${count.toLocaleString("en-US")} ${count === 1 ? "person" : "people"} subscribed`}
    </p>
  )
  const saveButton = (
    <button type="button" className={cn(BTN_PRIMARY, phone && "h-11 px-5 text-[15px]")} onClick={() => void save()} disabled={busy || !name.trim() || noProducts}>
      {busy ? "Saving" : "Save segment"}
    </button>
  )
  const form = (
      <div className={cn("space-y-4", phone && "[&_input:not([type=checkbox])]:text-[16px] [&_select]:text-[16px]")} data-segment-editor="">
        <Field label="Name" htmlFor="segment-name">
          <TextInput
            id="segment-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bought in the last 90 days"
            autoFocus={!phone}
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (phone && e.key === "Enter") {
                e.preventDefault()
                putKeyboardAway()
              }
            }}
          />
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
                <label key={p.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] text-[#1a1a2e] hover:bg-[#f6f7f9]", phone && "min-h-11 text-[15px]")}>
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
  )

  if (phone) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={onClose}
        label="New segment"
        hideFrom="sm"
        fill
        aboveKeyboard
        maxHeight="min(88dvh, 720px)"
        dismissible={!busy}
        header={
          <div className="flex h-11 items-center justify-between gap-3 px-4">
            <h2 className="text-[17px] font-semibold text-[#1a1a2e]">New segment</h2>
            {typing ? (
              /* The caret stays in the field through the press (no blur on pointerdown), so the tap is never lost to a sheet that moved. */
              <button type="button" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={putKeyboardAway} className="inline-flex h-9 items-center rounded-full bg-[#f1f2f4] px-4 text-[15px] font-semibold text-[#1a1a2e] active:bg-[#e6e8eb] [-webkit-tap-highlight-color:transparent]" data-segment-done="">
                Done
              </button>
            ) : (
              <button type="button" onClick={onClose} aria-label="Close" disabled={busy} className="-mr-1.5 grid h-10 w-10 place-items-center rounded-full text-[#6b7280] active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        }
      >
        <div ref={sheetBody} className="flex min-h-0 flex-1 flex-col">
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2"
            style={{ touchAction: "pan-y" }}
            data-segment-scroll=""
            onPointerDown={(e) => {
              if (!(e.target as HTMLElement).closest("input, select, textarea, label, button")) putKeyboardAway()
            }}
          >
            {form}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#f1f2f4] px-4 pt-3" data-segment-foot="">
            {countLine}
            {saveButton}
          </div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New segment"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {countLine}
          <div className="flex shrink-0 gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            {saveButton}
          </div>
        </div>
      }
    >
      {form}
    </Modal>
  )
}

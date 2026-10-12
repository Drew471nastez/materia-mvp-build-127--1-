"use client"

/**
 * Who the email goes to: everyone, the people who joined lately, the ones
 * from the OnePage or the website, or a saved segment, each with how many
 * are subscribed today. A popover on a computer, the sheet on a phone.
 */
import * as React from "react"
import { ChevronDown, Plus } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { PickerDivider, PickerRow, onRowsKey, pickerSurface, usePhone } from "@/components/app/date-range-picker"
import { cn } from "@/lib/utils"
import { SegmentEditor } from "./segment-editor"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

export interface AudienceOption {
  type: string
  label: string
  count: number | null
}
export interface SegmentOption {
  id: string
  name: string
  count: number | null
}
export interface Audience {
  type: string
  segmentId: string | null
}

const n = (v: number | null | undefined) => (typeof v === "number" ? v.toLocaleString(appLocale()) : "")

export function audienceLabel(a: Audience, options: AudienceOption[], segments: SegmentOption[]): { label: string; count: number | null } {
  if (a.type === "segment") {
    const s = segments.find((x) => x.id === a.segmentId)
    return { label: s ? s.name : tt("A segment"), count: s?.count ?? null }
  }
  if (a.type === "last_24h") return { label: tt("Joined in the last 24 hours"), count: null }
  const o = options.find((x) => x.type === a.type) ?? options[0]
  return { label: o?.label ?? tt("All subscribers"), count: o?.count ?? null }
}

function Rows({ value, options, segments, compact, onPick, onNew }: { value: Audience; options: AudienceOption[]; segments: SegmentOption[]; compact: boolean; onPick: (a: Audience) => void; onNew?: () => void }) {
  return (
    <div role="menu" aria-label={tt("Audience")} onKeyDown={onRowsKey} className={compact ? "px-2 pb-3" : "max-h-[360px] overflow-y-auto p-1.5"}>
      {options.map((o) => (
        <PickerRow key={o.type} rowKey={o.type} compact={compact} checked={value.type === o.type} detail={n(o.count)} onClick={() => onPick({ type: o.type, segmentId: null })}>
          {o.label}
        </PickerRow>
      ))}
      {segments.length ? (
        <>
          <PickerDivider compact={compact} />
          <p className={cn("px-3 pb-1 pt-1.5 font-medium text-[#6b7280]", compact ? "text-[13px]" : "text-[12px]")}>{tt("Segments")}</p>
          {segments.map((s) => (
            <PickerRow key={s.id} rowKey={s.id} compact={compact} checked={value.type === "segment" && value.segmentId === s.id} detail={n(s.count)} onClick={() => onPick({ type: "segment", segmentId: s.id })}>
              {s.name}
            </PickerRow>
          ))}
        </>
      ) : null}
      {onNew ? (
        <>
          <PickerDivider compact={compact} />
          <button
            type="button"
            role="menuitem"
            onClick={onNew}
            className={cn("flex w-full items-center gap-2 rounded-lg px-3 text-left font-medium text-[#1a1a2e] hover:bg-[#f6f7f9]", compact ? "h-12 text-[15px]" : "h-9 text-[14px]")}
            data-new-segment=""
          >
            <Plus className="h-4 w-4 text-[#6b7280]" aria-hidden />
            {tt("New segment")}
          </button>
        </>
      ) : null}
    </div>
  )
}

export function AudiencePicker({
  value,
  options,
  segments,
  onChange,
  disabled,
  id,
  products = [],
  onSegmentCreated,
}: {
  value: Audience
  options: AudienceOption[]
  segments: SegmentOption[]
  onChange: (a: Audience) => void
  disabled?: boolean
  id?: string
  /** For New segment: the creator's products, and what to do with a saved one. Without it there is no New segment row. */
  products?: { id: string; title: string }[]
  onSegmentCreated?: (s: SegmentOption) => void
}) {
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)
  const [making, setMaking] = React.useState(false)
  const onNew = onSegmentCreated
    ? () => {
        setOpen(false)
        setMaking(true)
      }
    : undefined
  const editor = onSegmentCreated ? <SegmentEditor open={making} onClose={() => setMaking(false)} products={products} onSaved={onSegmentCreated} /> : null
  const { label, count } = audienceLabel(value, options, segments)
  const pick = (a: Audience) => {
    onChange(a)
    setOpen(false)
  }
  const trigger = (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={phone ? () => setOpen(true) : undefined}
      className="flex h-11 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg px-0 text-left text-[16px] text-[#1a1a2e] outline-none disabled:cursor-default sm:h-9 sm:text-[14px]"
    >
      <span className="min-w-0 truncate">
        <span className="font-medium">{label}</span>
        {count !== null ? <span className="text-[#6b7280]"> · {n(count)} {count === 1 ? "person" : "people"}</span> : null}
      </span>
      {!disabled ? <ChevronDown className="h-4 w-4 shrink-0 text-[#6b7280]" /> : null}
    </button>
  )
  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={tt("Send to")} hideFrom="sm">
          <Rows value={value} options={options} segments={segments} compact onPick={pick} onNew={onNew} />
        </BottomSheet>
        {editor}
      </>
    )
  }
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className={cn(pickerSurface, "w-[340px]")}>
          <Rows value={value} options={options} segments={segments} compact={false} onPick={pick} onNew={onNew} />
        </PopoverContent>
      </Popover>
      {editor}
    </>
  )
}

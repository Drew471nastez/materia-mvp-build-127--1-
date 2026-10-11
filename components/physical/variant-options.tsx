"use client"

/**
 * ===========================================================================
 *  A PHYSICAL PRODUCT'S OPTIONS: SIZE, COLOR, MATERIAL, OR THE SELLER'S OWN
 * ===========================================================================
 * Shaped like Shopify's: each option is one line that reads "Size  S M L XL"
 * until it is opened, and opened it is a name and a list of values, one
 * field each, with an empty field at the end for the next one. Up to three
 * options, up to 100 values each (lib/physical/variants.ts).
 *
 * "Make variants feel better: arranging them, smooth drag, adding variants,
 * the UI on mobile, smaller, smoother, cleaner." So:
 *
 *   one line     an option's line keeps its place and height whether it is
 *                open or not: its name, then Edit or Done at the end. Under
 *                it the values as chips fold away while the fields fold out,
 *                both through grid rows (Reveal), so nothing jumps
 *   reorder      the grip follows the finger at once (useGripDragSensors);
 *                the rows around it make room in 180ms on iOS's own curve.
 *                The keyboard lifts with Space, moves with the arrows
 *   values       compact fields, 40px on a phone and 36px from 640px, with
 *                16px type so iOS never zooms; a value added slides in, a
 *                removed one fades out before the rows under it close up
 *   rename       a value is committed when its field is left or Enter is
 *                pressed, so the rows under it follow the new name and keep
 *                what was typed into them (./variant-rows.ts)
 *   add          Enter, a comma, or leaving the last field adds what is in it
 *
 * Colours get a small swatch beside their name when the word is one the
 * product page also draws as a swatch.
 */

import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent, type Modifier } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { GripVertical, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { isColorOption, swatchColor } from "@/lib/products/product-page-model"
import { MAX_OPTIONS, MAX_VALUES } from "@/lib/physical/variants"
import { AUTO_SCROLL, GRIP_TOUCH, liftTick, useGripDragSensors } from "@/app/app/products/new/hold-to-drag"
import { BTN_GHOST, BTN_SECONDARY, FIELD_COMPACT, Reveal } from "./ui"

export interface OptionDraft {
  /** Stable for the drag and for React: never shown or saved. */
  id: string
  name: string
  values: string[]
  open: boolean
}

/** The names most products use, offered as the name field is typed; any other name is fine. */
export const OPTION_NAMES = ["Size", "Color", "Material", "Style", "Pattern", "Scent", "Flavor", "Length", "Fit", "Finish"]

/** The options most products have, with their usual values to keep or remove. */
export const OPTION_PRESETS: { name: string; values: string[] }[] = [
  { name: "Size", values: ["S", "M", "L", "XL"] },
  { name: "Color", values: [] },
  { name: "Material", values: [] },
]

let seq = 0
export const optionId = () => `opt-${Date.now().toString(36)}-${(seq++).toString(36)}`

const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/** How the rows around a lifted one make room: short, on the curve the editor's sheets use. */
export const SORT_TRANSITION = { duration: 180, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }

/** A row going: how long it fades before it is taken out. */
export const LEAVE_MS = 140

/** What an option still needs before it can be closed, or null. */
export function optionProblem(o: { name: string; values: string[] }, taken: boolean): string | null {
  if (!o.name.trim()) return "Name this option, like Size or Color"
  if (taken) return "Another option has this name"
  if (o.values.length === 0) return "Add at least one value"
  return null
}

export interface OptionsEditorProps {
  options: OptionDraft[]
  setOptions: (update: (prev: OptionDraft[]) => OptionDraft[]) => void
  /** A value renamed in place: the rows that had it follow (./variant-rows.ts renameValueInRows). */
  renameValue: (option: number, from: string, to: string) => void
  /** An option dragged to another place: every row's values move the same way. */
  moveOption: (from: number, to: number) => void
  removeOption: (index: number) => void
}

export function OptionsEditor({ options, setOptions, renameValue, moveOption, removeOption }: OptionsEditorProps) {
  const sensors = useGripDragSensors()
  const [leaving, setLeaving] = React.useState<string | null>(null)
  const latest = React.useRef(options)
  latest.current = options
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = options.findIndex((o) => o.id === active.id)
    const to = options.findIndex((o) => o.id === over.id)
    if (from >= 0 && to >= 0) moveOption(from, to)
  }
  const used = new Set(options.map((o) => o.name.trim().toLowerCase()))
  const add = (name = "", values: string[] = []) => setOptions((prev) => [...prev.map((o) => ({ ...o, open: false })), { id: optionId(), name, values, open: true }])
  /* Faded out first, then taken out, so the rows under it close up after it has gone rather than over it. */
  const remove = (id: string) => {
    setLeaving(id)
    window.setTimeout(() => {
      setLeaving(null)
      const i = latest.current.findIndex((o) => o.id === id)
      if (i >= 0) removeOption(i)
    }, prefersLessMotion() ? 0 : LEAVE_MS)
  }

  return (
    <div className="space-y-2.5" data-options-editor="">
      {options.length ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[vertical]}
          autoScroll={AUTO_SCROLL}
          onDragStart={(e) => liftTick(e.activatorEvent)}
          onDragEnd={onDragEnd}
          accessibility={{ screenReaderInstructions: { draggable: "To move an option, press Space on its handle, then the up and down arrow keys, then Space again." } }}
        >
          <SortableContext items={options.map((o) => o.id)} strategy={verticalListSortingStrategy}>
            <div className="rounded-xl border border-[#eceef1] bg-white" data-option-list="">
              {options.map((o, i) => {
                const taken = options.some((x, j) => j !== i && x.name.trim() && x.name.trim().toLowerCase() === o.name.trim().toLowerCase())
                return (
                  <OptionRow
                    key={o.id}
                    option={o}
                    index={i}
                    canMove={options.length > 1}
                    leaving={leaving === o.id}
                    problem={optionProblem(o, taken)}
                    update={(patch) => setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, ...patch } : x)))}
                    open={() => setOptions((prev) => prev.map((x) => ({ ...x, open: x.id === o.id })))}
                    renameValue={(from, to) => renameValue(i, from, to)}
                    remove={() => remove(o.id)}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}

      {options.length < MAX_OPTIONS ? (
        options.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2" data-option-presets="">
            {/* One tap for the usual ones, with their common values filled in to keep or remove. */}
            {OPTION_PRESETS.map((p) => (
              <button key={p.name} type="button" onClick={() => add(p.name, [...p.values])} className={cn(BTN_SECONDARY, "h-9 px-3 text-[13.5px]")}>
                <Plus className="h-3.5 w-3.5" />
                {p.name}
              </button>
            ))}
            <button type="button" onClick={() => add()} className={cn(BTN_GHOST, "h-9 px-3 text-[13.5px]")}>
              Your own option
            </button>
          </div>
        ) : (
          <button type="button" data-add-option="" onClick={() => add(OPTION_PRESETS.find((p) => !used.has(p.name.toLowerCase()))?.name ?? "")} className={cn(BTN_GHOST, "-ml-2 h-9 px-2 text-[13.5px]")}>
            <Plus className="h-4 w-4" />
            Add another option
          </button>
        )
      ) : null}
    </div>
  )
}

function prefersLessMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

function Swatch({ value }: { value: string }) {
  const c = swatchColor(value)
  if (!c) return null
  return <span aria-hidden className="h-3 w-3 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(17,24,39,0.15)]" style={{ background: c }} />
}

/** The grip at the start of a row: 28px wide, the full height of the line, and the only part a finger drags by. */
function Grip({ label, activator, attributes, listeners, className }: { label: string; activator: (el: HTMLElement | null) => void; attributes: object; listeners: object | undefined; className?: string }) {
  return (
    <button
      type="button"
      ref={activator}
      {...attributes}
      {...listeners}
      aria-label={label}
      data-grip=""
      className={cn("grid w-7 shrink-0 place-items-center rounded-md text-[#b0b5bd] outline-none transition-colors hover:text-[#4b5563] focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40", GRIP_TOUCH, className)}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}

function OptionRow({
  option,
  index,
  canMove,
  leaving,
  problem,
  update,
  open,
  renameValue,
  remove,
}: {
  option: OptionDraft
  index: number
  canMove: boolean
  leaving: boolean
  problem: string | null
  update: (patch: Partial<OptionDraft>) => void
  open: () => void
  renameValue: (from: string, to: string) => void
  remove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: option.id, transition: SORT_TRANSITION })
  const color = isColorOption(option.name)
  const nameId = `${option.id}-name`
  const nameRef = React.useRef<HTMLInputElement>(null)
  /* A new option opens on its name when it has none; one from a preset opens on its values. */
  React.useEffect(() => {
    if (option.open && !option.name) nameRef.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only as it first opens
  }, [option.open])

  return (
    <div
      ref={setNodeRef}
      data-option-row={option.name || index}
      data-open={option.open ? "" : undefined}
      data-dragging={isDragging ? "" : undefined}
      className={cn(
        "relative border-b border-[#eceef1] bg-white first:rounded-t-xl last:rounded-b-xl last:border-b-0",
        isDragging && "z-10 rounded-xl shadow-[0_14px_32px_-10px_rgba(17,24,39,0.28),0_0_0_1px_rgba(17,24,39,0.06)]",
        leaving && "pointer-events-none opacity-0 transition-opacity duration-150",
      )}
      style={{ transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined, transition: isDragging ? undefined : transition }}
    >
      {/* The line: the same height open or closed. */}
      <div className="flex min-h-[48px] items-stretch gap-1 py-1 pl-1 pr-2 sm:min-h-[44px]">
        {canMove ? <Grip label={`Move ${option.name || "option"}`} activator={setActivatorNodeRef} attributes={attributes} listeners={listeners} /> : <span className="w-2 shrink-0" />}
        <button
          type="button"
          onClick={() => (option.open ? !problem && update({ open: false }) : open())}
          aria-expanded={option.open}
          aria-label={option.open ? `Done with ${option.name || "this option"}` : `Edit ${option.name || "option"}`}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40"
        >
          <span className="min-w-0 truncate text-[14.5px] font-medium text-[#1a1a2e] sm:text-[14px]">{option.name.trim() || "New option"}</span>
          <span className={cn("shrink-0 text-[13px] font-medium", option.open ? (problem ? "text-[#9ca3af]" : "text-[#1a1a2e]") : "text-[#6b7280]")} data-option-done={option.open ? "" : undefined}>
            {option.open ? "Done" : "Edit"}
          </span>
        </button>
      </div>

      {/* Closed: its values as chips. */}
      <Reveal open={!option.open}>
        <div className="flex flex-wrap gap-1.5 pb-3 pl-9 pr-3" data-option-chips="">
          {option.values.length ? (
            option.values.map((v) => (
              <span key={v} className="inline-flex h-6 items-center gap-1.5 rounded-md bg-[#f1f2f4] px-2 text-[12.5px] text-[#374151]">
                {color ? <Swatch value={v} /> : null}
                {v}
              </span>
            ))
          ) : (
            <span className="text-[12.5px] text-[#b45309]">No values yet</span>
          )}
        </div>
      </Reveal>

      {/* Open: its name and values, as fields. */}
      <Reveal open={option.open}>
        <div className="space-y-3 pb-3 pl-9 pr-3" data-option-fields="">
          <div className="space-y-1">
            <label htmlFor={nameId} className="block text-[12.5px] font-medium text-[#4b5563]">
              Option name
            </label>
            <input
              id={nameId}
              ref={nameRef}
              list="physical-option-names"
              value={option.name}
              maxLength={40}
              autoComplete="off"
              placeholder={index === 0 ? "Size" : index === 1 ? "Color" : "Material"}
              onChange={(e) => update({ name: e.target.value.replace(/\s{2,}/g, " ").slice(0, 40) })}
              className={FIELD_COMPACT}
              data-option-name=""
            />
            <datalist id="physical-option-names">
              {OPTION_NAMES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <p className="text-[12.5px] font-medium text-[#4b5563]">Values</p>
            <ValueList option={option} color={color} update={update} renameValue={renameValue} />
          </div>
          <div className="flex min-h-[20px] items-center justify-between gap-3">
            <p className={cn("text-[12.5px] leading-[18px]", problem ? "text-[#b45309]" : "text-[#9ca3af]")} aria-live="polite">
              {problem ?? `${option.values.length} ${option.values.length === 1 ? "value" : "values"}`}
            </p>
            <button type="button" onClick={remove} className="-mr-1.5 h-8 shrink-0 rounded-md px-1.5 text-[13px] font-medium text-[#b42318] outline-none hover:bg-[#fef2f2] focus-visible:ring-2 focus-visible:ring-[#fca5a5]/50" data-option-delete="">
              Delete option
            </button>
          </div>
        </div>
      </Reveal>
    </div>
  )
}

/** One field per value, in order, held by its grip to reorder; an empty field at the end takes the next. */
function ValueList({ option, color, update, renameValue }: { option: OptionDraft; color: boolean; update: (patch: Partial<OptionDraft>) => void; renameValue: (from: string, to: string) => void }) {
  const sensors = useGripDragSensors()
  const [draft, setDraft] = React.useState("")
  const [dupe, setDupe] = React.useState<string | null>(null)
  /* The value just added slides in; one being removed fades out first. */
  const [entered, setEntered] = React.useState<string | null>(null)
  const [leaving, setLeaving] = React.useState<string | null>(null)
  const latest = React.useRef(option.values)
  latest.current = option.values
  const has = (v: string, except?: number) => option.values.some((x, i) => i !== except && x.toLowerCase() === v.toLowerCase())

  const addDraft = (text = draft) => {
    const add = text.replace(/\s+/g, " ").trim().slice(0, 100)
    if (!add) return setDraft("")
    if (has(add)) {
      setDupe(add)
      return
    }
    if (option.values.length >= MAX_VALUES) return
    update({ values: [...option.values, add] })
    setEntered(add)
    setDraft("")
    setDupe(null)
  }
  const removeValue = (v: string) => {
    setLeaving(v)
    window.setTimeout(() => {
      setLeaving(null)
      update({ values: latest.current.filter((x) => x !== v) })
    }, prefersLessMotion() ? 0 : LEAVE_MS)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = option.values.indexOf(String(active.id))
    const to = option.values.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = [...option.values]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    update({ values: next })
  }

  return (
    <div className="space-y-1.5" data-option-values="">
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[vertical]} autoScroll={AUTO_SCROLL} onDragStart={(e) => liftTick(e.activatorEvent)} onDragEnd={onDragEnd}>
        <SortableContext items={option.values} strategy={verticalListSortingStrategy}>
          {option.values.map((v, k) => (
            <ValueField
              key={v}
              value={v}
              color={color}
              canMove={option.values.length > 1}
              entering={entered === v}
              leaving={leaving === v}
              taken={(text) => has(text, k)}
              onCommit={(text) => {
                if (text === v) return
                renameValue(v, text)
              }}
              onRemove={() => removeValue(v)}
            />
          ))}
        </SortableContext>
      </DndContext>
      {option.values.length < MAX_VALUES ? (
        <div className="flex items-center gap-1 pl-7">
          <input
            aria-label={`Add a value to ${option.name || "this option"}`}
            placeholder={option.values.length ? "Add another value" : "Type a value, like Small"}
            value={draft}
            maxLength={101}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => {
              const v = e.target.value
              setDupe(null)
              if (v.endsWith(",")) addDraft(v.slice(0, -1))
              else setDraft(v)
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              e.preventDefault()
              addDraft()
            }}
            onBlur={() => addDraft()}
            className={cn(FIELD_COMPACT, "flex-1 border-dashed bg-[#fcfcfd] focus:border-solid focus:bg-white")}
            data-option-new-value=""
          />
          <span className="w-8 shrink-0" />
        </div>
      ) : null}
      {dupe ? <p className="pl-7 text-[12.5px] text-[#b45309]">{dupe} is already a value.</p> : null}
    </div>
  )
}

function ValueField({
  value,
  color,
  canMove,
  entering,
  leaving,
  taken,
  onCommit,
  onRemove,
}: {
  value: string
  color: boolean
  canMove: boolean
  entering: boolean
  leaving: boolean
  taken: (text: string) => boolean
  onCommit: (text: string) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: value, transition: SORT_TRANSITION })
  const [text, setText] = React.useState(value)
  React.useEffect(() => setText(value), [value])
  const clash = text.trim() !== value && !!text.trim() && taken(text.trim())
  const commit = () => {
    const t = text.replace(/\s+/g, " ").trim().slice(0, 100)
    if (!t || clash) return setText(value)
    onCommit(t)
  }
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative flex items-center gap-1",
        isDragging && "z-10",
        entering && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-150",
        leaving && "pointer-events-none opacity-0 transition-opacity duration-150",
      )}
      style={{ transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined, transition: isDragging ? undefined : transition }}
      data-option-value={value}
      data-dragging={isDragging ? "" : undefined}
    >
      {canMove ? <Grip label={`Move ${value}`} activator={setActivatorNodeRef} attributes={attributes} listeners={listeners} className="h-10 sm:h-9" /> : <span className="w-7 shrink-0" />}
      <div className="relative min-w-0 flex-1">
        {color ? (
          <span className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2">
            <Swatch value={text} />
          </span>
        ) : null}
        <input
          aria-label={`Value ${value}`}
          value={text}
          maxLength={100}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            } else if (e.key === "Escape") setText(value)
          }}
          className={cn(FIELD_COMPACT, isDragging && "shadow-[0_10px_24px_-10px_rgba(17,24,39,0.3)]", color && swatchColor(text) && "pl-7", clash && "border-[#f59e0b]")}
        />
      </div>
      <button type="button" aria-label={`Remove ${value}`} onClick={onRemove} className="grid h-10 w-8 shrink-0 place-items-center rounded-lg text-[#9ca3af] outline-none transition-colors hover:bg-[#fef2f2] hover:text-[#b42318] focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40 sm:h-9">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

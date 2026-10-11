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
 *   reorder     hold the handle and move it (./hold-to-drag, the same rules
 *               as the photos and the questions): options, and values inside
 *               an open option. The keyboard lifts with Space.
 *   rename      a value is committed when its field is left or Enter is
 *               pressed, so the rows under it follow the new name and keep
 *               what was typed into them (./variant-rows.ts)
 *   add         Enter, a comma, or leaving the last field adds what is in it
 *   remove      the bin beside a value, Delete under an open option
 *
 * Colours get a small swatch beside their name when the word is one the
 * product page also draws as a swatch.
 */

import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent, type Modifier } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { isColorOption, swatchColor } from "@/lib/products/product-page-model"
import { MAX_OPTIONS, MAX_VALUES } from "@/lib/physical/variants"
import { AUTO_SCROLL, HANDLE_TOUCH, liftTick, useHoldToDragSensors } from "@/app/app/products/new/hold-to-drag"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, FIELD } from "./ui"

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
  const sensors = useHoldToDragSensors()
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = options.findIndex((o) => o.id === active.id)
    const to = options.findIndex((o) => o.id === over.id)
    if (from >= 0 && to >= 0) moveOption(from, to)
  }
  const used = new Set(options.map((o) => o.name.trim().toLowerCase()))
  const add = (name = "", values: string[] = []) => setOptions((prev) => [...prev.map((o) => ({ ...o, open: false })), { id: optionId(), name, values, open: true }])

  return (
    <div className="space-y-3" data-options-editor="">
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
            <div className="overflow-hidden rounded-xl border border-[#eceef1]" data-option-list="">
              {options.map((o, i) => (
                <OptionRow
                  key={o.id}
                  option={o}
                  index={i}
                  canMove={options.length > 1}
                  taken={options.some((x, j) => j !== i && x.name.trim() && x.name.trim().toLowerCase() === o.name.trim().toLowerCase())}
                  update={(patch) => setOptions((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                  open={() => setOptions((prev) => prev.map((x, j) => ({ ...x, open: j === i })))}
                  renameValue={(from, to) => renameValue(i, from, to)}
                  remove={() => removeOption(i)}
                />
              ))}
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

function Swatch({ value }: { value: string }) {
  const c = swatchColor(value)
  if (!c) return null
  return <span aria-hidden className="h-3 w-3 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(17,24,39,0.15)]" style={{ background: c }} />
}

function OptionRow({
  option,
  index,
  canMove,
  taken,
  update,
  open,
  renameValue,
  remove,
}: {
  option: OptionDraft
  index: number
  canMove: boolean
  taken: boolean
  update: (patch: Partial<OptionDraft>) => void
  open: () => void
  renameValue: (from: string, to: string) => void
  remove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: option.id })
  const color = isColorOption(option.name)
  const nameId = `${option.id}-name`
  const problem = !option.name.trim() ? "Name this option, like Size or Color" : taken ? "Another option has this name" : option.values.length === 0 ? "Add at least one value" : null

  return (
    <div
      ref={setNodeRef}
      data-option-row={option.name || index}
      className={cn("relative border-b border-[#eceef1] bg-white last:border-b-0", isDragging && "z-10 shadow-[0_12px_28px_-8px_rgba(17,24,39,0.22)]")}
      style={{ transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined, transition: isDragging ? undefined : transition }}
    >
      <div className="flex items-start gap-1 px-1.5 py-2.5 sm:px-2">
        {canMove ? (
          <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Move ${option.name || "option"}`} className={cn("grid h-9 w-8 shrink-0 place-items-center rounded-md text-[#9ca3af] outline-none hover:text-[#4b5563] focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40", HANDLE_TOUCH)}>
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-2 shrink-0" />
        )}

        {option.open ? (
          <div className="min-w-0 flex-1 space-y-3 py-0.5 pr-1.5">
            <div className="space-y-1.5">
              <label htmlFor={nameId} className="block text-[13px] font-medium text-[#374151]">
                Option name
              </label>
              <input
                id={nameId}
                list="physical-option-names"
                value={option.name}
                maxLength={40}
                placeholder={index === 0 ? "Size" : index === 1 ? "Color" : "Material"}
                onChange={(e) => update({ name: e.target.value.slice(0, 40) })}
                className={FIELD}
                data-option-name=""
              />
              <datalist id="physical-option-names">
                {OPTION_NAMES.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-[#374151]">Values</p>
              <ValueList option={option} color={color} update={update} renameValue={renameValue} />
            </div>
            {problem ? <p className="text-[12.5px] text-[#b45309]">{problem}</p> : null}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button type="button" onClick={remove} className={cn(BTN_GHOST, "-ml-2 text-[#b42318] hover:bg-[#fef2f2] hover:text-[#b42318]")}>
                Delete
              </button>
              <button type="button" data-option-done="" onClick={() => update({ open: false })} disabled={!!problem} className={cn(BTN_PRIMARY, "h-9 px-4")}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={open} aria-label={`Edit ${option.name || "option"}`} className="flex min-w-0 flex-1 flex-col items-start gap-1.5 rounded-lg px-1.5 py-1 text-left outline-none transition-colors hover:bg-[#f8f9fa] focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40">
            <span className="text-[14px] font-medium text-[#1a1a2e]">{option.name || "Untitled option"}</span>
            <span className="flex flex-wrap gap-1.5">
              {option.values.length ? (
                option.values.map((v) => (
                  <span key={v} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#f1f2f4] px-2 text-[13px] text-[#374151]">
                    {color ? <Swatch value={v} /> : null}
                    {v}
                  </span>
                ))
              ) : (
                <span className="text-[13px] text-[#b45309]">No values yet</span>
              )}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

/** One field per value, in order, held to reorder; an empty field at the end takes the next. */
function ValueList({ option, color, update, renameValue }: { option: OptionDraft; color: boolean; update: (patch: Partial<OptionDraft>) => void; renameValue: (from: string, to: string) => void }) {
  const sensors = useHoldToDragSensors()
  const [draft, setDraft] = React.useState("")
  const [dupe, setDupe] = React.useState<string | null>(null)
  const newRef = React.useRef<HTMLInputElement>(null)
  const has = (v: string, except?: number) => option.values.some((x, i) => i !== except && x.toLowerCase() === v.toLowerCase())

  const addDraft = (text = draft) => {
    const add = text.trim().slice(0, 100)
    if (!add) return setDraft("")
    if (has(add)) {
      setDupe(add)
      return
    }
    if (option.values.length >= MAX_VALUES) return
    update({ values: [...option.values, add] })
    setDraft("")
    setDupe(null)
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
              taken={(text) => has(text, k)}
              onCommit={(text) => {
                if (text === v) return
                renameValue(v, text)
              }}
              onRemove={() => update({ values: option.values.filter((_, n) => n !== k) })}
            />
          ))}
        </SortableContext>
      </DndContext>
      {option.values.length < MAX_VALUES ? (
        <div className="flex items-center gap-1 pl-9">
          <input
            ref={newRef}
            aria-label={`Add a value to ${option.name || "this option"}`}
            placeholder={option.values.length ? "Add another value" : "Type a value, like Small"}
            value={draft}
            maxLength={101}
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
            className={cn(FIELD, "flex-1")}
            data-option-new-value=""
          />
          <span className="w-9 shrink-0" />
        </div>
      ) : null}
      {dupe ? <p className="pl-9 text-[12.5px] text-[#b45309]">{dupe} is already a value.</p> : null}
    </div>
  )
}

function ValueField({ value, color, canMove, taken, onCommit, onRemove }: { value: string; color: boolean; canMove: boolean; taken: (text: string) => boolean; onCommit: (text: string) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: value })
  const [text, setText] = React.useState(value)
  React.useEffect(() => setText(value), [value])
  const clash = text.trim() !== value && !!text.trim() && taken(text.trim())
  const commit = () => {
    const t = text.trim().slice(0, 100)
    if (!t || clash) return setText(value)
    onCommit(t)
  }
  return (
    <div
      ref={setNodeRef}
      className={cn("relative flex items-center gap-1", isDragging && "z-10")}
      style={{ transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined, transition: isDragging ? undefined : transition }}
      data-option-value={value}
    >
      {canMove ? (
        <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Move ${value}`} className={cn("grid h-10 w-8 shrink-0 place-items-center rounded-md text-[#9ca3af] outline-none hover:text-[#4b5563] focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40", HANDLE_TOUCH)}>
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="w-8 shrink-0" />
      )}
      <div className="relative min-w-0 flex-1">
        {color ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Swatch value={text} />
          </span>
        ) : null}
        <input
          aria-label={`Value ${value}`}
          value={text}
          maxLength={100}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            } else if (e.key === "Escape") setText(value)
          }}
          className={cn(FIELD, isDragging && "shadow-[0_8px_20px_-8px_rgba(17,24,39,0.25)]", color && swatchColor(text) && "pl-8", clash && "border-[#f59e0b]")}
        />
      </div>
      <button type="button" aria-label={`Remove ${value}`} onClick={onRemove} className="grid h-10 w-9 shrink-0 place-items-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#fef2f2] hover:text-[#b42318]">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

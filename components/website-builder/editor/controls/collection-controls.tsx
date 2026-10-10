"use client"

/**
 * ===========================================================================
 *  A COLLECTION, OR SEVERAL, PICKED BY RECOGNISING THEM
 * ===========================================================================
 * The controls for `collection_picker` and `collection_list`. Both hold ids
 * and show collections: a picture, a name and how many products are in it,
 * the way Products › Collections lists them. The list opens under the field
 * with a search box, in the flow of the sidebar like the product list's
 * (field-popover.tsx), so the sheet it sits in cannot clip it.
 *
 * A collection that is hidden from visitors is offered and marked Hidden,
 * so the creator sees why the section is empty rather than wondering. One
 * that has been deleted, or is not theirs, stays in the setting named as
 * missing until somebody removes it: it is still in the section's settings.
 */
import { EmptyPicker } from "./empty-picker"
import * as React from "react"
import { ArrowDown, ArrowUp, GripVertical, Plus, Search, X } from "lucide-react"

import { FieldPopover, usePhoneLayout } from "@/components/website-builder/field-popover"
import { cn } from "@/lib/utils"
import { useEditorFieldEnv, type PickerCollection } from "./context"
import { ADD_BUTTON, ICON_BUTTON, NOTE, TEXT_BUTTON } from "./styles"
import { useReorder } from "./use-reorder"

const DEFAULT_LIMIT = 12

function Thumb({ collection }: { collection?: PickerCollection }) {
  return collection?.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={collection.image} alt="" loading="lazy" decoding="async" width={36} height={36} className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" />
  ) : (
    <span aria-hidden className="h-9 w-9 shrink-0 rounded-md border border-border bg-muted" />
  )
}

function countLabel(c: PickerCollection): string {
  const n = `${c.products_count} ${c.products_count === 1 ? "product" : "products"}`
  return c.published ? n : `Hidden · ${n}`
}

/** One chosen collection: its picture, name and count, and the buttons beside it. */
function Row({ c, children }: { c?: PickerCollection; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-1.5 pr-1">
      <Thumb collection={c} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13px] max-sm:text-[15px] font-medium", !c && "text-muted-foreground")}>
          {c ? c.title : "A collection that is gone"}
        </span>
        {c && <span className="block text-[11px] max-sm:text-[13px] text-muted-foreground tabular-nums">{countLabel(c)}</span>}
      </span>
      {children}
    </div>
  )
}

/** The searchable list a choice is made from. */
function CollectionMenu({
  open,
  onOpenChange,
  trigger,
  offer,
  onPick,
  emptyText,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  trigger: React.ReactNode
  offer: PickerCollection[]
  onPick: (id: string) => void
  emptyText: string
}) {
  const phone = usePhoneLayout()
  const [query, setQuery] = React.useState("")
  const q = query.trim().toLowerCase()
  const shown = offer.filter((c) => !q || c.title.toLowerCase().includes(q))
  const pick = (id: string) => {
    onPick(id)
    setQuery("")
  }
  return (
    <FieldPopover open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQuery("") }} trigger={trigger}>
      <div className="border-b border-border px-2.5 py-2">
        <label className="flex items-center gap-2">
          <Search aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="search"
            autoFocus={!phone}
            className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search your collections"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shown[0]) {
                e.preventDefault()
                pick(shown[0].id)
              }
            }}
          />
        </label>
      </div>
      <ul role="listbox" aria-label="Your collections" className="max-h-60 overflow-y-auto wb-slim-scroll py-1">
        {shown.length === 0 && <li className="px-3 py-2.5 text-[13px] text-muted-foreground">{q ? "Nothing matches that." : emptyText}</li>}
        {shown.map((c) => (
          <li key={c.id} role="option" aria-selected={false}>
            <button type="button" className="flex w-full items-center gap-2.5 px-2.5 py-1.5 max-sm:min-h-12 text-left transition-colors hover:bg-muted/60" onClick={() => pick(c.id)}>
              <Thumb collection={c} />
              <span className="min-w-0 flex-1 truncate text-[13px] max-sm:text-[15px]">{c.title}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{countLabel(c)}</span>
            </button>
          </li>
        ))}
      </ul>
    </FieldPopover>
  )
}

/** Said in place of the control when there is nothing it could pick from. */
function Unavailable({ list }: { list: PickerCollection[] | null | undefined }) {
  if (list === null) return <p className={NOTE}>Your collections could not be loaded. Reload the builder to try again.</p>
  return (
    <EmptyPicker kind="collection" />
  )
}

export function CollectionPickerControl({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const env = useEditorFieldEnv()
  const list = env?.collections
  const [open, setOpen] = React.useState(false)
  const current = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (!list || list.length === 0) {
    return current ? (
      <div className="space-y-2" data-collection-picker="">
        <Row><button type="button" className={ICON_BUTTON} aria-label="Remove the collection" onClick={() => onChange("")}><X className="h-3.5 w-3.5" /></button></Row>
        <Unavailable list={list} />
      </div>
    ) : <Unavailable list={list} />
  }
  const picked = list.find((c) => c.id.toLowerCase() === current)
  const trigger = (
    <button type="button" className={ADD_BUTTON} aria-expanded={open} aria-label={label ? `Choose ${label.toLowerCase()}` : "Choose a collection"} onClick={() => setOpen((o) => !o)}>
      {current ? "Change" : <><Plus className="h-3.5 w-3.5" />Choose collection</>}
    </button>
  )
  return (
    <div className="space-y-2" data-collection-picker="">
      {current && (
        <Row c={picked}>
          <button type="button" className={ICON_BUTTON} aria-label={`Remove ${picked?.title ?? "the collection"}`} onClick={() => onChange("")}>
            <X className="h-3.5 w-3.5" />
          </button>
        </Row>
      )}
      <CollectionMenu
        open={open}
        onOpenChange={setOpen}
        trigger={trigger}
        offer={list.filter((c) => c.id.toLowerCase() !== current)}
        onPick={(id) => { onChange(id); setOpen(false) }}
        emptyText="This is your only collection."
      />
      {picked && !picked.published && <p className={NOTE}>Visitors see it once {picked.title} is published in Products › Collections.</p>}
    </div>
  )
}

export function CollectionListControl({
  value,
  onChange,
  limit,
  label,
}: {
  value: unknown
  onChange: (ids: string[]) => void
  limit?: number
  label?: string
}) {
  const env = useEditorFieldEnv()
  const list = env?.collections
  const [open, setOpen] = React.useState(false)
  const chosen = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
  const byId = React.useMemo(() => new Map((list ?? []).map((c) => [c.id.toLowerCase(), c])), [list])
  const max = typeof limit === "number" && limit > 0 ? Math.min(24, limit) : DEFAULT_LIMIT

  const move = (from: number, to: number) => {
    if (to < 0 || to >= chosen.length) return
    const next = [...chosen]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }
  const remove = (at: number) => onChange(chosen.filter((_, i) => i !== at))
  /* Drag a row by its grip, with a mouse or a finger (use-reorder.ts); Up and Down stay for a keyboard. */
  const { listRef, gripProps, rowStyle } = useReorder<HTMLUListElement>({ count: chosen.length, onMove: move })
  const add = (id: string) => {
    if (chosen.some((k) => k.toLowerCase() === id.toLowerCase()) || chosen.length >= max) return
    onChange([...chosen, id])
    if (chosen.length + 1 >= max) setOpen(false)
  }
  const taken = new Set(chosen.map((k) => k.toLowerCase()))

  return (
    <div className="space-y-2" data-collection-list="">
      {chosen.length > 0 && (
        <ul ref={listRef} className="space-y-1.5" aria-label={label ? `${label}, in order` : "Chosen collections, in order"}>
          {chosen.map((key, i) => {
            const c = byId.get(key.toLowerCase())
            const name = c?.title ?? "collection"
            return (
              <li key={`${key}-${i}`} data-reorder-row="" style={rowStyle(i)} className="flex items-center gap-1">
                <button type="button" aria-label={`Move ${name}`} title="Drag to move" className="flex h-9 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/70 hover:text-foreground active:cursor-grabbing" {...gripProps(i)}>
                  <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <div className="min-w-0 flex-1">
                <Row c={c}>
                  <button type="button" className={ICON_BUTTON} aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className={ICON_BUTTON} aria-label={`Move ${name} down`} disabled={i === chosen.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className={ICON_BUTTON} aria-label={`Remove ${name}`} onClick={() => remove(i)}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Row>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {!list || list.length === 0 ? (
        <Unavailable list={list} />
      ) : chosen.length >= max ? (
        <p className={NOTE}>This section shows {max} at most. Remove one to add another.</p>
      ) : (
        <CollectionMenu
          open={open}
          onOpenChange={setOpen}
          trigger={
            <button type="button" className={ADD_BUTTON} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <Plus className="h-3.5 w-3.5" />
              Add collection
            </button>
          }
          offer={list.filter((c) => !taken.has(c.id.toLowerCase()))}
          onPick={add}
          emptyText="Every collection is already in the list."
        />
      )}
    </div>
  )
}

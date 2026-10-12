"use client"

/**
 * ===========================================================================
 *  ADD BLOCK
 * ===========================================================================
 * The dashed row under a list of blocks. With one thing it could add (an
 * FAQ adds questions and nothing else) it adds that, at once, as it always
 * has. With more (a section that accepts theme blocks, a Group) it opens
 * the action list: a menu on a computer, a sheet on a phone, like every
 * other list of actions in the builder.
 *
 * A theme block with several presets is offered once per preset, by the
 * preset's name, which is how Shopify lists them: "Two columns" and "Image
 * with text" are both Groups, and the person picks the one they mean.
 */
import * as React from "react"
import { Plus } from "lucide-react"

import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { BlockSchema, SectionPreset } from "@/lib/website-builder/types"
import { tt } from "@/lib/i18n/text"

export interface BlockChoice {
  type: string
  label: string
  preset?: SectionPreset
}

/** Every way to add a block here: one per preset when a block has several. */
export function blockChoices(options: readonly BlockSchema[]): BlockChoice[] {
  const out: BlockChoice[] = []
  for (const b of options) {
    const presets = b.presets ?? []
    if (presets.length > 1) for (const p of presets) out.push({ type: b.type, label: p.name, preset: p })
    else out.push({ type: b.type, label: presets[0]?.name ?? b.name, preset: presets[0] })
  }
  return out
}

const BUTTON =
  "mt-2 w-full flex h-9 max-sm:h-12 items-center justify-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-neutral-400 rounded-lg transition-colors"

export function AddBlockButton({
  options,
  onAdd,
  label,
}: {
  options: readonly BlockSchema[]
  onAdd: (choice: BlockChoice) => void
  /** The words on the button. "Add question" for a section with one kind of block. */
  label?: string
}) {
  const choices = React.useMemo(() => blockChoices(options), [options])
  const items = React.useMemo<ActionMenuItem[]>(() => choices.map((c) => ({ label: c.label, onClick: () => onAdd(c) })), [choices, onAdd])
  if (choices.length === 0) return null
  const text = label ?? (choices.length === 1 ? tt("Add {value}", { value: choices[0].label.toLowerCase() }) : tt("Add block"))
  if (choices.length === 1) {
    return (
      <button type="button" className={BUTTON} data-add-block="" onClick={() => onAdd(choices[0])}>
        <Plus className="h-3.5 w-3.5" />
        {text}
      </button>
    )
  }
  return (
    <ResponsiveActionMenu
      title={tt("Add block")}
      align="start"
      menuWidth="w-60"
      items={items}
      trigger={
        <button type="button" className={BUTTON} data-add-block="">
          <Plus className="h-3.5 w-3.5" />
          {text}
        </button>
      }
    />
  )
}

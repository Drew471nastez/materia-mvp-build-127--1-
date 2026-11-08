"use client"

/**
 * ===========================================================================
 *  A CHOICE FROM A LIST, IN A BLOCK'S SETTINGS (round AN)
 * ===========================================================================
 * The owner: "the add a network selector is not smooth, clean, Storelib UI
 * adapted, it is using the iOS selector instead of Storelib's selector like
 * the language and country selector ... across all OnePage". A native
 * <select> opens the phone's wheel. Every list in a block's settings is
 * Storelib's own ChoicePicker now (components/ui/choice-list), the one the
 * phone country, the language and the time zone use: a popover under the
 * field on a computer, the shared sheet on a phone.
 *
 *   EditorSelect   a field showing the choice, its name over it.
 *   AddFromList    "+ Add a network": a dashed button that opens the same
 *                  list and adds what is picked.
 *
 * A short list (fewer than nine) is rows alone, no search field, and its
 * phone sheet is as tall as its rows; a long one keeps the search.
 */
import * as React from "react"
import { Plus } from "lucide-react"
import { ChoicePicker, type Choice } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"

export type { Choice }

const SEARCH_FROM = 9

export function EditorSelect({
  name,
  title,
  value,
  choices,
  onChange,
  emptyLabel,
  leading,
  fieldLeading,
  id,
}: {
  /** data-choice-field, for the probes. */
  name: string
  /** Heads the phone sheet and names the list for a screen reader. */
  title: string
  value: string | null
  choices: Choice[]
  onChange: (value: string) => void
  /** What the field says while nothing is chosen. */
  emptyLabel: string
  leading?: (choice: Choice, near: boolean) => React.ReactNode
  fieldLeading?: React.ReactNode
  id?: string
}) {
  const chosen = value ? choices.find((c) => c.value === value) : undefined
  return (
    <ChoicePicker
      name={name}
      id={id}
      title={title}
      choices={choices}
      value={value}
      onChange={onChange}
      placeholder={title}
      searchable={choices.length >= SEARCH_FROM}
      fieldLabel={chosen?.label ?? emptyLabel}
      fieldMuted={!chosen}
      fieldLeading={chosen ? fieldLeading : undefined}
      leading={leading}
    />
  )
}

export function AddFromList({
  name,
  title,
  label,
  choices,
  onPick,
  leading,
}: {
  name: string
  title: string
  /** The button's words: "Add a network". */
  label: string
  choices: Choice[]
  onPick: (value: string) => void
  leading?: (choice: Choice, near: boolean) => React.ReactNode
}) {
  return (
    <div data-add-from-list={name} className="[&_[data-choice-field]>svg:last-child]:hidden">
      <ChoicePicker
        name={name}
        title={title}
        choices={choices}
        value={null}
        onChange={onPick}
        placeholder={title}
        searchable={choices.length >= SEARCH_FROM}
        fieldLabel={label}
        fieldLeading={<Plus aria-hidden className="h-4 w-4 shrink-0" />}
        leading={leading}
        fieldClassName={cn(
          "justify-center gap-1.5 border-dashed border-[#d5d7dd] bg-transparent text-[13.5px] font-medium shadow-none hover:bg-[#f7f7f8]",
          "[&>span:nth-child(2)]:flex-none",
        )}
      />
    </div>
  )
}

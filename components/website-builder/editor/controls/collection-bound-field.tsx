"use client"

/**
 * ===========================================================================
 *  A SETTING THAT FOLLOWS THE PICKED COLLECTION
 * ===========================================================================
 * A setting whose schema says `"from": "collection.image"` (or `.title`,
 * `.description`, `.url`) is the picked collection's until somebody sets one
 * (lib/storelib-theme/collection-binding.ts). In the sidebar:
 *
 *   following    the control shows what the page draws: the collection's
 *                picture in the picker, its title as the text box's
 *                placeholder. One quiet line under it: From <collection>.
 *   its own      the control shows the value set, and the line under it is
 *                Reset to collection, which empties it so the collection's
 *                is drawn again.
 *
 * Nothing is copied into the setting while it follows: a renamed collection
 * or a new picture is on the canvas the moment the collection changes.
 * With no collection picked the setting is an ordinary one.
 */
import type { ReactNode } from "react"

import { boundState } from "@/lib/storelib-theme/collection-binding"
import { resolveControlType } from "@/lib/storelib-theme/controls/types"
import type { SchemaField } from "@/lib/website-builder/types"
import { useEditorFieldEnv, useSiblingSettings } from "./context"
import { TEXT_BUTTON } from "./styles"
import { tt } from "@/lib/i18n/text"

export function CollectionBoundField({
  field,
  value,
  onChange,
  children,
}: {
  field: SchemaField
  value: unknown
  onChange: (v: unknown) => void
  /** The control itself, drawn with the field (and the value) it should show. */
  children: (shown: { field: SchemaField; value: unknown }) => ReactNode
}) {
  const env = useEditorFieldEnv()
  const siblings = useSiblingSettings()
  const state = field.from ? boundState(field, value, siblings, env?.collections ?? null) : null
  if (!state || !state.collection) return <>{children({ field, value })}</>

  const kind = resolveControlType(field.type) ?? field.type
  if (state.overridden) {
    return (
      <div data-bound-field="own">
        {children({ field, value })}
        <button type="button" className={`${TEXT_BUTTON} mt-1 -ml-1.5`} onClick={() => onChange("")}>
          {tt("Reset to collection")}
        </button>
      </div>
    )
  }
  /* Following: the picture the page draws in the picker, the words it draws as the box's placeholder. */
  const shown =
    kind === "image_picker"
      ? { field, value: state.fromCollection }
      : { field: { ...field, placeholder: state.fromCollection || field.placeholder }, value }
  return (
    <div data-bound-field="collection">
      {children(shown)}
      <p className="mt-1 truncate text-[11px] max-sm:text-[13px] text-muted-foreground">{tt("From {name}", { name: state.collection.title })}</p>
    </div>
  )
}

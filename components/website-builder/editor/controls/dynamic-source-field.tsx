"use client"

/**
 * ===========================================================================
 *  A SETTING THAT READS THE SHOP
 * ===========================================================================
 * Under a setting that can take a dynamic source (lib/storelib-theme/
 * dynamic.ts), one quiet action: Insert shop data. It lists what this page
 * knows (the shop's name, the creator's photo, and on the product page the
 * product's title, price and picture), only the ones this kind of setting
 * can hold.
 *
 * A text setting gets the placeholder added to what is already typed, so
 * "Get {{ product.title }} today" is written the way it reads, and the line
 * under it says what the page will print. A picture, a link or a number
 * takes a source as its whole value, and while it does the control is
 * replaced by the name of what it is connected to and a way to disconnect:
 * a picture picker showing `{{ product.image }}` would be a picker showing
 * nonsense.
 *
 * Only drawn where the editor provides the page it is on. A field that is
 * not in the editor, or that holds a value per breakpoint, is left alone.
 *
 * NOT UNDER EVERY FIELD AT REST. A sidebar where every text box carries the
 * same extra line is a sidebar of that line. It appears while the field is
 * being used (focused, or under the pointer), and stays while the field
 * holds a placeholder, because then it has something to say.
 */
import * as React from "react"

import { FieldPopover } from "@/components/website-builder/field-popover"
import { resolveControlType } from "@/lib/storelib-theme/controls/registry"
import {
  SOURCE_TARGETS,
  describePlaceholders,
  dynamicSource,
  placeholderFor,
  sourcesFor,
  sourcesIn,
  targetIsWhole,
  wholeSource,
  type DynamicSource,
} from "@/lib/storelib-theme/dynamic"
import { useEditorFieldEnv } from "./context"
import { NOTE, TEXT_BUTTON } from "./styles"

export function DynamicSourceField({
  field,
  value,
  onChange,
  children,
}: {
  field: { type: string; label?: string; responsive?: boolean }
  value: unknown
  onChange: (v: unknown) => void
  children: React.ReactNode
}) {
  const env = useEditorFieldEnv()
  const [open, setOpen] = React.useState(false)
  const kind = resolveControlType(field.type) ?? field.type
  const target = SOURCE_TARGETS[kind]
  const offered = React.useMemo(() => (env && target ? sourcesFor(kind, env.template) : []), [env, target, kind])
  if (!env || !target || field.responsive || offered.length === 0) return <>{children}</>

  const whole = targetIsWhole(target)
  const bound = whole ? wholeSource(value) : null
  const text = typeof value === "string" ? value : ""
  const named = whole ? [] : sourcesIn(text)

  const pick = (s: DynamicSource) => {
    setOpen(false)
    if (whole) return onChange(placeholderFor(s.id))
    const sep = text === "" || /\s$/.test(text) ? "" : " "
    onChange(`${text}${sep}${placeholderFor(s.id)}`)
  }

  if (bound) {
    const source = dynamicSource(bound)
    return (
      <div className="flex min-h-9 max-sm:min-h-11 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3" data-dynamic-bound="">
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="text-muted-foreground">From </span>
          {source?.label ?? bound}
        </span>
        <button type="button" className={TEXT_BUTTON} onClick={() => onChange("")}>
          Disconnect
        </button>
      </div>
    )
  }

  const groups = offered.reduce<Record<string, DynamicSource[]>>((acc, s) => {
    ;(acc[s.group] ??= []).push(s)
    return acc
  }, {})

  /*
    NOTHING MOVES WHEN THE POINTER PASSES. The action used to be a row under
    the field, shown on hover: every field the pointer crossed grew by a
    line and shrank again, so the whole sidebar below it jumped and the
    scroll position went with it (the "glitching" in the recording). Now the
    action sits on the right of the field's label row, drawn over it, and
    fades in: it takes no room, so hovering changes nothing's position. The
    line that says what a placeholder prints stays under the field, in the
    flow, because it is there at rest and does not come and go.
  */
  return (
    <div className="group/dyn relative" data-dynamic-field="">
      {children}
      {named.length > 0 && (
        <p className={`${NOTE} mt-1`} data-dynamic-note="">On the page: {describePlaceholders(text)}</p>
      )}
      <FieldPopover
        open={open}
        onOpenChange={setOpen}
        trigger={
          <div
            className={
              "absolute bottom-full right-0 z-[1] pb-[3px] transition-opacity duration-150 " +
              (open || named.length > 0
                ? "opacity-100"
                : "opacity-0 pointer-events-none group-hover/dyn:opacity-100 group-hover/dyn:pointer-events-auto group-focus-within/dyn:opacity-100 group-focus-within/dyn:pointer-events-auto")
            }
            data-dynamic-action=""
          >
            <button
              type="button"
              className="inline-flex h-[22px] max-sm:h-8 items-center rounded-md bg-background px-1.5 text-[11.5px] max-sm:text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {whole ? "Use shop data" : "Insert shop data"}
            </button>
          </div>
        }
      >
        <div className="max-h-72 overflow-y-auto wb-slim-scroll py-1" role="listbox" aria-label="Shop data">
          {Object.entries(groups).map(([group, list]) => (
            <div key={group} className="py-1">
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{group}</p>
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="block w-full px-3 py-1.5 max-sm:min-h-12 text-left transition-colors hover:bg-muted/60"
                  onClick={() => pick(s)}
                >
                  <span className="block text-[13px] max-sm:text-[15px] font-medium">{s.label}</span>
                  <span className="block text-[11px] max-sm:text-[13px] leading-snug text-muted-foreground">{s.description}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </FieldPopover>
    </div>
  )
}

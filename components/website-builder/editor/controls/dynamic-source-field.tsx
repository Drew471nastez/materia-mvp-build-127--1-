"use client"

/**
 * ===========================================================================
 *  A SETTING THAT READS THE SHOP
 * ===========================================================================
 * A setting that can take a dynamic source (lib/storelib-theme/dynamic.ts)
 * carries one small square button at the right end of its label row, the
 * way Shopify's theme editor carries "Connect dynamic source". It lists
 * what this page knows (the shop's name, the creator's photo, and on the
 * product page the product's title, price and picture), only the ones this
 * kind of setting can hold.
 *
 * CONNECTED, THE FIELD SAYS SO. A picture, a link or a number takes a
 * source as its whole value, and a text setting whose whole value is one
 * source reads the same way: the field is replaced by a chip with the
 * source's name and an x to disconnect. A picture picker showing
 * `{{ product.image }}` would be a picker showing nonsense.
 *
 * TEXT AROUND A SOURCE STILL WORKS. A text setting takes the placeholder
 * at the caret, so "Get {{ product.title }} today" can be written the way
 * it reads, and the line under the field prints it back with the source's
 * name set apart: "On the page: Get Product title today".
 *
 * ALWAYS THERE, NEVER OVER THE TEXT. The first version was a text pill that
 * faded in on hover, drawn over the label row; on a narrow sidebar it
 * landed inside the input on top of the words, and every pass of the
 * pointer made it blink. The button is now in the label row's own flow, at
 * rest and on hover alike: nothing appears, disappears or moves under the
 * pointer. It is 28px, and 44px under a thumb through a hit area that
 * reaches into the gap above the row, never over the field below it.
 *
 * Only drawn where the editor provides the page it is on. A field that is
 * not in the editor, or that holds a value per breakpoint, gets its label
 * and nothing else.
 */
import * as React from "react"
import { Database, X } from "lucide-react"

import { FieldPopover, usePhoneLayout } from "@/components/website-builder/field-popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { resolveControlType } from "@/lib/storelib-theme/controls/registry"
import {
  SOURCE_TARGETS,
  dynamicSource,
  insertPlaceholder,
  placeholderFor,
  placeholderParts,
  sourcesFor,
  sourcesIn,
  targetIsWhole,
  wholeSource,
  type DynamicSource,
} from "@/lib/storelib-theme/dynamic"
import { useEditorFieldEnv } from "./context"
import { NOTE } from "./styles"

/** A field's name above it, as the sidebar has always drawn one. */
export const FIELD_LABEL = "text-xs font-medium text-muted-foreground mb-1.5 block"

/** What the button is called, to a screen reader and in its tooltip. */
export const INSERT_LABEL = "Insert shop data"

export function DynamicSourceField({
  field,
  value,
  onChange,
  label,
  children,
}: {
  field: { type: string; label?: string; responsive?: boolean }
  value: unknown
  onChange: (v: unknown) => void
  /** The label row's words. Absent for a control that names itself. */
  label?: string
  children: React.ReactNode
}) {
  const env = useEditorFieldEnv()
  const phone = usePhoneLayout()
  const [open, setOpen] = React.useState(false)
  const [tip, setTip] = React.useState(false)
  const button = React.useRef<HTMLButtonElement>(null)
  const list = React.useRef<HTMLDivElement>(null)
  const body = React.useRef<HTMLDivElement>(null)
  /** Where the caret was in the field's text box, so an insert lands there. */
  const caret = React.useRef<number | null>(null)
  /* Read on every selection change and again as the text box loses focus to the button. */
  const keepCaret = (el: EventTarget) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (typeof el.selectionStart === "number") caret.current = el.selectionStart
    }
  }
  /** Focus handed back to the button by a pick is not a request for its tooltip. */
  const quiet = React.useRef(false)
  const refocus = () => {
    quiet.current = true
    button.current?.focus({ preventScroll: true })
    setTimeout(() => (quiet.current = false), 0)
  }
  const kind = resolveControlType(field.type) ?? field.type
  const target = SOURCE_TARGETS[kind]
  const offered = React.useMemo(() => (env && target ? sourcesFor(kind, env.template) : []), [env, target, kind])

  /* The first choice takes focus when the list opens, so the keyboard is in it. */
  React.useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      list.current?.querySelector<HTMLButtonElement>("[role='option']")?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  if (!env || !target || field.responsive || offered.length === 0) {
    return (
      <>
        {label ? <label className={FIELD_LABEL}>{label}</label> : null}
        {children}
      </>
    )
  }

  const whole = targetIsWhole(target)
  const text = typeof value === "string" ? value : ""
  /* A text setting that is one source and nothing else reads as connected, too. */
  const bound = whole ? wholeSource(value) : wholeSource(text)
  const named = bound ? [] : whole ? [] : sourcesIn(text)

  const pick = (s: DynamicSource) => {
    setOpen(false)
    if (whole) {
      onChange(placeholderFor(s.id))
      requestAnimationFrame(refocus)
      return
    }
    /* Connected already: the new source replaces the old, as it does for a picture. */
    const next = bound ? { value: placeholderFor(s.id), caret: placeholderFor(s.id).length } : insertPlaceholder(text, s.id, caret.current)
    caret.current = next.caret
    onChange(next.value)
    /*
      Back to where the person was. At a keyboard that is the text box with
      the caret after what went in; under a thumb it is the button, because
      focusing a text box would raise the phone's keyboard over the sheet.
    */
    setTimeout(() => {
      requestAnimationFrame(() => {
        const input = body.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input[type='text'], input:not([type]), textarea")
        if (!phone && input) {
          input.focus({ preventScroll: true })
          const at = Math.min(next.caret, input.value.length)
          try { input.setSelectionRange(at, at) } catch { /* a type without a caret */ }
        } else {
          refocus()
        }
      })
    }, 0)
  }

  const disconnect = () => {
    caret.current = null
    onChange("")
    requestAnimationFrame(refocus)
  }

  /* Up and down move through the list, Home and End to its ends. */
  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return
    const options = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("[role='option']") ?? [])
    if (options.length === 0) return
    e.preventDefault()
    const i = options.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === "Home" ? 0
      : e.key === "End" ? options.length - 1
      : e.key === "ArrowDown" ? (i + 1) % options.length
      : (i <= 0 ? options.length - 1 : i - 1)
    options[next]?.focus()
  }

  const groups = offered.reduce<Record<string, DynamicSource[]>>((acc, s) => {
    ;(acc[s.group] ??= []).push(s)
    return acc
  }, {})

  const action = (
    <button
      ref={button}
      type="button"
      aria-label={INSERT_LABEL}
      aria-haspopup="listbox"
      aria-expanded={open}
      data-dynamic-action=""
      onClick={() => {
        setTip(false)
        setOpen((o) => !o)
      }}
      className={
        "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors " +
        "hover:bg-neutral-100 hover:text-foreground aria-expanded:bg-neutral-100 aria-expanded:text-foreground " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 " +
        /* 44px under a thumb: 8px either side, 14px up into the 16px gap above, 2px down to the field and not over it. */
        "before:absolute before:content-[''] max-sm:before:-inset-x-2 max-sm:before:-top-3.5 max-sm:before:-bottom-0.5"
      }
    >
      <Database className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </button>
  )

  const source = bound ? dynamicSource(bound) : undefined
  const parts = named.length > 0 ? placeholderParts(text) : []

  return (
    <div data-dynamic-field="">
      <FieldPopover
        open={open}
        onOpenChange={setOpen}
        trigger={
          <>
            {/*
              The row a plain label would be, with the button at its end. The
              row is 28px for the button; -6px above and 2px below keep the
              words and the field where a plain label puts them (16px of
              words, 6px, the field), so this field lines up with its
              neighbours to within 2px. On a phone the row keeps its top
              margin, because the button's 44px reaches 14px up into it.
            */}
            <div className="-mt-1.5 mb-0.5 max-sm:mt-0 flex min-h-7 items-center justify-between gap-2" data-dynamic-label="">
              {label ? <label className="min-w-0 truncate text-xs font-medium text-muted-foreground">{label}</label> : <span />}
              {phone ? (
                action
              ) : (
                <Tooltip
                  open={tip && !open}
                  onOpenChange={(next) => {
                    if (next && quiet.current) return
                    setTip(next)
                  }}
                  delayDuration={400}
                >
                  <TooltipTrigger asChild>{action}</TooltipTrigger>
                  <TooltipContent side="left">{INSERT_LABEL}</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div
              ref={body}
              onSelect={(e) => keepCaret(e.target)}
              onBlur={(e) => keepCaret(e.target)}
            >
              {bound ? (
                <div
                  className="flex h-9 max-sm:min-h-11 items-center rounded-lg border border-border bg-background px-1.5"
                  data-dynamic-bound=""
                >
                  <span className="inline-flex h-6 max-sm:h-8 min-w-0 max-w-full items-center gap-0.5 rounded-md bg-neutral-100 pl-2 pr-0.5 text-[13px] max-sm:text-[15px] font-medium text-foreground">
                    <span className="truncate">{source?.label ?? bound}</span>
                    <button
                      type="button"
                      aria-label={`Disconnect ${source?.label ?? bound}`}
                      onClick={disconnect}
                      className="relative inline-flex h-5 w-5 max-sm:h-7 max-sm:w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 before:absolute before:content-[''] max-sm:before:-inset-2"
                    >
                      <X className="h-3 w-3 max-sm:h-3.5 max-sm:w-3.5" strokeWidth={2} aria-hidden />
                    </button>
                  </span>
                </div>
              ) : (
                children
              )}
            </div>
          </>
        }
      >
        <div
          ref={list}
          className="max-h-72 overflow-y-auto wb-slim-scroll py-1"
          role="listbox"
          aria-label="Shop data"
          onKeyDown={onListKey}
        >
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="py-1" role="group" aria-label={group}>
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground" aria-hidden>{group}</p>
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={bound === s.id}
                  className="block w-full px-3 py-1.5 max-sm:min-h-12 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none aria-selected:bg-muted/40"
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
      {parts.length > 0 && (
        <p className={`${NOTE} mt-1`} data-dynamic-note="">
          On the page:{" "}
          {parts.map((p, i) =>
            "source" in p ? (
              <span key={i} className="font-medium text-foreground">{p.label}</span>
            ) : (
              <React.Fragment key={i}>{p.text}</React.Fragment>
            ),
          )}
        </p>
      )}
    </div>
  )
}

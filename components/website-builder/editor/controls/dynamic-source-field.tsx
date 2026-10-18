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
 * pointer made it blink. The button is in the label row's own flow, at
 * rest and on hover alike: nothing appears, disappears or moves under the
 * pointer.
 *
 * SMALL AND QUIET. It was a 22px white key with a hairline ring, a shade in
 * its foot and a shadow under it, one on every text setting in the panel,
 * and the owner found the column of them too big and too loud. It is now
 * an 18px glyph button with a 12px glyph in a light grey, no ring and no
 * shadow: it darkens, and takes a faint grey square, under the pointer, and
 * stays dark with the square while its list is open. The label row is 18px
 * to hold it, two pixels taller than the label's own line.
 *
 * SMALL TO SEE, NOT SMALL TO HIT. A `::before` widens what takes the
 * pointer: 26px under a mouse, 44px under a thumb, reaching sideways and
 * up into the gap above the row, never down over the field below it.
 *
 * NO TOOLTIP. It had one, "Insert shop data", and the owner asked for it
 * gone: a bubble over the panel every time the pointer crossed a label was
 * more noise than the one word it added. The name is still the button's
 * accessible name, and the list it opens is headed "Shop data".
 *
 * THE BACKGROUND IS ITS OWN, AND THAT IS WHAT KEEPS THE OPEN STATE UNDER A
 * FINGER. globals.css clears `:hover` backgrounds inside the phone sheets,
 * because a touch screen leaves `:hover` on the last thing tapped until
 * something else is tapped. Its documented opt-out is that an element
 * setting its OWN background keeps it. Without one, the open state
 * (`aria-expanded:bg-...`) was erased the moment a thumb opened the list:
 * you tapped the glyph, the list opened, and the glyph looked untouched.
 * `bg-transparent` in the class list is the opt-out. Everything that
 * answers a pointer is a `hover:` utility, which Tailwind already puts
 * behind `(hover: hover)` and a touch screen therefore never sees. The tap
 * highlight, the grey square a phone paints over a small button, is turned
 * off, the way every button in depth-button.ts turns it off.
 *
 * CONNECTED, THE GLYPH SAYS SO. Muted while the setting holds only typed
 * words, the foreground colour as soon as any of its value comes from the
 * shop. A whole-value field already reads as a chip, but a text setting with
 * a source among its words had nothing in its label row to say so.
 *
 * Only drawn where the editor provides the page it is on. A field that is
 * not in the editor, or that holds a value per breakpoint, gets its label
 * and nothing else.
 */
import * as React from "react"
import { Database, X } from "lucide-react"

import { FieldPopover, usePhoneLayout } from "@/components/website-builder/field-popover"
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
import { ChipTextInput, type ChipTextInputHandle } from "./chip-text-input"
import { caretAfter, editableOf, insertPill, isPill, markPill, pillLabel, removePill, replacePill } from "@/components/website-builder/value-pills"
import { useEditorFieldEnv } from "./context"
import { NOTE } from "./styles"
import { tt, msg } from "@/lib/i18n/text"

/** A field's name above it, as the sidebar has always drawn one. */
export const FIELD_LABEL = "text-xs font-medium text-muted-foreground mb-1.5 block"

/** What the button is called, to a screen reader. */
export const INSERT_LABEL = msg("Insert shop data")

export function DynamicSourceField({
  field,
  value,
  onChange,
  label,
  children,
}: {
  field: { type: string; label?: string; responsive?: boolean; default?: unknown }
  value: unknown
  onChange: (v: unknown) => void
  /** The label row's words. Absent for a control that names itself. */
  label?: string
  children: React.ReactNode
}) {
  const env = useEditorFieldEnv()
  const phone = usePhoneLayout()
  const [open, setOpen] = React.useState(false)
  const button = React.useRef<HTMLButtonElement>(null)
  const list = React.useRef<HTMLDivElement>(null)
  const body = React.useRef<HTMLDivElement>(null)
  const chips = React.useRef<ChipTextInputHandle>(null)
  const wasChipped = React.useRef(false)
  /** The caret's last place in a box that draws pills. */
  const range = React.useRef<Range | null>(null)
  /** The pill a click opened the list for: a pick replaces it, Remove takes it out. */
  const replacing = React.useRef<HTMLElement | null>(null)
  const [replacingId, setReplacingId] = React.useState<string | null>(null)
  /** Where the caret was in the field's text box, so an insert lands there. */
  const caret = React.useRef<number | null>(null)
  /* Read on every selection change and again as the text box loses focus to the button. */
  const keepCaret = (el: EventTarget) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (typeof el.selectionStart === "number") caret.current = el.selectionStart
    }
  }
  const refocus = () => {
    button.current?.focus({ preventScroll: true })
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

  /* Where the caret was in a box that draws pills (words, rich text, a heading), so an insert lands there. */
  React.useEffect(() => {
    const keep = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const root = editableOf(sel.anchorNode)
      if (root && body.current?.contains(root)) range.current = sel.getRangeAt(0).cloneRange()
    }
    document.addEventListener("selectionchange", keep)
    return () => document.removeEventListener("selectionchange", keep)
  }, [])

  /* The list closed: the pill it was changing is no longer the one. */
  React.useEffect(() => {
    if (open) return
    markPill(replacing.current, false)
    replacing.current = null
    setReplacingId(null)
  }, [open])

  const whole = !!target && targetIsWhole(target)
  const text = typeof value === "string" ? value : ""
  /*
    Only a picture, a link or a number is connected as a whole. A text
    setting that is one source and nothing else used to read as connected
    too: the box was swapped for a chip with an x, and there was nowhere to
    type. "Shop name" and then " sale" is a sentence, so words always keep
    their box, with the source as a pill in it.
  */
  const bound = whole ? wholeSource(value) : null
  /*
    NOT ON A SLIDER. A range takes a number source, but nobody sets a
    padding to the number of products, and a button at the end of every
    size and spacing label is a sidebar of buttons. A slider already
    connected (a theme can ship one) still shows its chip and the way out.
  */
  const slider = kind === "range" && !bound

  if (!env || !target || field.responsive || offered.length === 0 || slider) {
    return (
      <>
        {label ? <label className={FIELD_LABEL}>{label}</label> : null}
        {children}
      </>
    )
  }

  const named = bound ? [] : whole ? [] : sourcesIn(text)
  /**
   * PLAIN WORDS WITH SOURCES AMONG THEM ARE DRAWN AS CHIPS (chip-text-input.tsx):
   * "Welcome to [Shop name]" rather than braces. Text and long text only; a
   * rich text setting keeps its own editor and the line under it.
   */
  /* Once a chip field, always one: deleting the last chip must not swap the box being typed in for another. */
  if (target === "text" && named.length > 0) wasChipped.current = true
  const chipped = target === "text" && wasChipped.current
  /** Anything of this setting's value that comes from the shop, whole or among words. */
  const connected = !!bound || named.length > 0

  /** The box this field types into, when it draws pills: a contentEditable, not an input. */
  const editable = () => body.current?.querySelector<HTMLElement>('[contenteditable]:not([contenteditable="false"])') ?? null

  const pick = (s: DynamicSource) => {
    setOpen(false)
    if (whole) {
      onChange(placeholderFor(s.id))
      requestAnimationFrame(refocus)
      return
    }
    /* A pill clicked: this one in its place. */
    const old = replacing.current
    if (old?.isConnected) {
      markPill(old, false)
      replacing.current = null
      const made = replacePill(old, s.id)
      if (!phone) {
        editableOf(made.parentNode)?.focus({ preventScroll: true })
        caretAfter(made)
      }
      return
    }
    /*
      A box that draws pills takes the pill at its caret, on the DOM, and
      saves itself from there. A rich text value used to have the
      placeholder added to the END of its markup, after the last </p>: the
      pill landed outside every line, the caret could not get past it, and
      typing stopped.
    */
    const box = editable()
    if (box) {
      insertPill(box, range.current, s.id, !phone)
      if (phone) refocus()
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
        if (!phone && chips.current) {
          chips.current.focusAt(next.caret)
          return
        }
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

  /**
   * BACK TO A PLAIN VALUE OF THE RIGHT KIND. Every setting used to be
   * disconnected to `""`, which is a plain value for words, a link and a
   * picture, and is not a number. A number setting connected to the number
   * of products and then disconnected held the empty string: the canvas
   * quietly drew the default (resolveOne refuses a value the control
   * cannot hold) while the sidebar showed an empty box, and the two
   * disagreed until something was typed. A number goes back to its own
   * default, or to zero when the schema names none.
   */
  const disconnect = () => {
    caret.current = null
    if (target === "number") onChange(typeof field.default === "number" ? field.default : 0)
    else onChange("")
    requestAnimationFrame(refocus)
  }

  /* Up and down move through the list, Home and End to its ends. */
  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return // i18n-ignore: key names
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
      aria-label={tt(INSERT_LABEL)}
      aria-haspopup="listbox"
      aria-expanded={open}
      data-dynamic-action=""
      data-connected={connected ? "" : undefined}
      onClick={() => setOpen((o) => !o)}
      className={
        "relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] bg-transparent " +
        (connected ? "text-foreground " : "text-[#9ca3af] ") +
        "transition-[background-color,color] duration-100 " +
        "hover:bg-[#f1f2f4] hover:text-[#374151] " +
        /* Open, it stays dark with its square: the list below is its own. */
        "active:bg-[#eceef1] aria-expanded:bg-[#eceef1] aria-expanded:text-foreground " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 " +
        "[-webkit-tap-highlight-color:transparent] " +
        /* 26px under a mouse. 44px under a thumb: 13px either side, 22px up into the gap above, 4px down and short of the field 5px below. */
        "before:absolute before:content-[''] before:-inset-1 max-sm:before:-inset-x-[13px] max-sm:before:-top-[22px] max-sm:before:-bottom-1"
      }
    >
      <Database className="h-3 w-3" strokeWidth={1.75} aria-hidden />
    </button>
  )

  const source = bound ? dynamicSource(bound) : undefined
  /*
    The sentence spelled back under a field that still shows braces (a code
    box). Words, rich text and headings draw their sources as pills, which
    already say it.
  */
  const drawsPills = chipped || kind === "richtext" || kind === "inline_richtext"
  const parts = named.length > 0 && !drawsPills ? placeholderParts(text) : []

  return (
    <div data-dynamic-field="">
      <FieldPopover
        open={open}
        onOpenChange={setOpen}
        trigger={
          <>
            {/*
              The row a plain label would be, with the button at its end. The
              row is 18px for the button; -1px above and 5px below keep the
              words and the field where a plain label puts them (16px of
              words, 6px, the field), so this field lines up with its
              neighbours. On a phone the row keeps its top margin, because
              the button's 44px reaches up into it.
            */}
            <div className="-mt-px mb-[5px] max-sm:mt-0 flex min-h-[18px] items-center justify-between gap-2" data-dynamic-label="">
              {label ? <label className="min-w-0 truncate text-xs font-medium text-muted-foreground">{label}</label> : <span />}
              {action}
            </div>
            <div
              ref={body}
              onSelect={(e) => keepCaret(e.target)}
              onBlur={(e) => keepCaret(e.target)}
              onClick={(e) => {
                /*
                  A PILL IS PRESSED: its list opens to change it, with Remove
                  at the top. A press anywhere else in the words closes a
                  list that was open for a pill.
                */
                const pill = (e.target as HTMLElement).closest<HTMLElement>("[data-value]")
                if (pill && isPill(pill) && editableOf(pill.parentNode) && body.current?.contains(pill)) {
                  e.preventDefault()
                  markPill(replacing.current, false)
                  replacing.current = pill
                  markPill(pill, true)
                  setReplacingId(pill.dataset.value ?? null)
                  setOpen(true)
                  return
                }
                if (replacing.current) setOpen(false)
              }}
            >
              {bound ? (
                <div
                  className="flex h-8 max-sm:h-auto max-sm:min-h-11 items-center rounded-md border border-border bg-background px-1"
                  data-dynamic-bound=""
                >
                  <span className="inline-flex h-6 max-sm:h-8 min-w-0 max-w-full items-center gap-0.5 rounded-md bg-neutral-100 pl-2 pr-0.5 text-[13px] max-sm:text-[15px] font-medium text-foreground">
                    <span className="truncate">{source?.label ?? bound}</span>
                    <button
                      type="button"
                      aria-label={tt("Disconnect {value}", { value: source?.label ?? bound })}
                      onClick={disconnect}
                      className="relative inline-flex h-5 w-5 max-sm:h-7 max-sm:w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 [-webkit-tap-highlight-color:transparent] before:absolute before:content-[''] max-sm:before:-inset-2"
                    >
                      <X className="h-3 w-3 max-sm:h-3.5 max-sm:w-3.5" strokeWidth={2} aria-hidden />
                    </button>
                  </span>
                </div>
              ) : chipped ? (
                <ChipTextInput
                  ref={chips}
                  value={text}
                  onChange={(next) => onChange(next)}
                  multiline={kind === "textarea"}
                  label={label}
                  onCaret={(at) => {
                    caret.current = at
                  }}
                />
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
          aria-label={tt("Shop data")}
          onKeyDown={onListKey}
        >
          {replacingId && (
            <div className="border-b border-border pb-1" data-pill-menu="">
              <button
                type="button"
                role="option"
                aria-selected={false}
                data-pill-remove=""
                className="block w-full px-3 py-1.5 max-sm:min-h-12 text-left text-[13px] max-sm:text-[15px] font-medium text-[#b91c1c] transition-colors hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
                onClick={() => {
                  const pill = replacing.current
                  setOpen(false)
                  if (pill?.isConnected) {
                    const root = editableOf(pill.parentNode)
                    removePill(pill)
                    if (!phone) root?.focus({ preventScroll: true })
                  }
                }}
              >
                {tt("Remove {value}", { value: pillLabel(replacingId) })}
              </button>
            </div>
          )}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="py-1" role="group" aria-label={group}>
              <p className="px-3 pb-1 pt-1.5 text-[12px] font-medium text-[#6b7280]" aria-hidden>{group}</p>
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={bound === s.id || replacingId === s.id}
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
          {tt("On the page:")}{" "}
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

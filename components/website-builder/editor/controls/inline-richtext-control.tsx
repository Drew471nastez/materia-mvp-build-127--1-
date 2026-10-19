"use client"

/**
 * ===========================================================================
 *  ONE LINE, WITH A WORD IN ITALICS
 * ===========================================================================
 * The control for `inline_richtext`: a heading or a button label that may
 * have a bold word, an italic one or a link in it, and never a second
 * paragraph. It looks like the sidebar's text box with three buttons above
 * it, because that is what it is.
 *
 * Enter does not start a new line: the setting is one line by definition,
 * and a paragraph break would be removed on save anyway, so the key is
 * refused rather than accepted and then undone. A paste arrives as words.
 *
 * What leaves here has been through the engine's inline allow list
 * (lib/storelib-theme/values.ts), the same function that runs again when
 * the section is drawn, so the field and the page cannot disagree.
 */
import * as React from "react"
import { Bold, Italic, Link } from "lucide-react"

import { sanitizeInlineHtml } from "@/lib/storelib-theme/values"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { VALUE_IN_TEXT, withValueChips, withoutValueChips } from "@/components/website-builder/rich-text-field"
import { caretAfter, copyWithPills, pillKeyDown, pillsFromText, stripZw } from "@/components/website-builder/value-pills"

export function InlineRichTextControl({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  label?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = React.useState(!value)
  /** What this field has sent since the last value from outside: its own echo, never news. */
  const sent = React.useRef<string[]>([])

  /*
    The DOM is the truth while somebody types; the prop wins when it says
    something else (undo, the assistant, another section).

    ITS OWN ECHO IS NOT SOMETHING ELSE. The value sent is the cleaned markup,
    which is not byte for byte the DOM: a space typed at the end is `&nbsp;`
    in the DOM and a plain space once cleaned, and a pill is a `<span>` in
    the DOM and `{{ shop.name }}` once saved. Compared with the DOM, every
    echo looked like news and was written back in, which threw the caret to
    the start of the heading after every space and after every pill: the
    "typing stops" bug. A value this field sent is skipped.
  */
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const incoming = value ?? ""
    if (sent.current.includes(incoming)) return
    sent.current = []
    const shown = withValueChips(incoming)
    if (el.innerHTML !== shown) el.innerHTML = shown
    setEmpty(!stripZw(el.textContent ?? "").trim())
  }, [value])

  const publish = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    /* Braces typed or pasted become their pill where they stand. */
    const made = pillsFromText(el, VALUE_IN_TEXT)
    if (made && document.activeElement === el) caretAfter(made)
    setEmpty(!stripZw(el.textContent ?? "").trim())
    const clean = sanitizeInlineHtml(withoutValueChips(el.innerHTML))
    if (clean !== value) {
      sent.current.push(clean)
      if (sent.current.length > 64) sent.current.shift()
      onChange(clean)
    }
  }, [onChange, value])

  const run = (command: string, argument?: string) => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    try {
      document.execCommand(command, false, argument)
    } catch {
      /* a browser that refuses still types */
    }
    publish()
  }

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-neutral-900/10 focus-within:border-neutral-400 transition-colors">
      <div className="flex items-center gap-px border-b border-border bg-muted/30 px-1.5 py-1">
        <ToolButton label={tt("Bold")} onPress={() => run("bold")}>
          <Bold className="h-[15px] w-[15px]" strokeWidth={2.4} />
        </ToolButton>
        <ToolButton label={tt("Italic")} onPress={() => run("italic")}>
          <Italic className="h-[15px] w-[15px]" strokeWidth={2.1} />
        </ToolButton>
        <ToolButton
          label={tt("Link")}
          onPress={() => {
            const href = window.prompt(tt("Link to"))
            if (!href) return
            const t = href.trim()
            const safe = /^(https?:\/\/|mailto:|tel:|\/(?![/\\])|#)/i.test(t) ? t : `https://${t}`
            run("createLink", safe)
          }}
        >
          <Link className="h-[15px] w-[15px]" strokeWidth={1.9} />
        </ToolButton>
      </div>
      <div className="relative">
        {empty && placeholder ? (
          <p className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{placeholder}</p>
        ) : null}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="false"
          aria-label={label ?? placeholder}
          contentEditable
          suppressContentEditableWarning
          data-inline-richtext=""
          onInput={publish}
          onBlur={() => {
            publish()
            /* Out of the field, a toolbar undo is news again. */
            sent.current = sent.current.slice(-1)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              return
            }
            if (ref.current) pillKeyDown(e, ref.current)
          }}
          onCopy={(e) => {
            if (ref.current) copyWithPills(e, ref.current)
          }}
          onCut={(e) => {
            if (ref.current) copyWithPills(e, ref.current, true)
          }}
          onPaste={(e) => {
            e.preventDefault()
            run("insertText", e.clipboardData.getData("text/plain").replace(/\s+/g, " "))
          }}
          className={cn(
            /* One line by meaning, not by width: a long heading wraps in the box like it does on the page, rather than scrolling sideways out of view. It grows to about eight lines, then scrolls up and down only. */
            "min-h-9 max-sm:min-h-11 min-w-0 px-3 py-2 text-sm max-sm:text-[16px] leading-5 outline-none whitespace-normal [overflow-wrap:anywhere] overflow-x-hidden overflow-y-auto wb-slim-scroll max-h-[180px] max-sm:max-h-[220px]",
            "[&_a]:underline [&_a]:underline-offset-2",
          )}
        />
      </div>
    </div>
  )
}

function ToolButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      /* Down, not click: a click moves focus out of the field first, and a
         field that lost its selection has nothing to make bold. */
      onMouseDown={(e) => {
        e.preventDefault()
        onPress()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onPress()
        }
      }}
      className="inline-flex h-7 w-7 max-sm:h-10 max-sm:w-10 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
    >
      {children}
    </button>
  )
}

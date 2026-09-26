"use client"

/**
 * ===========================================================================
 *  ONE TEXT BLOCK OF AN EMAIL, WRITTEN WHERE IT READS
 * ===========================================================================
 * The words of an email are written in place, in the email's own type
 * (./email-canvas.ts), with no box round them and no toolbar of their own:
 * "I don't understand why there's the button and then there are two rich
 * text editors appearing in the new email." The one formatting bar for the
 * whole email (./format-bar.tsx) acts on whichever block has the caret.
 *
 * WHO OWNS THE DOM. While somebody types, the DOM does: React writes the
 * element's content once, on the first render, and after that only when the
 * value says something the DOM has not just said itself (an undo, a layout
 * picked, a split). The same rule as the shared rich text field
 * (components/app/rich-text-editor.tsx), for the same reason: writing it on
 * every keystroke puts the caret back at the start.
 *
 * WHAT COMES OUT. Every change is read back through the description's allow
 * list (lib/rich-text/html.ts cleanStoredHtml) before it is handed up, so a
 * browser's styled spans never reach the draft; a paste is cleaned on the
 * way in (cleanPastedHtml), so a paragraph copied out of a web page or a
 * document brings its structure and leaves its fonts, colours and scripts.
 * The send renders the result again with every style inline
 * (lib/email-campaigns/rich.ts).
 *
 * The text is 16px, so iOS does not zoom the page when it is focused.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { cleanPastedHtml, cleanStoredHtml, isBlankHtml, plainTextToHtml, toEditorHtml } from "@/lib/rich-text/html"

export interface EmailTextProps {
  id: string
  html: string
  label: string
  placeholder: string
  /** Show the placeholder only while the block has the caret (a block after a button, say). */
  quietPlaceholder?: boolean
  onChange: (html: string) => void
  /** Backspace in an empty block that is not the only one: it goes, and the caret goes back. */
  onRemoveEmpty?: () => void
  /** Cmd or Ctrl and K: the formatting bar's link row. */
  onLinkKey?: () => void
  className?: string
}

let separatorSet = false

export function EmailText({ id, html, label, placeholder, quietPlaceholder, onChange, onRemoveEmpty, onLinkKey, className }: EmailTextProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  /** What the DOM shows: the last value written in, or the last one handed up. */
  const shown = React.useRef(html)
  /* One object for the life of the block: React 19 compares it by identity, and a new one rewrites the text. */
  const [initial] = React.useState(() => ({ __html: toEditorHtml(html) }))
  const [empty, setEmpty] = React.useState(() => isBlankHtml(initial.__html))
  const onChangeRef = React.useRef(onChange)
  React.useEffect(() => {
    onChangeRef.current = onChange
  })

  React.useLayoutEffect(() => {
    if (separatorSet) return
    separatorSet = true
    try {
      /* Enter makes a <p>, not Chrome's default <div>. */
      document.execCommand("defaultParagraphSeparator", false, "p")
    } catch {
      /* the output cleaner turns a bare div into a p */
    }
  }, [])

  /* A value from somewhere else: undo, a layout, a split. */
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el || html === shown.current) return
    shown.current = html
    el.innerHTML = toEditorHtml(html)
    setEmpty(isBlankHtml(el.innerHTML))
  }, [html])

  const commit = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    const raw = el.innerHTML
    const blank = isBlankHtml(raw)
    setEmpty(blank)
    const out = blank ? "" : cleanStoredHtml(raw, { blocks: true })
    if (out !== shown.current) {
      shown.current = out
      onChangeRef.current(out)
    }
  }, [])

  /** Emptied by select all and delete, a field can be left with no block to type into. Put one back. */
  const ensureBlock = () => {
    const el = ref.current
    if (!el || el.firstElementChild || el.textContent) return
    el.innerHTML = "<p><br></p>"
    const sel = document.getSelection()
    if (sel && document.activeElement === el) {
      const r = document.createRange()
      r.setStart(el.firstChild as Node, 0)
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
    }
  }

  const insert = (command: "insertText" | "insertHTML", value: string) => {
    try {
      document.execCommand(command, false, value)
    } catch {
      /* a browser that refuses: nothing is inserted */
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const data = e.clipboardData
    if (!data) return
    const pasted = data.getData("text/html")
    const text = data.getData("text/plain")
    e.preventDefault()
    if (!pasted && !text) return
    if (!pasted) {
      if (!/\n/.test(text)) insert("insertText", text)
      else insert("insertHTML", plainTextToHtml(text))
    } else {
      const clean = cleanPastedHtml(pasted)
      if (!clean) {
        if (text) insert("insertText", text)
      } else {
        /* One paragraph goes in as its words, joining the line the caret is on. */
        const single = /^<p>((?:(?!<\/?(p|h2|h3|ul|ol|blockquote|hr)\b).)*)<\/p>$/s.exec(clean)
        insert("insertHTML", single ? single[1] : clean)
      }
    }
    commit()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k" && onLinkKey) {
      e.preventDefault()
      onLinkKey()
      return
    }
    if (e.key === "Backspace" && onRemoveEmpty && ref.current && isBlankHtml(ref.current.innerHTML)) {
      e.preventDefault()
      onRemoveEmpty()
    }
  }

  const showPlaceholder = empty && placeholder
  return (
    <div className="group/text relative">
      {showPlaceholder ? (
        <p
          aria-hidden
          data-email-placeholder=""
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 select-none truncate text-[16px] leading-[26px] text-[#9ca3af]",
            quietPlaceholder && "opacity-0 transition-opacity duration-150 group-focus-within/text:opacity-100",
          )}
        >
          {placeholder}
        </p>
      ) : null}
      <div
        ref={ref}
        id={`email-text-${id}`}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-placeholder={placeholder}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-email-text=""
        dangerouslySetInnerHTML={initial}
        onInput={(e) => {
          if (!(e.nativeEvent as InputEvent).isComposing) ensureBlock()
          commit()
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={(e) => {
          /* A drag of text from elsewhere is a paste where it lands; files are not text. */
          if (e.dataTransfer.files?.length) e.preventDefault()
        }}
        className={cn(
          "min-h-[26px] outline-none [overflow-wrap:anywhere] [-webkit-user-select:text] [user-select:text] [-webkit-tap-highlight-color:transparent]",
          className,
        )}
      />
    </div>
  )
}

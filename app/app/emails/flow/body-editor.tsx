"use client"

/**
 * The body of one automated email, written in place. Small on purpose: the
 * things a personal note from a creator uses (a heading, bold, a list, a
 * link, one button, the reader's first name) and nothing that would make the
 * email look like a newsletter template. The campaign editor is a separate
 * thing (components/email) and is not touched from here.
 *
 * What is typed is the creator's; the server sanitises it on save
 * (lib/automations/flow-io cleanBody), so this never has to be the guard.
 *
 * The editable element is written once per step (`key` on the step id) and
 * then left to the browser: React re-rendering its HTML on every keystroke
 * would move the caret to the start.
 */

import * as React from "react"
import { Bold, Heading2, Italic, Link2, List, RectangleHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

const tool = "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-[#4b5563] transition-colors duration-100 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] cursor-pointer select-none"

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

function normaliseUrl(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (/^\{\{\s*store_url\s*\}\}$/.test(v)) return "{{store_url}}"
  if (/^mailto:/i.test(v)) return v
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    const url = new URL(withScheme)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

type Pending = { kind: "link" | "button"; text: string; url: string } | null

export function BodyEditor({ value, onChange, label }: { value: string; onChange: (html: string) => void; label: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const saved = React.useRef<Range | null>(null)
  const [pending, setPending] = React.useState<Pending>(null)
  const [error, setError] = React.useState("")

  React.useLayoutEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || "<p><br></p>"
    // Written once for this step; see the note at the top.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emit = () => {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  const keepSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange()
  }

  const restoreSelection = () => {
    const el = ref.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    if (!sel) return
    if (saved.current && el.contains(saved.current.startContainer)) {
      sel.removeAllRanges()
      sel.addRange(saved.current)
    } else {
      const r = document.createRange()
      r.selectNodeContents(el)
      r.collapse(false)
      sel.removeAllRanges()
      sel.addRange(r)
    }
  }

  const run = (command: string, arg?: string) => {
    restoreSelection()
    document.execCommand(command, false, arg)
    keepSelection()
    emit()
  }

  const insertHtml = (html: string) => {
    restoreSelection()
    document.execCommand("insertHTML", false, html)
    keepSelection()
    emit()
  }

  const openPending = (kind: "link" | "button") => {
    keepSelection()
    const text = window.getSelection()?.toString() ?? ""
    setError("")
    setPending({ kind, text: text.slice(0, 80), url: "" })
  }

  const confirmPending = () => {
    if (!pending) return
    const url = normaliseUrl(pending.url)
    if (!url) {
      setError("Enter a web address, like yoursite.com/page.")
      return
    }
    const text = pending.text.trim() || (pending.kind === "button" ? "Open" : pending.url.trim())
    if (pending.kind === "link") {
      insertHtml(`<a href="${escape(url)}">${escape(text)}</a>`)
    } else {
      insertHtml(
        `<p><a href="${escape(url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background-color:#1a1a2e;color:#ffffff;text-decoration:none;font-weight:600;">${escape(text)}</a></p><p><br></p>`,
      )
    }
    setPending(null)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#d5d7dd] bg-white focus-within:border-[#1a1a2e] focus-within:shadow-[0_0_0_1px_#1a1a2e]">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-[#eef0f2] bg-[#fafbfb] px-1.5 py-1">
        <button type="button" className={tool} aria-label="Heading" title="Heading" onMouseDown={(e) => e.preventDefault()} onClick={() => run("formatBlock", "h2")}>
          <Heading2 className="h-4 w-4" />
        </button>
        <button type="button" className={tool} aria-label="Bold" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => run("bold")}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={tool} aria-label="Italic" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => run("italic")}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className={tool} aria-label="List" title="List" onMouseDown={(e) => e.preventDefault()} onClick={() => run("insertUnorderedList")}>
          <List className="h-4 w-4" />
        </button>
        <button type="button" className={tool} aria-label="Link" title="Link" onMouseDown={(e) => e.preventDefault()} onClick={() => openPending("link")}>
          <Link2 className="h-4 w-4" />
        </button>
        <button type="button" className={tool} title="Button" onMouseDown={(e) => e.preventDefault()} onClick={() => openPending("button")}>
          <RectangleHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Button</span>
        </button>
        <span className="mx-1 h-5 w-px bg-[#e3e4e8]" aria-hidden />
        <button type="button" className={tool} title="Their first name, or 'there' when it is not known" onMouseDown={(e) => e.preventDefault()} onClick={() => insertHtml("{{first_name}}")}>
          First name
        </button>
      </div>

      {pending ? (
        <div className="space-y-2 border-b border-[#eef0f2] bg-white p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              autoFocus
              value={pending.text}
              onChange={(e) => setPending({ ...pending, text: e.target.value })}
              placeholder={pending.kind === "button" ? "Button text" : "Link text"}
              className="h-9 rounded-lg border border-[#d5d7dd] px-2.5 text-[16px] outline-none focus:border-[#1a1a2e] sm:text-[13px]"
            />
            <input
              value={pending.url}
              onChange={(e) => setPending({ ...pending, url: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  confirmPending()
                }
              }}
              inputMode="url"
              placeholder="yoursite.com/page"
              className="h-9 rounded-lg border border-[#d5d7dd] px-2.5 text-[16px] outline-none focus:border-[#1a1a2e] sm:text-[13px]"
            />
          </div>
          {error ? <p className="text-[12px] text-[#8a1c0f]">{error}</p> : null}
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="text-[12px] font-medium text-[#6b7280] hover:text-[#1a1a2e]" onClick={() => setPending({ ...pending, url: "{{store_url}}" })}>
              Link to your Storelib page
            </button>
            <div className="flex gap-1.5">
              <button type="button" className="h-8 rounded-lg px-3 text-[13px] font-medium text-[#4b5563] hover:bg-[#f1f2f4]" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button type="button" className="h-8 rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-medium text-white hover:bg-[#2a2a40]" onClick={confirmPending}>
                Insert
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={() => {
          keepSelection()
          emit()
        }}
        onKeyUp={keepSelection}
        onMouseUp={keepSelection}
        className={cn(
          "flow-body min-h-[220px] px-4 py-3 text-[15px] leading-[1.6] text-[#374151] outline-none",
          "[&_a]:text-[#1a1a2e] [&_a]:underline [&_h2]:mb-2 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:text-[#1a1a2e] [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5",
        )}
      />
    </div>
  )
}

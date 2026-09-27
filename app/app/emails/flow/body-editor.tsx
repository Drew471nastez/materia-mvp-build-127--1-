"use client"

/**
 * The body of one automated email, written in place. Small on purpose: the
 * things a personal note from a creator uses (a heading, bold, a list, a
 * link, one button, the reader's first name) and nothing that would make the
 * email look like a newsletter template. The campaign editor is a separate
 * thing (components/email) and is not touched from here.
 *
 * The field is the shared rich text editor (components/app/rich-text-editor),
 * the one the product description is written in, with this email's two
 * extras added to its toolbar: a button, and the reader's first name.
 *
 * What is typed is the creator's; the server sanitises it on save
 * (lib/automations/flow-io cleanBody), which keeps the inline styles an
 * email client needs for the button. So this field hands its HTML up as it
 * is, rather than through the description's allow list, which would strip
 * them. A paste is still cleaned on the way in.
 */

import * as React from "react"
import { RectangleHorizontal } from "lucide-react"
import { RichTextEditor, type RichTextApi } from "@/components/app/rich-text-editor"
import { escapeAttr, escapeText } from "@/lib/rich-text/html"
import { cn } from "@/lib/utils"

const STORE_URL = "{{store_url}}"

/** A link field (lib/automations/merge-fields), kept as the field: it is filled per person when sent. */
const LINK_FIELD = /^\{\{\s*(store_url|product_url|order_url|download_url|review_url|checkout_url|unsubscribe_url)\s*\}\}$/

function normaliseUrl(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  const field = LINK_FIELD.exec(v)
  if (field) return `{{${field[1]}}}`
  if (/^mailto:/i.test(v)) return v
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    const url = new URL(withScheme)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

const extra =
  "inline-flex h-11 min-w-11 shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-[#4b5563] transition-colors duration-100 hover:bg-[#eef0f2] hover:text-[#1a1a2e] sm:h-8 sm:min-w-8 [-webkit-tap-highlight-color:transparent]"

const input =
  "h-11 rounded-lg border border-[#d5d7dd] px-2.5 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-9 sm:text-[13px]"

const keepEmailHtml = (html: string) => html

export function BodyEditor({
  value,
  onChange,
  label,
  links,
}: {
  value: string
  onChange: (html: string) => void
  label: string
  /** The link fields this flow's trigger can fill, offered as places a link or button can go. */
  links?: Array<{ label: string; href: string }>
}) {
  const shortcuts = links && links.length > 0 ? links : [{ label: "Your Storelib page", href: STORE_URL }]
  const api = React.useRef<RichTextApi | null>(null)
  const [button, setButton] = React.useState<{ text: string; url: string } | null>(null)
  const [error, setError] = React.useState("")

  const confirmButton = () => {
    if (!button || !api.current) return
    const url = normaliseUrl(button.url)
    if (!url) {
      setError("Enter a web address, like yoursite.com/page.")
      return
    }
    const text = button.text.trim() || "Open"
    api.current.insertBlock(
      `<p><a href="${escapeAttr(url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background-color:#1a1a2e;color:#ffffff;text-decoration:none;font-weight:600;">${escapeText(text)}</a></p><p><br></p>`,
    )
    setButton(null)
  }

  return (
    <RichTextEditor
      value={value}
      onChange={onChange}
      label={label}
      tools={["h2", "bold", "italic", "bulletList", "link"]}
      linkShortcuts={shortcuts.map((s) => ({ label: `Link to ${s.label.charAt(0).toLowerCase()}${s.label.slice(1)}`, href: s.href }))}
      cleanOutput={keepEmailHtml}
      minHeight={220}
      apiRef={api}
      extraTools={(editor) => (
        <>
          <button
            type="button"
            className={extra}
            title="Button"
            aria-label="Button"
            aria-expanded={!!button}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.keepSelection()
              setError("")
              setButton(button ? null : { text: editor.selectedText().slice(0, 80), url: "" })
            }}
          >
            <RectangleHorizontal className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Button</span>
          </button>
          <button
            type="button"
            className={extra}
            title="Their first name, or 'there' when it is not known"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.insertHtml("{{first_name}}")}
          >
            First name
          </button>
        </>
      )}
      panel={
        button ? (
          <div className="space-y-2 border-b border-[#eef0f2] bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                autoFocus
                value={button.text}
                onChange={(e) => setButton({ ...button, text: e.target.value })}
                placeholder="Button text"
                aria-label="Button text"
                className={input}
              />
              <input
                value={button.url}
                onChange={(e) => setButton({ ...button, url: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    confirmButton()
                  }
                }}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="yoursite.com/page"
                aria-label="Button link"
                className={input}
              />
            </div>
            {error ? <p className="text-[12px] text-[#8a1c0f]">{error}</p> : null}
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 flex-wrap gap-x-3">
                {shortcuts.map((s) => (
                  <button
                    key={s.href}
                    type="button"
                    className={cn("min-h-11 text-[12px] font-medium hover:text-[#1a1a2e] sm:min-h-0", button.url === s.href ? "text-[#1a1a2e]" : "text-[#6b7280]")}
                    onClick={() => setButton({ ...button, url: s.href })}
                  >
                    {s.label}
                  </button>
                ))}
              </span>
              <div className="flex shrink-0 gap-1.5">
                <button type="button" className="h-11 rounded-lg px-3 text-[13px] font-medium text-[#4b5563] hover:bg-[#f1f2f4] sm:h-8" onClick={() => setButton(null)}>
                  Cancel
                </button>
                <button type="button" className="h-11 rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-medium text-white hover:bg-[#2a2a40] sm:h-8" onClick={confirmButton}>
                  Insert
                </button>
              </div>
            </div>
          </div>
        ) : null
      }
    />
  )
}

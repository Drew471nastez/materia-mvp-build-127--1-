"use client"

/**
 * The control for an `html` setting: markup somebody pastes from another
 * service. A code box, because it is code, and under it the one thing worth
 * knowing before saving: when part of what was pasted will not survive the
 * clean on save (lib/website-builder/sanitize.ts, the custom HTML list), it
 * says so here rather than letting the page quietly differ from the box.
 */
import * as React from "react"

import { sanitizeCustomHtml } from "@/lib/website-builder/sanitize"
import { AutoTextarea } from "@/components/website-builder/auto-textarea"
import { NOTE } from "./styles"
import { tt } from "@/lib/i18n/text"
import { formatList } from "@/lib/i18n/format"

/** What the clean removes, in words a person would use. */
function whatGoes(before: string, after: string): string | null {
  if (!before.trim() || before === after) return null
  const lost: string[] = []
  if (/<script\b/i.test(before)) lost.push(tt("scripts"))
  if (/<form\b|<input\b|<select\b/i.test(before)) lost.push(tt("forms"))
  if (/\son[a-z]+\s*=/i.test(before)) lost.push(tt("click and load handlers"))
  if (/<style\b|\sstyle\s*=/i.test(before)) lost.push(tt("styles"))
  if (/<iframe\b/i.test(before) && !/<iframe\b/i.test(after)) lost.push(tt("a frame from a site that is not a known player"))
  if (lost.length === 0) return tt("Some of this is removed when it is saved.")
  /* A list in the reader's language ("scripts, forms and styles"), and one sentence shape that needs no "is" or "are". */
  return tt("Removed when this is saved: {list}.", { list: formatList(lost) })
}

export function HtmlControl({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: unknown) => void
  placeholder?: string
}) {
  const note = React.useMemo(() => whatGoes(value ?? "", sanitizeCustomHtml(value ?? "")), [value])
  return (
    <div className="space-y-1.5">
      <AutoTextarea
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder ?? "<iframe src=…></iframe>"}
        className="font-mono text-[12px] leading-5 max-sm:text-[16px]"
        spellCheck={false}
      />
      {note && <p className={NOTE} role="status">{note}</p>}
    </div>
  )
}

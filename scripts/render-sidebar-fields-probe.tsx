/**
 * The builder sidebar's text controls, mounted for scripts/check-sidebar-
 * fields.mjs: the richtext field (Text on a Rich text section), the one line
 * inline_richtext control (an imported theme's headings) and the textarea,
 * each holding a long unbroken word and a long web address, in a panel
 * `?w=` wide with the sidebar's own 16px gutters. `?phone=1` draws them at
 * the phone sheet's width instead.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { RichTextField } from "@/components/website-builder/rich-text-field"
import { InlineRichTextControl } from "@/components/website-builder/editor/controls/inline-richtext-control"
import { AutoTextarea } from "@/components/website-builder/auto-textarea"

const params = new URLSearchParams(location.search)
const width = Number(params.get("w") ?? 320)
const LONG_URL = "https://www.example-store-with-a-very-long-name.com/collections/limited-edition-hand-thrown-ceramics?utm_source=newsletter&utm_campaign=autumn"
const LONG_WORD = "Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichenhersteller"

function Panel() {
  const [rich, setRich] = React.useState(`<h2>${LONG_WORD}</h2><p>Read more at ${LONG_URL} or <a href="${LONG_URL}">${LONG_URL}</a></p><ul><li>${LONG_WORD}${LONG_WORD}</li></ul>`)
  const [heading, setHeading] = React.useState(`Our <em>${LONG_WORD}</em> ${LONG_URL}`)
  const [area, setArea] = React.useState(`${LONG_WORD}${LONG_WORD} ${LONG_URL}`)
  return (
    <div
      data-probe-panel=""
      className="wb-slim-scroll overflow-y-auto overflow-x-hidden bg-white"
      style={{ width, height: "100vh" }}
    >
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-1.5" data-probe-field="richtext">
          <span className="block text-[12px] font-medium text-foreground/80">Text</span>
          <RichTextField value={rich} onChange={setRich} placeholder="Write something" />
        </div>
        <div className="space-y-1.5" data-probe-field="inline_richtext">
          <span className="block text-[12px] font-medium text-foreground/80">Heading</span>
          <InlineRichTextControl value={heading} onChange={setHeading} label="Heading" />
        </div>
        <div className="space-y-1.5" data-probe-field="textarea">
          <span className="block text-[12px] font-medium text-foreground/80">Description</span>
          <AutoTextarea value={area} onChange={setArea} placeholder="" />
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Panel />)

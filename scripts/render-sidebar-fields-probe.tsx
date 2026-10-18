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
import { ChipTextInput } from "@/components/website-builder/editor/controls/chip-text-input"

const params = new URLSearchParams(location.search)
const width = Number(params.get("w") ?? 320)
const LONG_URL = "https://www.example-store-with-a-very-long-name.com/collections/limited-edition-hand-thrown-ceramics?utm_source=newsletter&utm_campaign=autumn"
const LONG_WORD = "Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichenhersteller"

function Panel() {
  const [rich, setRich] = React.useState(`<h2>${LONG_WORD}</h2><p>Read more at ${LONG_URL} or <a href="${LONG_URL}">${LONG_URL}</a></p><ul><li>${LONG_WORD}${LONG_WORD}</li></ul>`)
  const [heading, setHeading] = React.useState(`Our <em>${LONG_WORD}</em> ${LONG_URL}`)
  const [area, setArea] = React.useState(`${LONG_WORD}${LONG_WORD} ${LONG_URL}`)
  const [line, setLine] = React.useState("Shop")
  const [chips, setChips] = React.useState("Made by {{ shop.name }}")
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
        {/* The one line text setting, as the editor page draws it (EchoTextInput). */}
        <div className="space-y-1.5" data-probe-field="text">
          <span className="block text-[12px] font-medium text-foreground/80">Button label</span>
          <AutoTextarea
            singleLine
            maxRows={8}
            value={line}
            onChange={setLine}
            className="min-h-8 px-2.5 py-[6px] text-[13px] leading-[18px] rounded-md max-sm:min-h-11 max-sm:py-[10px] max-sm:text-[16px] max-sm:leading-[22px]"
          />
        </div>
        {/* A text setting with shop data in it: words and pills. */}
        <div className="space-y-1.5" data-probe-field="chips">
          <span className="block text-[12px] font-medium text-foreground/80">Subheading</span>
          <ChipTextInput value={chips} onChange={setChips} label="Subheading" />
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Panel />)

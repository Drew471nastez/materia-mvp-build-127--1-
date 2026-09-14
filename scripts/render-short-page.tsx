/**
 * A SHORT PAGE, IN A CARD TALLER THAN IT IS.
 *
 * The editor's canvas card is a fixed-height white box and the page is drawn
 * inside it. When the page is shorter than the card — a page with no sections,
 * or two short ones — whatever the page does not cover is the card showing
 * through. This mounts exactly that: the real ThemePage, a header, a footer,
 * no body, inside a box the height of a canvas, so the gap can be measured
 * rather than described.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const section = (id: string, type: string): SectionInstance =>
  ({ id, type, name: type, settings: {} }) as SectionInstance

const theme = {
  /* A theme whose page is NOT white, so the card's white is tellable from it. */
  background_color: "#101014",
  text_color: "#ffffff",
} as unknown as ThemeSettingsValues

const sections = [section("h", "header"), section("f", "footer")]

createRoot(document.getElementById("app")!).render(
  /* The card: fixed height, white, exactly as the canvas is. */
  /* The editor's chain exactly: the card is a flex column that scrolls, and
     the canvas inside it is the flex item that takes the room. */
  <div id="card" style={{ height: 700, width: 900, background: "#ffffff", display: "flex", flexDirection: "column", overflowY: "auto" }}>
    <div id="canvas" style={{ display: "flex", flexDirection: "column", width: "100%", flex: "1 1 auto" }}>
      <ThemePage
        theme={theme}
        sections={sections}
        storefront={{ inEditor: true }}
        /* No style passed: ThemePage decides, which is the thing being tested. */
      >
        <div id="placeholder" style={{ padding: 48, textAlign: "center", color: "#888", ...((globalThis as unknown as { __fillStyle?: React.CSSProperties }).__fillStyle ?? {}) }}>
          Empty page
        </div>
      </ThemePage>
    </div>
  </div>,
)

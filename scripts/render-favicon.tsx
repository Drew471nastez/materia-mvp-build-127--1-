/**
 * The real DynamicFavicon, given a source whose shape is known: 100 wide by
 * 300 tall, three stacked squares — red, white, blue. Covering a square icon
 * must crop the red and the blue away and leave white; stretching keeps all
 * three, which is how the old behaviour is told from the new one.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { DynamicFavicon } from "@/components/store-builder/dynamic-favicon"

const c = document.createElement("canvas")
c.width = 100
c.height = 300
const g = c.getContext("2d")!
g.fillStyle = "#dc2626"; g.fillRect(0, 0, 100, 100)
g.fillStyle = "#ffffff"; g.fillRect(0, 100, 100, 100)
g.fillStyle = "#2563eb"; g.fillRect(0, 200, 100, 100)
const source = c.toDataURL("image/png")

createRoot(document.getElementById("app")!).render(<DynamicFavicon avatarUrl={source} />)

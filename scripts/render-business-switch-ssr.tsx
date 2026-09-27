/**
 * The server half of scripts/render-business-switch-tree.tsx: the HTML the
 * new business's /app sends, with the switch's arrival screen (the cookie
 * came) and without it (a load with no switch behind it). Run by
 * scripts/check-business-switch.mjs under Node; prints JSON.
 */
import React from "react"
import { renderToString } from "react-dom/server"
import { NewTree } from "./render-business-switch-tree"
import { SWITCH_FIRST_PAINT_SCRIPT } from "@/lib/businesses/switch-screen"

const name = process.argv[2] || "Lind Studio"
const photo = process.argv[3] || null
/* `head` is what app/layout.tsx runs in the <head> of every document before its body is parsed: the probe puts it in the head of both of its own. */
/* `gated`: the same with the app's session gate still at work (the cold start's frame under the screen), for the probe's GATE_MS run. */
const gateMs = Number(process.argv[4] || 0)
process.stdout.write(JSON.stringify({
  arriving: renderToString(<NewTree arriving={{ name, photo }} />),
  plain: renderToString(<NewTree arriving={null} />),
  gated: gateMs ? renderToString(<NewTree arriving={{ name, photo }} gateMs={gateMs} />) : null,
  head: SWITCH_FIRST_PAINT_SCRIPT,
}))

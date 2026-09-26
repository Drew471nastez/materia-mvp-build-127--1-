/**
 * The server half of scripts/render-business-switch-tree.tsx: the HTML the
 * new business's /app sends, with the switch's arrival screen (the cookie
 * came) and without it (a load with no switch behind it). Run by
 * scripts/check-business-switch.mjs under Node; prints JSON.
 */
import React from "react"
import { renderToString } from "react-dom/server"
import { NewTree } from "./render-business-switch-tree"

const name = process.argv[2] || "Lind Studio"
const photo = process.argv[3] || null
process.stdout.write(JSON.stringify({ arriving: renderToString(<NewTree arriving={{ name, photo }} />), plain: renderToString(<NewTree arriving={null} />) }))

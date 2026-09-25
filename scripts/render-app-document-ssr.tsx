/**
 * The server half of scripts/render-app-document-tree.tsx: the HTML an /app
 * page's layout sends, with the wrapper as it is and as it was. Run by
 * scripts/check-website-arrival.mjs under Node; prints JSON.
 */
import React from "react"
import { renderToString } from "react-dom/server"
import { DocumentTree } from "./render-app-document-tree"

process.stdout.write(JSON.stringify({ after: renderToString(<DocumentTree before={false} />), before: renderToString(<DocumentTree before />) }))

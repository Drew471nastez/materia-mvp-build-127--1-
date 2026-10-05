/**
 * The "Open in the Storelib app" pill (components/community/open-in-app-pill)
 * over a community page's worth of content, for
 * scripts/check-open-app-pill.mjs. Rendered to a string first (the server's
 * HTML, where the App Store meta tag has to be) and then mounted.
 */
import { createRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { createElement, Fragment } from "react"

import { OpenInAppPill } from "@/components/community/open-in-app-pill"

const page = () =>
  createElement(
    Fragment,
    null,
    createElement(OpenInAppPill),
    createElement(
      "main",
      { style: { maxWidth: 680, margin: "0 auto", padding: "72px 16px 160px", background: "#f8f9fa", minHeight: "200vh" } },
      ...Array.from({ length: 6 }, (_, i) =>
        createElement("div", { key: i, style: { background: "#fff", borderRadius: 16, height: 180, marginBottom: 12, boxShadow: "0 0 0 1px #e5e7eb" } }),
      ),
    ),
  )

;(window as unknown as { __ssr?: string }).__ssr = renderToString(createElement(page))
createRoot(document.getElementById("app")!).render(createElement(page))
;(window as unknown as { __ran?: boolean }).__ran = true

/**
 * The hand off card (components/platform/open-in-app-card) over a page's
 * worth of content, for scripts/check-open-in-app.mjs.
 *
 * The whole component is mounted, not just its look: it reads the user
 * agent, asks /api/app-links/in-app-browser (the probe's own server answers
 * that, with the scheme and the store pointing back at it so a hand off and
 * a store fallback are real requests the probe can see) and draws itself.
 */
import { createRoot } from "react-dom/client"
import { createElement, Fragment } from "react"

import { OpenInAppCard } from "@/components/platform/open-in-app-card"

const page = () =>
  createElement(
    Fragment,
    null,
    createElement(
      "main",
      { style: { maxWidth: 680, margin: "0 auto", padding: "20px 16px 240px", background: "#f8f9fa", minHeight: "220vh" } },
      createElement(
        "h1",
        { id: "heading", style: { margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.01em" } },
        "Clay Studio",
      ),
      createElement("p", { style: { margin: "0 0 16px", fontSize: 14, color: "#6b7280" } }, "A community for potters. 412 members."),
      ...Array.from({ length: 6 }, (_, i) =>
        createElement(
          "div",
          {
            key: i,
            id: i === 0 ? "first-card" : undefined,
            style: { background: "#fff", borderRadius: 16, height: 168, marginBottom: 12, boxShadow: "0 0 0 1px #e5e7eb" },
          },
        ),
      ),
    ),
    createElement(OpenInAppCard),
  )

createRoot(document.getElementById("app")!).render(createElement(page))
;(window as unknown as { __ran?: boolean }).__ran = true

/**
 * The story editor as it really mounts, at phone size.
 *
 * The screenshot shows a panel with a grabber, square to both screen edges,
 * and a Cancel/Save row floating well above the keyboard. A centred Radix
 * dialog at max-h-[85vh] cannot look like that, so the first question is not
 * how to fix it but what is actually on screen. This renders it and measures.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { EditAboutButton } from "@/components/storefront/edit-about-button"

createRoot(document.getElementById("app")!).render(
  <div style={{ minHeight: "100vh", background: "#eee" }}>
    <EditAboutButton headline="About me" story="<p>Gg</p>" media={[]} contactEmail="" />
  </div>,
)

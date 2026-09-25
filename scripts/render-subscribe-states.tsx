/**
 * The creator page's subscribe bar, rendered the way the page renders it:
 * to HTML first (react-dom/server), painted, and only then hydrated. A block
 * the height of a cover sits under it, so anything the bar does to the page
 * shows up as that block moving. Driven by scripts/check-subscribe-states.mjs.
 */
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { hydrateRoot } from "react-dom/client"

import { SubscribeBar } from "@/components/store-builder/subscribe-bar"

const w = window as unknown as Record<string, unknown>

/* The subscribe request, held for as long as the probe says. */
const realFetch = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes("/api/subscribers") || url.includes("/api/follow")) {
    return new Promise((resolve) =>
      setTimeout(() => resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } })), Number(w.__subscribeDelay ?? 700)),
    )
  }
  return realFetch(input, init)
}) as typeof fetch

const theme = new URLSearchParams(location.search).get("theme") === "light"
  ? { backgroundColor: "#ffffff", textColor: "#111113", buttonColor: "#111113", buttonTextColor: "#ffffff" }
  : { backgroundColor: "#111113", textColor: "#ffffff", buttonColor: "#ffffff", buttonTextColor: "#111113" }

const tree = createElement(
  "div",
  { style: { background: "#f6f6f7", minHeight: "200vh" } },
  createElement(SubscribeBar, {
    creatorId: "creator-probe",
    settings: {
      visible: true,
      text: "",
      customCtaText: "",
      placeholder: "Enter your email",
      buttonText: "",
      showAvatar: true,
      avatarUrl: undefined,
      creatorName: "Luca Dragoste",
      style: "style1",
      buttonStyle: "style1",
      enableStickyBar: true,
      enableStickyOnScrollUp: true,
      ...theme,
    } as never,
  }),
  createElement("div", { "data-probe-cover": "", style: { height: 220, background: "#d8d4cc" } }),
)

const root = document.getElementById("root")!
try {
  root.innerHTML = renderToString(tree)
} catch (e) {
  w.__err = String((e as Error)?.stack || e)
}
const cover = () => Math.round((root.querySelector("[data-probe-cover]") as HTMLElement).getBoundingClientRect().top)
w.__serverHasBar = !!root.querySelector('input[type="email"]')
w.__coverBefore = cover()
const errors: string[] = []
w.__hydrationErrors = errors
w.__hydrate = () => {
  hydrateRoot(root, tree, { onRecoverableError: (e) => errors.push(String((e as Error)?.message || e)) })
}
w.__cover = cover

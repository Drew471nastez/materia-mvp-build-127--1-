/**
 * The real front page hero, drawn the way a visit draws it: the server's
 * HTML first (renderToString), painted, and then hydrated. Nothing about the
 * hero is reimplemented; scripts/check-home-hero.mjs measures what comes out.
 *
 * The hash picks who is looking, through the same auth snapshot the header
 * writes: #guest, #buyer, #creator. `late` in the hash writes the snapshot
 * only after hydration, the way a header that is still verifying does.
 */
import React from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { Hero } from "@/components/marketing/hero"
import { writeAuthSnapshot } from "@/lib/auth/auth-snapshot"

const hash = location.hash.slice(1)
const who = hash.includes("creator") ? "creator" : hash.includes("buyer") ? "buyer" : "guest"
const snapshot = () => {
  if (who === "guest") return
  writeAuthSnapshot({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "A", username: "a", isSeller: who === "creator" })
}
try { localStorage.clear() } catch { /* file:// may refuse; the probe says so */ }
if (!hash.includes("late")) snapshot()

const tree = (
  <div id="host">
    <Hero />
    <div id="below" style={{ height: 3000, background: "#fff" }} />
  </div>
)
const app = document.getElementById("app")!
app.innerHTML = renderToString(tree)
const w = window as unknown as Record<string, unknown>
w.__ssrPainted = performance.now()
requestAnimationFrame(() => requestAnimationFrame(() => {
  hydrateRoot(app, tree, { onRecoverableError: (e) => { (w.__err as string[]).push("hydration: " + String((e as Error)?.message ?? e)) } })
  w.__ready = true
  if (hash.includes("late")) setTimeout(snapshot, 300)
}))

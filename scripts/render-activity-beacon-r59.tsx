/**
 * The real ActivityBeacon (components/app/activity-beacon.tsx) on a page that
 * looks like /app for scripts/check-activity-beacon-r59.mjs: a route the
 * check can change (next/navigation is stubbed with a store it drives), a
 * button named for publishing, a plain button and a text field to type in.
 * The clock runs sixty times fast so a minute takes a second.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"

import { ActivityBeacon } from "@/components/app/activity-beacon"
import { noteActivity } from "@/lib/activity/creator-activity-client"

const SPEED = 60
const realNow = Date.now.bind(Date)
const start = realNow()
Date.now = () => start + (realNow() - start) * SPEED
const realInterval = window.setInterval.bind(window)
window.setInterval = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => realInterval(fn, Math.max(1, (ms ?? 0) / SPEED), ...rest)) as typeof window.setInterval

function Page() {
  return (
    <main style={{ padding: 24, fontFamily: "Inter, sans-serif" }}>
      <h1>Products</h1>
      <input id="title" placeholder="Product title" />
      <textarea id="note" />
      <button id="plain" type="button">Save draft</button>
      <button id="publish" type="button" onClick={() => noteActivity("site.publish")}>Publish</button>
      <button id="stripe" type="button" data-activity="stripe.start">Set up payments</button>
      <a id="editor" href="/website-builder/editor/9f8e7d6c-1111-4222-8333-444455556666" onClick={(e) => e.preventDefault()}>Edit website</a>
      <ActivityBeacon />
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<Page />)

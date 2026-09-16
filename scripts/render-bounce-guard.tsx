/**
 * The real CapacitorBounceGuard over a page shaped like a real one: a deep
 * tree, because what the guard does on every touchmove is walk UP it.
 *
 * Nothing about the guard is reimplemented here. The point is to scroll a
 * page with it attached and measure what the scroll costs.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { CapacitorBounceGuard } from "@/components/platform/capacitor-bounce-guard"

/** Roughly the depth between a card's text and <body> on a real product page. */
function Nest({ depth, children }: { depth: number; children: React.ReactNode }) {
  if (depth <= 0) return <>{children}</>
  return (
    <div className="relative flex w-full flex-col">
      <Nest depth={depth - 1}>{children}</Nest>
    </div>
  )
}

function Card({ i }: { i: number }) {
  return (
    <Nest depth={10}>
      <div className="mb-3 rounded-2xl border bg-white p-4 shadow-sm" data-card={i}>
        <div className="h-28 w-full rounded-xl bg-neutral-200" />
        <div className="mt-2 text-sm font-medium">Product {i}</div>
        <div className="text-xs text-neutral-500">$92.00</div>
      </div>
    </Nest>
  )
}

createRoot(document.getElementById("app")!).render(
  <>
    <CapacitorBounceGuard />
    <div id="page" className="px-4 py-4">
      {Array.from({ length: 60 }, (_, i) => <Card key={i} i={i} />)}
    </div>
  </>,
)

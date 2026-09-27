/**
 * The receipt page rendered on the "server" (Node, react-dom/server), for
 * scripts/check-receipt.mjs's hydration pass: the browser then hydrates
 * this markup with scripts/render-receipt.tsx, and any difference between
 * the two renders is a React warning in the console.
 */
import React from "react"
import { renderToString } from "react-dom/server"
import { ReceiptView } from "@/app/receipt/[token]/receipt-view"
import { receiptCases } from "./receipt-cases"

export function renderReceipt(which: string, origin: string): string {
  const CASES = receiptCases(origin)
  const chosen = CASES[which] ?? CASES.free
  return renderToString(<ReceiptView receipt={chosen.receipt as never} viewer={chosen.viewer as never} locale="en-US" />)
}

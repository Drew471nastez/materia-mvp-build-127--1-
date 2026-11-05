/**
 * The real receipt page (app/(storelib)/receipt/[token]/receipt-view.tsx) with the
 * review card under it, for scripts/check-receipt.mjs. The orders are in
 * scripts/receipt-cases.tsx; `?case=` picks one. The router is a stub; the
 * probe's server answers every /api call the page makes (download, resend,
 * send a copy, contact seller, change address, reviews).
 *
 * When the probe served the page already rendered (scripts/render-receipt-ssr.tsx),
 * this hydrates it, the way Next does, so a server/browser difference shows
 * up as React's hydration warning; otherwise it renders from scratch.
 */
import React from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { ReceiptView } from "@/app/(storelib)/receipt/[token]/receipt-view"
import ReceiptLoading from "@/app/(storelib)/receipt/[token]/loading"
import { receiptCases } from "./receipt-cases"

const params = new URLSearchParams(location.search)
const which = params.get("case") || "free"
const CASES = receiptCases(location.origin)
const chosen = CASES[which] ?? CASES.free
;(window as any).__receiptCase = which

/* ?case=loading draws the route's skeleton, to be laid over the real page (scripts/check-receipt.mjs). */
const tree = which === "loading" ? <ReceiptLoading /> : <ReceiptView receipt={chosen.receipt as never} viewer={chosen.viewer as never} locale="en-US" />
const app = document.getElementById("app")!
if (app.hasChildNodes()) hydrateRoot(app, tree)
else createRoot(app).render(tree)

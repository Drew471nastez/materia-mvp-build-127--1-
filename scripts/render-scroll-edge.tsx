/**
 * The real ScrollEdge (components/app/scroll-edge.tsx) around the two table
 * shapes it carries in /app, with the classes those tables use:
 *
 *   emails   app/(storelib)/app/emails/emails-home.tsx: border-collapse, rows divided by
 *            the tbody, one frozen column, the Status badge going under it
 *   orders   app/(storelib)/app/orders/orders-list.tsx: border-separate, a checkbox
 *            column and the Order column frozen, one row selected
 *
 * Measured by scripts/check-scroll-edge.mjs.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { ScrollEdge } from "@/components/app/scroll-edge"
import { StatusBadge } from "@/app/(storelib)/app/orders/order-parts"
import { cn } from "@/lib/utils"

const th = "h-9 whitespace-nowrap px-3 text-left text-[12px] font-medium text-[#4b5563]"
const td = "h-12 whitespace-nowrap px-3 text-[13px] text-[#1a1a2e]"
const sticky = "sticky left-0 z-[1] bg-white group-hover:bg-[#fafbfb]"
const stickyHead = "sticky left-0 z-[1] bg-[#fafbfb]"
const card = "bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"

const EMAILS = ["admin-trigger@storelib.com", "andewre@gmail.com", "anisiaghita2003@gmail.com"]

function Emails() {
  return (
    <section data-table="emails" className={cn(card, "mt-4")}>
      <ScrollEdge>
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
            <tr>
              <th data-scroll-edge="" className={cn(th, stickyHead)}>Email</th>
              <th className={th}>Name</th>
              <th className={th}>Source</th>
              <th className={th}>Status</th>
              <th className={th}>Subscribed</th>
              <th className={cn(th, "w-12")} aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f2f4]">
            {EMAILS.map((email, i) => (
              <tr key={email} data-row={i} className="group cursor-pointer hover:bg-[#fafbfb]">
                <td data-scroll-edge="" className={cn(td, sticky, "font-medium")}>
                  <span className="block max-w-[180px] truncate sm:max-w-[260px]">{email}</span>
                </td>
                <td className={cn(td, "text-[#4b5563]")}>–</td>
                <td className={td}>Your website</td>
                <td className={td}><StatusBadge tone="success">Subscribed</StatusBadge></td>
                <td className={cn(td, "tabular-nums text-[#4b5563]")}>Sep 17</td>
                <td className={cn(td, "w-12 px-2 text-right")}>…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollEdge>
    </section>
  )
}

const COLS = ["Date", "Customer", "Source", "Payment", "Fulfilment", "Items", "Total"]

function Orders() {
  return (
    <section data-table="orders" className={cn(card, "mt-4")}>
      <ScrollEdge className="orders-scroller">
        <table className="w-full min-w-max border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="h-9 text-left text-[12px] font-medium text-[#4b5563]">
              <th scope="col" className="orders-sticky left-0 w-10 bg-[#f7f7f8] p-0"><span className="block w-10" /></th>
              <th scope="col" data-scroll-edge="" className="orders-sticky left-10 bg-[#f7f7f8] pl-2 pr-4">Order</th>
              {COLS.map((c) => <th key={c} scope="col" className="bg-[#f7f7f8] px-3">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {[1041, 1040, 1039, 1038].map((n, i) => {
              const rowBg = i === 1 ? "bg-[#f4f4f6]" : "bg-white group-hover:bg-[#fafafb]"
              return (
                <tr key={n} data-row={i} className="group h-10 cursor-pointer">
                  <td className={cn("orders-sticky left-0 w-10 border-t border-[#f0f1f3] p-0", rowBg)}><span className="block w-10" /></td>
                  <td data-scroll-edge="" className={cn("orders-sticky left-10 border-t border-[#f0f1f3] pl-2 pr-4", rowBg)}>
                    <span className="font-semibold text-[#1a1a2e]">#{n}</span>
                  </td>
                  {COLS.map((c) => (
                    <td key={c} className={cn("whitespace-nowrap border-t border-[#f0f1f3] px-3 text-[#303036]", rowBg)}>
                      {c === "Payment" ? <StatusBadge tone="success">Paid</StatusBadge> : c === "Customer" ? "Anisia Ghita" : c === "Total" ? "$24.00" : "Sep 17, 10:42"}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollEdge>
    </section>
  )
}

createRoot(document.getElementById("app")!).render(
  <div className="min-h-svh bg-[#f8f9fa] px-4 py-6">
    <Emails />
    <Orders />
  </div>,
)

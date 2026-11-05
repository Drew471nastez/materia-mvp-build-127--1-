"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cx } from "../_console/ui"

const LINKS = [
  { href: "/admin/payments", label: "Overview" },
  { href: "/admin/payments/accounts", label: "Accounts" },
  { href: "/admin/payments/transactions", label: "Transactions" },
  { href: "/admin/payments/payouts", label: "Payouts" },
  { href: "/admin/payments/disputes", label: "Disputes" },
  { href: "/admin/payments/fees", label: "Fees" },
  { href: "/admin/payments/simulator", label: "Simulator" },
  { href: "/admin/payouts-setup", label: "Setup" },
  { href: "/admin/payments/webhooks", label: "Webhooks" },
  { href: "/admin/payments/configuration", label: "Configuration" },
] as const

export function PaymentsShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#ededf0]">
      <header className="border-b border-white/[0.08] px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76]">Storelib admin</p>
            <h1 className="text-[15px] font-semibold">Payments</h1>
          </div>
          <a href="/admin" className="text-[13px] text-[#9b9ba6] hover:text-[#ededf0]">← Console</a>
        </div>
        <nav className="mx-auto mt-3 flex max-w-6xl flex-wrap gap-1" aria-label="Payments">
          {LINKS.map((l) => {
            const on = path === l.href || (l.href !== "/admin/payments" && path.startsWith(l.href))
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cx(
                  "rounded-[7px] px-2.5 py-1.5 text-[12px] transition-colors",
                  on ? "bg-white/[0.07] font-medium text-[#ededf0]" : "text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]",
                )}
              >
                {l.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}

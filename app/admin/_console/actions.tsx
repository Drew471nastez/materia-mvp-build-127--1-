"use client"

import * as React from "react"

import { money } from "./format"
import { ConfirmDialog, TextArea } from "./ui"

/**
 * ===========================================================================
 *  THE THREE THINGS THE CONSOLE CAN CHANGE, EACH BEHIND A DIALOG
 * ===========================================================================
 * Ban or unban a creator, take a product down or put it back, refund an
 * order. Every one reads what it would do from the server first and shows
 * it, and the request that acts carries back the number the dialog showed
 * (the count of creators, the product id, the cents), so a set or an amount
 * that changed in between is refused rather than acted on.
 *
 * The server writes each one to the audit log. What comes back is shown as
 * it came: done, done with a note, or refused with the reason.
 */

export type Action =
  | { kind: "ban" | "unban"; creatorId: string; label: string }
  | { kind: "unpublish" | "republish"; productId: string; label: string }
  | { kind: "refund"; orderId: string; label: string }
  | { kind: "delete_account"; userId: string; label: string }

export type Outcome = { tone: "good" | "bad"; text: string; notes?: string[] }

async function readJson(res: Response): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    return await res.json()
  } catch {
    return {}
  }
}

export function ActionDialog({ action, onClose, onDone }: { action: Action | null; onClose: () => void; onDone: (o: Outcome) => void }) {
  const [plan, setPlan] = React.useState<Record<string, any> | null>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [reason, setReason] = React.useState("")

  React.useEffect(() => {
    setPlan(null)
    setError(null)
    setReason("")
    if (!action) return
    let cancelled = false
    const load = async () => {
      if (action.kind === "ban" || action.kind === "unban") {
        const res = await fetch(`/api/admin/creators/moderate?ids=${encodeURIComponent(action.creatorId)}`, { cache: "no-store" })
        const body = await readJson(res)
        if (cancelled) return
        if (!res.ok) setError(body.error || "Could not read what this would change.")
        else setPlan(body)
      } else if (action.kind === "refund") {
        const res = await fetch(`/api/admin/orders/refund?id=${encodeURIComponent(action.orderId)}`, { cache: "no-store" })
        const body = await readJson(res)
        if (cancelled) return
        if (!res.ok) setError(body.error || "Could not read this order.")
        else setPlan(body)
      } else if (action.kind === "delete_account") {
        const res = await fetch(`/api/admin/accounts/delete?id=${encodeURIComponent(action.userId)}`, { cache: "no-store" })
        const body = await readJson(res)
        if (cancelled) return
        if (!res.ok) setError(body.error || "Could not read this account.")
        else setPlan(body)
      } else {
        setPlan({})
      }
    }
    load().catch(() => {
      if (!cancelled) setError("Could not reach the server.")
    })
    return () => {
      cancelled = true
    }
  }, [action])

  if (!action) return <ConfirmDialog open={false} title="" confirmLabel="" onConfirm={() => {}} onClose={onClose}>{null}</ConfirmDialog>

  const submit = async () => {
    if (!plan) return
    if (action.kind === "delete_account" && plan.isAdmin) return
    setBusy(true)
    setError(null)
    try {
      let res: Response
      if (action.kind === "ban" || action.kind === "unban") {
        res = await fetch("/api/admin/creators/moderate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: action.kind, creatorIds: [action.creatorId], confirm: plan.count, reason: reason.trim() || null }),
        })
      } else if (action.kind === "refund") {
        res = await fetch("/api/admin/orders/refund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: action.orderId, confirm: plan.amount, reason: reason.trim() }),
        })
      } else if (action.kind === "delete_account") {
        /* Round AG: the dialog is the double check (Are you sure?); the request still names the account it read. */
        res = await fetch("/api/admin/accounts/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: action.userId,
            confirm: action.userId,
            reason: reason.trim() || null,
            force: true,
          }),
        })
      } else {
        const product = action as Extract<Action, { kind: "unpublish" | "republish" }>
        res = await fetch("/api/admin/products/moderate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: product.productId, action: product.kind, confirm: product.productId, reason: reason.trim() }),
        })
      }
      const body = await readJson(res)
      if (!res.ok || body.ok === false) {
        const failedLine = Array.isArray(body.failed) && body.failed[0]?.error ? body.failed[0].error : null
        setError(body.error || failedLine || "That did not go through. Nothing was changed.")
        return
      }
      const done =
        action.kind === "ban"
          ? `Banned ${action.label}.`
          : action.kind === "unban"
            ? `Lifted the ban on ${action.label}.`
            : action.kind === "refund"
              ? `Refunded ${money(body.amount ?? plan.amount, plan.currency || "USD")} for ${action.label}.`
              : action.kind === "unpublish"
                ? `Took ${action.label} off sale.`
                : action.kind === "delete_account"
                  ? body.mode === "retired"
                    ? `Retired ${action.label}. Personal details are gone; sales records stay.`
                    : `Deleted ${action.label} completely.`
                  : `Put ${action.label} back on sale.`
      onDone({ tone: "good", text: done, notes: Array.isArray(body.notes) ? body.notes : [] })
    } catch {
      setError("Could not reach the server. Nothing was changed.")
    } finally {
      setBusy(false)
    }
  }

  const title =
    action.kind === "ban"
      ? `Ban ${action.label}`
      : action.kind === "unban"
        ? `Lift the ban on ${action.label}`
        : action.kind === "refund"
          ? "Refund this order"
          : action.kind === "unpublish"
            ? `Take ${action.label} off sale`
            : action.kind === "delete_account"
              ? `Delete ${action.label}`
              : `Put ${action.label} back on sale`

  const target = plan?.targets?.[0] as { publishedProducts?: number; orders?: number } | undefined

  return (
    <ConfirmDialog
      open
      title={title}
      confirmLabel={action.kind === "ban" ? "Ban" : action.kind === "unban" ? "Lift ban" : action.kind === "refund" ? (plan ? `Refund ${money(plan.amount, plan.currency || "USD")}` : "Refund") : action.kind === "unpublish" ? "Take off sale" : action.kind === "delete_account" ? "Delete account" : "Put back on sale"}
      danger={action.kind === "ban" || action.kind === "refund" || action.kind === "unpublish" || action.kind === "delete_account"}
      busy={busy || (!plan && !error)}
      error={error}
      onConfirm={submit}
      onClose={onClose}
    >
      {!plan && !error ? <p>Reading what this would change…</p> : null}
      {plan && action.kind === "ban" ? (
        <p>
          Their storefront closes and {target?.publishedProducts === 1 ? "their 1 published product is" : `their ${target?.publishedProducts ?? 0} published products are`} taken off sale.
          {target?.orders ? ` Their ${target.orders} orders and buyers' downloads stay.` : ""} This can be lifted.
        </p>
      ) : null}
      {plan && action.kind === "unban" ? <p>Their storefront can open again. Products stay off sale until they publish them.</p> : null}
      {plan && action.kind === "unpublish" ? <p>It leaves the marketplace and their page, and cannot be bought. Buyers who own it keep it.</p> : null}
      {plan && action.kind === "republish" ? <p>It goes back on the marketplace and their page as it was.</p> : null}
      {plan && action.kind === "refund" ? (
        <p>
          {money(plan.amount, plan.currency || "USD")} goes back to {plan.buyer} for {plan.product}. The creator&apos;s share comes back from their balance, and both are emailed. This cannot be undone.
        </p>
      ) : null}
      {plan && action.kind === "delete_account" ? (
        <>
          {plan.isAdmin ? (
            <p className="text-[#f47067]">This is a Storelib admin account. It cannot be deleted from here.</p>
          ) : (
            <p>
              {plan.expectedMode === "retired"
                ? "This account will be retired: the storefront closes, personal details and sign-in are erased, and buyers keep what they paid for. Financial records stay."
                : "This account will be removed completely, including sign-in. This cannot be undone."}
              {plan.creatorOrders > 0 ? ` They have ${plan.creatorOrders} sale${plan.creatorOrders === 1 ? "" : "s"} as a creator.` : ""}
              {plan.buyerOrders > 0 ? ` They have ${plan.buyerOrders} purchase${plan.buyerOrders === 1 ? "" : "s"}; those orders stay as the sellers' records.` : ""}
            </p>
          )}
          {plan.blockers?.length ? (
            <p className="text-[12px] text-[#9b9ba6]">Note for creators with open balances: {plan.blockers.join(" ")}</p>
          ) : null}
          {!plan.isAdmin ? <p className="mt-3 font-medium text-[#ededf0]">Are you sure? This can&apos;t be undone.</p> : null}
        </>
      ) : null}
      {plan && action.kind !== "unban" && action.kind !== "republish" && action.kind !== "delete_account" ? (
        <TextArea label="Reason, for the audit log" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Optional" />
      ) : null}
      {plan && action.kind === "delete_account" && !plan.isAdmin ? (
        <TextArea label="Reason, for the audit log" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Optional" />
      ) : null}
    </ConfirmDialog>
  )
}

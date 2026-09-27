"use client"

import * as React from "react"

import type { WalletDomainReport } from "@/lib/checkout/wallet-domains"

import { Button, DataList, Delayed, Facts, Panel, Status } from "./ui"

/**
 * ===========================================================================
 *  WALLET BUTTONS AT CHECKOUT: THE ONE THING THAT IS NOT CODE
 * ===========================================================================
 * Apple Pay and Google Pay only draw on a domain registered with the Stripe
 * account. Everything else is already in place, so this panel is the whole
 * remaining step and it is one press: what Stripe says per wallet, what our
 * own association file answers, and a button that registers the domain or
 * asks Stripe to check it again (/api/admin/payment-domains).
 *
 * It reads itself rather than riding on the Health view's payload, because
 * asking Stripe and fetching our own file over the network would hold up
 * every other figure on the page, and because the button has to be able to
 * refresh this panel alone.
 *
 * Stripe's own `status_details.error_message` is shown as it came. That
 * sentence is the only thing that says what Apple actually saw, and rewriting
 * it would lose the one detail the fix depends on.
 *
 * The button is the console's plain one: near black, one hairline. This is a
 * read-only health page and the press is safe to repeat, so it does not need
 * the weight the refund dialog's confirm has.
 */

type Answer = WalletDomainReport & { did?: "create" | "validate"; notes?: string[] }

const stateOf = (s: "active" | "inactive" | "unknown") => (s === "active" ? "ok" : s === "inactive" ? "failed" : "late")
const wordOf = (s: "active" | "inactive" | "unknown") => (s === "active" ? "Active" : s === "inactive" ? "Not active" : "Unknown")

export function WalletDomainsPanel() {
  const [answer, setAnswer] = React.useState<Answer | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [said, setSaid] = React.useState<string | null>(null)

  const ask = React.useCallback(async (method: "GET" | "POST") => {
    setError(null)
    if (method === "POST") setBusy(true)
    try {
      const res = await fetch("/api/admin/payment-domains", {
        method,
        cache: "no-store",
        ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: "{}" } : {}),
      })
      if (res.status === 401) {
        window.location.reload()
        return
      }
      const body = (await res.json().catch(() => null)) as Answer | { error?: string } | null
      if (!res.ok || !body || "error" in body) {
        setError((body as { error?: string } | null)?.error || "Stripe could not be asked about this domain.")
        return
      }
      setAnswer(body as Answer)
      if (method === "POST") {
        const did = (body as Answer).did
        setSaid(did === "create" ? "Registered with Stripe. Apple and Google are checked within a few minutes." : "Sent to Stripe to be checked again.")
      }
    } catch {
      setError("Could not reach the server.")
    } finally {
      if (method === "POST") setBusy(false)
    }
  }, [])

  React.useEffect(() => {
    void ask("GET")
  }, [ask])

  const rows = (answer?.wallets ?? []).filter((w) => w.checkout)

  return (
    <Panel
      id="wallet-domains"
      title="Wallet buttons at checkout"
      meta={answer ? answer.domain : "Apple Pay, Google Pay and Link"}
      action={
        <Button
          onClick={() => void ask("POST")}
          disabled={busy}
          aria-label={answer?.nextStep === "validate" ? "Ask Stripe to check this domain again" : "Register this domain with Stripe"}
        >
          {busy ? "Working…" : answer?.nextStep === "validate" ? "Check again" : "Register domain"}
        </Button>
      }
    >
      {!answer && !error ? (
        <Delayed>
          <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">Asking Stripe about this domain…</p>
        </Delayed>
      ) : null}

      {error ? <p className="px-4 py-4 text-[13px] text-[#f47067]" role="alert">{error}</p> : null}

      {answer ? (
        <>
          <p className="border-b border-white/[0.08] px-4 py-2.5 text-[13px] text-[#ededf0]">
            {answer.summary}
            {said ? <span className="mt-0.5 block text-[12px] text-[#9b9ba6]">{said}</span> : null}
            {(answer.notes ?? []).map((n) => (
              <span key={n} className="mt-0.5 block text-[12px] text-[#d4a72c]">{n}</span>
            ))}
          </p>

          <DataList
            label="Wallets on this domain"
            rows={rows}
            rowKey={(w) => w.id}
            empty=""
            columns={[
              { key: "wallet", label: "Wallet", width: "minmax(0,1fr)", phone: "primary", render: (w) => w.label },
              { key: "state", label: "State", width: "120px", phone: "end", render: (w) => <Status value={stateOf(w.state)} label={wordOf(w.state)} /> },
              {
                key: "why",
                label: "At checkout",
                width: "minmax(0,1.6fr)",
                render: (w) => (w.state === "active" ? "Showing" : answer.registered ? "Not showing" : "Not registered, so nothing is drawn"),
              },
            ]}
          />

          {/*
            Stripe's sentence, whole and wrapped, under the table rather than
            in a cell: it is the only thing that says what Apple actually saw,
            and a truncated one is worth nothing.
          */}
          {rows.filter((w) => w.message).map((w) => (
            <p key={w.id} className="border-t border-white/[0.08] px-4 py-2.5 text-[12px] leading-4 text-[#9b9ba6] [overflow-wrap:anywhere]">
              <span className="text-[#ededf0]">{w.label}</span> {w.message}
            </p>
          ))}

          <div className="border-t border-white/[0.08]" />
          <Facts
            items={[
              { label: "Registered with Stripe", value: <Status value={answer.registered ? (answer.enabled ? "ok" : "failed") : "failed"} label={answer.registered ? (answer.enabled ? "Yes" : "Switched off") : "No"} /> },
              { label: "Association file", value: <Status value={answer.association.ok ? "ok" : "failed"} label={answer.association.status === null ? "No answer" : `${answer.association.status}${answer.association.bytes === null ? "" : `, ${answer.association.bytes} bytes`}`} /> },
              { label: "Domains on this account", value: answer.allDomains.length },
            ]}
          />
          <p className="border-t border-white/[0.08] px-4 py-2.5 text-[12px] leading-4 text-[#9b9ba6] [overflow-wrap:anywhere]">{answer.association.note}</p>
        </>
      ) : null}
    </Panel>
  )
}

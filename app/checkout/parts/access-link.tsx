"use client"

/**
 * "BOUGHT THIS BEFORE? EMAIL ME MY LINK", under the email on a checkout: the
 * website's (app/checkout/site) and the Explore one (app/checkout). The
 * receipts of that email's orders go to that email; what the page shows is
 * exactly what the server said, which is the same whatever the email
 * (lib/checkout/access-link), so it tells nobody what another person bought.
 */
import * as React from "react"

/**
 * "Bought this before?" for a guest. Sends the receipts of that email's
 * orders to that email (the route answers the same either way), and says
 * exactly what the server said.
 */
export function AccessLink({ email, send }: { email: string; send: (email: string) => Promise<{ ok: boolean; message: string }> }) {
  const [state, setState] = React.useState<{ kind: "idle" } | { kind: "busy" } | { kind: "said"; ok: boolean; message: string }>({ kind: "idle" })
  const ask = async () => {
    const typed = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) {
      setState({ kind: "said", ok: false, message: "Type the email you bought it with above, then press this again." })
      document.getElementById("checkout-email")?.focus()
      return
    }
    setState({ kind: "busy" })
    const said = await send(typed).catch(() => ({ ok: false, message: "That didn't go through. Try again in a moment." }))
    setState({ kind: "said", ok: said.ok, message: said.message })
  }
  return (
    <div data-checkout-access="" className="text-[13px] leading-[19px] text-[#6b7280]">
      {state.kind === "said" && state.ok ? (
        <p role="status" className="text-[#166534]">{state.message}</p>
      ) : (
        <p>
          Bought this before?{" "}
          <button type="button" onClick={() => void ask()} disabled={state.kind === "busy"} className="cursor-pointer font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 disabled:cursor-default disabled:opacity-60">
            {state.kind === "busy" ? "Sending" : "Email me my link"}
          </button>
        </p>
      )}
      {state.kind === "said" && !state.ok ? <p role="alert" className="mt-1 text-[#b91c1c]">{state.message}</p> : null}
    </div>
  )
}

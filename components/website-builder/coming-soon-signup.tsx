"use client"

/**
 * The "Notify me" box on a website that is not live yet
 * (app/(site)/w/[username]/not-published.tsx). One email field and a button,
 * through the same subscribe path every email box on a website uses
 * (lib/website-builder/subscribe-client), so the address lands in the
 * creator's Subscribers with where it came from.
 */
import { useState, type FormEvent } from "react"
import { subscribeToCreator } from "@/lib/website-builder/subscribe-client"

export function ComingSoonSignup({ creatorId }: { creatorId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [problem, setProblem] = useState("")

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get("email") ?? "")
    setState("sending")
    const result = await subscribeToCreator({ creatorId, email, placement: "password" })
    if (result.ok === false) {
      setProblem(result.error)
      setState("error")
      return
    }
    setState("done")
  }

  if (state === "done") {
    return (
      <p role="status" style={{ margin: "24px 0 0", fontSize: 15, lineHeight: 1.55, color: "#1a1a2e" }}>
        Thanks. You will get an email when it opens.
      </p>
    )
  }

  return (
    <form onSubmit={submit} style={{ margin: "24px 0 0", textAlign: "left" }}>
      <label htmlFor="coming-soon-email" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
        Email
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input
          id="coming-soon-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          required
          placeholder="Your email"
          style={{
            flex: "1 1 200px",
            minWidth: 0,
            height: 48,
            boxSizing: "border-box",
            padding: "0 14px",
            fontSize: 16,
            color: "#1a1a2e",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={state === "sending"}
          style={{
            flex: "0 0 auto",
            height: 48,
            padding: "0 20px",
            fontSize: 15,
            fontWeight: 600,
            color: "#ffffff",
            background: "#1a1a2e",
            border: 0,
            borderRadius: 12,
            cursor: state === "sending" ? "default" : "pointer",
            opacity: state === "sending" ? 0.6 : 1,
          }}
        >
          Notify me
        </button>
      </div>
      {state === "error" ? (
        <p role="alert" style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.5, color: "#b42318" }}>
          {problem}
        </p>
      ) : null}
    </form>
  )
}

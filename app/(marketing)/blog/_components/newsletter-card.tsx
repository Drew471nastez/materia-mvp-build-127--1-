"use client"

/**
 * NEW POSTS BY EMAIL. Posts to /api/newsletter (Storelib's own list, the
 * storelib_newsletter table the footer's box already fills) with source
 * "blog". Says "You're on the list" only when the server stored the
 * address; a refusal or a list that is not open yet shows the server's own
 * words, and the address stays in the field.
 *
 * `company` is a field people never see: a script that fills every field
 * fills it, and the server keeps nothing it sends.
 */
import { useState, type FormEvent } from "react"

export function NewsletterCard({ id = "blog-newsletter" }: { id?: string }) {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "done">("idle")
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim() || state === "sending") return
    const company = (e.currentTarget.elements.namedItem("company") as HTMLInputElement | null)?.value ?? ""
    setState("sending")
    setError(null)
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "blog", company }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        setError(typeof data?.error === "string" ? data.error : "That did not go through. Try again in a moment.")
        setState("idle")
        return
      }
      setState("done")
    } catch {
      setError("No connection. Try again in a moment.")
      setState("idle")
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-[#e5e7eb] bg-white p-5" data-blog-newsletter="">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">The Storelib blog</p>
      <h2 id={`${id}-title`} className="mt-2 text-[20px] font-semibold leading-[1.2] tracking-[-0.015em] text-[#1a1a2e]">
        New guides for creators, by email.
      </h2>
      {state === "done" ? (
        <p role="status" className="mt-4 text-[15px] leading-relaxed text-[#1a1a2e]">
          You&apos;re on the list. New posts will come to {email.trim()}.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4" noValidate={false}>
          <label htmlFor={`${id}-email`} className="sr-only">
            Email address
          </label>
          <input
            id={`${id}-email`}
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="h-12 w-full rounded-xl border border-[#d4d7dc] bg-white px-4 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#1a1a2e]"
          />
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor={`${id}-company`}>Company</label>
            <input id={`${id}-company`} name="company" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
          <button type="submit" disabled={state === "sending"} className="mt-2.5 h-12 w-full rounded-xl bg-[#16161a] text-[15px] font-semibold text-white transition-colors hover:bg-[#2c2c34] disabled:opacity-60">
            {state === "sending" ? "Subscribing…" : "Subscribe"}
          </button>
          {error ? (
            <p id={`${id}-error`} role="alert" className="mt-2.5 text-[13.5px] leading-snug text-[#b42318]">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  )
}

"use client"

import * as React from "react"

/**
 * The sign in, on the console's own surface. It posts to the same login the
 * blog admin has always used (app/api/admin/blog/auth), which sets the signed
 * admin cookie; the page then reloads and the server renders the console.
 */
export function AdminLogin() {
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/admin/blog/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        window.location.reload()
        return
      }
      /* "Not configured" is not "wrong password". */
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body.error === "string" ? body.error : "The admin is not configured.")
      } else {
        setError("That username and password do not match.")
      }
    } catch {
      setError("Could not reach the server.")
    }
    setBusy(false)
  }

  const field =
    "h-10 w-full rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[14px] text-[#ededf0] outline-none focus:border-[#8b5cf6]/70"

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0b0b0f] px-4 text-[#ededf0] [color-scheme:dark]" data-admin-login>
      <form onSubmit={submit} className="w-full max-w-[340px]">
        <p className="text-[15px] font-semibold">Storelib admin</p>
        <p className="mt-1 text-[13px] text-[#9b9ba6]">Sign in to run the platform.</p>
        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-[#9b9ba6]">Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" className={field} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-[#9b9ba6]">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={field} />
          </label>
          {error ? (
            <p className="text-[13px] text-[#f47067]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="h-10 w-full rounded-[8px] bg-[#ededf0] text-[14px] font-medium text-[#0b0b0f] transition-colors hover:bg-white disabled:opacity-60"
          >
            {busy ? "Checking…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  )
}

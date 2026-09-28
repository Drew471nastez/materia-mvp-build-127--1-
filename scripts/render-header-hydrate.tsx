/**
 * The real platform header, server rendered and then hydrated, for
 * scripts/check-header-hydrate.mjs.
 *
 * The HTML is made the way the server makes it: with no saved session,
 * because the server cannot see localStorage. Then the returning visitor's
 * saved session (lib/auth/auth-snapshot) is put where the browser has it,
 * and window.__go() hydrates the header over that HTML. Every recoverable
 * error React reports while it does (a hydration mismatch is one) is kept
 * in window.__recoverable.
 */
import React from "react"
import { renderToString } from "react-dom/server"
import { hydrateRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"

const w = window as any
const params = new URLSearchParams(location.hash.slice(1))
w.__nav = { path: params.get("path") || "/explore", subs: new Set<() => void>() }
w.__who = params.get("who") || "buyer"
w.__recoverable = []

const tree = (
  <LocaleProvider>
    <PlatformHeaderClient />
    <main className="min-h-[900px] bg-[#f8f9fa] p-6 text-[15px] text-neutral-500">A buyer page under the header.</main>
  </LocaleProvider>
)

try {
  localStorage.clear()
} catch {
  /* no storage */
}
const app = document.getElementById("app")!
app.innerHTML = renderToString(tree)
if (w.__who !== "first") {
  localStorage.setItem(
    "_sl_auth_v1",
    JSON.stringify({ signedIn: w.__who !== "guest", userId: w.__who === "guest" ? null : "u1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: w.__who === "seller" }),
  )
}
w.__go = () => hydrateRoot(app, tree, { onRecoverableError: (e: unknown) => w.__recoverable.push(String((e as Error)?.message ?? e)) })
w.__ready = true

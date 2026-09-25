import type { ReactNode } from "react"
import { NativeAuthGate } from "@/components/native-auth-gate"

/**
 * What a server page or layout renders when Supabase did not answer in time
 * (lib/auth/page-user.ts returned null, or readCurrentUser said
 * "indeterminate").
 *
 * Not /login: the session is very likely still in the cookie or on the
 * device. The gate reads it in the browser, writes it back through
 * /auth/sync-session and reloads, at most twice, and if that keeps failing it
 * says the connection dropped and offers a retry. Only a browser with no
 * session at all is sent to the login form.
 *
 * Inside the /app layout the layout's own gate is already holding the
 * screen, so its children (this included) are never mounted and there is only
 * ever one recovery running.
 */
export function SessionRecovery({ fallback }: { fallback?: ReactNode }) {
  return (
    <NativeAuthGate requireAuth loadingFallback={fallback}>
      {null}
    </NativeAuthGate>
  )
}

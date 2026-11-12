import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { mayBeSignedIn } from "@/lib/auth/session-hint"
import { AuthArrivalProvider } from "@/components/auth/auth-arrival"

/*
  Reads the request's cookies, so /login and /signup are drawn per request
  with the form in their first HTML (the address's own ?intent=sell and
  ?next= included) rather than prerendered as a spinner that the browser
  swaps for the form once its script has run. See ./auth-arrival.tsx.
*/
export async function AuthArrival({ children }: { children: ReactNode }) {
  const jar = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ")
  return <AuthArrivalProvider maybeSignedIn={mayBeSignedIn(jar)}>{children}</AuthArrivalProvider>
}

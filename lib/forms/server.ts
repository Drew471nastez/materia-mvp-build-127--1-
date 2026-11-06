import "server-only"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { routeUser, authUnavailableResponse } from "@/lib/auth/route-user"
export const NO_STORE = { "Cache-Control": "no-store" }
export const PUBLIC_HEADERS = {
  ...NO_STORE,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}
export async function formActor() {
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  if (who.kind !== "user")
    return NextResponse.json(
      { error: "Sign in to continue." },
      { status: 401, headers: NO_STORE },
    )
  return { user: who.user, db: await createClient() }
}
export function formError(
  error: unknown,
  status = 400,
  headers: Record<string, string> = NO_STORE,
) {
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "That could not be saved. Try again.",
    },
    { status, headers },
  )
}
export async function boundedJson(request: Request, max = 65_536) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error("The request could not be read.")
  const decoder = new TextDecoder()
  let size = 0,
    text = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) {
        await reader.cancel()
        throw new Error("This form is too large.")
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Invalid body")
    return parsed
  } catch {
    throw new Error("The request could not be read.")
  }
}

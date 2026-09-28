import "server-only"

import { createClient } from "@/lib/supabase/server"

/** Responses about a course are one person's own: never cached anywhere. */
export const PRIVATE = { "Cache-Control": "private, no-store" } as const

/** The signed in person's id, or null for a visitor (a preview needs no account). */
export async function sessionUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

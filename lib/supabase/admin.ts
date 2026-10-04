/**
 * ENFORCED, not requested.
 *
 * This module reads SUPABASE_SERVICE_ROLE_KEY — the key that bypasses every
 * RLS policy on the database. The comment below used to say "NEVER import
 * this in client components" and nothing checked, which is the kind of rule
 * that holds until the day somebody is in a hurry.
 *
 * `server-only` turns that sentence into a build error: a client component
 * that imports this, directly or through a re-export, fails to compile
 * instead of shipping.
 */
import "server-only"
import { mediaFetch, withMediaAddresses } from "@/lib/storage/media-url"

import { createClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase admin client.
 * Uses Service Role key to bypass RLS.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
  }

  return withMediaAddresses(createClient(url, serviceRoleKey, {
    /* Every row read carries Storelib's own file addresses (lib/storage/media-url.ts). */
    global: { fetch: mediaFetch },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }))
}

import "server-only"

import { createClient } from "@/lib/supabase/server"
import { viewerOf, type Viewer } from "./server"

/** The signed in person on this request, as a member (./server Viewer), or null. */
export async function requestViewer(): Promise<Viewer | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return viewerOf(user)
}

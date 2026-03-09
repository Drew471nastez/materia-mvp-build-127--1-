import { createClient } from "@/lib/supabase/client"
import { nativeLogout } from "@/lib/native-bridge"

export async function handleLogout(router: { replace: (url: string) => void }) {
  const supabase = createClient()
  await nativeLogout(supabase, router)
}

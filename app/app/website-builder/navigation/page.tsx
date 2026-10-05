import { redirect } from "next/navigation"

import { pageUser } from "@/lib/auth/page-user"
import { createClient } from "@/lib/supabase/server"

/**
 * /app/website-builder/navigation: AN ADDRESS, NOT A PAGE.
 *
 * Menus are edited where they are seen: in the builder, under Navigation
 * next to Pages, with the page drawn beside the links as they change. A page
 * of its own on the dashboard was a second place to look for the same thing,
 * so this address only opens the builder there (`?panel=navigation`, read by
 * the editor) on the live website, or the first one when none is live.
 */
export default async function NavigationAddress() {
  const user = await pageUser()
  if (!user) redirect("/login?next=/app/website-builder")

  const supabase = await createClient()
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) redirect("/app")

  const { data: installs } = await supabase
    .from("store_theme_installs")
    .select("id, status")
    .eq("creator_id", creator.id)
    .order("sort_order", { ascending: true })
  const list = (installs ?? []) as { id: string; status: string }[]
  const site = list.find((i) => i.status === "published") ?? list[0]
  redirect(site ? `/website-builder/editor/${site.id}?panel=navigation` : "/app/website-builder")
}

import { redirect } from "next/navigation"
import { websitePage } from "@/lib/team/website"

/**
 * /app/website-builder/themes was the theme marketplace as a page of its
 * own. The marketplace is a popup over the Website page now (./themes-client.tsx),
 * so this address opens that page with the popup up: ?themes=1, and a theme
 * a link named (?theme=slug) is kept and brought into view.
 *
 * The same check as the page it goes to, made here as well so a visitor who
 * may not see the store's websites is turned away before the hop.
 */
export default async function ThemeMarketplacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  /* The owner's own store, or the one a team member with Website works in (lib/team/website). */
  const access = await websitePage()
  if (access.kind === "closed") return null
  if (access.kind === "none") redirect("/app")

  const given = await searchParams
  const to = new URLSearchParams({ themes: "1" })
  const theme = Array.isArray(given.theme) ? given.theme[0] : given.theme
  if (theme && /^[a-z0-9-]{1,64}$/.test(theme)) to.set("theme", theme)
  redirect(`/app/website-builder?${to}`)
}

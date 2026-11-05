import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Review widgets") }
}

const WIDGETS_HOME = "/app/reviews?view=widgets"
const TOKEN = /^[a-z0-9_-]{1,64}$/i

/**
 * /app/reviews/widgets, kept for every link that names it (the theme editor's
 * widget control, Add to website coming back): the widgets gallery is the
 * Widgets view of Storelib Reviews' page, /app/reviews (round 27; it was the
 * integration's page under Integrations) (components/reviews/manage/
 * widgets-slot.tsx), so this sends there with the widget and the saved look
 * it named.
 */
export default async function ReviewWidgetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""
  const to = new URLSearchParams()
  for (const key of ["widget", "config"]) {
    const v = one(q[key])
    if (TOKEN.test(v)) to.set(key, v)
  }
  const rest = to.toString()
  redirect(rest ? `${WIDGETS_HOME}&${rest}` : WIDGETS_HOME)
}

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { listBusinesses } from "@/lib/businesses/server"
import { NewBusinessScreen } from "./new-business-screen"

/**
 * /onboarding/business: the start of a second business.
 *
 * One screen, then the onboarding every creator goes through, run for the new
 * business (/signup/success?action=become-creator&business=new). This page
 * only says what a second business is and makes it: the account, the link to
 * this login, and a session for it (app/api/businesses).
 *
 * A login that already has two, or a second business itself, is told so and
 * pointed back: the limit is the database's (business_links), and a second
 * business cannot start a third.
 */

export const metadata: Metadata = {
  title: { absolute: "New business | Storelib" },
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function NewBusinessPage() {
  const { user, state } = await currentUserForRequest()
  if (!user && state === "anonymous") redirect("/login")

  const businesses = user ? await listBusinesses(user.id).catch(() => []) : []
  const current = businesses.find((b) => b.current) ?? null
  const full = businesses.length >= 2
  const isSecond = current?.role === "member"

  return (
    <NewBusinessScreen
      currentName={current?.name ?? null}
      blocked={full || isSecond ? (isSecond ? "second" : "full") : null}
    />
  )
}

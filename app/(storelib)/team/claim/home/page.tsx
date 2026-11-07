import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { pageUser } from "@/lib/auth/page-user"
import { SessionRecovery } from "@/components/auth/session-recovery"
import { JOIN_BTN_QUIET } from "@/components/team/join-actions"
import { Frame, StoreCard } from "@/components/team/join-card"
import { OpenBusiness } from "@/components/handoff/claim-actions"
import { HANDED_HOME, handedBusinessOf } from "@/lib/handoff/home"

/**
 * Where a login with no store of its own goes when it took a business over
 * (lib/handoff/home): straight into that business, the way the account menu
 * switches (OpenBusiness opens it at once, on the web and in the apps), with
 * the button still there if the switch needs a second press. A login with
 * nothing handed to it goes to Discover, as it always did. Signed in is
 * asked through pageUser, so a slow answer from Supabase is never a sign out.
 */
export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Opening your business", robots: { index: false, follow: false } }

export default async function HandedHomePage() {
  const user = await pageUser(`/login?next=${encodeURIComponent(HANDED_HOME)}`)
  if (!user) return <SessionRecovery />
  const handed = await handedBusinessOf(user.id)
  if (!handed) redirect("/explore")
  return (
    <Frame>
      <StoreCard store={{ id: "", name: handed.name, avatarUrl: handed.avatarUrl }} eyebrow="Your business" title={`Opening ${handed.name}`}>
        <OpenBusiness userId={handed.userId} name={handed.name} auto />
        <div className="mt-2">
          <Link href="/explore" className={JOIN_BTN_QUIET}>Go to Discover</Link>
        </div>
      </StoreCard>
    </Frame>
  )
}

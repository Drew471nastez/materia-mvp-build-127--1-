"use client"

/**
 * ===========================================================================
 *  WORKING IN SOMEBODY ELSE'S STORE
 * ===========================================================================
 * A thin bar over the dashboard while a team member works in a store they
 * were invited to: whose store, as what, and the way back to their own
 * account. Under it, a page their role does not have is said instead of
 * drawn (TeamAreaClosed). That is how it reads; what keeps the store's data
 * to the right people is the server (lib/team/server creatorFor), which a
 * page that is not the member's to see never reaches.
 */
import * as React from "react"
import { usePathname } from "next/navigation"
import { ROLE_LABEL, areaOfPath, memberCan, type MemberRole } from "@/lib/team/roles"
import { TeamAreaClosed } from "./team-area-closed"

export function TeamBar({ store, role, ownStore = true, children }: { store: string; role: MemberRole; ownStore?: boolean; children: React.ReactNode }) {
  const pathname = usePathname() || "/app"
  const [leaving, setLeaving] = React.useState(false)
  const area = areaOfPath(pathname)
  const allowed = area === null || memberCan(role, area)
  const back = async () => {
    setLeaving(true)
    await fetch("/api/team/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ store: null }) }).catch(() => null)
    window.location.href = "/app"
  }
  return (
    <>
      <div role="status" className="flex items-center justify-center gap-3 bg-[#1a1a2e] px-4 py-2 text-[13px] leading-5 text-white">
        <span className="truncate">
          Working in <strong className="font-semibold">{store}</strong> as {ROLE_LABEL[role]}
        </span>
        {/* Someone with no store of their own has no account dashboard to go back to. */}
        {ownStore ? (
          <button type="button" onClick={back} disabled={leaving} className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 font-medium hover:bg-white/20 disabled:opacity-60">
            {leaving ? "Going back" : "Back to my account"}
          </button>
        ) : null}
      </div>
      {allowed ? children : <TeamAreaClosed area={area ?? "store"} store={store} role={role} />}
    </>
  )
}

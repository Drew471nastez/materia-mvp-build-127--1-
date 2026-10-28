"use client"

/**
 * ===========================================================================
 *  WORKING IN SOMEBODY ELSE'S STORE
 * ===========================================================================
 * A thin bar over the dashboard while a team member works in a store they
 * were invited to: whose store, as what, and the way back to their own
 * account. Under it, a page their permissions do not open is said instead
 * of drawn (TeamAreaClosed). That is how it reads; what keeps the store's data
 * to the right people is the server (lib/team/server creatorFor), which a
 * page that is not the member's to see never reaches.
 */
import * as React from "react"
import { usePathname } from "next/navigation"
import { areaOfPath, permits, type TeamPermission } from "@/lib/team/permissions"
import { TeamAreaClosed } from "./team-area-closed"
import { tt } from "@/lib/i18n/text"

/** A sentence with {store} left in it, the name drawn in bold where it stands. */
function WithStore({ sentence, store }: { sentence: string; store: string }) {
  const [before, after = ""] = sentence.split("{store}")
  return (
    <>
      {before}
      <strong className="font-semibold">{store}</strong>
      {after}
    </>
  )
}

/** `ownHome`: where Back to my account opens (lib/team/landing ownAccountHref): their dashboard, or their own setup with the way back here. */
export function TeamBar({ store, permissions, ownStore = true, ownHome = "/app", children }: { store: string; permissions: TeamPermission[]; ownStore?: boolean; ownHome?: string; children: React.ReactNode }) {
  const pathname = usePathname() || "/app"
  const [leaving, setLeaving] = React.useState(false)
  const area = areaOfPath(pathname)
  const allowed = area === null || permits(permissions, area)
  /* Just joined from an invite (app/api/team/join adds ?joined=1): said once in the bar, then the address is tidied. */
  const [joined, setJoined] = React.useState(false)
  React.useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get("joined") !== "1") return
    setJoined(true)
    url.searchParams.delete("joined")
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    const t = window.setTimeout(() => setJoined(false), 6000)
    return () => window.clearTimeout(t)
  }, [])
  const back = async () => {
    setLeaving(true)
    await fetch("/api/team/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ store: null }) }).catch(() => null)
    window.location.href = ownHome
  }
  return (
    <>
      <div role="status" className="flex items-center justify-center gap-3 bg-[#1a1a2e] px-4 py-2 text-[13px] leading-5 text-white">
        <span className="min-w-0 truncate">
          {/* One sentence per language, with the store's name in bold wherever that language puts it. */}
          <WithStore sentence={joined ? tt("You joined {store}. Welcome to the team.") : tt("Working in {store}")} store={store} />
        </span>
        {/* Someone with no store of their own has no account dashboard to go back to. */}
        {ownStore ? (
          <button type="button" onClick={back} disabled={leaving} className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 font-medium hover:bg-white/20 disabled:opacity-60">
            {leaving ? tt("Going back") : <><span className="sm:hidden">{tt("My account")}</span><span className="hidden sm:inline">{tt("Back to my account")}</span></>}
          </button>
        ) : null}
      </div>
      {allowed ? children : <TeamAreaClosed area={area ?? "store"} store={store} permissions={permissions} />}
    </>
  )
}

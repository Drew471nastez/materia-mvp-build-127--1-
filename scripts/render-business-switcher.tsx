/**
 * The account menu's business switcher (components/app/business-switcher) in
 * both of its sizes, for scripts/check-business-switcher.mjs.
 * Fixture businesses: the one you are in, a second still being set up, and a
 * third that is ready. One, two and three of them: a login can have three
 * (lib/businesses/rules MAX_BUSINESSES), so two still offers New business and
 * three does not.
 *
 * `?view=setup` is the other side of New business: the screen /signup/success
 * opens on (NewBusinessScreen), which window.__leave() fades out as the
 * setup's first step would.
 */
import React, { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { BusinessSwitcher, type BusinessRow } from "@/components/app/business-switcher"
import { NewBusinessScreen } from "@/components/app/business-switch-screen"

const THREE: BusinessRow[] = [
  { userId: "00000000-0000-4000-8000-00000000000a", name: "AndrewRullz", handle: "andrewrullz", avatarUrl: null, ready: true, current: true, role: "owner" },
  { userId: "00000000-0000-4000-8000-00000000000b", name: "Loudlib", handle: "loudlib", avatarUrl: null, ready: false, current: false, role: "member" },
  { userId: "00000000-0000-4000-8000-00000000000c", name: "Lind Studio", handle: "lindstudio", avatarUrl: null, ready: true, current: false, role: "member" },
]
const TWO: BusinessRow[] = THREE.slice(0, 2)
const ONE: BusinessRow[] = [THREE[0]]
/* Signed in to a business that is not the first: "when I switch to Calvin, my other business, there is no plus icon there." */
const asMember = (rows: BusinessRow[]): BusinessRow[] => rows.map((b) => ({ ...b, current: b.userId === "00000000-0000-4000-8000-00000000000c" }))
const FIXTURES = { one: ONE, two: TWO, three: THREE, "member-three": asMember(THREE), "member-two": asMember([THREE[0], THREE[2]]) } as const
const NAMES = ["three", "two", "one", "member-three", "member-two"] as const

function Menus() {
  return (
    <div style={{ display: "flex", gap: 24, padding: 24, background: "#f3f4f6", minHeight: "100vh", alignItems: "flex-start", flexWrap: "wrap" }}>
      {NAMES.map((n) => (
        <div key={`d-${n}`} data-probe={`dropdown-${n}`} className="w-[248px] rounded-xl border border-neutral-200/70 bg-white p-1 shadow-xl shadow-black/10">
          <BusinessSwitcher businesses={FIXTURES[n]} variant="dropdown" onNavigate={() => {}} />
        </div>
      ))}
      {NAMES.map((n) => (
        <div key={`s-${n}`} data-probe={`sheet-${n}`} className="w-[390px] rounded-t-2xl bg-white px-3 pb-3 pt-3">
          <BusinessSwitcher businesses={FIXTURES[n]} variant="sheet" onNavigate={() => {}} />
        </div>
      ))}
    </div>
  )
}

function Setup() {
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    ;(window as unknown as { __leave: () => void }).__leave = () => setLeaving(true)
  }, [])
  return <NewBusinessScreen leaving={leaving} />
}

const view = new URLSearchParams(location.search).get("view")
createRoot(document.getElementById("app")!).render(view === "setup" ? <Setup /> : <Menus />)

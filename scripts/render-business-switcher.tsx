/**
 * The account menu's business switcher (components/app/business-switcher) in
 * both of its sizes, and the screen that starts a second business
 * (app/(auth)/onboarding/business), for scripts/check-business-switcher.mjs.
 * Fixture businesses: the one you are in, a second still being set up.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BusinessSwitcher, type BusinessRow } from "@/components/app/business-switcher"
import { NewBusinessScreen } from "@/app/(auth)/onboarding/business/new-business-screen"

const TWO: BusinessRow[] = [
  { userId: "00000000-0000-4000-8000-00000000000a", name: "AndrewRullz", handle: "andrewrullz", avatarUrl: null, ready: true, current: true, role: "owner" },
  { userId: "00000000-0000-4000-8000-00000000000b", name: "Loudlib", handle: "loudlib", avatarUrl: null, ready: false, current: false, role: "member" },
]
const ONE: BusinessRow[] = [TWO[0]]
const view = new URLSearchParams(location.search).get("view") || "menus"

function Menus() {
  return (
    <div style={{ display: "flex", gap: 24, padding: 24, background: "#f3f4f6", minHeight: "100vh", alignItems: "flex-start", flexWrap: "wrap" }}>
      <div data-probe="dropdown-two" className="w-[248px] rounded-xl border border-neutral-200/70 bg-white p-1 shadow-xl shadow-black/10">
        <BusinessSwitcher businesses={TWO} variant="dropdown" onNavigate={() => {}} />
      </div>
      <div data-probe="dropdown-one" className="w-[248px] rounded-xl border border-neutral-200/70 bg-white p-1 shadow-xl shadow-black/10">
        <BusinessSwitcher businesses={ONE} variant="dropdown" onNavigate={() => {}} />
      </div>
      <div data-probe="sheet-two" className="w-[390px] rounded-t-2xl bg-white px-3 pb-3 pt-3">
        <BusinessSwitcher businesses={TWO} variant="sheet" onNavigate={() => {}} />
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  view === "new" ? <NewBusinessScreen currentName="AndrewRullz" blocked={null} /> : view === "full" ? <NewBusinessScreen currentName="AndrewRullz" blocked="full" /> : <Menus />,
)

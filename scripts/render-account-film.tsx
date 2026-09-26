/**
 * The black bar's account button, for scripts/check-account-film.mjs.
 *
 *   /        the real /app shell (scripts/render-business-switch-tree OldTree:
 *            the real AppSidebar, its phone account sheet and its desktop
 *            dropdown), whose account buttons wear the film
 *            (components/app/account-film)
 *   /before  the phone and desktop account buttons as they were before the
 *            film, their grey a background colour on the button, drawn on
 *            the same bars, so the probe can say what changed on the glass
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { ChevronDown } from "lucide-react"
import { OldTree } from "./render-business-switch-tree"

function Before() {
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [deskOpen, setDeskOpen] = useState(false)
  /* The class strings as they were, to the letter (git show HEAD~1:components/app/mobile-account-menu.tsx and sidebar.tsx). */
  const phone = `flex items-center gap-2 w-fit justify-start rounded-xl px-2 py-1.5 transition-colors duration-200 ease-out ${phoneOpen ? "bg-white/15" : "hover:bg-white/10"}`
  const desk = `flex items-center gap-2.5 rounded-full px-2.5 py-1.5 transition-[background-color] duration-200 ease-out ${deskOpen ? "bg-[#2e2e34]" : "hover:bg-[#26262b]"}`
  return (
    <div className="min-h-svh bg-white">
      <div className="flex h-[68px] items-center bg-[#111111] px-4 py-[10px] md:hidden">
        <button id="account-trigger" data-open={phoneOpen ? "" : undefined} onClick={() => setPhoneOpen((v) => !v)} className={phone}>
          <span className="inline-block h-6 w-6 rounded-full bg-[#b5452a] ring-1 ring-white/20" />
          <span className="max-w-[120px] truncate text-[13px] font-medium text-white/90">Mara Lind</span>
          <ChevronDown className="h-3.5 w-3.5 text-white/50" />
        </button>
      </div>
      <header data-shell-chrome="" className="hidden md:block">
        <div className="flex h-[58px] items-center bg-[#131316] px-5">
          <button data-open={deskOpen ? "" : undefined} onClick={() => setDeskOpen((v) => !v)} className={desk}>
            <span className="inline-block h-7 w-7 rounded-full bg-[#b5452a] ring-1 ring-white/20" />
            <span className="max-w-[140px] truncate text-[13px] font-medium text-white/90">Mara Lind</span>
            <ChevronDown className="h-3.5 w-3.5 text-white/50" />
          </button>
        </div>
      </header>
      {/* What the sheet and the dropdown do to the page as they open: a click anywhere else closes. */}
      <div data-close="" className="h-[600px]" onClick={() => { setPhoneOpen(false); setDeskOpen(false) }} />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(location.pathname === "/before" ? <Before /> : <OldTree />)

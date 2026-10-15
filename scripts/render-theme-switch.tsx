/**
 * The light and dark switch where people press it, for
 * scripts/check-theme-switch.mjs: the real account sheet on a phone
 * (AccountSheet, open), the real account menu on a computer
 * (DesktopAccountMenu, opened by the probe) and the sun and moon of a
 * community's bar (AppearanceButton), over a page of cards so the fade
 * between the two looks has something to fade. `window.__mode` picks one.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { AccountSheet, DesktopAccountMenu, type HeaderLink } from "@/components/platform/platform-header-client"
import { AppearanceButton } from "@/components/platform/appearance-switch"
import { paintAppearance } from "@/lib/appearance/client"

try {
  localStorage.clear()
} catch {
  /* no storage: light, from nothing */
}
paintAppearance(location.pathname, null)

const mode = (window as unknown as { __mode?: string }).__mode ?? "sheet"
const link: HeaderLink = (path) => ({ href: path, onClick: (e) => e.preventDefault() })
const noop = () => {}

function Page() {
  return (
    <div className="min-h-svh bg-[#f8f9fa]">
      <header className="flex h-16 items-center justify-end gap-2 border-b border-[#e5e7eb]/60 bg-white px-4">
        {mode === "button" ? <AppearanceButton /> : null}
        {mode === "menu" ? <DesktopAccountMenu name="Sam Rivera" username="sam" seller link={link} onLanguage={noop} onLogout={noop} /> : null}
      </header>
      <main className="mx-auto grid max-w-[1200px] gap-4 px-4 py-6">
        {Array.from({ length: 6 }, (_, k) => (
          <div key={k} className="h-28 rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
        ))}
      </main>
      {mode === "sheet" ? <AccountSheet open onClose={noop} name="Sam Rivera" username="sam" seller link={link} onLanguage={noop} onLogout={noop} /> : null}
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Page />
  </LocaleProvider>,
)

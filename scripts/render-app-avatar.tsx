/**
 * AppAvatar the way the shell draws it: the header's 24 and 28px avatars on
 * the dark bar, the account sheet's and sidebar's 40px on white, and
 * Settings' 64/72px, each with a photo the probe's server holds back for
 * `?delay=` ms. `#remount` draws them a second time, the way coming back to
 * a page does; `?fail` points them at a picture that does not exist, and
 * `?none` gives them none.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { AppAvatar } from "@/components/app/app-avatar"

const q = new URLSearchParams(location.search)
const src = q.has("none") ? null : q.has("fail") ? "/missing.png" : `/avatar.png?delay=${q.get("delay") ?? "400"}`

function Set_() {
  return (
    <>
      <div data-surface="dark" style={{ display: "flex", gap: 16, alignItems: "center", padding: 16, background: "#131316" }}>
        <AppAvatar src={src} name="Mara Lind" size={24} tone="dark" className="ring-1 ring-white/20" />
        <AppAvatar src={src} name="Mara Lind" size={28} tone="dark" className="ring-1 ring-white/20" />
      </div>
      <div data-surface="light" style={{ display: "flex", gap: 16, alignItems: "center", padding: 16, background: "#fff" }}>
        <AppAvatar src={src} name="Mara Lind" size={40} className="ring-1 ring-neutral-200" />
        <AppAvatar src={src} name="Mara Lind" size={40} />
        <AppAvatar src={src} name="Mara Lind" size={72} sizedByClass className="h-16 w-16 sm:h-[72px] sm:w-[72px]" />
        <AppAvatar src={src} name="Mara Lind" size={32} />
      </div>
    </>
  )
}

function Harness() {
  const [round, setRound] = React.useState(1)
  React.useEffect(() => {
    ;(window as unknown as { __remount: () => void }).__remount = () => setRound((r) => r + 1)
  }, [])
  return <Set_ key={round} />
}

createRoot(document.getElementById("app")!).render(<Harness />)

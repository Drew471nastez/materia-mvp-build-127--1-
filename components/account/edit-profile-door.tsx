"use client"

/**
 * Edit profile on /account: on a phone a subpage over the profile, on a
 * computer (768px and wider) Settings' Profile tab, where the photo and the
 * cover are too. The name, handle and bio are already on the page, so
 * opening it does not wait on another document.
 *
 * The sheet is portaled to document.body. It used to render inside the
 * cover's sticky row, and that row (plus main's overflow-x-clip) is the
 * containing block for position:fixed. The panel then only covered the
 * button, the fields spilled out over the avatar and the name, and on a
 * wide screen the 480px drawer cut through the centred photo. A body portal
 * is the viewport, above the header and the tab bar, solid white.
 */
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { secondaryDepth } from "@/components/ui/depth-button"
import { createClient } from "@/lib/supabase/client"
import { normalizeHandle } from "@/lib/profile/username-rules"
import { readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { cn } from "@/lib/utils"

/** Settings, opened on its Profile tab. */
const SETTINGS_PROFILE = "/account/settings?section=profile"

export function EditProfileDoor({
  userId,
  name: initialName,
  username: initialUsername,
  bio: initialBio,
  usernameEditable,
}: {
  userId: string
  name: string
  username: string | null
  bio: string | null
  usernameEditable: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)
  const [name, setName] = useState(initialName)
  const [handle, setHandle] = useState(initialUsername || "")
  const [bio, setBio] = useState(initialBio || "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => setShown(true))
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      cancelAnimationFrame(id)
      document.body.style.overflow = prev
    }
  }, [open])

  const close = () => {
    setShown(false)
    window.setTimeout(() => setOpen(false), 280)
  }

  const save = async () => {
    const nextName = name.trim()
    if (!nextName || busy) return
    setBusy(true)
    setError(null)
    try {
      const nextHandle = normalizeHandle(handle)
      if (usernameEditable && nextHandle && nextHandle !== normalizeHandle(initialUsername || "")) {
        const res = await fetch("/api/profile/username", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: nextHandle }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          setError(data.error || "That username is taken.")
          return
        }
      }
      const { error: updateError } = await createClient().from("profiles").update({ display_name: nextName, bio: bio.trim() || null }).eq("id", userId)
      if (updateError && /bio/i.test(updateError.message)) {
        const again = await createClient().from("profiles").update({ display_name: nextName }).eq("id", userId)
        if (again.error) throw again.error
      } else if (updateError) throw updateError
      const snap = readAuthSnapshot()
      if (snap?.signedIn) writeAuthSnapshot({ ...snap, displayName: nextName, username: usernameEditable ? normalizeHandle(handle) || snap.username : snap.username })
      close()
    } catch {
      setError("That did not save. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onPointerEnter={() => router.prefetch(SETTINGS_PROFILE)}
        onClick={() => {
          /* On a computer, Settings' Profile tab: the photo, the cover and every field, in one place (round 15). */
          if (window.matchMedia?.("(min-width: 768px)").matches) {
            router.push(SETTINGS_PROFILE)
            return
          }
          setName(initialName)
          setHandle(initialUsername || "")
          setBio(initialBio || "")
          setError(null)
          setOpen(true)
        }}
        aria-label="Edit profile"
        data-profile-edit=""
        className={cn(secondaryDepth, "pointer-events-auto h-10 rounded-[10px] px-4 text-[14px]")}
      >
        <span className="min-[390px]:hidden">Edit</span>
        <span className="hidden min-[390px]:inline">Edit profile</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] bg-white transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              data-edit-profile-sheet=""
              role="dialog"
              aria-modal="true"
              aria-label="Edit profile"
              style={{ transform: shown ? "translateX(0)" : "translateX(100%)" }}
            >
              <div className="mx-auto flex h-full w-full max-w-[480px] flex-col" style={{ paddingTop: "env(safe-area-inset-top)" }}>
                <div className="flex h-14 shrink-0 items-center gap-2 px-3">
                  <button type="button" onClick={close} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-xl text-[#1a1a2e]">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-[17px] font-semibold text-[#1a1a2e]">Edit profile</h2>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-6">
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-medium text-[#4b5563]">Name</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-12 w-full rounded-xl bg-[#f4f4f5] px-4 text-[16px] outline-none" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-medium text-[#4b5563]">Username</span>
                    <input
                      value={handle}
                      onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      disabled={!usernameEditable}
                      maxLength={30}
                      className="h-12 w-full rounded-xl bg-[#f4f4f5] px-4 text-[16px] outline-none disabled:text-[#6b7280]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-medium text-[#4b5563]">Bio</span>
                    <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 160))} rows={3} className="w-full resize-none rounded-xl bg-[#f4f4f5] px-4 py-3 text-[16px] outline-none" />
                  </label>
                  {error ? <p role="alert" className="text-[13px] text-red-600">{error}</p> : null}
                </div>
                <div className="shrink-0 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
                  <button type="button" onClick={() => void save()} disabled={busy || !name.trim()} className="h-12 w-full rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white disabled:opacity-50">
                    {busy ? "Saving" : "Save"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

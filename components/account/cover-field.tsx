"use client"

/**
 * THE COVER ON YOUR PROFILE, IN SETTINGS.
 *
 * The band behind your photo, the way a creator's page has one. The box is
 * the creator editor's own upload control (components/app/image-upload.tsx,
 * bucket `covers`, 3:1): the same resizing, the same server check of the
 * bytes, the same live preview while it goes up. A picture that has landed
 * is saved at once (PATCH /api/profile/cover), and Remove takes it off; the
 * profile is refreshed so the band behind your photo changes with it.
 */
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ImageUpload } from "@/components/app/image-upload"

async function saveCover(coverUrl: string | null): Promise<void> {
  let res: Response
  try {
    res = await fetch("/api/profile/cover", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coverUrl }) })
  } catch {
    throw new Error("Could not reach Storelib. Check your connection and try again.")
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error((data && typeof data.error === "string" && data.error !== "not_set_up" && data.error) || "That did not save. Try again.")
  }
}

export function CoverField({ initial, labelClass, helpClass }: { initial: string | null; labelClass: string; helpClass: string }) {
  const router = useRouter()
  const [cover, setCover] = useState<string | null>(initial)
  const [error, setError] = useState<string | null>(null)

  const change = async (url: string | null) => {
    const before = cover
    setCover(url)
    setError(null)
    try {
      await saveCover(url)
      router.refresh()
    } catch (e) {
      setCover(before)
      setError(e instanceof Error ? e.message : "That did not save. Try again.")
    }
  }

  return (
    <div id="cover" className="scroll-mt-24" data-account-cover-field="">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className={labelClass}>Cover</span>
        <span className="text-[12px] text-[#6b7280]">Wide, about 3:1</span>
      </div>
      <ImageUpload bucket="covers" aspectRatio="cover" value={cover || undefined} onChange={(url) => void change(url || null)} replaceOnly allowRemove livePreview replaceLabel="Change cover" />
      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] leading-[1.45] text-[#b42318]" data-account-cover-error="">
          {error}
        </p>
      ) : (
        <span className={helpClass}>Shown behind your photo on your profile.</span>
      )}
    </div>
  )
}

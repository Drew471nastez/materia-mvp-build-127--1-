"use client"

/**
 * THE COVER ON YOUR PROFILE, IN SETTINGS.
 *
 * The band behind your photo, the way a creator's page has one, and the
 * creator page editor's own cover control (components/app/image-upload.tsx
 * with `reposition`, as components/storefront/edit-profile-button.tsx uses
 * it): the same resizing, the same server check of the bytes, the same live
 * preview sharpening as it goes up, and the frame that shows the cover is
 * the frame you place it in. One finger drags it, two pinch it closer
 * (ctrl and the wheel on a computer), the arrow keys nudge it, Reset puts
 * it back in the middle.
 *
 * THE FRAME IS THE BAND'S SHAPE. The profile's band runs edge to edge at a
 * fixed height (lib/profile/cover.ts profileBandAspect), so on a phone it is
 * near 3:1 and on a laptop past 5:1. The frame here takes the shape the
 * band has on this screen, so what you place is what your profile shows.
 *
 * SAVED AS IT IS DONE, LIKE THE PICTURE. A new picture is saved the moment
 * it has landed (centred, at its own size). A move is saved when the finger
 * lifts (the frame reports once per gesture), a burst of nudges once they
 * stop. The crop rides on the stored address (lib/profile/cover.ts), so
 * there is no column to add. The profile is refreshed after each save, so
 * the band behind your photo matches when you go back to it.
 */
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ImageUpload } from "@/components/app/image-upload"
import { DEFAULT_COVER_CROP, isDefaultCrop, type CoverCrop } from "@/lib/images/cover-crop"
import { parseProfileCover, profileBandAspect } from "@/lib/profile/cover"

type Change = { coverUrl?: string | null; crop?: CoverCrop }

async function saveCover(change: Change): Promise<void> {
  let res: Response
  try {
    res = await fetch("/api/profile/cover", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) })
  } catch {
    throw new Error("Could not reach Storelib. Check your connection and try again.")
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error((data && typeof data.error === "string" && data.error !== "not_set_up" && data.error) || "That did not save. Try again.")
  }
}

/* A layout effect in the browser, so the frame has the band's shape in its first paint. */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect

/** The shape of the profile's band on this screen, kept as the window changes. */
function useBandAspect(): number {
  const [aspect, setAspect] = useState(3)
  useBeforePaint(() => {
    const measure = () => setAspect(profileBandAspect(document.documentElement.clientWidth || window.innerWidth))
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])
  return aspect
}

/** How long after the last nudge a crop is saved. A drag reports once, on release, so it barely waits. */
const CROP_SAVE_MS = 450

export function CoverField({ initial, labelClass, helpClass }: { initial: string | null; labelClass: string; helpClass: string }) {
  const router = useRouter()
  const start = useMemo(() => parseProfileCover(initial), [initial])
  const [cover, setCover] = useState<string | null>(start.url)
  const [crop, setCrop] = useState<CoverCrop>(start.crop)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const aspect = useBandAspect()
  /* The crop the server has, to put back if a save fails. */
  const savedCrop = useRef<CoverCrop>(start.crop)
  const cropTimer = useRef<number | null>(null)
  const savedTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (cropTimer.current) window.clearTimeout(cropTimer.current)
      if (savedTimer.current) window.clearTimeout(savedTimer.current)
    },
    [],
  )

  const done = useCallback(() => {
    router.refresh()
    setSaved(true)
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setSaved(false), 1800)
  }, [router])

  const changePicture = useCallback(
    async (url: string | null) => {
      const before = { cover, crop }
      if (cropTimer.current) window.clearTimeout(cropTimer.current)
      setCover(url)
      /* A new picture starts from the middle, at its own size, as the creator editor's does. */
      setCrop(DEFAULT_COVER_CROP)
      setError(null)
      try {
        await saveCover(url ? { coverUrl: url, crop: DEFAULT_COVER_CROP } : { coverUrl: null })
        savedCrop.current = DEFAULT_COVER_CROP
        done()
      } catch (e) {
        setCover(before.cover)
        setCrop(before.crop)
        setError(e instanceof Error ? e.message : "That did not save. Try again.")
      }
    },
    [cover, crop, done],
  )

  const changeCrop = useCallback(
    (next: CoverCrop) => {
      setCrop(next)
      setError(null)
      if (cropTimer.current) window.clearTimeout(cropTimer.current)
      cropTimer.current = window.setTimeout(async () => {
        cropTimer.current = null
        try {
          await saveCover({ crop: next })
          savedCrop.current = next
          done()
        } catch (e) {
          setCrop(savedCrop.current)
          setError(e instanceof Error ? e.message : "That did not save. Try again.")
        }
      }, CROP_SAVE_MS)
    },
    [done],
  )

  const reposition = useMemo(() => ({ value: crop, onChange: changeCrop, aspect, editable: !!cover }), [crop, changeCrop, aspect, cover])

  return (
    <div id="cover" className="scroll-mt-24" data-account-cover-field="" data-cover-crop={isDefaultCrop(crop) ? "default" : `${crop.x},${crop.y},${crop.zoom}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className={labelClass}>Cover</span>
        {/* What the frame does, said once, as the creator editor says it (no pill over the picture). */}
        {cover ? (
          <span className="text-right text-[12px] text-[#6b7280]" data-account-cover-hint="">
            <span className="pointer-fine:hidden">Drag to move, pinch to zoom</span>
            <span className="hidden pointer-fine:inline">Drag to move, pinch or ctrl + scroll to zoom</span>
          </span>
        ) : null}
      </div>
      <ImageUpload
        bucket="covers"
        aspectRatio="cover"
        value={cover || undefined}
        onChange={(url) => void changePicture(url || null)}
        replaceOnly
        allowRemove
        livePreview
        maxSizeMB={15}
        replaceLabel="Change cover"
        reposition={reposition}
        emptyBand={{ label: "Add a cover", hint: "JPG, PNG or WebP. Or drop one here." }}
      />
      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] leading-[1.45] text-[#b42318]" data-account-cover-error="">
          {error}
        </p>
      ) : (
        <span className={helpClass} aria-live="polite">
          {saved ? "Saved. Your profile shows it like this." : "Shown behind your photo on your profile."}
        </span>
      )}
    </div>
  )
}

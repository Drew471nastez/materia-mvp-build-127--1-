/**
 * ===========================================================================
 *  THE CREATOR PAGE'S COVER AND ITS PROFILE SHEET, FOR A BROWSER TO MEASURE
 * ===========================================================================
 * Served by scripts/check-cover-crop.mjs. Two pages, chosen by `#profile` or
 * `#crop` in the address:
 *
 *   #profile  the real UnifiedShopHeader with the real owner controls
 *             (EditProfileButton) in its slot, and a cover like the one in
 *             the report: black, with the Storelib mark in the middle. The
 *             driver opens "Profile details" and reads the band, the sheet,
 *             its corners and what shows above it.
 *
 *   #crop     the same band, drawn from a crop held in state, beside the
 *             profile sheet's own shell (EditorSheet) holding the cover's
 *             real frame (ImageUpload with `reposition`, editable, exactly as
 *             edit-profile-button passes it). The driver pinches and drags
 *             the frame with real touches and reads whether the picture ever
 *             uncovers the frame, whether the band then draws the same crop,
 *             and how often React rendered while a finger was down.
 *
 * Beside each real band is a REFERENCE band in the markup the renderer had
 * before zoom existed (`absolute inset-0 h-full w-full object-cover` at the
 * focal point), so "a cover saved before today looks exactly as it did" is
 * a pixel comparison, not a claim.
 *
 * The pictures are drawn on a canvas here, so nothing is fetched and every
 * pixel of them is known: a saturated colour field with no grey in it, so a
 * grey pixel inside the frame can only be the frame's own empty background.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { UnifiedShopHeader } from "@/components/store-builder/unified-section-renderer"
import { EditProfileButton } from "@/components/storefront/edit-profile-button"
import { EditorSheet } from "@/components/storefront/editor-sheet"
import { ImageUpload } from "@/components/app/image-upload"
import { useCoverAspect } from "@/components/storefront/use-cover-aspect"
import { defaultGlobalStoreSettings, defaultShopHeaderSettings } from "@/lib/store-builder/defaults"
import { DEFAULT_COVER_CROP, type CoverCrop } from "@/lib/images/cover-crop"

declare global {
  interface Window {
    __renders: number
    __crop: CoverCrop
    __ready: boolean
    __logo?: string
  }
}
window.__renders = 0
window.__crop = DEFAULT_COVER_CROP
window.__ready = false

/** 1600 by 1200 of full-saturation hue: nothing in it is near grey. */
function colourField(): string {
  const c = document.createElement("canvas")
  c.width = 1600
  c.height = 1200
  const g = c.getContext("2d")!
  for (let x = 0; x < 1600; x += 8) {
    for (let y = 0; y < 1200; y += 8) {
      g.fillStyle = `hsl(${(x / 1600) * 300}, 100%, ${30 + (y / 1200) * 30}%)`
      g.fillRect(x, y, 8, 8)
    }
  }
  return c.toDataURL("image/png")
}

/** The report's cover: a black 3:1 banner with the Storelib mark in the middle. */
function brandCover(logo: HTMLImageElement | null): string {
  const c = document.createElement("canvas")
  c.width = 1500
  c.height = 500
  const g = c.getContext("2d")!
  g.fillStyle = "#000"
  g.fillRect(0, 0, 1500, 500)
  const s = 220
  if (logo) g.drawImage(logo, 750 - s / 2, 250 - s / 2, s, s)
  else {
    g.fillStyle = "#835eff"
    g.fillRect(750 - s / 2, 250 - s / 2, s, s)
  }
  return c.toDataURL("image/png")
}

const creator = { id: "c1", slug: "andrewrullz", niche_tags: [], show_total_sales_badge: false } as never
const profile = { id: "p1", username: "andrewrullz", display_name: "AndrewRullz", avatar_url: null } as never

/** The old markup, verbatim, for the pixel comparison. */
function ReferenceBand({ src, focal, heightClass }: { src: string; focal: { x: number; y: number }; heightClass: string }) {
  return (
    <div data-reference-band className={`relative w-full overflow-hidden bg-gray-200 group ${heightClass}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: `${focal.x}% ${focal.y}%`, filter: "brightness(1)" }}
      />
    </div>
  )
}

function ProfilePage({ cover }: { cover: string }) {
  const settings = {
    ...defaultShopHeaderSettings,
    coverImageUrl: cover,
    coverFocalPoint: { x: 50, y: 50 },
  } as never
  return (
    <div style={{ background: "#111113", minHeight: "200vh", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* The newsletter bar's height, so the band sits where it does on the page. */}
      <div style={{ height: 84, background: "#111" }} />
      <div data-case="real">
        <UnifiedShopHeader
          settings={settings}
          creator={creator}
          profile={profile}
          products={[]}
          globalSettings={defaultGlobalStoreSettings as never}
          ownerActions={
            <EditProfileButton
              embedded
              displayName="AndrewRullz"
              bio=""
              username="andrewrullz"
              avatarUrl={null}
              coverUrl={cover}
              coverFocalPoint={{ x: 50, y: 50 }}
              coverZoom={null}
              socialLinks={{}}
            />
          }
        />
      </div>
    </div>
  )
}

function CropHarness({ photo }: { photo: string }) {
  window.__renders += 1
  const [crop, setCrop] = React.useState<CoverCrop>(DEFAULT_COVER_CROP)
  const [open, setOpen] = React.useState(true)
  const aspect = useCoverAspect(open)
  React.useEffect(() => { window.__crop = crop }, [crop])
  const settings = {
    ...defaultShopHeaderSettings,
    coverImageUrl: photo,
    coverFocalPoint: { x: crop.x, y: crop.y },
    coverZoom: crop.zoom,
  } as never
  return (
    <div style={{ background: "#fff", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div data-case="real">
        <UnifiedShopHeader
          settings={settings}
          creator={creator}
          profile={profile}
          products={[]}
          globalSettings={defaultGlobalStoreSettings as never}
        />
      </div>
      <EditorSheet open={open} onClose={() => setOpen(false)} title="Profile details" wide onSave={() => {}}>
        <div className="space-y-2">
          <ImageUpload
            bucket="covers"
            aspectRatio="cover"
            value={photo}
            onChange={() => {}}
            replaceOnly
            allowRemove
            replaceLabel="Change banner"
            reposition={{ value: crop, onChange: setCrop, aspect, editable: true }}
          />
        </div>
        <div style={{ height: 900 }} />
      </EditorSheet>
    </div>
  )
}

function ReferencePage({ photo }: { photo: string }) {
  /* The band at zoom 1 in the new markup, and in the old, side by side. */
  const settings = {
    ...defaultShopHeaderSettings,
    coverImageUrl: photo,
    coverFocalPoint: { x: 30, y: 70 },
  } as never
  return (
    <div style={{ background: "#fff" }}>
      {/* A whole-pixel height, so the reference band starts on a whole pixel
          too and the two are rasterised on the same grid. */}
      <div data-case="real" style={{ height: 600, overflow: "hidden" }}>
        <UnifiedShopHeader settings={settings} creator={creator} profile={profile} products={[]} globalSettings={defaultGlobalStoreSettings as never} />
      </div>
      <ReferenceBand src={photo} focal={{ x: 30, y: 70 }} heightClass="h-48 sm:h-64" />
    </div>
  )
}

async function main() {
  const mode = location.hash.replace("#", "") || "profile"
  const photo = colourField()
  let logo: HTMLImageElement | null = null
  if (window.__logo) {
    logo = new Image()
    logo.src = window.__logo
    await logo.decode().catch(() => { logo = null })
  }
  const root = createRoot(document.getElementById("app")!)
  if (mode === "crop") root.render(<CropHarness photo={photo} />)
  else if (mode === "reference") root.render(<ReferencePage photo={photo} />)
  else root.render(<ProfilePage cover={brandCover(logo)} />)
  window.__ready = true
}

void main()

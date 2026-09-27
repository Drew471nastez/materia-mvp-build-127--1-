"use client"

/**
 * ===========================================================================
 *  SEARCH AND SHARING, AS THE PAGE WILL SHOW THEM
 * ===========================================================================
 * Two previews on top, what a chat app draws when the link is shared and
 * what Google lists, and under them the fields that change them. Every field
 * starts out following the page (lib/onepage/seo resolveOnePageSeo): its box
 * is empty and shows what the page gives it, grey, and the previews change
 * as the name, bio, photo or theme change anywhere in the editor. Typing in a
 * box makes that field the creator's own; "Use page name" (or bio, or the
 * search title) empties it and it follows again.
 *
 * The share card is drawn by components/onepage/share-card, the same
 * elements the server draws the real image with, scaled to the column.
 *
 * The fields write to the page as they are typed, like the rest of the
 * editor, so the previews, undo and the editor's Save all see them.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { useOnePage } from "@/lib/onepage/context"
import { publicOnePageFromDraft } from "@/lib/onepage/public-shape"
import {
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  SHARE_IMAGE_WIDTH,
  resolveOnePageSeo,
  textLength,
  type ResolvedField,
} from "@/lib/onepage/seo"
import { ShareCardArt } from "@/components/onepage/share-card"
import { useOwnerProfile } from "@/components/onepage/live-preview"
import { createClient } from "@/lib/supabase/client"
import { secondaryDepth } from "@/components/ui/depth-button"
import { fieldInput } from "@/components/onepage/editor-kit"
import { cn } from "@/lib/utils"

type SeoKey = "seo_title" | "seo_description" | "social_title" | "social_description"

/** A picture re-encoded as a JPEG no wider than 2400px, which every app and the share image can read. Null when the browser cannot read it. */
async function asJpeg(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const g = canvas.getContext("2d")
    if (!g) return null
    g.fillStyle = "#ffffff"
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88))
  } catch {
    return null
  }
}

/** The 1200 by 630 card, drawn at its own size and scaled to the width it is given. */
function ScaledCard({ children }: { children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const measure = () => setScale(box.clientWidth / SHARE_IMAGE_WIDTH)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    return () => watch.disconnect()
  }, [])
  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden" aria-hidden>
      <div style={{ width: SHARE_IMAGE_WIDTH, transformOrigin: "0 0", transform: `scale(${scale})`, opacity: scale ? 1 : 0 }}>{children}</div>
    </div>
  )
}

function Field({
  label,
  field,
  stored,
  max,
  multiline,
  resetLabel,
  followsLabel = "Follows your page",
  onChange,
  id,
}: {
  label: string
  field: ResolvedField
  stored: string
  max: number
  multiline?: boolean
  resetLabel: string
  followsLabel?: string
  onChange: (value: string | null) => void
  id: string
}) {
  const own = !field.auto
  const count = textLength(stored)
  const common = {
    id,
    value: stored,
    maxLength: max,
    placeholder: field.auto ? field.value : "",
    "data-seo-field": id,
    "data-follows": field.auto ? "" : undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value === "" ? null : e.target.value),
    /* The editor's own text box (editor-kit fieldInput): 16px on a phone, so iOS does not zoom in on it. */
    className: fieldInput,
  }
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-[20px] items-baseline justify-between gap-3">
        <label htmlFor={id} className="min-w-0 truncate text-[13px] font-medium text-[#374151]">
          {label}
        </label>
        {own ? (
          <span className="flex shrink-0 items-baseline gap-3 whitespace-nowrap">
            <span className={cn("text-[12px] tabular-nums", count >= max ? "text-amber-600" : "text-[#9ca3af]")}>
              {count}/{max}
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              data-seo-reset={id}
              className="cursor-pointer text-[12.5px] font-medium text-[#1a1a2e] underline decoration-[#d1d5db] underline-offset-[3px] hover:decoration-[#1a1a2e] [-webkit-tap-highlight-color:transparent]"
            >
              {resetLabel}
            </button>
          </span>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-[12px] text-[#9ca3af]">{followsLabel}</span>
        )}
      </div>
      {multiline ? <textarea {...common} rows={3} className={cn(common.className, "h-auto resize-none py-3 leading-snug")} /> : <input {...common} type="text" />}
    </div>
  )
}

export function SeoPanel({ pageUrl, footer }: { pageUrl: string; footer?: ReactNode }) {
  const { onepage, updateSettings, getLatestOnePage } = useOnePage()
  const owner = useOwnerProfile(onepage?.owner_id)
  const [focalDraft, setFocalDraft] = useState<{ x: number; y: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [showSocial, setShowSocial] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cropRef = useRef<HTMLDivElement>(null)

  const drawn = useMemo(
    () => (onepage ? publicOnePageFromDraft(onepage as never, { displayName: owner.displayName, liveAvatarUrl: owner.avatarUrl }) : null),
    [onepage, owner.displayName, owner.avatarUrl],
  )
  const settings = (onepage?.settings ?? {}) as Record<string, any>
  const seo = useMemo(
    () =>
      drawn && onepage
        ? resolveOnePageSeo({
            name: drawn.title,
            bio: drawn.bio,
            handle: onepage.slug,
            avatarUrl: drawn.avatar_url,
            theme: drawn.theme,
            settings: focalDraft ? { ...settings, social_image_position_x: focalDraft.x, social_image_position_y: focalDraft.y } : settings,
            pageUrl,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawn, onepage?.slug, onepage?.settings, focalDraft, pageUrl],
  )
  if (!onepage || !seo) return null

  const stored = (key: SeoKey) => (typeof settings[key] === "string" ? (settings[key] as string) : "")
  const write = (key: SeoKey) => (value: string | null) => updateSettings({ [key]: value } as never)
  const socialOpen = showSocial || !seo.socialTitle.auto || !seo.socialDescription.auto || !!stored("social_title") || !!stored("social_description")

  /* The image is written at once, the page's id and its three settings only, so it survives a refresh without a Save. */
  const writeImage = async (imageSettings: Record<string, unknown>) => {
    const res = await fetch("/api/onepage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: onepage.id, settings: imageSettings }),
    }).catch(() => null)
    updateSettings(imageSettings as never, { silent: !!res?.ok })
  }

  const handleImageUpload = async (file: File | undefined) => {
    setImageError(null)
    if (!file) return
    if (!file.type.startsWith("image/")) return setImageError("Choose a picture: JPG, PNG or GIF")
    if (file.size > 15 * 1024 * 1024) return setImageError("That picture is over 15 MB")
    setUploading(true)
    try {
      const jpeg = await asJpeg(file)
      const body = jpeg ?? file
      if (body.size > 5 * 1024 * 1024) throw new Error("too large")
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("signed out")
      const ext = jpeg ? "jpg" : (file.name.split(".").pop() || "img").toLowerCase().replace(/[^a-z0-9]/g, "")
      const path = `${user.id}/og-image-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from("onepage-assets").upload(path, body, { upsert: true, contentType: jpeg ? "image/jpeg" : file.type })
      if (error) throw error
      const {
        data: { publicUrl },
      } = supabase.storage.from("onepage-assets").getPublicUrl(path)
      const latest = (getLatestOnePage()?.settings as any) || {}
      await writeImage({
        social_image_url: publicUrl,
        social_image_position_x: latest.social_image_position_x ?? 50,
        social_image_position_y: latest.social_image_position_y ?? 50,
      })
    } catch (error) {
      setImageError(error instanceof Error && error.message === "too large" ? "That picture is too large. Try one under 5 MB" : "The picture did not upload. Try again")
    } finally {
      setUploading(false)
    }
  }

  const removeImage = () => {
    setImageError(null)
    void writeImage({ social_image_url: null, social_image_position_x: null, social_image_position_y: null })
  }

  /* Dragging moves the crop on screen only; the point is written once, when the finger lifts. */
  const focalAt = (clientX: number, clientY: number) => {
    const box = cropRef.current?.getBoundingClientRect()
    if (!box) return null
    return {
      x: Math.round(Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100))),
      y: Math.round(Math.max(0, Math.min(100, ((clientY - box.top) / box.height) * 100))),
    }
  }

  const image = seo.image
  return (
    <div className="space-y-6" data-onepage-seo="">
      <div>
        <h3 className="text-[16px] font-semibold text-[#1a1a2e]">Search and sharing</h3>
        <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">
          Made from your page and updated as you edit it. Change a field to write your own.
        </p>
      </div>

      {/* WHEN THE LINK IS SHARED: the picture, the host, the title and the description, as iMessage, WhatsApp and X draw them. */}
      <figure className="space-y-2" data-share-preview="">
        <figcaption className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">Shared link</figcaption>
        <div
          className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          data-og-card=""
          data-og-image-url={image.url}
        >
          {image.customUrl ? (
            <div
              ref={cropRef}
              className="relative aspect-[1200/630] cursor-crosshair touch-none select-none overflow-hidden bg-[#f3f4f6]"
              data-og-crop=""
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                setFocalDraft(focalAt(e.clientX, e.clientY))
              }}
              onPointerMove={(e) => {
                if (!focalDraft) return
                setFocalDraft(focalAt(e.clientX, e.clientY))
              }}
              onPointerUp={() => {
                if (focalDraft) updateSettings({ social_image_position_x: focalDraft.x, social_image_position_y: focalDraft.y } as never)
                setFocalDraft(null)
              }}
              onPointerCancel={() => setFocalDraft(null)}
            >
              <img
                src={image.customUrl}
                alt=""
                draggable={false}
                className="pointer-events-none h-full w-full object-cover"
                style={{ objectPosition: `${image.focal.x}% ${image.focal.y}%` }}
              />
              <span
                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                style={{ left: `${image.focal.x}%`, top: `${image.focal.y}%` }}
              />
            </div>
          ) : (
            <div className="relative aspect-[1200/630] bg-[#f3f4f6]" data-og-generated="">
              <ScaledCard>
                <ShareCardArt card={image.card} avatarSrc={image.card.avatarUrl} backgroundSrc={image.card.background.imageUrl} fontFamily="Inter, system-ui, sans-serif" />
              </ScaledCard>
            </div>
          )}
          <div className="border-t border-[#f0f0f2] bg-[#fafafa] px-3.5 py-3">
            <p className="truncate text-[11.5px] uppercase tracking-[0.03em] text-[#6b7280]" data-og-domain="">
              {seo.domain}
            </p>
            <p className="mt-0.5 truncate text-[14.5px] font-semibold text-[#1a1a2e]" data-og-title="">
              {seo.socialTitle.value}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[#6b7280]" data-og-description="">
              {seo.socialDescription.value}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => !uploading && fileInputRef.current?.click()}
            disabled={uploading}
            data-og-pick=""
            className={cn(secondaryDepth, "h-9 rounded-lg px-3.5 text-[13px]")}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {uploading ? "Uploading" : image.customUrl ? "Change picture" : "Use my own picture"}
          </button>
          {image.customUrl && !uploading ? (
            <button
              type="button"
              onClick={removeImage}
              data-og-reset=""
              className="h-9 cursor-pointer rounded-lg px-3 text-[13px] font-medium text-[#4b5563] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
            >
              Use page card
            </button>
          ) : null}
          <span className="ml-auto text-[12px] text-[#9ca3af]">{image.customUrl ? "Drag on the picture to move the crop" : "1200 x 630, JPG or PNG"}</span>
        </div>
        {imageError ? (
          <p className="text-[12.5px] text-red-600" role="alert">
            {imageError}
          </p>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleImageUpload(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </figure>

      {/* ON GOOGLE: the page's picture and address, the title in link blue, the description under it. */}
      <figure className="space-y-2" data-search-preview="">
        <figcaption className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">Google</figcaption>
        <div className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" style={{ fontFamily: "Arial, system-ui, sans-serif" }}>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#ecedef] bg-[#f1f3f4] text-[11px] font-semibold text-[#4d5156]">
              {image.card.avatarUrl ? <img src={image.card.avatarUrl} alt="" className="h-full w-full object-cover" /> : image.card.initials.slice(0, 1)}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[14px] text-[#202124]">{seo.name}</span>
              <span className="block truncate text-[12px] text-[#4d5156]" data-search-url="">
                {`https://${seo.breadcrumb}`}
              </span>
            </span>
          </div>
          <p className="mt-1.5 line-clamp-1 text-[18px] leading-[1.3] text-[#1a0dab]" data-search-title="">
            {seo.title.value}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-[1.45] text-[#4d5156]" data-search-description="">
            {seo.description.value}
          </p>
        </div>
      </figure>

      <div className="space-y-4">
        <Field
          id="seo-title"
          label="Search title"
          field={seo.title}
          stored={stored("seo_title")}
          max={SEO_TITLE_MAX}
          resetLabel="Use page name"
          onChange={write("seo_title")}
        />
        <Field
          id="seo-description"
          label="Search description"
          field={seo.description}
          stored={stored("seo_description")}
          max={SEO_DESCRIPTION_MAX}
          multiline
          resetLabel={drawn?.bio?.trim() ? "Use bio" : "Use automatic"}
          onChange={write("seo_description")}
        />
        {socialOpen ? (
          <>
            <Field
              id="social-title"
              label="Shared title"
              followsLabel={seo.title.auto ? "Follows your page" : "Same as search"}
              field={seo.socialTitle}
              stored={stored("social_title")}
              max={SEO_TITLE_MAX}
              resetLabel={seo.title.auto ? "Use page name" : "Use search title"}
              onChange={write("social_title")}
            />
            <Field
              id="social-description"
              label="Shared description"
              followsLabel="Same as search"
              field={seo.socialDescription}
              stored={stored("social_description")}
              max={SEO_DESCRIPTION_MAX}
              multiline
              resetLabel="Use search text"
              onChange={write("social_description")}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowSocial(true)}
            data-seo-social-open=""
            className="cursor-pointer text-[13px] font-medium text-[#1a1a2e] underline decoration-[#d1d5db] underline-offset-[3px] hover:decoration-[#1a1a2e]"
          >
            Use a different title when shared
          </button>
        )}
      </div>

      {footer}
    </div>
  )
}

"use client"

/**
 * ===========================================================================
 *  SEARCH AND SHARING, AS THE PAGE WILL SHOW THEM
 * ===========================================================================
 * Two previews on top, what a chat app draws when the link is shared and
 * what Google lists, and under them the fields that change them. Every field
 * starts out following the page (lib/onepage/seo resolveOnePageSeo): its box
 * is empty and shows what the page gives it, grey, with a line under it
 * saying where that comes from ("From your bio", "From your page: 3
 * products, 2 socials"), and the previews change as the name, bio, photo,
 * theme, links or products change anywhere in the editor. With no bio the
 * description is made from the page's blocks (lib/onepage/seo-description),
 * with each product read as the catalogue has it now, as the public page
 * reads it. Typing in a box makes that field the creator's own; "Use page
 * name" (or bio, or the search title) empties it and it follows again.
 *
 * The picture a shared link shows is one of three (lib/onepage/seo
 * pickShareImage): the profile photo, which every page starts with; the
 * share card, drawn by components/onepage/share-card with the same elements
 * the server draws the real image with, scaled to the column; or a picture
 * of their own. The preview is laid out the way chat apps lay out each: a
 * square photo beside the words, a wide picture above them. A choice that
 * has nothing to show says what shows instead.
 *
 * The fields write to the page as they are typed, like the rest of the
 * editor, so the previews, undo and the editor's Save all see them.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { teamPageOwner } from "@/lib/onepage/team-context"
import { teamSignedUpload } from "@/lib/team/upload-fallback"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { Loader2, Plus } from "lucide-react"
import { useOnePage } from "@/lib/onepage/context"
import { publicOnePageFromDraft } from "@/lib/onepage/public-shape"
import {
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  SHARE_IMAGE_WIDTH,
  resolveOnePageSeo,
  textLength,
  type ResolvedField,
  type ShareImageMode,
} from "@/lib/onepage/seo"
import { descriptionSourceNote } from "@/lib/onepage/seo-description"
import { answersForBlocks, productIdsInBlocks, resolveProductBlocks, type ProductAnswers, type ProductsDb } from "@/lib/onepage/live-products"
import { ShareCardArt } from "@/components/onepage/share-card"
import { FilesLibraryChooser, LibraryButton } from "@/components/onepage/library-pick"
import { useOwnerProfile } from "@/components/onepage/live-preview"
import { createClient } from "@/lib/supabase/client"
import { secondaryDepth } from "@/components/ui/depth-button"
import { ChoiceMark, choiceOff, fieldInput } from "@/components/onepage/editor-kit"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

type SeoKey = "seo_title" | "seo_description" | "social_title" | "social_description"

const SHARE_CHOICES: readonly { id: ShareImageMode; label: string }[] = [
  { id: "profile", get label() { return tt("Profile photo") } },
  { id: "card", get label() { return tt("Share card") } },
  { id: "custom", get label() { return tt("Custom image") } },
]

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

/**
 * What the catalogue says about the products the draft names, as the preview
 * frame asks it (components/onepage/preview-document): only for a product it
 * has not asked about yet, so typing does not read the database on every key.
 * An archived or unpublished product then drops out of the description here
 * as it does on the public page. A read that fails answers nothing.
 */
function useProductAnswers(sellerId: string | null, blocks: unknown): ProductAnswers {
  const [answers, setAnswers] = useState<ProductAnswers>(() => new Map())
  const asked = useRef(new Set<string>())
  /* Kept across edits: an answer asked for before the next key press still lands. */
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!sellerId || !blocks) return
    const fresh = productIdsInBlocks(blocks).filter((id) => !asked.current.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) asked.current.add(id)
    let db: ProductsDb
    try {
      db = createClient() as unknown as ProductsDb
    } catch {
      return
    }
    answersForBlocks(db, sellerId, blocks)
      .then((got) => {
        if (mounted.current && got.size > 0) setAnswers((prev) => new Map([...prev, ...got]))
      })
      .catch(() => undefined)
  }, [sellerId, blocks])
  return answers
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
  followsLabel = tt("Follows your page"),
  onChange,
  id,
}: {
  label: string
  field: ResolvedField
  stored: string
  max: number
  multiline?: boolean
  resetLabel: string
  /** Where the words come from while the field follows the page, said under it. */
  followsLabel?: string
  onChange: (value: string | null) => void
  id: string
}) {
  const noteId = `${id}-source`
  const own = !field.auto
  const count = textLength(stored)
  const common = {
    id,
    value: stored,
    maxLength: max,
    placeholder: field.auto ? field.value : "",
    "data-seo-field": id,
    "data-follows": field.auto ? "" : undefined,
    "aria-describedby": field.auto ? noteId : undefined,
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
        ) : null}
      </div>
      {multiline ? <textarea {...common} rows={3} className={cn(common.className, "h-auto resize-none py-3 leading-snug")} /> : <input {...common} type="text" />}
      {field.auto ? (
        <p id={noteId} className="text-[12.5px] leading-snug text-[#6b7280]" data-seo-source={id}>
          {followsLabel}
        </p>
      ) : null}
    </div>
  )
}

export function SeoPanel({ pageUrl, footer }: { pageUrl: string; footer?: ReactNode }) {
  const { onepage, updateSettings, updateOnePage, getLatestOnePage } = useOnePage()
  const owner = useOwnerProfile(onepage?.owner_id)
  const [focalDraft, setFocalDraft] = useState<{ x: number; y: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [showSocial, setShowSocial] = useState(false)
  /* "Your files" for the custom share picture (components/onepage/library-pick). */
  const [choosing, setChoosing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cropRef = useRef<HTMLDivElement>(null)

  const drawn = useMemo(
    () => (onepage ? publicOnePageFromDraft(onepage as never, { displayName: owner.displayName, liveAvatarUrl: owner.avatarUrl }) : null),
    [onepage, owner.displayName, owner.avatarUrl],
  )
  const answers = useProductAnswers(drawn?.seller_id ?? null, drawn?.blocks)
  /* The draft's blocks with each product as its row has it now, as the public page reads them. */
  const blocks = useMemo(() => (drawn ? resolveProductBlocks(drawn.blocks, answers) : []), [drawn, answers])
  const settings = (onepage?.settings ?? {}) as Record<string, any>
  const seo = useMemo(
    () =>
      drawn && onepage
        ? resolveOnePageSeo({
            name: drawn.title,
            bio: drawn.bio,
            blocks,
            socialLinks: drawn.social_links,
            handle: onepage.slug,
            avatarUrl: drawn.avatar_url,
            theme: drawn.theme,
            settings: focalDraft ? { ...settings, social_image_position_x: focalDraft.x, social_image_position_y: focalDraft.y } : settings,
            shareImageMode: onepage.share_image_mode,
            pageUrl,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawn, blocks, onepage?.slug, onepage?.settings, onepage?.share_image_mode, focalDraft, pageUrl],
  )
  if (!onepage || !seo) return null

  const stored = (key: SeoKey) => (typeof settings[key] === "string" ? (settings[key] as string) : "")
  const write = (key: SeoKey) => (value: string | null) => updateSettings({ [key]: value } as never)
  const socialOpen = showSocial || !seo.socialTitle.auto || !seo.socialDescription.auto || !!stored("social_title") || !!stored("social_description")

  /*
    An upload is written at once, the page's id, its three image settings and
    the choice only, so it survives a refresh without a Save. Choosing one of
    the three is an ordinary edit: the preview shows it, undo takes it back,
    and Save sends it (app/api/onepage share_image_mode).
  */
  const writeImage = async (imageSettings: Record<string, unknown>, mode: ShareImageMode) => {
    const res = await fetch("/api/onepage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: onepage.id, settings: imageSettings, share_image_mode: mode }),
    }).catch(() => null)
    updateSettings(imageSettings as never, { silent: !!res?.ok })
    updateOnePage({ share_image_mode: mode }, { silent: !!res?.ok })
  }

  const handleImageUpload = async (file: File | undefined) => {
    setImageError(null)
    if (!file) return
    if (!file.type.startsWith("image/")) return setImageError(tt("Choose a picture: JPG, PNG or GIF"))
    if (file.size > 15 * 1024 * 1024) return setImageError(tt("That picture is over 15 MB"))
    setUploading(true)
    try {
      const jpeg = await asJpeg(file)
      const body = jpeg ?? file
      if (body.size > 5 * 1024 * 1024) throw new Error("too large")
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error(tt("signed out"))
      const ext = jpeg ? "jpg" : (file.name.split(".").pop() || "img").toLowerCase().replace(/[^a-z0-9]/g, "")
      /* Round 41: a team member's picture goes into the page owner's folder; storage takes it through a path the server signs (lib/team/upload-fallback). */
      const owner = teamPageOwner()
      const path = `${owner ?? user.id}/og-image-${Date.now()}.${ext}`
      const { error } = owner
        ? { error: (await teamSignedUpload("onepage-assets", path, body, jpeg ? "image/jpeg" : file.type)) ? null : new Error("upload refused") }
        : await supabase.storage.from("onepage-assets").upload(path, body, { upsert: true, contentType: jpeg ? "image/jpeg" : file.type })
      if (error) throw error
      confirmUpload("onepage-assets", path)
      const {
        data: { publicUrl },
      } = supabase.storage.from("onepage-assets").getPublicUrl(path)
      const latest = (getLatestOnePage()?.settings as any) || {}
      await writeImage(
        {
          social_image_url: publicUrl,
          social_image_position_x: latest.social_image_position_x ?? 50,
          social_image_position_y: latest.social_image_position_y ?? 50,
        },
        "custom",
      )
    } catch (error) {
      setImageError(error instanceof Error && error.message === "too large" ? tt("That picture is too large. Try one under 5 MB") : tt("The picture did not upload. Try again"))
    } finally {
      setUploading(false)
    }
  }

  /* Taking the picture away goes back to the photo, the choice every page starts with. */
  const removeImage = () => {
    setImageError(null)
    void writeImage({ social_image_url: null, social_image_position_x: null, social_image_position_y: null }, "profile")
  }

  const choose = (mode: ShareImageMode) => {
    setImageError(null)
    updateOnePage({ share_image_mode: mode })
    /* Custom image with nothing uploaded yet: the picker opens, as it would on any platform. */
    if (mode === "custom" && !seo.image.customUrl && !uploading) fileInputRef.current?.click()
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
        <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{tt("Search and sharing")}</h3>
        <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">
          {tt("Made from your page and updated as you edit it. Change a field to write your own.")}
        </p>
      </div>

      {/*
        WHEN THE LINK IS SHARED: the picture, the host, the title and the
        description, laid out as iMessage, WhatsApp and X lay them out. A
        square photo sits beside the words; a wide picture sits above them.
      */}
      <figure className="space-y-2" data-share-preview="" data-share-source={image.source}>
        <figcaption className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">{tt("Shared link")}</figcaption>
        <div
          className={cn("overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]", image.source === "profile" && "flex items-stretch")}
          data-og-card=""
          data-og-image-url={image.url}
          data-og-twitter-card={image.twitterCard}
        >
          {image.source === "profile" && image.photoUrl ? (
            <div className="relative aspect-square w-[88px] shrink-0 self-center overflow-hidden bg-[#f3f4f6] sm:w-[104px]" data-og-photo="">
              <img src={image.photoUrl} alt="" draggable={false} className="h-full w-full object-cover" />
            </div>
          ) : image.source === "custom" && image.customUrl ? (
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
                <ShareCardArt card={image.card} avatarSrc={image.card.avatarUrl} backgroundSrc={image.card.background.imageUrl} fontFamily={"Inter, system-ui, sans-serif"} />
              </ScaledCard>
            </div>
          )}
          <div
            className={cn(
              "min-w-0 bg-[#fafafa] px-3.5 py-3",
              image.source === "profile" ? "flex flex-1 flex-col justify-center border-l border-[#f0f0f2]" : "border-t border-[#f0f0f2]",
            )}
          >
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

        {/* WHICH PICTURE: three cards, the chosen one marked the way every choice in the editor is. */}
        <div className="pt-2" data-share-choices="">
          <p id="share-image-label" className="mb-2 text-[13px] font-medium text-[#374151]">
            {tt("Picture")}
          </p>
          <div role="group" aria-labelledby="share-image-label" className="grid grid-cols-3 gap-2">
            {SHARE_CHOICES.map((choice) => (
              /*
                The editor's choice card (editor-kit ChoiceCard), with a name
                that may take two lines: "Profile photo" does not fit a third
                of a phone's column in one, and a name cut to "Profile ph..."
                says nothing.
              */
              <button
                key={choice.id}
                type="button"
                onClick={() => choose(choice.id)}
                aria-pressed={image.mode === choice.id}
                data-choice={choice.label}
                className={cn(
                  "relative flex min-h-11 cursor-pointer flex-col items-stretch rounded-2xl border bg-white p-1.5 text-center transition-[border-color] duration-150 [-webkit-tap-highlight-color:transparent]",
                  "outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]",
                  choiceOff,
                )}
              >
                <span className="relative block aspect-[1200/630] w-full overflow-hidden rounded-[10px] bg-[#f3f4f6]" data-share-thumb={choice.id}>
                  {choice.id === "profile" ? (
                    image.photoUrl ? (
                      <img src={image.photoUrl} alt="" draggable={false} className="absolute left-1/2 top-0 h-full w-auto max-w-none -translate-x-1/2 aspect-square object-cover" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold text-[#9ca3af]">{image.card.initials}</span>
                    )
                  ) : choice.id === "card" ? (
                    <ScaledCard>
                      <ShareCardArt card={image.card} avatarSrc={image.card.avatarUrl} backgroundSrc={image.card.background.imageUrl} fontFamily={"Inter, system-ui, sans-serif"} />
                    </ScaledCard>
                  ) : image.customUrl ? (
                    <img src={image.customUrl} alt="" draggable={false} className="h-full w-full object-cover" style={{ objectPosition: `${image.focal.x}% ${image.focal.y}%` }} />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center rounded-[10px] border border-dashed border-[#d1d5db] bg-white text-[#9ca3af]">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2} />}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "flex flex-1 items-center justify-center px-0.5 pb-1 pt-2 text-[13px] font-medium leading-[1.25] transition-colors duration-[180ms]",
                    image.mode === choice.id ? "text-[#1a1a2e]" : "text-[#4b5563]",
                  )}
                >
                  {choice.label}
                </span>
                <ChoiceMark on={image.mode === choice.id} />
              </button>
            ))}
          </div>

          <p className="mt-2.5 text-[12.5px] leading-snug text-[#6b7280]" data-share-note={image.fallback ?? image.mode}>
            {image.fallback === "no-photo"
              ? tt("You have no profile photo yet, so links show the share card.")
              : image.fallback === "no-upload"
                ? tt("Upload a picture, 1200 x 630 works best. Until then, links show {value}.", { value: image.source === "profile" ? tt("your profile photo") : tt("the share card") })
                : image.mode === "profile"
                  ? tt("The photo at the top of your page, shown square.")
                  : image.mode === "card"
                    ? tt("Made from your name, photo and theme.")
                    : tt("Drag on the picture to move the crop.")}
          </p>
          {image.mode === "custom" ? (
            <div className="mt-2.5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => !uploading && fileInputRef.current?.click()}
                disabled={uploading}
                data-og-pick=""
                className={cn(secondaryDepth, "h-9 rounded-lg px-3.5 text-[13px]")}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {uploading ? tt("Uploading") : image.customUrl ? tt("Replace") : tt("Upload picture")}
              </button>
              {!uploading ? <LibraryButton onClick={() => setChoosing(true)} /> : null}
              {image.customUrl && !uploading ? (
                <button
                  type="button"
                  onClick={removeImage}
                  data-og-reset=""
                  className="h-9 cursor-pointer rounded-lg px-3 text-[13px] font-medium text-[#4b5563] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
                >
                  {tt("Remove")}
                </button>
              ) : null}
            </div>
          ) : null}
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
        {/* A picture already in Files is used where it is: written the way an upload is, at the centre. */}
        <FilesLibraryChooser
          open={choosing}
          onClose={() => setChoosing(false)}
          selectedUrl={image.customUrl}
          onPick={(url) => {
            setImageError(null)
            void writeImage({ social_image_url: url, social_image_position_x: 50, social_image_position_y: 50 }, "custom")
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
          label={tt("Search title")}
          field={seo.title}
          stored={stored("seo_title")}
          max={SEO_TITLE_MAX}
          resetLabel={tt("Use page name")}
          followsLabel={seo.derived.title === "name-and-handle" ?tt("From your page name and address") : tt("From your page name")}
          onChange={write("seo_title")}
        />
        <Field
          id="seo-description"
          label={tt("Search description")}
          field={seo.description}
          stored={stored("seo_description")}
          max={SEO_DESCRIPTION_MAX}
          multiline
          resetLabel={seo.derived.description.kind === "bio" ? tt("Use bio") : tt("Use page summary")}
          followsLabel={descriptionSourceNote(seo.derived.description)}
          onChange={write("seo_description")}
        />
        {socialOpen ? (
          <>
            <Field
              id="social-title"
              label={tt("Shared title")}
              followsLabel={seo.title.auto ? tt("From your page name") : tt("Same as search title")}
              field={seo.socialTitle}
              stored={stored("social_title")}
              max={SEO_TITLE_MAX}
              resetLabel={seo.title.auto ? tt("Use page name") : tt("Use search title")}
              onChange={write("social_title")}
            />
            <Field
              id="social-description"
              label={tt("Shared description")}
              followsLabel={tt("Same as search description")}
              field={seo.socialDescription}
              stored={stored("social_description")}
              max={SEO_DESCRIPTION_MAX}
              multiline
              resetLabel={tt("Use search text")}
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
            {tt("Use a different title when shared")}
          </button>
        )}
      </div>

      {footer}
    </div>
  )
}

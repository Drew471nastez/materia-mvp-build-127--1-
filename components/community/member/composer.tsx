"use client"

/**
 * ===========================================================================
 *  "SHARE SOMETHING..."
 * ===========================================================================
 * Closed, the composer is one line with the member's picture: nothing to
 * decide. Pressed, it opens where it is into a title (optional), the text,
 * and one row of extras: pictures, a poll, a file (for the creator, who has
 * somewhere to keep files), and the space it goes to. A link in the text
 * brings its card on its own (fetched by the server), and the card can be
 * taken off. Pictures go straight to Storelib's picture storage under the
 * member's own folder, compressed first, and are checked by the upload
 * pipeline when they land (confirmUpload).
 *
 * WHAT WAS TYPED IS KEPT. Every change is written to this browser's storage
 * for this community, and comes back if the page is closed, refreshed or
 * crashed before posting. Posting clears it.
 */
import { useEffect, useRef, useState } from "react"
import { BarChart3, ChevronDown, ImagePlus, Loader2, Paperclip, Plus, X } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { createClient } from "@/lib/supabase/client"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { COMPRESS_PROFILES, compressImage } from "@/lib/images/compress"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { MAX_MEDIA_PER_POST, POLL_OPTIONS_MAX } from "@/lib/communities/limits"
import type { FeedPostView, PostMedia } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { LinkCard, fileSize } from "./media"
import { MentionTextarea, type MentionTextareaHandle } from "./mention-input"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY, CARD, FIELD, ICON_BTN } from "./ui"
import type { ComposerSpace, LinkPreview } from "./view-types"

export interface ComposerProps {
  communityId: string
  userId: string
  me: { name: string; avatarUrl: string | null }
  spaces: ComposerSpace[]
  /** On a space's page the post goes there. */
  fixedSpaceId?: string | null
  /** The product a creator's files are kept under; null hides files. */
  fileProductId?: string | null
  onPosted: (post: FeedPostView) => void
}

interface Upload {
  key: string
  kind: "image" | "file"
  name: string
  size: number
  preview?: string
  progress: number
  media?: PostMedia
  failed?: boolean
}

interface PollDraft {
  question: string
  options: string[]
  multiple: boolean
  closesIn: "" | "1" | "3" | "7"
}

interface Draft {
  title: string
  body: string
  spaceId: string | null
  poll: PollDraft | null
  media: PostMedia[]
}

export function draftKey(communityId: string, spaceId?: string | null): string {
  return `storelib:community-draft:${communityId}${spaceId ? `:${spaceId}` : ""}`
}

function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    if (typeof d !== "object" || !d) return null
    return { title: String(d.title || ""), body: String(d.body || ""), spaceId: d.spaceId || null, poll: d.poll ?? null, media: Array.isArray(d.media) ? d.media : [] }
  } catch {
    return null
  }
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/i

async function uploadPicture(file: File, userId: string, communityId: string): Promise<PostMedia> {
  if (!file.type.startsWith("image/") || /svg/i.test(file.type)) throw new Error("That file is not a picture.")
  if (file.size > 25 * 1024 * 1024) throw new Error("That picture is over 25 MB.")
  const upload = await compressImage(file, COMPRESS_PROFILES["product-images"])
  const size = await (async () => {
    try {
      const bitmap = await createImageBitmap(upload)
      const out = { w: bitmap.width, h: bitmap.height }
      bitmap.close()
      return out
    } catch {
      return { w: 0, h: 0 }
    }
  })()
  const supabase = createClient()
  const ext = (upload.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
  /* The member's own folder first: storage only lets a person write there. */
  const path = `${userId}/community/${communityId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from("product-images").upload(path, upload, { cacheControl: "31536000", contentType: upload.type, upsert: false })
  if (error) throw new Error("The picture did not upload. Check the connection and try again.")
  confirmUpload("product-images", path)
  const { data } = supabase.storage.from("product-images").getPublicUrl(path)
  return { type: "image", url: data.publicUrl, ...(size.w ? { w: size.w, h: size.h } : {}) }
}

export function Composer({ communityId, userId, me, spaces, fixedSpaceId = null, fileProductId = null, onPosted }: ComposerProps) {
  const key = draftKey(communityId, fixedSpaceId)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [spaceId, setSpaceId] = useState<string | null>(fixedSpaceId ?? spaces[0]?.id ?? null)
  const [poll, setPoll] = useState<PollDraft | null>(null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [restored, setRestored] = useState(false)
  const textRef = useRef<MentionTextareaHandle>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  /* A draft left here comes back, open. */
  useEffect(() => {
    const d = readDraft(key)
    if (d && (d.title || d.body || d.poll || d.media.length)) {
      setTitle(d.title)
      setBody(d.body)
      if (!fixedSpaceId && d.spaceId && spaces.some((s) => s.id === d.spaceId)) setSpaceId(d.spaceId)
      setPoll(d.poll)
      setUploads(d.media.map((m, i) => ({ key: `restored-${i}`, kind: m.type === "file" ? "file" : "image", name: m.type === "file" ? m.name : "", size: m.type === "file" ? (m.size ?? 0) : 0, preview: m.type === "image" ? m.url : undefined, progress: 100, media: m })))
      setOpen(true)
      setRestored(true)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Every change kept, a moment after typing stops. */
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      try {
        const media = uploads.map((u) => u.media).filter((m): m is PostMedia => !!m)
        if (!title && !body && !poll && !media.length) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, JSON.stringify({ title, body, spaceId, poll, media } satisfies Draft))
      } catch {
        /* Private mode: nothing kept, nothing lost. */
      }
    }, 400)
    return () => window.clearTimeout(t)
  }, [open, title, body, spaceId, poll, uploads, key])

  /* The first link in the text, as a card. */
  const link = URL_IN_TEXT.exec(body)?.[0] ?? null
  useEffect(() => {
    if (!link || link === dismissed || preview?.url === link) {
      if (!link) setPreview(null)
      return
    }
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      const r = await api<{ preview: LinkPreview | null }>(`${apiBase(communityId)}/posts/link-preview`, { body: { url: link }, signal: ctrl.signal })
      if (r.ok && r.data.preview) setPreview(r.data.preview)
    }, 600)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [link, dismissed, communityId, preview?.url])

  const addPictures = async (files: FileList | null) => {
    if (!files?.length) return
    const room = MAX_MEDIA_PER_POST - uploads.length
    const list = Array.from(files).slice(0, Math.max(0, room))
    if (list.length < files.length) toast(`Up to ${MAX_MEDIA_PER_POST} pictures and files in one post.`)
    for (const file of list) {
      const k = `${Date.now()}-${Math.random()}`
      setUploads((u) => [...u, { key: k, kind: "image", name: file.name, size: file.size, preview: URL.createObjectURL(file), progress: 10 }])
      try {
        const media = await uploadPicture(file, userId, communityId)
        setUploads((u) => u.map((x) => (x.key === k ? { ...x, progress: 100, media } : x)))
      } catch (e) {
        setUploads((u) => u.filter((x) => x.key !== k))
        toast((e as Error).message || "The picture did not upload.")
      }
    }
  }

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !fileProductId) return
    for (const file of Array.from(files).slice(0, Math.max(0, MAX_MEDIA_PER_POST - uploads.length))) {
      const k = `${Date.now()}-${Math.random()}`
      setUploads((u) => [...u, { key: k, kind: "file", name: file.name, size: file.size, progress: 0 }])
      try {
        const result = await new DirectUploader({ file, productId: fileProductId, folder: "digital", onProgress: (p) => setUploads((u) => u.map((x) => (x.key === k ? { ...x, progress: p } : x))) }).start()
        if (!result.assetId) throw new Error("The file did not upload.")
        setUploads((u) => u.map((x) => (x.key === k ? { ...x, progress: 100, media: { type: "file", assetId: result.assetId!, name: result.fileName || file.name, size: result.fileSize || file.size } } : x)))
      } catch (e) {
        setUploads((u) => u.filter((x) => x.key !== k))
        toast((e as { message?: string })?.message || "The file did not upload.")
      }
    }
  }

  const reset = () => {
    setTitle("")
    setBody("")
    setPoll(null)
    setUploads([])
    setPreview(null)
    setDismissed(null)
    setRestored(false)
    setOpen(false)
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* nothing kept */
    }
  }

  const uploading = uploads.some((u) => !u.media)
  const pollReady = !poll || (poll.question.trim() && poll.options.filter((o) => o.trim()).length >= 2)
  const empty = !title.trim() && !body.trim() && !uploads.length && !poll
  const space = spaces.find((s) => s.id === spaceId) ?? null

  const submit = async () => {
    if (busy || uploading || empty || !pollReady || !spaceId) return
    setBusy(true)
    const media: PostMedia[] = uploads.map((u) => u.media).filter((m): m is PostMedia => !!m)
    if (preview && preview.url !== dismissed) media.push({ type: "link", url: preview.url, ...(preview.title ? { title: preview.title } : {}), ...(preview.image ? { image: preview.image } : {}) })
    const closesAt = poll?.closesIn ? new Date(Date.now() + Number(poll.closesIn) * 86_400_000).toISOString() : null
    const r = await api<{ post: FeedPostView }>(`${apiBase(communityId)}/posts`, {
      body: {
        spaceId,
        title: title.trim(),
        body: body.trim(),
        media,
        poll: poll ? { question: poll.question, options: poll.options.filter((o) => o.trim()), multiple: poll.multiple, closesAt } : undefined,
      },
    })
    setBusy(false)
    if (!r.ok) return toast(r.error)
    onPosted(r.data.post)
    reset()
    toast("Posted")
  }

  if (!open) {
    return (
      <div className={`${CARD} flex items-center gap-3 p-3 sm:p-3.5`} data-composer="closed">
        <AppAvatar src={me.avatarUrl} name={me.name} alt="" size={36} markWhileLoading />
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            requestAnimationFrame(() => textRef.current?.focus())
          }}
          className="flex h-10 min-w-0 flex-1 items-center rounded-full bg-[#f4f5f7] px-4 text-left text-[15px] text-[#8a8f98] transition-colors hover:bg-[#eef0f2]"
          data-composer-open=""
        >
          Share something...
        </button>
      </div>
    )
  }

  return (
    <div className={`${CARD} p-3.5 sm:p-4`} data-composer="open">
      <div className="flex items-start gap-3">
        <AppAvatar src={me.avatarUrl} name={me.name} alt="" size={36} markWhileLoading />
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Title (optional)"
            aria-label="Title"
            className="block w-full bg-transparent pt-1.5 text-[17px] font-semibold text-[#1a1a2e] outline-none placeholder:font-medium placeholder:text-[#a3a8b0]"
          />
          <MentionTextarea
            ref={textRef}
            communityId={communityId}
            value={body}
            onChange={setBody}
            placeholder="Share something..."
            ariaLabel="Post"
            minRows={3}
            maxLength={20000}
            className="mt-1.5 text-[16px] leading-[1.55] text-[#262633] sm:text-[15px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void submit()
              }
            }}
          />
          {restored ? <p className="mt-1 text-[12.5px] text-[#8a8f98]">Your draft is back where you left it.</p> : null}
        </div>
      </div>

      {uploads.length ? (
        <div className="mt-3 flex flex-wrap gap-2 sm:pl-12" data-composer-uploads="">
          {uploads.map((u) =>
            u.kind === "image" ? (
              <div key={u.key} className="relative h-[76px] w-[76px] overflow-hidden rounded-xl bg-[#f1f2f4]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {u.preview ? <img src={u.preview} alt="" className={`h-full w-full object-cover ${u.media ? "" : "opacity-60"}`} /> : null}
                {!u.media ? <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin text-white" aria-label="Uploading" /> : null}
                <RemoveButton onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} />
              </div>
            ) : (
              <div key={u.key} className="relative flex h-12 min-w-[180px] max-w-full items-center gap-2 rounded-xl border border-[#e8e9ec] py-1 pl-3 pr-11">
                <Paperclip className="h-4 w-4 shrink-0 text-[#6b7280]" aria-hidden />
                <span className="min-w-0">
                  <span className="block max-w-[200px] truncate text-[13px] font-medium text-[#1a1a2e]">{u.name}</span>
                  <span className="block text-[12px] text-[#6b7280]">{u.media ? fileSize(u.size) : `${Math.round(u.progress)}%`}</span>
                </span>
                <RemoveButton onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} />
              </div>
            ),
          )}
        </div>
      ) : null}

      {preview && preview.url !== dismissed ? (
        <div className="mt-3 sm:pl-12">
          <LinkCard url={preview.url} title={preview.title} image={preview.image} onRemove={() => setDismissed(preview.url)} />
        </div>
      ) : null}

      {poll ? <PollEditor poll={poll} onChange={setPoll} onRemove={() => setPoll(null)} /> : null}

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-[#f0f1f3] pt-2.5 sm:pl-12">
        <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" multiple hidden onChange={(e) => (void addPictures(e.target.files), (e.target.value = ""))} />
        <button type="button" aria-label="Add pictures" title="Add pictures" className={ICON_BTN} onClick={() => imageInput.current?.click()} data-composer-image="">
          <ImagePlus className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <button type="button" aria-label="Add a poll" title="Add a poll" aria-pressed={!!poll} className={`${ICON_BTN} ${poll ? "bg-[#f1f2f4] text-[#1a1a2e]" : ""}`} onClick={() => setPoll((p) => p ?? { question: "", options: ["", ""], multiple: false, closesIn: "" })} data-composer-poll="">
          <BarChart3 className="h-5 w-5" strokeWidth={1.75} />
        </button>
        {fileProductId ? (
          <>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => (void addFiles(e.target.files), (e.target.value = ""))} />
            <button type="button" aria-label="Attach a file" title="Attach a file" className={ICON_BTN} onClick={() => fileInput.current?.click()}>
              <Paperclip className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </>
        ) : null}

        {!fixedSpaceId && spaces.length > 1 ? (
          <ResponsiveActionMenu
            title="Post in"
            align="start"
            items={spaces.map((s) => ({ label: s.name, onClick: () => setSpaceId(s.id) }))}
            trigger={
              <button type="button" className={`${BTN_GHOST} ml-1 max-w-[180px] gap-1 text-[13.5px]`} data-composer-space="">
                <span className="truncate">in {space?.name ?? "a space"}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </button>
            }
          />
        ) : space && !fixedSpaceId ? (
          <span className="ml-2 text-[13.5px] text-[#6b7280]">in {space.name}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className={BTN_GHOST} onClick={reset} disabled={busy}>
            {empty ? "Close" : "Discard"}
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={submit} disabled={busy || uploading || empty || !pollReady || !spaceId} data-composer-post="">
            {busy ? "Posting..." : "Post"}
          </button>
        </div>
      </div>
    </div>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Remove" className="absolute right-0.5 top-0.5 flex h-10 w-10 items-center justify-center">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
        <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </span>
    </button>
  )
}

function PollEditor({ poll, onChange, onRemove }: { poll: PollDraft; onChange: (p: PollDraft) => void; onRemove: () => void }) {
  const set = (patch: Partial<PollDraft>) => onChange({ ...poll, ...patch })
  return (
    <div className="mt-3 rounded-xl border border-[#e8e9ec] p-3 sm:ml-12" data-composer-poll-editor="">
      <div className="flex items-center gap-2">
        <input value={poll.question} onChange={(e) => set({ question: e.target.value })} maxLength={200} placeholder="Ask a question" aria-label="Poll question" className={`${FIELD} font-medium`} />
        <button type="button" onClick={onRemove} aria-label="Remove poll" className={ICON_BTN}>
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {poll.options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={o}
              onChange={(e) => set({ options: poll.options.map((x, j) => (j === i ? e.target.value : x)) })}
              maxLength={100}
              placeholder={`Choice ${i + 1}`}
              aria-label={`Choice ${i + 1}`}
              className={FIELD}
            />
            {poll.options.length > 2 ? (
              <button type="button" onClick={() => set({ options: poll.options.filter((_, j) => j !== i) })} aria-label={`Remove choice ${i + 1}`} className={ICON_BTN}>
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {poll.options.length < POLL_OPTIONS_MAX ? (
          <button type="button" onClick={() => set({ options: [...poll.options, ""] })} className={`${BTN_GHOST} -ml-2 text-[13.5px]`}>
            <Plus className="h-4 w-4" aria-hidden />
            Add a choice
          </button>
        ) : null}
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-[13.5px] text-[#4b5563]">
          <input type="checkbox" checked={poll.multiple} onChange={(e) => set({ multiple: e.target.checked })} className="h-4 w-4 accent-[#1a1a2e]" />
          More than one answer
        </label>
        <label className="flex min-h-10 items-center gap-2 text-[13.5px] text-[#4b5563]">
          Closes
          <select value={poll.closesIn} onChange={(e) => set({ closesIn: e.target.value as PollDraft["closesIn"] })} className="h-10 rounded-lg border border-[#e3e4e8] bg-white px-2 text-[14px] text-[#1a1a2e] outline-none">
            <option value="">Never</option>
            <option value="1">In a day</option>
            <option value="3">In 3 days</option>
            <option value="7">In a week</option>
          </select>
        </label>
      </div>
    </div>
  )
}

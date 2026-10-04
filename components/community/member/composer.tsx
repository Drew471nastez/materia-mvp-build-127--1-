"use client"

/**
 * ===========================================================================
 *  "SHARE SOMETHING..."
 * ===========================================================================
 * Closed, the composer is the member's picture and "Share something...",
 * nothing else (round 7). Pressing it opens the editor: in place on a
 * computer, a screen of its own sliding up on a phone. The editor is a title
 * and the words (both needed), what the post carries, and one toolbar after
 * Skool's: attach files, add a link, a video (a YouTube or Vimeo address,
 * or Upload for one from the device, side by side in one row), a poll, an
 * emoji, a GIF, the space it goes to ("Select a space", only spaces this
 * member may post in), Cancel and Post.
 * Post waits until there is a title, words, a space and nothing still
 * uploading.
 *
 * WHAT IS ATTACHED, BY WHAT IT IS (media-upload.ts): a picture goes to
 * Storelib's picture storage; a video through the community's video route,
 * with a still for the card; any other file through the community's file
 * route, checked before and after it is sent. A link typed in the words
 * brings its card on its own (fetched by the server), a YouTube or Vimeo
 * address brings the video, and either can be taken off.
 *
 * LEAVING WITH SOMETHING WRITTEN asks first, in Storelib's own dialog: "You
 * haven't finished your post yet. Leave without posting?" (Keep writing /
 * Leave), on Cancel, on closing the phone's screen, on Back, and on a link
 * to another page (useLeaveGuard). Closing the tab gets the browser's own
 * question.
 *
 * WHAT IS TYPED IS KEPT. Every change is written to this browser's storage
 * for this community, and comes back if the page is closed, refreshed or
 * crashed before posting. Posting, or choosing Leave, clears it.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { BarChart3, ChevronDown, Clapperboard, FileText, Link2, Loader2, Paperclip, Play, Plus, Upload, X } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { EmojiControl } from "@/components/app/rich-text/emoji-picker"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { uploadCommunityVideo } from "@/lib/video/upload-client"
import { MAX_MEDIA_PER_POST, POLL_OPTIONS_MAX } from "@/lib/communities/limits"
import { MAX_EMBEDS, MAX_GIFS, STAFF_FILE_MAX_BYTES, embedFromUrl, fileSizeLabel } from "@/lib/communities/post-media"
import type { FeedPostView, PostMedia } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { LinkCard } from "./media"
import { GifButton } from "./media-gif"
import { uploadCommunityFile, uploadKindOf, uploadPicture, uploadVideoPoster } from "./media-upload"
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
  /** Kept for the pages that pass it; files now go through the community's own file route for every member. */
  fileProductId?: string | null
  /** Kept for the pages that pass it; events are made on the creator side. */
  eventHref?: string | null
  onPosted: (post: FeedPostView) => void
}

type AttachmentKind = "image" | "video" | "file" | "gif" | "embed"

interface Attachment {
  key: string
  kind: AttachmentKind
  name: string
  size: number
  preview?: string
  progress: number
  media?: PostMedia
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

export const LEAVE_QUESTION = "You haven't finished your post yet. Leave without posting?"

/** One tool in the editor's row: a 40px target, the glyph alone, no box until hovered. */
const TOOL =
  "inline-flex h-10 w-10 shrink-0 cursor-pointer select-none items-center justify-center rounded-[10px] text-[#6b7280] outline-none transition-colors duration-150 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] active:opacity-70 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-[#eceef1] aria-pressed:text-[#1a1a2e] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

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

function attachmentOf(m: PostMedia, key: string): Attachment {
  if (m.type === "image") return { key, kind: "image", name: "", size: 0, preview: m.url, progress: 100, media: m }
  if (m.type === "video") return { key, kind: "video", name: "Video", size: 0, preview: m.poster, progress: 100, media: m }
  if (m.type === "file") return { key, kind: "file", name: m.name, size: m.size ?? 0, progress: 100, media: m }
  if (m.type === "gif") return { key, kind: "gif", name: m.title ?? "GIF", size: 0, preview: m.still, progress: 100, media: m }
  if (m.type === "embed") return { key, kind: "embed", name: m.title ?? (m.provider === "youtube" ? "YouTube" : "Vimeo"), size: 0, preview: m.thumb, progress: 100, media: m }
  return { key, kind: "file", name: "", size: 0, progress: 100 }
}

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

/**
 * NOT LEAVING BY ACCIDENT. While `active`: a link to another page is held
 * and the question asked first; Back is held by one extra step of history
 * (pushed while it matters, taken away again after) and the question asked;
 * closing or reloading the tab gets the browser's own. `sheet` also makes
 * Back close the phone's screen when nothing is written.
 */
function useLeaveGuard(opts: { active: boolean; sheet: boolean; ask: () => Promise<boolean>; onLeave: () => void; onSheetBack: () => void }) {
  const router = useRouter()
  const latest = useRef(opts)
  useEffect(() => {
    latest.current = opts
  })
  const guarding = opts.active || opts.sheet

  useEffect(() => {
    if (!opts.active) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.closest("[data-composer]")) return
      let url: URL
      try {
        url = new URL(a.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return
      e.preventDefault()
      e.stopPropagation()
      void latest.current.ask().then((leave) => {
        if (!leave) return
        latest.current.onLeave()
        router.push(`${url.pathname}${url.search}${url.hash}`)
      })
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClick, true)
    }
  }, [opts.active, router])

  useEffect(() => {
    if (!guarding) return
    const marker = `composer-${Date.now()}`
    const push = () => window.history.pushState({ ...(window.history.state ?? {}), storelibComposer: marker }, "", window.location.href)
    push()
    let ours = true
    const onPop = () => {
      if ((window.history.state as { storelibComposer?: string } | null)?.storelibComposer === marker) return
      if (!latest.current.active) {
        ours = false
        latest.current.onSheetBack()
        return
      }
      /* Held: the step comes back, and the question is asked. */
      push()
      void latest.current.ask().then((leave) => {
        if (!leave) return
        /* On a phone Back closes the screen, so Leave does only that; in place, Back meant the page before. */
        if (latest.current.sheet) return latest.current.onLeave()
        ours = false
        latest.current.onLeave()
        window.history.go(-2)
      })
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (ours && (window.history.state as { storelibComposer?: string } | null)?.storelibComposer === marker) window.history.back()
    }
  }, [guarding])
}

export function Composer({ communityId, userId, me, spaces, fixedSpaceId = null, onPosted }: ComposerProps) {
  const key = draftKey(communityId, fixedSpaceId)
  const phone = usePhone()
  const [open, setOpen] = useState(false)
  const [sheetIn, setSheetIn] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [spaceId, setSpaceId] = useState<string | null>(fixedSpaceId ?? (spaces.length === 1 ? spaces[0].id : null))
  const [poll, setPoll] = useState<PollDraft | null>(null)
  const [items, setItems] = useState<Attachment[]>([])
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [linkField, setLinkField] = useState<null | "link" | "video">(null)
  const [linkText, setLinkText] = useState("")
  const [busy, setBusy] = useState(false)
  const [restored, setRestored] = useState(false)
  const [asking, setAsking] = useState<((leave: boolean) => void) | null>(null)
  const textRef = useRef<MentionTextareaHandle>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)

  /* A draft left here comes back: open in place on a computer, waiting under "Continue" on a phone. */
  useEffect(() => {
    const d = readDraft(key)
    if (d && (d.title || d.body || d.poll || d.media.length)) {
      setTitle(d.title)
      setBody(d.body)
      if (!fixedSpaceId && d.spaceId && spaces.some((s) => s.id === d.spaceId)) setSpaceId(d.spaceId)
      setPoll(d.poll)
      setItems(d.media.filter((m) => m.type !== "link").map((m, i) => attachmentOf(m, `restored-${i}`)))
      const link = d.media.find((m): m is Extract<PostMedia, { type: "link" }> => m.type === "link")
      if (link) setPreview({ url: link.url, title: link.title ?? null, image: link.image ?? null, site: null })
      setRestored(true)
      if (!window.matchMedia("(max-width: 639px)").matches) setOpen(true)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const media = items.map((u) => u.media).filter((m): m is PostMedia => !!m)
  const linkMedia: PostMedia | null = preview && !dismissed.includes(preview.url) ? { type: "link", url: preview.url, ...(preview.title ? { title: preview.title } : {}), ...(preview.image ? { image: preview.image } : {}) } : null

  /* Every change kept, a moment after typing stops. */
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      try {
        const all = linkMedia ? [...media, linkMedia] : media
        if (!title && !body && !poll && !all.length) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, JSON.stringify({ title, body, spaceId, poll, media: all } satisfies Draft))
      } catch {
        /* Private mode: nothing kept, nothing lost. */
      }
    }, 400)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, body, spaceId, poll, items, preview, dismissed, key])

  const add = (a: Attachment) => setItems((list) => [...list, a])
  const patch = (k: string, p: Partial<Attachment>) => setItems((list) => list.map((x) => (x.key === k ? { ...x, ...p } : x)))
  const drop = (k: string) => setItems((list) => list.filter((x) => x.key !== k))
  const room = () => MAX_MEDIA_PER_POST - items.length
  const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  /* An address in the words: YouTube or Vimeo become the video, anything else its card. */
  const typedLink = URL_IN_TEXT.exec(body)?.[0] ?? null
  useEffect(() => {
    if (!typedLink || dismissed.includes(typedLink)) return
    const embed = embedFromUrl(typedLink)
    if (embed) {
      if (dismissed.includes(embed.url)) return
      const t = window.setTimeout(() => {
        setItems((list) => (list.some((x) => x.media?.type === "embed" && x.media.id === embed.id) || list.length >= MAX_MEDIA_PER_POST ? list : [...list, attachmentOf({ type: "embed", ...embed }, newKey())]))
      }, 400)
      return () => window.clearTimeout(t)
    }
    if (preview?.url === typedLink || (preview && !dismissed.includes(preview.url))) return
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      const r = await api<{ preview: LinkPreview | null }>(`${apiBase(communityId)}/posts/link-preview`, { body: { url: typedLink }, signal: ctrl.signal })
      if (r.ok && r.data.preview) setPreview(r.data.preview)
    }, 600)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedLink, dismissed, communityId])

  const addLink = async () => {
    const raw = linkText.trim()
    if (!raw) return
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const embed = embedFromUrl(url)
    if (linkField === "video" && !embed) return toast("Paste a YouTube or Vimeo link.")
    if (embed) {
      if (items.filter((x) => x.kind === "embed").length >= MAX_EMBEDS) return toast(`Up to ${MAX_EMBEDS} videos by link in one post.`)
      if (!room()) return toast(`Up to ${MAX_MEDIA_PER_POST} things in one post.`)
      const k = newKey()
      add(attachmentOf({ type: "embed", ...embed }, k))
      setLinkText("")
      setLinkField(null)
      /* Vimeo's picture and either one's title come from its page, read by the server. */
      const r = await api<{ preview: LinkPreview | null }>(`${apiBase(communityId)}/posts/link-preview`, { body: { url: embed.url } })
      if (r.ok && r.data.preview) {
        const p = r.data.preview
        setItems((list) =>
          list.map((x) =>
            x.key === k && x.media?.type === "embed"
              ? { ...x, name: p.title || x.name, preview: x.preview ?? p.image ?? undefined, media: { ...x.media, ...(p.title ? { title: p.title.slice(0, 200) } : {}), ...(!x.media.thumb && p.image ? { thumb: p.image } : {}) } }
              : x,
          ),
        )
      }
      return
    }
    setLinkField(null)
    setLinkText("")
    setDismissed((d) => d.filter((x) => x !== url))
    setPreview({ url, title: null, image: null, site: null })
    const r = await api<{ preview: LinkPreview | null }>(`${apiBase(communityId)}/posts/link-preview`, { body: { url } })
    if (r.ok && r.data.preview) setPreview(r.data.preview)
    else if (!r.ok) toast(r.error)
  }

  /* A video goes through the community's video route; only a ready one can be posted. Its still is the card's picture. */
  const addVideo = async (file: File | undefined) => {
    if (!file) return
    if (!room()) return toast(`Up to ${MAX_MEDIA_PER_POST} things in one post.`)
    if (!file.type.startsWith("video/")) return toast("That file is not a video.")
    const k = newKey()
    add({ key: k, kind: "video", name: file.name, size: file.size, progress: 0 })
    try {
      const [video, still] = await Promise.all([
        uploadCommunityVideo({ endpoint: `${apiBase(communityId)}/videos`, file, onProgress: (p) => patch(k, { progress: Math.min(99, p) }) }),
        uploadVideoPoster(file, userId, communityId),
      ])
      if (video.status === "failed") throw new Error(video.error || "The video could not be processed.")
      if (video.status !== "ready") throw new Error("The video is still processing. Add it again in a few minutes.")
      patch(k, { progress: 100, preview: still?.poster, media: { type: "video", videoId: video.id, ...(still ? { poster: still.poster, w: still.w, h: still.h } : {}) } })
    } catch (e) {
      drop(k)
      toast((e as { message?: string })?.message || "The video did not upload.")
    }
  }

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files).slice(0, Math.max(0, room()))
    if (list.length < files.length) toast(`Up to ${MAX_MEDIA_PER_POST} things in one post.`)
    await Promise.all(
      list.map(async (file) => {
        const kind = uploadKindOf(file)
        const k = newKey()
        if (kind === "image") {
          add({ key: k, kind, name: file.name, size: file.size, preview: URL.createObjectURL(file), progress: 10 })
          try {
            const pic = await uploadPicture(file, userId, communityId)
            patch(k, { progress: 100, media: pic })
          } catch (e) {
            drop(k)
            toast((e as Error).message || "The picture did not upload.")
          }
          return
        }
        if (kind === "video") return addVideo(file)
        if (file.size > STAFF_FILE_MAX_BYTES) return toast(`${file.name} is over ${fileSizeLabel(STAFF_FILE_MAX_BYTES)}.`)
        add({ key: k, kind: "file", name: file.name, size: file.size, progress: 0 })
        try {
          const done = await uploadCommunityFile({ communityId, file, onProgress: (p) => patch(k, { progress: p }) })
          patch(k, { progress: 100, name: done.name, media: done })
        } catch (e) {
          drop(k)
          toast((e as Error).message || "The file did not upload.")
        }
      }),
    )
  }

  const addGif = (gif: Extract<PostMedia, { type: "gif" }>) => {
    if (items.filter((x) => x.kind === "gif").length >= MAX_GIFS) return toast(`Up to ${MAX_GIFS} GIFs in one post.`)
    if (!room()) return toast(`Up to ${MAX_MEDIA_PER_POST} things in one post.`)
    add(attachmentOf(gif, newKey()))
  }

  const removeItem = (a: Attachment) => {
    const m = a.media
    if (m?.type === "embed") {
      /* Taken off, it stays off: the address in the words does not bring it back. */
      const typed = typedLink && embedFromUrl(typedLink)?.id === m.id ? [typedLink] : []
      setDismissed((d) => [...d, m.url, ...typed])
    }
    drop(a.key)
  }

  const dirty = !!(title.trim() || body.trim() || items.length || poll || linkMedia)
  const uploading = items.some((u) => !u.media)
  const pollReady = !poll || (poll.question.trim() && poll.options.filter((o) => o.trim()).length >= 2)
  const space = spaces.find((s) => s.id === spaceId) ?? null
  const ready = !!title.trim() && !!body.trim() && !!spaceId && !uploading && !!pollReady
  const sheet = open && phone

  const clear = useCallback(() => {
    setTitle("")
    setBody("")
    setPoll(null)
    setItems([])
    setPreview(null)
    setDismissed([])
    setLinkField(null)
    setLinkText("")
    setRestored(false)
    if (!fixedSpaceId && spaces.length !== 1) setSpaceId(null)
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* nothing kept */
    }
  }, [fixedSpaceId, spaces.length, key])

  const shut = useCallback(() => {
    setSheetIn(false)
    window.setTimeout(() => setOpen(false), phone ? 260 : 0)
  }, [phone])

  const ask = useCallback(() => new Promise<boolean>((resolve) => setAsking(() => resolve)), [])

  const cancel = async () => {
    if (dirty && !(await ask())) return
    clear()
    shut()
  }

  useLeaveGuard({
    active: open && dirty,
    sheet,
    ask,
    onLeave: () => {
      clear()
      setSheetIn(false)
      setOpen(false)
    },
    onSheetBack: shut,
  })

  /* The phone's screen slides up on the frame after it is drawn closed. */
  useEffect(() => {
    if (!sheet) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSheetIn(true)))
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = "hidden"
    return () => {
      cancelAnimationFrame(id)
      html.style.overflow = prev
    }
  }, [sheet])

  const submit = async () => {
    if (busy || !ready) return
    setBusy(true)
    const all = linkMedia ? [...media, linkMedia] : media
    const closesAt = poll?.closesIn ? new Date(Date.now() + Number(poll.closesIn) * 86_400_000).toISOString() : null
    const r = await api<{ post: FeedPostView }>(`${apiBase(communityId)}/posts`, {
      body: {
        spaceId,
        title: title.trim(),
        body: body.trim(),
        media: all,
        poll: poll ? { question: poll.question, options: poll.options.filter((o) => o.trim()), multiple: poll.multiple, closesAt } : undefined,
      },
    })
    setBusy(false)
    if (!r.ok) return toast(r.error)
    onPosted(r.data.post)
    clear()
    shut()
    toast("Posted")
  }

  const openEditor = () => {
    setOpen(true)
    requestAnimationFrame(() => (title ? textRef.current?.focus() : titleRef.current?.focus()))
  }

  const pickers = (
    <>
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => (void addFiles(e.target.files), (e.target.value = ""))} data-composer-file-input="" />
      <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => (void addVideo(e.target.files?.[0]), (e.target.value = ""))} data-composer-video-input="" />
    </>
  )

  const answer = (leave: boolean) => {
    asking?.(leave)
    setAsking(null)
  }
  /* Over the phone's editor screen too (it sits at z 125), so not the member area's Modal (z 80). */
  const leaveDialog = (
    <DialogPrimitive.Root open={!!asking} onOpenChange={(o) => (!o ? answer(false) : undefined)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[150] bg-[#0f1115]/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[151] mx-auto w-full max-w-[440px] rounded-t-[20px] bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_20px_60px_-12px_rgba(17,24,39,0.35)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5"
        >
          <DialogPrimitive.Title className="text-[17px] font-semibold leading-snug text-[#1a1a2e]">{LEAVE_QUESTION}</DialogPrimitive.Title>
          <div className="mt-5 flex justify-end gap-2" data-leave-dialog="">
            <button type="button" className={BTN_GHOST} onClick={() => answer(false)} data-leave-stay="" autoFocus>
              Keep writing
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => answer(true)} data-leave-go="">
              Leave
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )

  const closed = (
    <div className={`${CARD} px-3 py-3 sm:px-4 sm:py-3.5`} data-composer="closed">
      <div className="flex items-center gap-3">
        <AppAvatar src={me.avatarUrl} name={me.name} alt="" size={40} markWhileLoading />
        <button
          type="button"
          onClick={openEditor}
          className="flex h-11 min-w-0 flex-1 items-center rounded-xl border border-[#eceef1] bg-[#f6f7f8] px-4 text-left text-[15px] text-[#8a8f98] transition-colors hover:bg-[#f1f2f4]"
          data-composer-open=""
        >
          <span className="truncate">{restored && title ? `Continue: ${title}` : "Share something..."}</span>
        </button>
      </div>
    </div>
  )

  if (!open) {
    return (
      <>
        {pickers}
        {closed}
        {leaveDialog}
      </>
    )
  }

  const spacePicker =
    !fixedSpaceId && spaces.length > 1 ? (
      <ResponsiveActionMenu
        title="Post in"
        align="start"
        items={spaces.map((s) => ({ label: s.name, onClick: () => setSpaceId(s.id) }))}
        trigger={
          <button
            type="button"
            className={`inline-flex h-10 max-w-[200px] shrink-0 items-center gap-1 rounded-[10px] px-2.5 text-[14px] font-medium outline-none transition-colors hover:bg-[#f1f2f4] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 ${space ? "text-[#1a1a2e]" : "text-[#6b7280]"}`}
            data-composer-space={space ? space.id : ""}
          >
            <span className="truncate">{space ? space.name : "Select a space"}</span>
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        }
      />
    ) : space ? (
      <span className="truncate px-2 text-[14px] font-medium text-[#4b5563]" data-composer-space={space.id}>
        {space.name}
      </span>
    ) : null

  const tools = (
    <div className="flex min-w-0 items-center gap-0.5" data-composer-tools="">
      <button type="button" aria-label="Attach files" title="Attach files" className={TOOL} onClick={() => fileInput.current?.click()} data-composer-tool="file">
        <Paperclip className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <button type="button" aria-label="Add a link" title="Add a link" aria-pressed={linkField === "link"} className={TOOL} onClick={() => setLinkField((f) => (f === "link" ? null : "link"))} data-composer-tool="link">
        <Link2 className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <button type="button" aria-label="Add a video" title="Add a video" aria-pressed={linkField === "video"} className={TOOL} onClick={() => setLinkField((f) => (f === "video" ? null : "video"))} data-composer-tool="video">
        <Clapperboard className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <button type="button" aria-label="Add a poll" title="Add a poll" aria-pressed={!!poll} className={TOOL} onClick={() => setPoll((p) => (p ? null : { question: "", options: ["", ""], multiple: false, closesIn: "" }))} data-composer-tool="poll">
        <BarChart3 className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <span data-composer-tool="emoji" className="contents">
        <EmojiControl className={TOOL} onBeforeOpen={() => undefined} onInsert={(e) => textRef.current?.insert(e)} />
      </span>
      <GifButton communityId={communityId} className={TOOL} onPick={addGif} />
    </div>
  )

  const fields = (
    <>
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        placeholder="Title"
        aria-label="Title"
        aria-required="true"
        className="block w-full bg-transparent text-[18px] font-semibold text-[#1a1a2e] outline-none placeholder:font-semibold placeholder:text-[#a3a8b0] sm:text-[19px]"
        data-composer-title=""
      />
      <MentionTextarea
        ref={textRef}
        communityId={communityId}
        value={body}
        onChange={setBody}
        placeholder="Write something..."
        ariaLabel="Post"
        minRows={sheet ? 6 : 4}
        maxLength={20000}
        className="mt-2 text-[16px] leading-[1.55] text-[#262633] sm:text-[15px]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void submit()
          }
        }}
      />
      {restored ? <p className="mt-1 text-[12.5px] text-[#8a8f98]">Your draft is back where you left it.</p> : null}

      {linkField ? (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void addLink()
          }}
          data-composer-link-field={linkField}
        >
          <input value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder={linkField === "video" ? "YouTube or Vimeo link" : "Paste a link"} aria-label={linkField === "video" ? "Video link" : "Link"} inputMode="url" autoFocus className={FIELD} />
          <button type="submit" className={BTN_PRIMARY} disabled={!linkText.trim()}>
            Add
          </button>
          {linkField === "video" ? (
            /* The file picker opens inside this press: a browser only opens one from a press it is still handling. */
            <button type="button" className={`${BTN_GHOST} gap-1.5 border border-[#e3e4e8] px-3`} onClick={() => videoInput.current?.click()} data-composer-video-upload="">
              <Upload className="h-4 w-4" aria-hidden />
              <span className="max-sm:sr-only">Upload</span>
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close"
            className={ICON_BTN}
            onClick={() => {
              setLinkField(null)
              setLinkText("")
            }}
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </form>
      ) : null}

      {items.length ? (
        <div className="mt-3 flex flex-wrap gap-2" data-composer-uploads="">
          {items.map((u) => (
            <AttachmentTile key={u.key} a={u} onRemove={() => removeItem(u)} />
          ))}
        </div>
      ) : null}

      {linkMedia && preview ? (
        <div className="mt-3">
          <LinkCard url={preview.url} title={preview.title} image={preview.image} onRemove={() => setDismissed((d) => [...d, preview.url])} />
        </div>
      ) : null}

      {poll ? <PollEditor poll={poll} onChange={setPoll} onRemove={() => setPoll(null)} /> : null}
    </>
  )

  if (sheet) {
    return (
      <>
        {pickers}
        {closed}
        {createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New post"
            data-composer="sheet"
            data-composer-sheet-in={sheetIn ? "true" : "false"}
            className="fixed inset-x-0 top-[var(--vv-top,0px)] z-[125] flex h-[var(--vv-h,100dvh)] flex-col bg-white"
            style={{ translate: sheetIn ? "0 0" : "0 100%", transition: "translate 280ms cubic-bezier(0.32, 0.72, 0, 1)" }}
          >
            <div className="shrink-0 border-b border-[#f0f1f3] pt-[env(safe-area-inset-top)]">
              <div className="flex h-14 items-center gap-2 px-2">
                <button type="button" onClick={() => void cancel()} className={`${BTN_GHOST} px-3`} data-composer-cancel="">
                  Cancel
                </button>
                <span className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold text-[#1a1a2e]">New post</span>
                <button type="button" className={`${BTN_PRIMARY} px-4`} onClick={submit} disabled={busy || !ready} data-composer-post="">
                  {busy ? "Posting..." : "Post"}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
              <div className="mb-3 flex min-w-0 items-center gap-2">
                <AppAvatar src={me.avatarUrl} name={me.name} alt="" size={32} markWhileLoading />
                <span className="shrink-0 text-[14px] text-[#6b7280]">Posting in</span>
                <span className="-ml-1.5 min-w-0">{spacePicker}</span>
              </div>
              {fields}
            </div>
            <div className="shrink-0 border-t border-[#f0f1f3] bg-white px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5">{tools}</div>
          </div>,
          document.body,
        )}
        {leaveDialog}
      </>
    )
  }

  return (
    <>
      {pickers}
      <div className={`${CARD} p-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)] sm:px-5 sm:pt-4`} data-composer="open">
        <div className="mb-3 flex items-center gap-2.5">
          <AppAvatar src={me.avatarUrl} name={me.name} alt="" size={32} markWhileLoading />
          <span className="text-[14px] text-[#6b7280]">
            <span className="font-semibold text-[#1a1a2e]">{me.name}</span> posting{space ? ` in ${space.name}` : ""}
          </span>
        </div>
        {fields}
        <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-[#f0f1f3] pt-2.5">
          {tools}
          {spacePicker}
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" className={BTN_GHOST} onClick={() => void cancel()} disabled={busy} data-composer-cancel="">
              Cancel
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={submit} disabled={busy || !ready} data-composer-post="">
              {busy ? "Posting..." : "Post"}
            </button>
          </div>
        </div>
      </div>
      {leaveDialog}
    </>
  )
}

function AttachmentTile({ a, onRemove }: { a: Attachment; onRemove: () => void }) {
  const loading = !a.media
  if (a.kind === "file") {
    return (
      <div className="relative flex h-12 min-w-[180px] max-w-full items-center gap-2 rounded-xl border border-[#e8e9ec] py-1 pl-3 pr-11" data-attachment="file" data-ready={loading ? "false" : "true"}>
        <FileText className="h-4 w-4 shrink-0 text-[#6b7280]" aria-hidden />
        <span className="min-w-0">
          <span className="block max-w-[200px] truncate text-[13px] font-medium text-[#1a1a2e]">{a.name}</span>
          <span className="block text-[12px] text-[#6b7280]">{loading ? `${Math.round(a.progress)}%` : fileSizeLabel(a.size)}</span>
        </span>
        <RemoveButton onClick={onRemove} />
      </div>
    )
  }
  const video = a.kind === "video" || a.kind === "embed"
  return (
    <div className={`relative h-[76px] overflow-hidden rounded-xl bg-[#eef0f2] ${video ? "w-[120px]" : "w-[76px]"}`} data-attachment={a.kind} data-ready={loading ? "false" : "true"}>
      {a.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.preview} alt="" referrerPolicy={a.kind === "gif" || a.kind === "embed" ? "no-referrer" : undefined} className={`h-full w-full object-cover ${loading ? "opacity-60" : ""}`} />
      ) : video ? (
        <span className="absolute inset-0 bg-[#1f2230]" aria-hidden />
      ) : null}
      {video && !loading ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
          </span>
        </span>
      ) : null}
      {a.kind === "gif" ? <span className="absolute bottom-1 left-1 rounded-[5px] bg-black/55 px-1 text-[10px] font-semibold leading-[15px] text-white">GIF</span> : null}
      {loading ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white" aria-label="Uploading">
          <Loader2 className="h-5 w-5 animate-spin" />
          {a.kind === "video" ? <span className="text-[11px] font-medium tabular-nums">{Math.round(a.progress)}%</span> : null}
        </span>
      ) : null}
      <RemoveButton onClick={onRemove} />
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
    <div className="mt-3 rounded-xl border border-[#e8e9ec] p-3" data-composer-poll-editor="">
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

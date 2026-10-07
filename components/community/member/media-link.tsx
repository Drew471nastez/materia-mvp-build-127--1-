"use client"

/**
 * ===========================================================================
 *  ADDING A LINK OR A VIDEO BY LINK (round 12)
 * ===========================================================================
 * The composer's link and video tools, and the comment box's video tool,
 * open this inside what is being written (never a popover, so it can never
 * be cut off by the window): a Storelib field (a 10px corner, a hairline,
 * a 1px shadow, a soft ring with the caret) with Paste at its end, so a
 * link on the clipboard goes in with one press. As soon as the address is
 * YouTube's, Vimeo's or Loom's the field's icon becomes that site's mark,
 * and a preview card under it shows what will be added: the video's
 * picture and title (read by the server, /posts/link-preview), or for any
 * other link its card. Add (or Enter) adds it; for a video, Upload next to
 * it takes one from the device instead (the composer only).
 */
import { useEffect, useRef, useState } from "react"
import { Clapperboard, ClipboardPaste, Link2, Loader2, Upload, X } from "lucide-react"
import { EMBED_NAMES, postEmbedFromUrl, type PostEmbedRef } from "@/lib/communities/post-media"
import { api, apiBase } from "./api"
import { hostOf } from "./media"
import { ProviderMark } from "./media-providers"
import { BTN_PRIMARY, ICON_BTN } from "./ui"
import type { LinkPreview } from "./view-types"

export type LinkMode = "link" | "video"

export interface LinkPick {
  url: string
  embed: PostEmbedRef | null
  preview: LinkPreview | null
}

/** An address as typed or pasted, with https:// when it has no scheme; null when it is not one. */
export function typedUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t || /\s/.test(t)) return null
  const url = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(url)
    return u.hostname.includes(".") ? u.toString() : null
  } catch {
    return null
  }
}

export const VIDEO_HINT = "Paste a YouTube, Vimeo or Loom link."

/** What the server read of a page, kept for this page's life so a link typed again previews at once. */
const READ = new Map<string, LinkPreview | null>()

export function LinkField({
  mode,
  communityId,
  onAdd,
  onUpload,
  onClose,
  className = "",
}: {
  mode: LinkMode
  communityId: string
  onAdd: (pick: LinkPick) => void
  /** Video only: take one from the device (the file picker opens inside this press). */
  onUpload?: () => void
  onClose: () => void
  className?: string
}) {
  const [text, setText] = useState("")
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [reading, setReading] = useState(false)
  const [canPaste, setCanPaste] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const url = typedUrl(text)
  const embed = url ? postEmbedFromUrl(url) : null
  const wrong = mode === "video" && !!url && !embed

  useEffect(() => {
    setCanPaste(typeof navigator !== "undefined" && !!navigator.clipboard?.readText)
    input.current?.focus({ preventScroll: true })
  }, [])

  /* The page's card, read by the server a moment after typing stops (a video's title and picture too). */
  useEffect(() => {
    setPreview(null)
    if (!url || wrong) return setReading(false)
    const key = embed ? embed.url : url
    if (READ.has(key)) {
      setPreview(READ.get(key) ?? null)
      return setReading(false)
    }
    setReading(true)
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      const r = await api<{ preview: LinkPreview | null }>(`${apiBase(communityId)}/posts/link-preview`, { body: { url: key }, signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      const p = r.ok ? r.data.preview : null
      READ.set(key, p)
      setPreview(p)
      setReading(false)
    }, 350)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, wrong, communityId])

  const add = () => {
    if (!url || wrong) return
    onAdd({ url: embed ? embed.url : url, embed, preview })
    setText("")
  }
  const paste = async () => {
    try {
      const got = (await navigator.clipboard.readText()).trim()
      if (got) setText(got.slice(0, 1000))
      input.current?.focus({ preventScroll: true })
    } catch {
      /* The browser said no: typing still works. */
      input.current?.focus({ preventScroll: true })
    }
  }

  const Lead = mode === "video" ? Clapperboard : Link2
  const thumb = embed?.thumb ?? preview?.image ?? null
  return (
    <div className={className} data-link-field={mode}>
      {mode === "video" && onUpload ? (
        <button
          type="button"
          onClick={onUpload}
          data-composer-video-upload=""
          className="mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#2a2a44] active:bg-[#11111c]"
        >
          <Upload className="h-4 w-4" aria-hidden />
          Upload a video
          <span className="font-medium text-white/70">up to 1 GB</span>
        </button>
      ) : null}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <label
          className={`flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] border bg-white pl-3 pr-1 shadow-[0_1px_1px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow] duration-150 focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.05),0_1px_1px_rgba(16,24,40,0.05)] motion-reduce:transition-none sm:h-10 ${wrong ? "border-[#f0c4bd] focus-within:border-[#e8a99f]" : "border-[#e3e5e9] focus-within:border-[#c9ccd3]"}`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[#8a8f98]" data-link-field-icon={embed ? embed.provider : "plain"}>
            {embed ? <ProviderMark provider={embed.provider} size={18} /> : <Lead className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />}
          </span>
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                onClose()
              }
            }}
            placeholder={mode === "video" ? "YouTube, Vimeo or Loom link" : "Paste a link"}
            aria-label={mode === "video" ? "Video link" : "Link"}
            aria-invalid={wrong || undefined}
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[14px]"
            data-link-input=""
          />
          {text ? (
            <button type="button" onClick={() => (setText(""), input.current?.focus({ preventScroll: true }))} aria-label="Clear" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#8a8f98] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          ) : canPaste ? (
            <button type="button" onClick={() => void paste()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-medium text-[#4b5563] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] active:bg-[#eceef1]" data-link-paste="">
              <ClipboardPaste className="h-[15px] w-[15px]" strokeWidth={1.9} aria-hidden />
              Paste
            </button>
          ) : null}
        </label>
        <button type="submit" className={BTN_PRIMARY} disabled={!url || wrong} data-link-add="">
          Add
        </button>
        <button type="button" aria-label="Close" className={`${ICON_BTN} -ml-1`} onClick={onClose} data-link-close="">
          <X className="h-[18px] w-[18px]" />
        </button>
      </form>

      {wrong ? (
        <p className="mt-1.5 pl-1 text-[12.5px] text-[#b42318]" role="status" data-link-hint="">
          {VIDEO_HINT}
        </p>
      ) : url ? (
        /* What Add will put in, as it will look: the video's picture and its site, or the page's card. */
        <div className="mt-2 flex max-w-[520px] items-center gap-3 rounded-[10px] border border-[#e6e8eb] bg-white p-2 shadow-[0_1px_1px_rgba(16,24,40,0.04)]" data-link-preview={embed ? embed.provider : "link"}>
          <span className={`relative shrink-0 overflow-hidden rounded-[7px] bg-[#f1f2f4] ${embed ? "h-[54px] w-24" : "h-[54px] w-[54px]"}`}>
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
            ) : embed ? (
              <span className="absolute inset-0 bg-[#1f2230]" aria-hidden />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-[#8a8f98]" aria-hidden>
                <Link2 className="h-5 w-5" strokeWidth={1.75} />
              </span>
            )}
            {embed ? (
              <span className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-[5px] bg-white/95 shadow-[0_1px_1px_rgba(0,0,0,0.15)]" aria-hidden>
                <ProviderMark provider={embed.provider} size={14} />
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] text-[#6b7280]">{embed ? EMBED_NAMES[embed.provider] : hostOf(url)}</span>
            <span className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e]">
              {preview?.title || (reading ? "Reading the link..." : embed ? `${EMBED_NAMES[embed.provider]} video` : url)}
            </span>
          </span>
          {reading ? <Loader2 className="mr-1 h-4 w-4 shrink-0 animate-spin text-[#9ca3af] motion-reduce:animate-none" aria-label="Reading the link" /> : null}
        </div>
      ) : null}
    </div>
  )
}

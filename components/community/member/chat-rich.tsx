"use client"

/**
 * ===========================================================================
 *  WHAT A CHAT BUBBLE SHOWS BESIDES ITS WORDS (round 38)
 * ===========================================================================
 * The owner: "make sure I can attach GIFs, images, videos, emojis, anything
 * like this. Links, YouTube embeds, make sure the chat supports it, very
 * smooth and clean." Drawn by chat-surface.tsx:
 *
 *   ChatEmbed     a YouTube, Vimeo or Loom link: its still and a play button
 *                 in a 16:9 box; pressed, the site's privacy player in the
 *                 same box (youtube-nocookie.com, Vimeo with do not track),
 *                 so nothing of theirs loads before somebody asks for it
 *   ChatLinkCard  any other link's card as the server read it: the site, the
 *                 title, the page's line about itself, its picture in a box
 *                 of its own shape, opened in a new tab as somebody else's
 *   ChatVideo     a video file sent in the chat: its first frame in a 16:9
 *                 box, played in place on a press with the browser's own
 *                 controls; the file is only asked for once the bubble is
 *                 near the screen, and the sender's own copy plays from the
 *                 file they picked
 *   LinkDraft     the card of a link being written, above the box, with a
 *                 cross to send the message without it
 *
 * Every box has its size before anything in it loads, so nothing moves.
 */
import { useEffect, useRef, useState } from "react"
import { Link2, Play, X } from "lucide-react"
import { EMBED_NAMES, embedPlayerSrc, type PostEmbedRef } from "@/lib/communities/post-media"
import { webUrl, type ChatLinkCard } from "@/lib/communities/chat-links"
import { api, apiBase } from "./api"

const BOX = "w-[min(300px,68vw)]"

/* ── A video by link ───────────────────────────────────────────────────── */

export function ChatEmbed({ video, card, mine }: { video: PostEmbedRef; card: ChatLinkCard | null; mine: boolean }) {
  const [playing, setPlaying] = useState(false)
  const still = video.thumb ?? card?.image ?? null
  const name = EMBED_NAMES[video.provider]
  const title = card?.title || `${name} video`
  return (
    <div className={`my-1 overflow-hidden rounded-xl ${BOX} ${mine ? "bg-white/10" : "bg-white"}`} data-chat-embed={video.provider}>
      <div className="relative aspect-video w-full bg-[#111113]">
        {playing ? (
          <iframe
            src={embedPlayerSrc(video)}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} aria-label={`Play ${title}`} className="group/play absolute inset-0 flex items-center justify-center">
            {still ? <img src={still} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} className="absolute inset-0 h-full w-full object-cover" /> : null}
            <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white transition-colors group-hover/play:bg-black/75">
              <Play className="h-5 w-5 translate-x-[1px]" fill="currentColor" aria-hidden />
            </span>
          </button>
        )}
      </div>
      <a href={video.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="block px-2.5 py-1.5" data-chat-embed-link="">
        <span className={`block text-[11.5px] font-medium ${mine ? "text-white/60" : "text-[#8a8f98]"}`}>{name}</span>
        <span className={`line-clamp-2 text-[13.5px] font-medium leading-snug ${mine ? "text-white" : "text-[#1a1a2e]"}`}>{title}</span>
      </a>
    </div>
  )
}

/* ── Any other link ────────────────────────────────────────────────────── */

export function ChatLinkCardView({ card, mine }: { card: ChatLinkCard; mine: boolean }) {
  const [broken, setBroken] = useState(false)
  const href = webUrl(card.url)
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className={`my-1 block overflow-hidden rounded-xl border-l-[3px] ${BOX} ${mine ? "border-white/50 bg-white/10" : "border-[#8b5cf6] bg-white"}`}
      data-chat-link-card=""
    >
      <span className="block px-2.5 py-1.5">
        {card.site ? <span className={`block truncate text-[11.5px] font-semibold ${mine ? "text-white/70" : "text-[#8b5cf6]"}`}>{card.site}</span> : null}
        {card.title ? <span className={`line-clamp-2 text-[13.5px] font-semibold leading-snug ${mine ? "text-white" : "text-[#1a1a2e]"}`} data-chat-link-title="">{card.title}</span> : null}
        {card.description ? <span className={`mt-0.5 line-clamp-2 text-[12.5px] leading-snug ${mine ? "text-white/75" : "text-[#4b5563]"}`} data-chat-link-words="">{card.description}</span> : null}
      </span>
      {card.image && !broken ? (
        <span className={`block aspect-[1.91] w-full ${mine ? "bg-white/10" : "bg-[#eceef1]"}`}>
          <img src={card.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} className="h-full w-full object-cover" />
        </span>
      ) : null}
    </a>
  )
}

/* ── A video file ──────────────────────────────────────────────────────── */

/** The file a member just sent, by its asset id, for the life of the page: their bubble plays it from the device. */
const LOCAL_VIDEO = new Map<string, string>()
export function keepLocalVideo(assetId: string, objectUrl: string): void {
  LOCAL_VIDEO.set(assetId, objectUrl)
}
export function localVideo(assetId: string): string | null {
  return LOCAL_VIDEO.get(assetId) ?? null
}

export function ChatVideo({ src, local }: { src: string | null; local: string | null }) {
  const box = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [near, setNear] = useState(!!local)
  const [playing, setPlaying] = useState(false)
  const url = local ?? src

  /* The file is asked for only once the bubble comes near the screen: a long chat of videos signs none it does not show. */
  useEffect(() => {
    if (near) return
    const el = box.current
    if (!el || typeof IntersectionObserver === "undefined") return setNear(true)
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "400px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  const play = () => {
    setPlaying(true)
    requestAnimationFrame(() => {
      const v = video.current
      if (!v) return
      v.muted = false
      void v.play().catch(() => undefined)
    })
  }

  return (
    <div ref={box} className={`relative my-1 aspect-video ${BOX} overflow-hidden rounded-xl bg-[#111113]`} data-chat-video="">
      {near && url ? (
        <video
          ref={video}
          src={`${url}#t=0.1`}
          preload="metadata"
          muted={!playing}
          playsInline
          controls={playing}
          className={`absolute inset-0 h-full w-full ${playing ? "object-contain" : "object-cover"}`}
        />
      ) : null}
      {!playing ? (
        <button type="button" onClick={play} disabled={!url} aria-label="Play video" className="absolute inset-0 flex items-center justify-center text-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55">
            <Play className="h-5 w-5 translate-x-[1px]" fill="currentColor" aria-hidden />
          </span>
        </button>
      ) : null}
    </div>
  )
}

/* ── The card of a link being written ──────────────────────────────────── */

export type DraftCard = ChatLinkCard & { sig?: string }

/** What the server read for each address this page asked about. */
const READ = new Map<string, DraftCard | null>()

/** The card for the first link in the box, read by the server a moment after typing stops; null while there is none. */
export function useLinkDraft(communityId: string, url: string | null): DraftCard | null {
  const [card, setCard] = useState<DraftCard | null>(() => (url ? (READ.get(url) ?? null) : null))
  useEffect(() => {
    if (!url) return setCard(null)
    if (READ.has(url)) return setCard(READ.get(url) ?? null)
    setCard(null)
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      const r = await api<{ card: DraftCard | null }>(`${apiBase(communityId)}/chat/unfurl?url=${encodeURIComponent(url)}`, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      const got = r.ok ? r.data.card : null
      READ.set(url, got)
      setCard(got)
    }, 350)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [communityId, url])
  return card
}

export function LinkDraft({ card, onDrop }: { card: DraftCard; onDrop: () => void }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 rounded-xl px-2 py-1" data-chat-link-draft="">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f1f2f4] text-[#8b5cf6]">
        {card.image ? <img src={card.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <Link2 className="h-4 w-4" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1 border-l-2 border-[#8b5cf6] pl-2 text-[12.5px] leading-snug">
        <span className="block truncate font-semibold text-[#1a1a2e]">{card.title || card.site || card.url}</span>
        <span className="block truncate text-[#6b7280]">{card.description || card.site}</span>
      </span>
      <button type="button" aria-label="Send without the preview" onClick={onDrop} onPointerDown={(e) => e.preventDefault()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f1f2f4]">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

"use client"
import { CompactInstagramPost } from "./compact-post"
import * as React from "react"
import { boxRadius, buttonPadScale, pressableProps, tintOf } from "@/lib/onepage/block-look"
import { Check, ChevronRight, Loader2, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePageMoney } from "@/components/platform/price-currency"
import { sendContactMessage } from "@/lib/website-builder/contact-client"
import { CONTACT_LIMITS, EMBED_PROVIDER_NAME, embedFrameUrl, embedSource, MUSIC_PROVIDER_NAME, cleanTestimonials, contactInputError, courseHref, lessonsLabel, musicSource } from "@/lib/onepage/creator-blocks"
import type { ContactFormBlockData, CourseBlockData, EmbedBlockData, MusicBlockData, OnePageBlock, OnePageTheme, TestimonialsBlockData } from "@/lib/onepage/types"
import { tt } from "@/lib/i18n/text"
import { isDarkColor } from "@/lib/onepage/storelib-blocks"
import { EMBED_MAX_WIDTH, EmbedFrame } from "@/components/onepage/embed-frame"
import { PlayerShape, frameFade, useFrameLoading, useFrameShown } from "@/components/onepage/embed-shell"
import { StorelibBlock } from "@/components/onepage/storelib-blocks"


/**
 * ===========================================================================
 *  COURSE, MUSIC, TESTIMONIALS AND CONTACT: DRAWN ONCE, PREVIEW AND LIVE
 * ===========================================================================
 * Four blocks a creator's page was missing next to Linktree and Stan Store,
 * drawn by the same `ExtraBlock` the heading, FAQ and video use
 * (./extra-blocks.tsx), so the editor's preview (the live page in a frame)
 * and the live page are one drawing. Their rules are in
 * lib/onepage/creator-blocks.ts.
 *
 *   COURSE        one of the creator's own courses: its cover, its title,
 *                 how many lessons and its price, opening the course's page
 *                 where it is bought. The live page reads the product again
 *                 every time (lib/onepage/live-products), so a renamed or
 *                 repriced course is right, and an archived one is gone.
 *   MUSIC         a Spotify, SoundCloud or Apple Music link, played in the
 *                 provider's own player (public embed pages, no key). The
 *                 player has its height before it loads, so nothing moves.
 *   TESTIMONIALS  what buyers said: a quote, a name, a line under it and up
 *                 to five stars. More than one slides sideways.
 *   CONTACT       a message to the creator: the same pipeline as a website's
 *                 contact form (app/api/website-builder/contact, lib/site-
 *                 contact), so it is kept in Emails › Messages, emailed to
 *                 the creator with Reply going to the visitor, rings the
 *                 bell, and, with the box ticked, adds them to the list.
 *                 Same spam checks: a hidden field and the time on screen.
 */


type Scale = "small" | "normal" | "live"

export interface CreatorBlockLook {
  theme: OnePageTheme
  scale: Scale
  preview?: boolean
  /** The page's creator (creators.id): where a contact message goes. */
  sellerId?: string | null
  /** The page itself (onepages.id): where a lead magnet's signup is kept (./storelib-blocks). */
  onepageId?: string | null
  /** The button look of the page (./extra-blocks themeButtonStyle). */
  button: React.CSSProperties
  /** Round 41: inside a group or a carousel, where a button keeps still. */
  still?: boolean
}

const k = (scale: Scale) => (scale === "small" ? 0.8 : 1)
const px = (n: number, scale: Scale) => `${Math.round(n * k(scale) * 10) / 10}px`

/* ─── Course ──────────────────────────────────────────────────────────── */

function CourseView({ data, look }: { data: CourseBlockData; look: CreatorBlockLook }) {
  const money = usePageMoney()
  if (!(data.product_id || "").trim()) return null
  const href = courseHref(data)
  const lessons = lessonsLabel(data.lessons_count)
  const price = typeof data.course_price_cents === "number" ? (data.course_price_cents > 0 ? money(data.course_price_cents) : tt("Free")) : null
  const meta = [lessons ? tt("{count, plural, one {# lesson} other {# lessons}}", lessons) : null, data.show_price !== false ? price : null].filter(Boolean).join(" · ")
  const radius = Math.min(Number(look.theme.button_border_radius) || 0, 22)
  const inner = (
    <>
      <span className="relative block w-full overflow-hidden bg-black/10" style={{ aspectRatio: "16 / 9", borderRadius: `${Math.max(radius - 6, 6)}px` }}>
        {data.course_thumbnail ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={data.course_thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 bg-gradient-to-br from-white/25 to-black/10" />
        )}
      </span>
      <span className="flex w-full items-center gap-3" style={{ padding: `${px(12, look.scale)} ${px(6, look.scale)} ${px(4, look.scale)}` }}>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate font-semibold" style={{ fontSize: px(15.5, look.scale) }}>
            {data.course_title || tt("Course")}
          </span>
          {meta ? (
            <span className="mt-0.5 block truncate opacity-75" style={{ fontSize: px(13, look.scale) }}>
              {meta}
            </span>
          ) : null}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-medium" style={{ fontSize: px(13.5, look.scale) }}>
          {(data.button_text ?? "").trim() || tt("View course")}
          <ChevronRight aria-hidden style={{ width: px(16, look.scale), height: px(16, look.scale) }} />
        </span>
      </span>
    </>
  )
  const box: React.CSSProperties = { ...look.button, borderRadius: `${radius}px`, padding: px(8, look.scale) }
  return href ? (
    <a data-onepage-course="" href={href} className="op-card flex w-full flex-col no-underline transition-[scale] duration-150 active:scale-[0.99]" style={box}>
      {inner}
    </a>
  ) : (
    <div data-onepage-course="" className="flex w-full flex-col" style={box}>
      {inner}
    </div>
  )
}

/* ─── Music ───────────────────────────────────────────────────────────── */

function MusicView({ data, look }: { data: MusicBlockData; look: CreatorBlockLook }) {
  const source = musicSource(data.url)
  /* Round AS (./embed-shell): the player's shape at its own height until it has loaded, at once in the sheet. */
  const [shown, onLoad] = useFrameShown(source?.embedUrl)
  const loading = useFrameLoading()
  if (!source) return null
  const radius = source.kind === "spotify" ? 12 : 10
  return (
    <div data-onepage-music={source.kind} className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      {data.title?.trim() ? (
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">
          {data.title}
        </p>
      ) : null}
      {/* The height is the player's own, set before it loads: nothing below it moves. */}
      <div className="relative w-full" style={{ height: source.height }} data-embed-shown={shown ? "" : undefined}>
        <PlayerShape single={source.height < 200} shown={shown} radius={radius} />
        <iframe
          title={data.title?.trim() || tt("{value} player", { value: MUSIC_PROVIDER_NAME[source.kind] })}
          src={source.embedUrl}
          loading={loading}
          onLoad={onLoad}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          className="absolute inset-0 block h-full w-full border-0 bg-transparent"
          style={{ borderRadius: radius, colorScheme: "normal", ...frameFade(shown) }}
        />
      </div>
    </div>
  )
}

/* ─── Embed ───────────────────────────────────────────────────────────── */

/* The page's own host, read after the first render (the server has no window, and a frame drawn there would differ from the browser's). */
const noHost = () => () => {}
const readHost = () => (typeof window === "undefined" ? null : window.location.hostname)
const serverHost = () => null

/**
 * A POST, FORM, PLAYER OR CALENDAR, IN ITS SERVICE'S OWN FRAME
 * (lib/onepage/creator-blocks embedSource). The frame has its height before
 * it loads (the service's usual height, or 16:9 for a video), so nothing
 * under it moves while it arrives; an Instagram or X post then grows or
 * shrinks to the height the post says it is, once, on that service's own
 * message. Lazy, so a page with five embeds opens as fast as one without.
 */
function EmbedView({ data, look }: { data: EmbedBlockData; look: CreatorBlockLook }) {
  const source = embedSource(data.url)
  const host = React.useSyncExternalStore(noHost, readHost, serverHost)
  if (!source) return null
  const base = host ? embedFrameUrl(source, host) : source.kind === "twitch" ? null : source.embedUrl
  /* Round 40: an X post on a dark page in X's own dark look. */
  const src = base && source.kind === "x" && isDarkColor(look.theme.background_color) ? `${base}&theme=dark` : base
  const radius = Math.min(Math.max(Number(look.theme.button_border_radius) || 0, 10), 16)
  return (
    <div data-onepage-embed={source.kind} className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      {data.title?.trim() ? (
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">
          {data.title}
        </p>
      ) : null}
      {/* Round 40 (./embed-frame): the post's own width, no box of ours around it, shown once it has its height. */}
      {src ? (
        source.kind === "instagram" ? <CompactInstagramPost src={src} title={data.title?.trim() || tt("Instagram post")} radius={radius}/> : <EmbedFrame src={src} kind={source.kind} title={data.title?.trim() || EMBED_PROVIDER_NAME[source.kind]} height={source.height} resizes={!!source.resizes} radius={radius} maxWidth={EMBED_MAX_WIDTH[source.kind]} fillWidth={source.kind === "x"} />
      ) : (
        <div aria-hidden className="w-full" style={source.height === null ? { aspectRatio: "16 / 9" } : { height: source.height }} />
      )}
    </div>
  )
}

/* ─── Testimonials ────────────────────────────────────────────────────── */

function Stars({ value, size }: { value: number; size: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={tt("{value} out of 5 stars", { value })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden fill={n <= value ? "currentColor" : "none"} strokeWidth={1.6} style={{ width: size, height: size, opacity: n <= value ? 1 : 0.35 }} />
      ))}
    </span>
  )
}

function TestimonialsView({ data, look }: { data: TestimonialsBlockData; look: CreatorBlockLook }) {
  const items = cleanTestimonials(data.items)
  if (items.length === 0) return null
  const many = items.length > 1
  const radius = Math.min(Number(look.theme.button_border_radius) || 0, 22)
  return (
    <div data-onepage-testimonials="" className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      {data.title?.trim() ? (
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">
          {data.title}
        </p>
      ) : null}
      <div
        className={cn("flex w-full", many && "op-rail snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}
        style={{ gap: px(10, look.scale) }}
      >
        {items.map((item) => (
          <figure
            key={item.id}
            className={cn("m-0 flex shrink-0 snap-start flex-col", many ? "w-[86%]" : "w-full")}
            style={{ ...look.button, borderRadius: `${radius}px`, padding: `${px(16, look.scale)} ${px(18, look.scale)}`, gap: px(10, look.scale) }}
          >
            {item.rating ? <Stars value={item.rating} size={px(14, look.scale)} /> : null}
            <blockquote className="m-0 whitespace-pre-line leading-relaxed" style={{ fontSize: px(14.5, look.scale) }}>
              {item.quote}
            </blockquote>
            <figcaption className="mt-auto" style={{ fontSize: px(13, look.scale) }}>
              <span className="font-semibold">{item.name}</span>
              {item.detail ? <span className="opacity-70"> · {item.detail}</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

/* ─── Contact form ────────────────────────────────────────────────────── */

function ContactFormView({ data, look }: { data: ContactFormBlockData; look: CreatorBlockLook }) {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [consent, setConsent] = React.useState(false)
  const [company, setCompany] = React.useState("")
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const shownAt = React.useRef(0)
  React.useEffect(() => {
    shownAt.current = Date.now()
  }, [])

  const radius = Math.min(Number(look.theme.button_border_radius) || 0, 14)
  const send = pressableProps(look.theme)
  const field = "w-full border-0 bg-white/90 text-[16px] text-black outline-none placeholder:text-black/45 focus:ring-2 focus:ring-black/15 disabled:opacity-70 sm:text-sm"
  /* Round W9: a hairline round each field, so a white field still shows on a light sheet or a white page (it vanished on Gazette's Contact sheet). */
  const fieldStyle: React.CSSProperties = { borderRadius: `${radius}px`, padding: `${px(12, look.scale)} ${px(14, look.scale)}`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.14)" }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state !== "idle") return
    if (look.preview) {
      setError(tt("Messages send from your live page."))
      return
    }
    const wrong = contactInputError({ email, message })
    if (wrong) {
      setError(wrong === "email" ? tt("Enter a valid email address.") : tt("Write a message first."))
      return
    }
    if (!look.sellerId) {
      setError(tt("This form is not connected to a store."))
      return
    }
    setError(null)
    setState("sending")
    const out = await sendContactMessage({
      creatorId: look.sellerId,
      name,
      email,
      message,
      consent: data.offer_signup !== false && consent,
      company,
      elapsed: Date.now() - shownAt.current,
      page: "onepage",
    })
    if (out.ok) {
      setState("sent")
    } else {
      setState("idle")
      setError("error" in out ? out.error : tt("Write a message first."))
    }
  }

  return (
    <div data-onepage-contact="" className="w-full" style={{ backgroundColor: tintOf(look.theme.button_color, 6), borderRadius: `${boxRadius(look.theme)}px`, padding: px(18, look.scale) }}>
      {data.title?.trim() ? (
        <h3 className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(17, look.scale) }} data-block-title="">
          {data.title}
        </h3>
      ) : null}
      {data.description?.trim() ? (
        <p className="mt-1 text-center" style={{ color: look.theme.secondary_text_color || look.theme.text_color, fontSize: px(13.5, look.scale), opacity: 0.85 }}>
          {data.description}
        </p>
      ) : null}
      {state === "sent" ? (
        <p role="status" className="mt-4 flex items-center justify-center gap-2 text-center font-medium" style={{ color: look.theme.text_color, fontSize: px(14.5, look.scale) }}>
          <Check aria-hidden style={{ width: px(17, look.scale), height: px(17, look.scale) }} />
          {(data.success_message ?? "").trim() || tt("Thanks. Your message is sent.")}
        </p>
      ) : (
        <form noValidate onSubmit={submit} className="mt-4 flex flex-col" style={{ gap: px(8, look.scale) }}>
          {/* The hidden field a person never sees or fills (lib/site-contact looksAutomated). */}
          <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden value={company} onChange={(e) => setCompany(e.target.value)} className="absolute -left-[9999px] h-px w-px opacity-0" />
          <input aria-label={tt("Your name")} placeholder={tt("Your name")} autoComplete="name" maxLength={CONTACT_LIMITS.name} value={name} onChange={(e) => setName(e.target.value)} disabled={state === "sending"} className={field} style={fieldStyle} />
          <input aria-label={tt("Your email")} placeholder={tt("Your email")} type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => { setEmail(e.target.value); setError(null) }} disabled={state === "sending"} className={field} style={fieldStyle} />
          <textarea aria-label={tt("Message")} placeholder={tt("Your message")} required rows={4} maxLength={CONTACT_LIMITS.message} value={message} onChange={(e) => { setMessage(e.target.value); setError(null) }} disabled={state === "sending"} className={cn(field, "min-h-[104px] resize-none")} style={fieldStyle} />
          {data.offer_signup !== false ? (
            <label className="flex cursor-pointer items-center gap-2.5 py-1" style={{ color: look.theme.text_color, fontSize: px(13, look.scale) }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-4 w-4 shrink-0 accent-current" />
              {tt("Keep me updated by email")}
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-center" style={{ color: look.theme.text_color, fontSize: px(12.5, look.scale), opacity: 0.85 }}>
              {error}
            </p>
          ) : null}
          {/* Round 41: Send is the page's button, its hover and size too (lib/onepage/block-look). */}
          <button type="submit" disabled={state === "sending"} data-hover={send["data-hover"]} data-shadow={send["data-shadow"]} className={cn(send.className, "inline-flex w-full items-center justify-center gap-2 font-medium disabled:opacity-60")} style={{ ...send.style, padding: `${px(13 * buttonPadScale(look.theme), look.scale)} ${px(16, look.scale)}`, fontSize: px(14.5, look.scale) }}>
            {state === "sending" ? <Loader2 aria-hidden className="animate-spin" style={{ width: px(16, look.scale), height: px(16, look.scale) }} /> : null}
            <span className="op-label relative">{(data.button_text ?? "").trim() || tt("Send")}</span>
          </button>
        </form>
      )}
    </div>
  )
}

/** Draws one of the four, or null for a type that is not one of them. */
export function CreatorBlock({ block, look }: { block: OnePageBlock; look: CreatorBlockLook }) {
  switch (block.type) {
    case "course":
      return <CourseView data={block.data as CourseBlockData} look={look} />
    case "music":
      return <MusicView data={block.data as MusicBlockData} look={look} />
    case "testimonials":
      return <TestimonialsView data={block.data as TestimonialsBlockData} look={look} />
    case "contact_form":
      return <ContactFormView data={block.data as ContactFormBlockData} look={look} />
    case "embed":
      return <EmbedView data={block.data as EmbedBlockData} look={look} />
    default:
      /* The shelf, lead magnets, posts, followers and codes (./storelib-blocks), or nothing. */
      return <StorelibBlock block={block} look={look} />
  }
}

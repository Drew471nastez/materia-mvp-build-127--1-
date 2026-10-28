"use client"

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

import * as React from "react"
import { Check, ChevronRight, Loader2, Plus, Star, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { usePageMoney } from "@/components/platform/price-currency"
import { createClient } from "@/lib/supabase/client"
import { sendContactMessage } from "@/lib/website-builder/contact-client"
import {
  CONTACT_LIMITS,
  EMBED_PROVIDER_NAME,
  embedFrameUrl,
  embedSource,
  MUSIC_PROVIDER_NAME,
  TESTIMONIAL_LIMITS,
  cleanTestimonials,
  contactInputError,
  courseHref,
  lessonsLabel,
  musicSource,
} from "@/lib/onepage/creator-blocks"
import type {
  ContactFormBlockData,
  CourseBlockData,
  EmbedBlockData,
  MusicBlockData,
  OnePageBlock,
  OnePageBlockData,
  OnePageTheme,
  TestimonialItem,
  TestimonialsBlockData,
} from "@/lib/onepage/types"
import { tt } from "@/lib/i18n/text"
import { isDarkColor } from "@/lib/onepage/storelib-blocks"
import { EMBED_MAX_WIDTH, EmbedFrame } from "@/components/onepage/embed-frame"
import { StorelibBlock, StorelibBlockEditor } from "@/components/onepage/storelib-blocks"
import { SignupTools } from "@/components/onepage/page-integrations"

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
          {(data.button_text || "").trim() || tt("View course")}
          <ChevronRight aria-hidden style={{ width: px(16, look.scale), height: px(16, look.scale) }} />
        </span>
      </span>
    </>
  )
  const box: React.CSSProperties = { ...look.button, borderRadius: `${radius}px`, padding: px(8, look.scale) }
  return href ? (
    <a data-onepage-course="" href={href} className="flex w-full flex-col no-underline transition-[scale] duration-150 active:scale-[0.99]" style={box}>
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
  if (!source) return null
  return (
    <div data-onepage-music={source.kind} className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      {data.title?.trim() ? (
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }}>
          {data.title}
        </p>
      ) : null}
      {/* The height is the player's own, set before it loads: nothing below it moves. */}
      <iframe
        title={data.title?.trim() || tt("{value} player", { value: MUSIC_PROVIDER_NAME[source.kind] })}
        src={source.embedUrl}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        className="block w-full border-0 bg-transparent"
        style={{ height: source.height, borderRadius: source.kind === "spotify" ? 12 : 10, colorScheme: "normal" }}
      />
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
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }}>
          {data.title}
        </p>
      ) : null}
      {/* Round 40 (./embed-frame): the post's own width, no box of ours around it, shown once it has its height. */}
      {src ? (
        <EmbedFrame src={src} kind={source.kind} title={data.title?.trim() || EMBED_PROVIDER_NAME[source.kind]} height={source.height} resizes={!!source.resizes} radius={radius} maxWidth={EMBED_MAX_WIDTH[source.kind]} />
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
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }}>
          {data.title}
        </p>
      ) : null}
      <div
        className={cn("flex w-full", many && "snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}
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
  const field = "w-full border-0 bg-white/90 text-[16px] text-black outline-none placeholder:text-black/45 focus:ring-2 focus:ring-black/15 disabled:opacity-70 sm:text-sm"
  const fieldStyle: React.CSSProperties = { borderRadius: `${radius}px`, padding: `${px(12, look.scale)} ${px(14, look.scale)}` }

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
    <div data-onepage-contact="" className="w-full" style={{ backgroundColor: `${look.theme.button_color}10`, borderRadius: `${Math.min(Number(look.theme.button_border_radius) || 0, 22)}px`, padding: px(18, look.scale) }}>
      {data.title?.trim() ? (
        <h3 className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(17, look.scale) }}>
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
          {(data.success_message || "").trim() || tt("Thanks. Your message is sent.")}
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
          <button type="submit" disabled={state === "sending"} className="inline-flex w-full items-center justify-center gap-2 font-medium transition-opacity disabled:opacity-60" style={{ ...look.button, padding: `${px(13, look.scale)} ${px(16, look.scale)}`, fontSize: px(14.5, look.scale) }}>
            {state === "sending" ? <Loader2 aria-hidden className="animate-spin" style={{ width: px(16, look.scale), height: px(16, look.scale) }} /> : null}
            {(data.button_text || "").trim() || tt("Send")}
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

/* ─── The editor ──────────────────────────────────────────────────────── */

const fieldBox = "space-y-1.5"
const fieldLabel = "text-xs"

type CourseRow = { id: string; title: string; slug: string | null; thumbnail_url: string | null; price_cents: number | null; status: string | null; lessons: number | null }

/** The creator's own courses, newest first, each with its lesson count when it can be read. */
async function loadCourses(): Promise<CourseRow[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return []
  const { data } = await supabase
    .from("products")
    .select("id, title, slug, thumbnail_url, price_cents, status")
    .eq("creator_id", (creator as { id: string }).id)
    .eq("type", "course")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(100)
  const rows = ((data ?? []) as Omit<CourseRow, "lessons">[]).map((r) => ({ ...r, lessons: null as number | null }))
  if (rows.length === 0) return rows
  /* The lesson count: course, then its modules, then their lessons. A read that fails leaves it unknown. */
  try {
    const { data: courses } = await supabase.from("courses").select("id, product_id").in("product_id", rows.map((r) => r.id))
    const byCourse = new Map(((courses ?? []) as { id: string; product_id: string }[]).map((c) => [c.id, c.product_id]))
    if (byCourse.size) {
      const { data: modules } = await supabase.from("course_modules").select("id, course_id").in("course_id", [...byCourse.keys()])
      const byModule = new Map(((modules ?? []) as { id: string; course_id: string }[]).map((m) => [m.id, byCourse.get(m.course_id)]))
      const counts = new Map<string, number>()
      for (const r of rows) counts.set(r.id, 0)
      if (byModule.size) {
        const { data: lessons } = await supabase.from("course_lessons").select("module_id").in("module_id", [...byModule.keys()])
        for (const l of (lessons ?? []) as { module_id: string }[]) {
          const product = byModule.get(l.module_id)
          if (product) counts.set(product, (counts.get(product) ?? 0) + 1)
        }
      }
      for (const r of rows) r.lessons = byCourse.size ? counts.get(r.id) ?? 0 : null
    }
  } catch {
    /* Unknown, and the live page counts them itself. */
  }
  return rows
}

function CourseEditor({ data, updateData }: { data: CourseBlockData; updateData: (u: Partial<CourseBlockData>) => void }) {
  const money = usePageMoney()
  const [courses, setCourses] = React.useState<CourseRow[] | null>(null)
  React.useEffect(() => {
    let live = true
    loadCourses().then((rows) => live && setCourses(rows)).catch(() => live && setCourses([]))
    return () => {
      live = false
    }
  }, [])
  return (
    <div className="space-y-3">
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Course")}</Label>
        {courses === null ? (
          <div className="flex h-12 items-center gap-2 rounded-xl border border-[#e3e4e8] px-3 text-[13px] text-[#6b7280]">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            {tt("Loading your courses")}
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#d9dbe0] p-4 text-center">
            <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("No courses yet")}</p>
            <p className="mt-0.5 text-[12px] text-[#6b7280]">{tt("Make a course, then add it here.")}</p>
            <a href="/app/courses/new" className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#1a1a2e] px-3.5 text-[13px] font-medium text-white">
              {tt("New course")}
            </a>
          </div>
        ) : (
          <div role="listbox" aria-label={tt("Your courses")} className="max-h-[264px] space-y-1 overflow-y-auto rounded-xl border border-[#e3e4e8] p-1">
            {courses.map((c) => {
              const on = data.product_id === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() =>
                    updateData({
                      product_id: c.id,
                      course_title: c.title,
                      course_slug: c.slug,
                      course_thumbnail: c.thumbnail_url,
                      course_price_cents: c.price_cents,
                      lessons_count: c.lessons,
                    })
                  }
                  className={cn("flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors duration-150", on ? "bg-[#f2f2f4]" : "hover:bg-[#f7f7f8]")}
                >
                  <span className="relative h-10 w-[60px] shrink-0 overflow-hidden rounded-md bg-[#eceef1]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.thumbnail_url ? <img src={c.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-[#1a1a2e]">{c.title}</span>
                    <span className="block truncate text-[12px] text-[#6b7280]">
                      {[c.lessons !== null ? tt("{count, plural, one {# lesson} other {# lessons}}", { count: c.lessons }) : null, c.price_cents ? money(c.price_cents) : tt("Free"), c.status !== "published" ? tt("Not published") : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {on ? <Check aria-hidden className="h-4 w-4 shrink-0 text-[#1a1a2e]" /> : null}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Button text (optional)")}</Label>
        <Input value={data.button_text || ""} maxLength={30} placeholder={tt("View course")} onChange={(e) => updateData({ button_text: e.target.value })} />
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-[13px] text-[#1a1a2e]">
        {tt("Show the price")}
        <input type="checkbox" checked={data.show_price !== false} onChange={(e) => updateData({ show_price: e.target.checked })} className="h-4 w-4 accent-[#1a1a2e]" />
      </label>
      <p className="text-[12px] text-[#6b7280]">{tt("Visitors open the course page, where they can buy it.")}</p>
    </div>
  )
}

function MusicEditor({ data, updateData }: { data: MusicBlockData; updateData: (u: Partial<MusicBlockData>) => void }) {
  const source = musicSource(data.url)
  const ok = !data.url?.trim() || source !== null
  return (
    <div className="space-y-3">
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Music link")}</Label>
        <Input value={data.url || ""} inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://open.spotify.com/track/..." onChange={(e) => updateData({ url: e.target.value.trim() })} aria-invalid={!ok || undefined} />
        {!ok ? (
          <p className="text-[12px] text-[#b42318]">{tt("Paste a Spotify, SoundCloud or Apple Music link to a song, album or playlist.")}</p>
        ) : source ? (
          <p className="text-[12px] text-[#6b7280]">{tt("Plays in the {value} player on your page.", { value: MUSIC_PROVIDER_NAME[source.kind] })}</p>
        ) : null}
      </div>
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Title (optional)")}</Label>
        <Input value={data.title || ""} maxLength={80} placeholder={tt("My new single")} onChange={(e) => updateData({ title: e.target.value })} />
      </div>
    </div>
  )
}

function TestimonialsEditor({ data, updateData }: { data: TestimonialsBlockData; updateData: (u: Partial<TestimonialsBlockData>) => void }) {
  const items = data.items || []
  const set = (id: string, patch: Partial<TestimonialItem>) => updateData({ items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })
  return (
    <div className="space-y-3">
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Title (optional)")}</Label>
        <Input value={data.title || ""} maxLength={60} placeholder={tt("What people say")} onChange={(e) => updateData({ title: e.target.value })} />
      </div>
      {items.map((item, n) => (
        <div key={item.id} className="space-y-2 rounded-xl border border-[#e3e4e8] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#6b7280]">{tt("Review {value}", { value: n + 1 })}</span>
            <button type="button" aria-label={tt("Remove review")} onClick={() => updateData({ items: items.filter((i) => i.id !== item.id) })} className="grid h-8 w-8 place-items-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#f2f2f4] hover:text-[#1a1a2e]">
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </div>
          <Textarea value={item.quote} rows={3} maxLength={TESTIMONIAL_LIMITS.quote} placeholder={tt("What they said")} onChange={(e) => set(item.id, { quote: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input value={item.name} maxLength={TESTIMONIAL_LIMITS.name} placeholder={tt("Name")} onChange={(e) => set(item.id, { name: e.target.value })} />
            <Input value={item.detail || ""} maxLength={TESTIMONIAL_LIMITS.detail} placeholder={tt("Bought the course")} onChange={(e) => set(item.id, { detail: e.target.value })} />
          </div>
          <div className="flex items-center gap-1" role="radiogroup" aria-label={tt("Stars")}>
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" role="radio" aria-checked={item.rating === v} aria-label={tt("{value} stars", { value: v })} onClick={() => set(item.id, { rating: item.rating === v ? null : v })} className="grid h-8 w-8 place-items-center rounded-lg text-[#1a1a2e] transition-colors hover:bg-[#f2f2f4]">
                <Star aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.6} fill={(item.rating ?? 0) >= v ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
        </div>
      ))}
      {items.length < TESTIMONIAL_LIMITS.items ? (
        <button type="button" onClick={() => updateData({ items: [...items, { id: `t_${Date.now().toString(36)}`, quote: "", name: "", detail: "", rating: 5 }] })} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#d9dbe0] text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]">
          <Plus aria-hidden className="h-4 w-4" />
          {tt("Add a review")}
        </button>
      ) : null}
    </div>
  )
}

function ContactFormEditor({ data, updateData }: { data: ContactFormBlockData; updateData: (u: Partial<ContactFormBlockData>) => void }) {
  return (
    <div className="space-y-3">
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Title")}</Label>
        <Input value={data.title || ""} maxLength={60} placeholder={tt("Get in touch")} onChange={(e) => updateData({ title: e.target.value })} />
      </div>
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Text (optional)")}</Label>
        <Input value={data.description || ""} maxLength={140} placeholder={tt("Questions, work, or just hi")} onChange={(e) => updateData({ description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={fieldBox}>
          <Label className={fieldLabel}>{tt("Button")}</Label>
          <Input value={data.button_text || ""} maxLength={24} placeholder={tt("Send")} onChange={(e) => updateData({ button_text: e.target.value })} />
        </div>
        <div className={fieldBox}>
          <Label className={fieldLabel}>{tt("After sending")}</Label>
          <Input value={data.success_message || ""} maxLength={100} placeholder={tt("Thanks. Your message is sent.")} onChange={(e) => updateData({ success_message: e.target.value })} />
        </div>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-[13px] text-[#1a1a2e]">
        {tt("Offer to join your email list")}
        <input type="checkbox" checked={data.offer_signup !== false} onChange={(e) => updateData({ offer_signup: e.target.checked })} className="h-4 w-4 accent-[#1a1a2e]" />
      </label>
      <p className="text-[12px] leading-relaxed text-[#6b7280]">
        {tt("Messages come to your email and to Emails, Messages. Reply goes straight to the sender.")}{" "}
        <a href="/app/emails?tab=messages" className="font-medium text-[#1a1a2e] underline underline-offset-2">
          {tt("Open messages")}
        </a>
      </p>
    </div>
  )
}

/** The settings of one of the four, or null for a type that is not one of them. */
/* i18n-ignore-start: a link's shape, not words. */
const EMBED_PLACEHOLDER: Record<string, string> = {
  instagram: "https://www.instagram.com/p/...",
  x: "https://x.com/you/status/...",
  typeform: "https://form.typeform.com/to/...",
  googleforms: "https://docs.google.com/forms/d/e/.../viewform",
  tally: "https://tally.so/r/...",
  substack: "https://you.substack.com",
  podcasts: "https://podcasts.apple.com/us/podcast/...",
  twitch: "https://www.twitch.tv/you",
  loom: "https://www.loom.com/share/...",
  mixcloud: "https://www.mixcloud.com/you/show/",
  bandcamp: "<iframe src=\"https://bandcamp.com/EmbeddedPlayer/...",
  deezer: "https://www.deezer.com/album/...",
  gcal: "https://calendar.google.com/calendar/appointments/schedules/...",
}
/* i18n-ignore-end */

function EmbedEditor({ data, updateData }: { data: EmbedBlockData; updateData: (u: Partial<EmbedBlockData>) => void }) {
  const source = embedSource(data.url)
  const ok = !data.url?.trim() || source !== null
  const hint = (data.provider && EMBED_PLACEHOLDER[data.provider]) || "https://..."
  return (
    <div className="space-y-3">
      <div className={fieldBox}>
        <Label className={fieldLabel}>{data.provider === "bandcamp" ? tt("Embed code or link") : tt("Link")}</Label>
        <Input value={data.url || ""} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder={hint} onChange={(e) => updateData({ url: e.target.value.trim() })} aria-invalid={!ok || undefined} />
        {!ok ? (
          <p className="text-[12px] text-[#b42318]">{tt("This link cannot show on your page. Try a post, form, show or player link from the list below.")}</p>
        ) : source ? (
          <p className="text-[12px] text-[#6b7280]">{tt("Shows in the {value} player on your page.", { value: EMBED_PROVIDER_NAME[source.kind] })}</p>
        ) : data.provider === "bandcamp" ? (
          <p className="text-[12px] text-[#6b7280]">{tt("On Bandcamp, press Share, then Embed, and paste the code here.")}</p>
        ) : null}
        {!source ? <p className="text-[11.5px] leading-[16px] text-[#9ca3af]">{Object.values(EMBED_PROVIDER_NAME).join(", ")}</p> : null}
      </div>
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Title (optional)")}</Label>
        <Input value={data.title || ""} maxLength={80} placeholder={tt("Watch this")} onChange={(e) => updateData({ title: e.target.value })} />
      </div>
    </div>
  )
}

export function CreatorBlockEditor({ block, updateData }: { block: OnePageBlock; updateData: (updates: Partial<OnePageBlockData>) => void }) {
  const update = updateData as (u: object) => void
  switch (block.type) {
    case "course":
      return <CourseEditor data={block.data as CourseBlockData} updateData={update} />
    case "music":
      return <MusicEditor data={block.data as MusicBlockData} updateData={update} />
    case "testimonials":
      return <TestimonialsEditor data={block.data as TestimonialsBlockData} updateData={update} />
    case "contact_form":
      return <ContactFormEditor data={block.data as ContactFormBlockData} updateData={update} />
    case "embed":
      return <EmbedEditor data={block.data as EmbedBlockData} updateData={update} />
    default:
      return <StorelibBlockEditor block={block} updateData={updateData} />
  }
}

/* ─── Email signup: where the addresses go ───────────────────────────── */

type MarketingRow = { provider: "klaviyo" | "omnisend"; connected: boolean; listName?: string | null }

/**
 * WHERE A SIGNUP GOES, SAID UNDER THE EMAIL SIGNUP'S SETTINGS. Every address
 * is a subscriber in Emails › Subscribers (app/api/onepage/leads writes the
 * one list every form on Storelib writes), the welcome automation runs, and
 * a store with Klaviyo or Omnisend connected (Settings › Integrations,
 * lib/integrations/marketing) has it sent there on the next sync. This says
 * how many joined from this page and which of those is on.
 */
export function SignupDestination({ suggest }: { suggest?: string | null } = {}) {
  const [joined, setJoined] = React.useState<number | null>(null)
  const [tools, setTools] = React.useState<MarketingRow[] | null>(null)
  React.useEffect(() => {
    let live = true
    fetch("/api/onepage/leads?limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setJoined(typeof d?.total === "number" ? d.total : null))
      .catch(() => {})
    fetch("/api/store/integrations/marketing")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setTools(Array.isArray(d?.marketing) ? (d.marketing as MarketingRow[]) : []))
      .catch(() => live && setTools([]))
    return () => {
      live = false
    }
  }, [])
  const on = (tools ?? []).filter((t) => t.connected)
  const name = (p: MarketingRow["provider"]) => (p === "klaviyo" ? "Klaviyo" : "Omnisend")
  return (
    <div data-signup-destination="" className="space-y-2.5 rounded-xl border border-[#e8e8ec] p-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#f2f2f4] text-[#1a1a2e]">
          <Check aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium text-[#111113]">{tt("Signups go to your subscribers")}</span>
          <span className="block text-[12px] text-[#6b7280]">
            {joined === null ? tt("Emails, Subscribers, with your welcome email") : tt("{count, plural, one {# person joined from your page} other {# people joined from your page}}", { count: joined })}
          </span>
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-[#6b7280]">
        {on.length
          ? tt("Also sent to {value} on the next sync.", { value: on.map((t) => name(t.provider) + (t.listName ? ` (${t.listName})` : "")).join(", ") })
          : tt("Use Klaviyo or Omnisend? Connect it and every signup is sent there too.")}
      </p>
      {/* Round 40: Mailchimp, Kit, beehiiv and the webhooks, each sent the signup as it happens; the one this block was added as first (./page-integrations). */}
      <SignupTools suggest={suggest} />
      <div className="flex gap-2">
        <a href="/app/emails?tab=subscribers" className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#2a2a40]">
          {tt("See subscribers")}
        </a>
        {!on.length && tools !== null ? (
          <a href={`/app/integrations?integration=${suggest === "omnisend" ? "omnisend" : "klaviyo"}`} className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-[#e3e4e8] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]">
            {tt("Connect an email tool")}
          </a>
        ) : null}
      </div>
    </div>
  )
}

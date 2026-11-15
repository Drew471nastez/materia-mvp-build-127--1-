"use client"

/*
 * THE EDITOR'S HALF OF ./creator-blocks (round 63): each creator block's editor and the sign up
 * destination note. Split out so a visitor's OnePage downloads the blocks it draws, not the course
 * list's database reads or the forms.
*/
import * as React from "react"
import { Check, Loader2, Plus, Star, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { usePageMoney } from "@/components/platform/price-currency"
import { createClient } from "@/lib/supabase/client"
import { teamStoreForProducts } from "@/lib/onepage/team-context"
import { EMBED_PROVIDER_NAME, embedSource, MUSIC_PROVIDER_NAME, TESTIMONIAL_LIMITS, musicSource } from "@/lib/onepage/creator-blocks"
import type { ContactFormBlockData, CourseBlockData, EmbedBlockData, MusicBlockData, OnePageBlock, OnePageBlockData, TestimonialItem, TestimonialsBlockData } from "@/lib/onepage/types"
import { tt } from "@/lib/i18n/text"
import { StorelibBlockEditor } from "@/components/onepage/storelib-blocks-editor"
import { SignupTools } from "@/components/onepage/page-integrations"
import { useCoverFromPreview } from "@/components/onepage/cover-from-preview"

/* ─── The editor ──────────────────────────────────────────────────────── */

const fieldBox = "space-y-1.5"
const fieldLabel = "text-xs"

type CourseRow = { id: string; title: string; slug: string | null; thumbnail_url: string | null; price_cents: number | null; status: string | null; lessons: number | null }

/** The creator's own courses, newest first, each with its lesson count when it can be read. */
async function loadCourses(): Promise<CourseRow[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  /* A team member editing a store's OnePage lists that store's courses (lib/onepage/team-context); the owner, their own, as before. */
  const teamStore = teamStoreForProducts()
  const { data: creator } = teamStore ? { data: { id: teamStore } } : await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
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
        <Input value={data.button_text ?? ""} maxLength={30} placeholder={tt("View course")} onChange={(e) => updateData({ button_text: e.target.value })} />
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
  /* Round AR3: the cover for the Card layout, read once from the address's public preview. */
  useCoverFromPreview(data.url, data.artwork_url, "artwork_url", !!source, (patch) => updateData(patch as Partial<MusicBlockData>))
  return (
    <div className="space-y-3">
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Music link")}</Label>
        <Input value={data.url || ""} inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://open.spotify.com/track/..." onChange={(e) => { const url = e.target.value.trim(); updateData(url === (data.url || "").trim() ? { url } : { url, artwork_url: null }) }} aria-invalid={!ok || undefined} />
        {!ok ? (
          <p className="text-[12px] text-[#b42318]">{tt("Paste a Spotify, SoundCloud or Apple Music link to a song, album or playlist.")}</p>
        ) : source ? (
          <p className="text-[12px] text-[#6b7280]">{tt("Plays in the {value} player on your page.", { value: MUSIC_PROVIDER_NAME[source.kind] })}</p>
        ) : null}
      </div>
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Title (optional)")}</Label>
        <Input value={data.title ?? ""} maxLength={80} placeholder={tt("My new single")} onChange={(e) => updateData({ title: e.target.value })} />
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
        <Input value={data.title ?? ""} maxLength={60} placeholder={tt("What people say")} onChange={(e) => updateData({ title: e.target.value })} />
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
        <Input value={data.title ?? ""} maxLength={60} placeholder={tt("Get in touch")} onChange={(e) => updateData({ title: e.target.value })} />
      </div>
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Text (optional)")}</Label>
        <Input value={data.description ?? ""} maxLength={140} placeholder={tt("Questions, work, or just hi")} onChange={(e) => updateData({ description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={fieldBox}>
          <Label className={fieldLabel}>{tt("Button")}</Label>
          <Input value={data.button_text ?? ""} maxLength={24} placeholder={tt("Send")} onChange={(e) => updateData({ button_text: e.target.value })} />
        </div>
        <div className={fieldBox}>
          <Label className={fieldLabel}>{tt("After sending")}</Label>
          <Input value={data.success_message ?? ""} maxLength={100} placeholder={tt("Thanks. Your message is sent.")} onChange={(e) => updateData({ success_message: e.target.value })} />
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
  canva: "https://www.canva.com/design/.../view",
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
        ) : data.provider === "canva" ? (
          <p className="text-[12px] text-[#6b7280]">{tt("In Canva, press Share, then Embed, and paste the smart embed link here.")}</p>
        ) : null}
        {!source ? <p className="text-[11.5px] leading-[16px] text-[#9ca3af]">{Object.values(EMBED_PROVIDER_NAME).join(", ")}</p> : null}
      </div>
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Title (optional)")}</Label>
        <Input value={data.title ?? ""} maxLength={80} placeholder={tt("Watch this")} onChange={(e) => updateData({ title: e.target.value })} />
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
      {/* Round AQ: each label on one line; where both do not fit side by side (a phone), they stack at full width rather than one wrapping inside its button. */}
      <div className="flex flex-wrap gap-2">
        <a href="/app/emails?tab=subscribers" className="inline-flex h-9 flex-[1_1_auto] items-center justify-center whitespace-nowrap rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#2a2a40]">
          {tt("See subscribers")}
        </a>
        {!on.length && tools !== null ? (
          <a href={`/app/integrations?integration=${suggest === "omnisend" ? "omnisend" : "klaviyo"}`} className="inline-flex h-9 flex-[1_1_auto] items-center justify-center whitespace-nowrap rounded-lg border border-[#e3e4e8] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]">
            {tt("Connect an email tool")}
          </a>
        ) : null}
      </div>
    </div>
  )
}

"use client"

/**
 * ===========================================================================
 *  ONE MEMBERSHIP, FOR ITS CREATOR
 * ===========================================================================
 * /app/memberships/<id>, three views under the title:
 *
 *   Updates    "Post an update to members": a title, the text, pictures,
 *              files and products to link, and whether to email it. Under
 *              it, everything posted, as members see it, with how many it
 *              was emailed to, and a way to take one down.
 *   Members    how many, what they bring in a month, who is in a trial or
 *              has a failed payment, and each member with where they stand.
 *   Settings   the page (name, description, picture), the monthly and
 *              yearly price and the free trial, what members get, the
 *              products included, and putting it on sale.
 *
 * A new membership opens on Settings; one with members opens on Updates.
 * The /app language throughout: the Orders list's bar and card, near black
 * actions (no purple on the app's actions), the segmented views Coupons
 * uses. Uploads go through the same pipeline as a product's files
 * (lib/storage/chunked-upload DirectUploader): pictures to the public
 * picture bucket, files to the private one under this membership, where
 * only members can download them (app/api/memberships/files).
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ExternalLink, FileText, ImagePlus, Link2, MoreHorizontal, Paperclip, Plus, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { GUTTER, PaneBar, StatusBadge, buttonPrimary, buttonSecondary, card } from "@/app/app/orders/order-parts"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { centsFromInput, checkPlan, LIMITS } from "@/lib/memberships/plan"
import { describeStatus, money, pricePer, shortDate, yearlySaving } from "@/lib/memberships/state"
import type { CreatorMembershipScreen, FeedPost, MemberView, PostRow } from "@/lib/memberships/view-types"
import { PostView, fileSize } from "./post-view"
import { StatusLabel } from "./status-line"
import { tt } from "@/lib/i18n/text"

type Tab = "updates" | "members" | "settings"
const WIDTH = "max-w-[980px]"

const field =
  "block w-full min-w-0 rounded-lg border border-[#e1e3e7] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#a2a7b0] hover:border-[#d2d5da] focus:border-[#1a1a2e]/50 focus:shadow-[0_0_0_3px_rgba(26,26,46,0.07)] sm:text-[14px]"

async function send<T>(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: T & { error?: string; field?: string } }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T & { error?: string; field?: string } }
  } catch {
    return { ok: false, data: { error: tt("The connection dropped. Nothing was saved. Try again.") } as T & { error?: string } }
  }
}

function asFeed(p: PostRow, products: CreatorMembershipScreen["products"]): FeedPost {
  return {
    id: p.id,
    title: p.title,
    body: p.body,
    images: p.images ?? [],
    attachments: p.attachments ?? [],
    links: (p.linked_product_ids ?? [])
      .map((id) => products.find((x) => x.id === id))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((x) => ({ id: x.id, title: x.title, cover: x.cover, href: `/app/products/${x.id}` })),
    publishedAt: p.published_at,
    unread: false,
  }
}

/* ── Updates ────────────────────────────────────────────────────────────── */

interface Upload {
  key: string
  kind: "image" | "file"
  name: string
  size: number
  progress: number
  url?: string
  assetId?: string
  error?: string
  width?: number | null
  height?: number | null
}

function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve(null)
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

function Composer({ screen, onPosted }: { screen: CreatorMembershipScreen; onPosted: (post: PostRow, emailing: number) => void }) {
  const [title, setTitle] = React.useState("")
  const [body, setBody] = React.useState("")
  const [uploads, setUploads] = React.useState<Upload[]>([])
  const [links, setLinks] = React.useState<string[]>([])
  const [pickLinks, setPickLinks] = React.useState(false)
  const onSale = screen.product.status === "published"
  const [sendEmail, setSendEmail] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const imageInput = React.useRef<HTMLInputElement>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const bodyRef = React.useRef<HTMLTextAreaElement>(null)
  const emailable = screen.stats.members

  /* The text box grows with what is written, up to a point, so the Post button stays in reach. */
  React.useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(420, Math.max(96, el.scrollHeight))}px`
  }, [body])

  const upload = async (file: File, kind: "image" | "file") => {
    const key = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const dims = kind === "image" ? await imageSize(file) : null
    setUploads((u) => [...u, { key, kind, name: file.name, size: file.size, progress: 0, width: dims?.width ?? null, height: dims?.height ?? null }])
    const uploader = new DirectUploader({
      file,
      productId: kind === "file" ? screen.product.id : undefined,
      folder: kind === "file" ? "digital" : "product-images",
      onProgress: (percent) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: percent } : x))),
    })
    try {
      const result = await uploader.start()
      setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: 100, url: result.publicUrl || undefined, assetId: result.assetId || undefined, name: result.fileName || x.name, size: result.fileSize || x.size } : x)))
    } catch (e) {
      const message = (e as { message?: string })?.message || tt("The upload did not finish.")
      setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: message } : x)))
    } finally {
      uploader.destroy()
    }
  }

  const pick = (files: FileList | null, kind: "image" | "file") => {
    if (!files) return
    const room = kind === "image" ? LIMITS.images - uploads.filter((u) => u.kind === "image").length : LIMITS.attachments - uploads.filter((u) => u.kind === "file").length
    Array.from(files).slice(0, Math.max(0, room)).forEach((f) => void upload(f, kind))
  }

  const pending = uploads.some((u) => !u.error && u.progress < 100)
  const ready = (title.trim() || body.trim() || uploads.some((u) => (u.url || u.assetId) && !u.error)) && !pending

  const submit = async () => {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    const res = await send<{ post?: PostRow; emailing?: number }>(`/api/app/memberships/${screen.product.id}/posts`, "POST", {
      title,
      body,
      images: uploads.filter((u) => u.kind === "image" && u.url && !u.error).map((u) => ({ url: u.url, width: u.width, height: u.height })),
      attachments: uploads.filter((u) => u.kind === "file" && u.assetId && !u.error).map((u) => ({ assetId: u.assetId, name: u.name, size: u.size })),
      linkedProductIds: links,
      sendEmail: onSale && sendEmail,
    })
    setBusy(false)
    if (!res.ok || !res.data.post) return setError(res.data.error || tt("The update could not be posted. Try again."))
    onPosted(res.data.post, res.data.emailing ?? 0)
    setTitle("")
    setBody("")
    setUploads([])
    setLinks([])
    setPickLinks(false)
  }

  return (
    <section aria-labelledby="composer-title" data-composer="" className={cn(card, "px-4 py-4 sm:px-5")}>
      <h2 id="composer-title" className="text-[15px] font-semibold text-[#1a1a2e]">
        {tt("Post an update to members")}
      </h2>
      <div className="mt-3 space-y-2.5">
        <label htmlFor="post-title" className="sr-only">{tt("Title")}</label>
        <input id="post-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, LIMITS.titleChars))} placeholder={tt("Title")} className={cn(field, "h-11 font-medium")} />
        <label htmlFor="post-body" className="sr-only">{tt("Your update")}</label>
        <textarea ref={bodyRef} id="post-body" value={body} onChange={(e) => setBody(e.target.value.slice(0, LIMITS.bodyChars))} placeholder={tt("Write to your members")} rows={4} className={cn(field, "resize-none py-2.5 leading-relaxed")} />
      </div>

      {uploads.length > 0 ? (
        <div className="mt-3 space-y-2">
          {uploads.some((u) => u.kind === "image") ? (
            <div className="flex flex-wrap gap-2">
              {uploads
                .filter((u) => u.kind === "image")
                .map((u) => (
                  <div key={u.key} className="relative h-20 w-20 overflow-hidden rounded-xl bg-[#f1f2f4]">
                    {u.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white">
                        <span className="block h-full bg-[#1a1a2e] transition-[width] duration-200" style={{ width: `${u.progress}%` }} />
                      </span>
                    )}
                    {u.error ? <span className="absolute inset-0 grid place-items-center bg-[#fef2f2]/90 px-1 text-center text-[11px] text-[#991b1b]">{tt("Failed")}</span> : null}
                    <button type="button" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} aria-label={tt("Remove {name}", { name: u.name })} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/75">
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          ) : null}
          {uploads
            .filter((u) => u.kind === "file")
            .map((u) => (
              <div key={u.key} className="flex items-center gap-3 rounded-xl border border-[#e8eaee] px-3 py-2">
                <FileText aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-[#1a1a2e]">{u.name}</p>
                  <p className={cn("text-[12px]", u.error ? "text-[#b91c1c]" : "text-[#6b7280]")}>{u.error ? u.error : u.progress < 100 ? tt("Uploading {progress}%", { progress: u.progress }) : fileSize(u.size)}</p>
                </div>
                <button type="button" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} aria-label={tt("Remove {name}", { name: u.name })} className="grid h-8 w-8 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f4f5f7]">
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>
            ))}
        </div>
      ) : null}

      {pickLinks ? (
        <div className="mt-3 rounded-xl border border-[#e8eaee] p-2">
          <p className="px-1.5 pb-1.5 text-[12.5px] font-medium text-[#6b7280]">{tt("Link products in this update (up to {links})", { links: LIMITS.links })}</p>
          {screen.products.length === 0 ? (
            <p className="px-1.5 pb-1 text-[13px] text-[#6b7280]">{tt("You have no other products yet.")}</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {screen.products.map((p) => {
                const on = links.includes(p.id)
                return (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-[#f7f7f8]">
                      <input type="checkbox" checked={on} disabled={!on && links.length >= LIMITS.links} onChange={() => setLinks((l) => (on ? l.filter((x) => x !== p.id) : [...l, p.id]))} className="h-4 w-4 accent-[#1a1a2e]" />
                      <span className="truncate text-[13.5px] text-[#1a1a2e]">{p.title}</span>
                      {p.status !== "published" ? <span className="text-[12px] text-[#9ca3af]">{tt("Draft")}</span> : null}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : links.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {links.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-lg bg-[#f1f2f4] py-1 pl-2.5 pr-1 text-[12.5px] font-medium text-[#1a1a2e]">
              {screen.products.find((p) => p.id === id)?.title}
              <button type="button" onClick={() => setLinks((l) => l.filter((x) => x !== id))} aria-label={tt("Remove link")} className="grid h-5 w-5 place-items-center rounded text-[#6b7280] hover:bg-[#e4e6ea]">
                <X aria-hidden className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-3 text-[13.5px] text-[#b91c1c]">{error}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#f1f2f4] pt-3">
        <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => { pick(e.target.files, "image"); e.target.value = "" }} />
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { pick(e.target.files, "file"); e.target.value = "" }} />
        <button type="button" onClick={() => imageInput.current?.click()} className={cn(buttonSecondary, "max-sm:h-10 max-sm:w-10 max-sm:px-0")} aria-label={tt("Add pictures")}>
          <ImagePlus aria-hidden className="h-4 w-4" />
          <span className="max-sm:hidden">{tt("Picture")}</span>
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} className={cn(buttonSecondary, "max-sm:h-10 max-sm:w-10 max-sm:px-0")} aria-label={tt("Attach files")}>
          <Paperclip aria-hidden className="h-4 w-4" />
          <span className="max-sm:hidden">{tt("File")}</span>
        </button>
        <button type="button" onClick={() => setPickLinks((o) => !o)} aria-pressed={pickLinks} className={cn(buttonSecondary, "max-sm:h-10 max-sm:w-10 max-sm:px-0", pickLinks && "bg-[#f1f2f4]")} aria-label={tt("Link products")}>
          <Link2 aria-hidden className="h-4 w-4" />
          <span className="max-sm:hidden">{tt("Product")}</span>
        </button>
        <div className="ml-auto flex items-center gap-3">
          {onSale ? (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#4b5563]">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
              {tt("Email")} {emailable === 1 ? tt("1 member") : tt("{emailable} members", { emailable })}
            </label>
          ) : null}
          <button type="button" onClick={() => void submit()} disabled={!ready || busy} data-post-button="" className={cn(buttonPrimary, "h-9 px-4 text-[13.5px] max-sm:h-10")}>
            {busy ? tt("Posting") : pending ? tt("Uploading") : tt("Post")}
          </button>
        </div>
      </div>
      {!onSale ? <p className="mt-2 text-[12.5px] text-[#6b7280]">{tt("Members see posts on their membership page. Put the membership on sale in Settings to let people join.")}</p> : null}
    </section>
  )
}

function Updates({ screen, posts, setPosts, notice }: { screen: CreatorMembershipScreen; posts: PostRow[]; setPosts: React.Dispatch<React.SetStateAction<PostRow[]>>; notice: (text: string) => void }) {
  const remove = async (id: string) => {
    const res = await send(`/api/app/memberships/${screen.product.id}/posts/${id}`, "DELETE")
    if (!res.ok) return notice(res.data.error || tt("The update could not be removed."))
    setPosts((list) => list.filter((p) => p.id !== id))
    notice(tt("Update removed"))
  }
  return (
    <div className="space-y-4">
      <Composer
        screen={screen}
        onPosted={(post, emailing) => {
          setPosts((list) => [post, ...list])
          notice(emailing > 0 ? tt("Posted, and emailing {emailing, plural, one {# member} other {# members}}", { emailing }) : tt("Posted"))
        }}
      />
      {posts.length === 0 ? (
        <p className="px-1 py-6 text-center text-[13.5px] text-[#6b7280]">{tt("Nothing posted yet. Your first update shows up here, as members see it.")}</p>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <div key={p.id}>
              <PostView
                post={asFeed(p, screen.products)}
                fileHref={(assetId) => `/api/memberships/files/${p.id}/${assetId}`}
                aside={
                  <ResponsiveActionMenu
                    title={tt("Update")}
                    items={[{ label: tt("Remove update"), variant: "destructive", onClick: () => void remove(p.id) }]}
                    trigger={
                      <button type="button" aria-label={tt("Actions for this update")} className="-mr-1.5 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f4f5f7]">
                        <MoreHorizontal aria-hidden className="h-4 w-4" />
                      </button>
                    }
                  />
                }
              />
              <p className="mt-1.5 px-2 text-[12px] text-[#9ca3af]">
                {p.email_status === "sent" ? (p.emailed_count > 0 ? tt("Emailed to {emailed_count, plural, one {# member} other {# members}}", { emailed_count: p.emailed_count }) : tt("Not emailed")) : p.email_status === "queued" || p.email_status === "sending" ? tt("Emailing members") : tt("Not emailed")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Members ────────────────────────────────────────────────────────────── */

type MemberFilter = "all" | "active" | "trialing" | "past_due" | "canceled" | "ended"
const FILTERS: { value: MemberFilter; label: string }[] = [
  { value: "all", get label() { return tt("All") } },
  { value: "active", get label() { return tt("Active") } },
  { value: "trialing", get label() { return tt("Trial") } },
  { value: "past_due", get label() { return tt("Payment failed") } },
  { value: "canceled", get label() { return tt("Cancelling") } },
  { value: "ended", get label() { return tt("Ended") } },
]

function viewOf(m: MemberView) {
  return describeStatus({ status: m.status, current_period_end: m.current_period_end, past_due_since: m.past_due_since, billing_interval: m.billing_interval, amount_cents: m.amount_cents, currency: m.currency, trial_end: m.trial_end })
}

function filterOf(m: MemberView): Exclude<MemberFilter, "all"> {
  const v = viewOf(m)
  if (m.status === "active") return "active"
  if (m.status === "trialing") return "trialing"
  if (m.status === "past_due") return "past_due"
  if (m.status === "canceled" && v.label === "Cancelled") return "canceled"
  return "ended"
}

function Members({ screen }: { screen: CreatorMembershipScreen }) {
  const [filter, setFilter] = React.useState<MemberFilter>("all")
  const counts = React.useMemo(() => {
    const c: Record<MemberFilter, number> = { all: screen.members.length, active: 0, trialing: 0, past_due: 0, canceled: 0, ended: 0 }
    for (const m of screen.members) c[filterOf(m)]++
    return c
  }, [screen.members])
  const shown = filter === "all" ? screen.members : screen.members.filter((m) => filterOf(m) === filter)
  const figures = [
    { label: tt("Members"), value: String(screen.stats.members) },
    { label: tt("A month"), value: money(screen.stats.monthlyCents) },
    { label: tt("In a trial"), value: String(screen.stats.trialing) },
    { label: tt("Payment failed"), value: String(screen.stats.pastDue) },
  ]
  return (
    <div className="space-y-4">
      <div className={cn(card, "grid grid-cols-2 divide-[#f1f2f4] sm:grid-cols-4 sm:divide-x")} data-member-stats="">
        {figures.map((f, i) => (
          <div key={f.label} className={cn("px-4 py-3.5 sm:px-5", i < 2 && "max-sm:border-b max-sm:border-[#f1f2f4]", i % 2 === 0 && "max-sm:border-r max-sm:border-[#f1f2f4]")}>
            <p className="text-[12.5px] text-[#6b7280]">{f.label}</p>
            <p className="mt-0.5 text-[20px] font-semibold tabular-nums text-[#1a1a2e]">{f.value}</p>
          </div>
        ))}
      </div>

      <section aria-label={tt("Members")} className={cn(card, "overflow-hidden")}>
        <div className="flex h-[52px] items-center border-b border-[#eef0f2] px-2 md:h-12">
          <div role="tablist" aria-label={tt("Members")} className="-my-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-2 scrollbar-hide">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-100 md:h-8 md:rounded-lg md:text-[13px]", filter === f.value ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]")}
              >
                {f.label}
                <span className="tabular-nums text-[#9ca3af]">{counts[f.value]}</span>
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-[#6b7280]">{screen.members.length === 0 ? tt("No members yet. When someone joins, they show up here.") : tt("Nobody here.")}</p>
        ) : (
          <>
            <ul className="divide-y divide-[#f1f2f4] md:hidden">
              {shown.map((m) => {
                const v = viewOf(m)
                return (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-[14.5px] font-medium text-[#1a1a2e]">{m.name || m.email}</p>
                      <StatusLabel view={v} />
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">{m.name ? m.email : ""}</p>
                    <p className="mt-0.5 text-[13px] text-[#6b7280]">
                      {m.amount_cents ? pricePer(m.amount_cents, m.billing_interval === "year" ? "year" : "month", m.currency) : ""} · {v.line}
                    </p>
                  </li>
                )
              })}
            </ul>
            <table className="hidden w-full border-collapse md:table">
              <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                <tr>
                  <th className="h-9 px-4 text-left text-[12px] font-medium text-[#4b5563]">{tt("Member")}</th>
                  <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Status")}</th>
                  <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Plan")}</th>
                  <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">{tt("Joined")}</th>
                  <th className="h-9 px-4 text-left text-[12px] font-medium text-[#4b5563]">{tt("Next")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f2f4]">
                {shown.map((m) => {
                  const v = viewOf(m)
                  return (
                    <tr key={m.id} className="hover:bg-[#fafbfb]">
                      <td className="h-14 max-w-[280px] px-4">
                        <p className="truncate text-[13.5px] font-medium text-[#1a1a2e]">{m.name || m.email}</p>
                        {m.name ? <p className="truncate text-[12.5px] text-[#6b7280]">{m.email}</p> : null}
                      </td>
                      <td className="h-14 whitespace-nowrap px-3">
                        <StatusLabel view={v} />
                      </td>
                      <td className="h-14 whitespace-nowrap px-3 text-[13px] text-[#1a1a2e]">{m.amount_cents ? pricePer(m.amount_cents, m.billing_interval === "year" ? "year" : "month", m.currency) : ""}</td>
                      <td className="h-14 whitespace-nowrap px-3 text-[13px] text-[#4b5563]">{shortDate(m.started_at || m.created_at)}</td>
                      <td className="h-14 px-4 text-[13px] text-[#4b5563]">{v.line}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  )
}

/* ── Settings ───────────────────────────────────────────────────────────── */

interface SettingsState {
  title: string
  description: string
  cover: string | null
  monthly: string
  yearly: string
  trialDays: string
  benefits: string[]
  included: string[]
}

const dollars = (cents: number | null) => (cents ? String(cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)) : "")

function initialSettings(s: CreatorMembershipScreen): SettingsState {
  return {
    title: s.product.title === "Membership" && s.product.status !== "published" ? "" : s.product.title,
    description: s.product.descriptionText,
    cover: s.product.thumbnail_url,
    monthly: dollars(s.plan.monthlyPriceCents),
    yearly: dollars(s.plan.yearlyPriceCents),
    trialDays: String(s.plan.trialDays || 0),
    benefits: s.plan.benefits.length ? s.plan.benefits : [""],
    included: s.plan.includedProductIds,
  }
}

function SettingsSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className={cn(card, "px-4 py-4 sm:px-5 sm:py-5")}>
      <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{title}</h2>
      {hint ? <p className="mt-0.5 text-[13px] text-[#6b7280]">{hint}</p> : null}
      <div className="mt-3.5">{children}</div>
    </section>
  )
}

function Settings({ screen, onSaved }: { screen: CreatorMembershipScreen; onSaved: (status: string, slug: string | null, title: string) => void }) {
  const [s, setS] = React.useState<SettingsState>(() => initialSettings(screen))
  const [saved, setSaved] = React.useState(() => JSON.stringify(initialSettings(screen)))
  const [busy, setBusy] = React.useState<null | "save" | "publish" | "unpublish" | "cover">(null)
  const [error, setError] = React.useState<{ text: string; field?: string } | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const coverInput = React.useRef<HTMLInputElement>(null)
  const status = screen.product.status
  const dirty = JSON.stringify(s) !== saved
  const monthlyCents = centsFromInput(s.monthly)
  const yearlyCents = centsFromInput(s.yearly)
  const saving = yearlySaving(Number.isFinite(monthlyCents as number) ? monthlyCents : null, Number.isFinite(yearlyCents as number) ? yearlyCents : null)

  const set = <K extends keyof SettingsState>(k: K, v: SettingsState[K]) => {
    setS((x) => ({ ...x, [k]: v }))
    setError(null)
    setNote(null)
  }

  const uploadCover = async (file: File | undefined) => {
    if (!file) return
    setBusy("cover")
    const uploader = new DirectUploader({ file, folder: "product-images" })
    try {
      const result = await uploader.start()
      if (result.publicUrl) set("cover", result.publicUrl)
    } catch (e) {
      setError({ text: (e as { message?: string })?.message || tt("The picture did not upload.") })
    } finally {
      uploader.destroy()
      setBusy(null)
    }
  }

  const save = async (publish: boolean | null) => {
    const plan = {
      monthlyPrice: s.monthly,
      yearlyPrice: s.yearly,
      trialDays: Number(s.trialDays || 0),
      benefits: s.benefits,
      includedProductIds: s.included,
    }
    /* The same rules the server applies (lib/memberships/plan.ts), said before anything is sent. */
    const checked = checkPlan(plan, { publishing: publish === true || (publish === null && status === "published") })
    if (!checked.ok) return setError({ text: checked.error, field: checked.field })
    if (!s.title.trim()) return setError({ text: tt("Give the membership a name."), field: "title" })
    setBusy(publish === true ? "publish" : publish === false ? "unpublish" : "save")
    const res = await send<{ status?: string; slug?: string | null }>(`/api/app/memberships/${screen.product.id}`, "PUT", {
      title: s.title,
      description: s.description,
      thumbnailUrl: s.cover,
      plan: checked.value,
      publish,
    })
    setBusy(null)
    if (!res.ok) return setError({ text: res.data.error || tt("The membership could not be saved."), field: res.data.field })
    setSaved(JSON.stringify(s))
    setNote(publish === true ? tt("On sale") : publish === false ? tt("Taken off sale") : tt("Saved"))
    onSaved(res.data.status || status, res.data.slug ?? null, s.title)
    void fetch("/api/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: res.data.slug, type: "product", handle: screen.handle || undefined, productId: screen.product.id }) }).catch(() => {})
  }

  const bad = (f: string) => error?.field === f

  return (
    <div className="space-y-4 pb-24">
      {!screen.paymentsReady ? (
        <div role="status" className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[13.5px] text-[#92400e]">
          {tt("Connect payouts before members can join: people pay you through Stripe.")}{" "}
          <Link href="/app/settings?tab=payments" className="font-semibold underline">
            {tt("Set up payouts")}
          </Link>
        </div>
      ) : null}

      <SettingsSection title={tt("Page")} hint={tt("What people see before they join.")}>
        <div className="space-y-3">
          <div>
            <label htmlFor="m-title" className="mb-1.5 block text-[13px] font-medium text-[#4b5563]">{tt("Name")}</label>
            <input id="m-title" value={s.title} onChange={(e) => set("title", e.target.value.slice(0, 120))} placeholder={tt("Inner circle")} aria-invalid={bad("title") || undefined} className={cn(field, "h-11", bad("title") && "border-[#dc2626]")} />
          </div>
          <div>
            <label htmlFor="m-description" className="mb-1.5 block text-[13px] font-medium text-[#4b5563]">{tt("Description")}</label>
            <textarea id="m-description" value={s.description} onChange={(e) => set("description", e.target.value.slice(0, 20_000))} rows={5} placeholder={tt("Who it is for and what you share")} className={cn(field, "resize-y py-2.5 leading-relaxed")} />
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-[#4b5563]">{tt("Picture")}</p>
            <div className="flex items-center gap-3">
              {s.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.cover} alt="" className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <span aria-hidden className="grid h-16 w-16 place-items-center rounded-xl border border-dashed border-[#d9dce1] text-[#9ca3af]">
                  <ImagePlus className="h-5 w-5" />
                </span>
              )}
              <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void uploadCover(e.target.files?.[0]); e.target.value = "" }} />
              <button type="button" onClick={() => coverInput.current?.click()} disabled={busy === "cover"} className={buttonSecondary}>
                {busy === "cover" ? tt("Uploading") : s.cover ? tt("Change") : tt("Add a picture")}
              </button>
              {s.cover ? (
                <button type="button" onClick={() => set("cover", null)} className={cn(buttonSecondary, "border-transparent shadow-none")}>
                  {tt("Remove")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={tt("Price")} hint={tt("Offer monthly, yearly or both. Members keep the price they joined at.")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["monthly", tt("Monthly"), "9"],
              ["yearly", tt("Yearly"), "90"],
            ] as const
          ).map(([k, label, ph]) => (
            <div key={k}>
              <label htmlFor={`m-${k}`} className="mb-1.5 block text-[13px] font-medium text-[#4b5563]">{label}</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">$</span>
                <input id={`m-${k}`} inputMode="decimal" value={s[k]} onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, "").slice(0, 9))} placeholder={ph} aria-invalid={bad(k) || undefined} className={cn(field, "h-11 pl-7 tabular-nums", bad(k) && "border-[#dc2626]")} />
              </div>
              {k === "yearly" && saving > 0 ? <p className="mt-1 text-[12.5px] text-[#15803d]">{tt("Saves {saving}% against monthly", { saving })}</p> : null}
            </div>
          ))}
          <div>
            <label htmlFor="m-trial" className="mb-1.5 block text-[13px] font-medium text-[#4b5563]">{tt("Free trial")}</label>
            <select id="m-trial" value={s.trialDays} onChange={(e) => set("trialDays", e.target.value)} aria-invalid={bad("trial") || undefined} className={cn(field, "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8")}>
              {[0, 3, 7, 14, 30].map((d) => (
                <option key={d} value={String(d)}>
                  {d === 0 ? tt("No trial") : tt("{d} days", { d })}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={tt("What members get")} hint={tt("Shown on the page and at checkout. A line each.")}>
        <div className="space-y-2">
          {s.benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={b}
                onChange={(e) => set("benefits", s.benefits.map((x, j) => (j === i ? e.target.value.slice(0, LIMITS.benefitChars) : x)))}
                placeholder={i === 0 ? tt("A new video lesson every week") : tt("Another thing members get")}
                aria-label={tt("Benefit {value}", { value: i + 1 })}
                className={cn(field, "h-10")}
              />
              <button type="button" onClick={() => set("benefits", s.benefits.length > 1 ? s.benefits.filter((_, j) => j !== i) : [""])} aria-label={tt("Remove benefit {value}", { value: i + 1 })} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f4f5f7]">
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </div>
          ))}
          {s.benefits.length < LIMITS.benefits ? (
            <button type="button" onClick={() => set("benefits", [...s.benefits, ""])} className={cn(buttonSecondary, "mt-1")}>
              <Plus aria-hidden className="h-4 w-4" />
              {tt("Add a line")}
            </button>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection title={tt("Included products")} hint={tt("Members get these in their library while their membership lasts.")}>
        {screen.products.length === 0 ? (
          <p className="text-[13.5px] text-[#6b7280]">{tt("No other products yet. Courses and products you make can be included here.")}</p>
        ) : (
          <ul className="-mx-1.5 max-h-72 overflow-y-auto">
            {screen.products.map((p) => {
              const on = s.included.includes(p.id)
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-[#f7f7f8]">
                    <input type="checkbox" checked={on} onChange={() => set("included", on ? s.included.filter((x) => x !== p.id) : [...s.included, p.id].slice(0, LIMITS.included))} className="h-4 w-4 accent-[#1a1a2e]" />
                    {p.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.cover} alt="" className="h-9 w-9 rounded-lg object-cover" />
                    ) : (
                      <span aria-hidden className="h-9 w-9 rounded-lg bg-[#eceef1]" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{p.title}</span>
                    <span className="text-[12px] text-[#9ca3af]">{p.type === "course" ? tt("Course") : p.status === "published" ? "" : tt("Draft")}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </SettingsSection>

      {/* The page's actions, kept in reach at the foot of the screen. */}
      <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 max-md:bottom-[calc(var(--app-nav-room,0px)+0.75rem)]">
        <div className={cn(card, "flex flex-wrap items-center gap-2 px-3 py-2.5 shadow-[0_8px_24px_-8px_rgba(17,24,39,0.18)]")}>
          <p role="status" className={cn("min-w-0 flex-1 truncate px-1 text-[13px]", error ? "text-[#b91c1c]" : "text-[#6b7280]")}>
            {error ? error.text : note ? note : dirty ? tt("Unsaved changes") : status === "published" ? tt("On sale") : tt("Draft")}
          </p>
          {status === "published" ? (
            <>
              <button type="button" onClick={() => void save(false)} disabled={busy !== null} className={cn(buttonSecondary, "h-9")}>
                {busy === "unpublish" ? tt("Saving") : tt("Take off sale")}
              </button>
              <button type="button" onClick={() => void save(null)} disabled={busy !== null || !dirty} className={cn(buttonPrimary, "h-9 px-4")}>
                {busy === "save" ? tt("Saving") : tt("Save")}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void save(null)} disabled={busy !== null || !dirty} className={cn(buttonSecondary, "h-9")}>
                {busy === "save" ? tt("Saving") : tt("Save draft")}
              </button>
              <button type="button" onClick={() => void save(true)} disabled={busy !== null} data-publish="" className={cn(buttonPrimary, "h-9 px-4")}>
                {busy === "publish" ? tt("Publishing") : tt("Put on sale")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── The screen ─────────────────────────────────────────────────────────── */

export function CreatorMembershipScreenView({ screen: initial, initialTab, isNew = false }: { screen: CreatorMembershipScreen; initialTab: Tab | null; isNew?: boolean }) {
  const router = useRouter()
  const [screen, setScreen] = React.useState(initial)
  const [posts, setPosts] = React.useState<PostRow[]>(initial.posts)
  const [tab, setTab] = React.useState<Tab>(initialTab ?? (isNew || (initial.product.status !== "published" && initial.members.length === 0) ? "settings" : "updates"))
  const [toast, setToast] = React.useState<string | null>(null)
  const toastTimer = React.useRef(0)
  const notice = (text: string) => {
    setToast(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }
  const choose = (t: Tab) => {
    setTab(t)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", t)
    url.searchParams.delete("new")
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
  }
  const pageHref = screen.handle && screen.product.slug ? `/${screen.handle}/${screen.product.slug}` : null
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "updates", label: tt("Updates"), count: posts.length },
    { value: "members", label: tt("Members"), count: screen.stats.members },
    { value: "settings", label: tt("Settings") },
  ]

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-creator-membership="" data-tab={tab}>
      <PaneBar width={WIDTH} className="flex min-h-[64px] items-center gap-2 pb-2 pt-3">
        <Link href="/app/memberships" aria-label={tt("Memberships")} className="-ml-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#1a1a2e] hover:bg-[#eceef1]">
          <ArrowLeft aria-hidden className="h-[18px] w-[18px]" />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <h1 className="truncate text-[20px] font-bold text-[#1a1a2e] sm:text-[24px]">{screen.product.title || "Membership"}</h1>
          <StatusBadge tone={screen.product.status === "published" ? "success" : "neutral"}>{screen.product.status === "published" ? tt("On sale") : tt("Draft")}</StatusBadge>
        </div>
        {pageHref && screen.product.status === "published" ? (
          <a href={pageHref} target="_blank" rel="noopener noreferrer" className={cn(buttonSecondary, "max-sm:h-9 max-sm:w-9 max-sm:px-0")} aria-label={tt("View page")}>
            <ExternalLink aria-hidden className="h-4 w-4" />
            <span className="max-sm:hidden">{tt("View page")}</span>
          </a>
        ) : null}
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-10", WIDTH, GUTTER)}>
        <div role="tablist" aria-label="Membership" className="mb-4 mt-1 flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              data-tab-button={t.value}
              onClick={() => choose(t.value)}
              className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 text-[14px] font-medium transition-colors duration-100", tab === t.value ? "bg-[#e6e8ec] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#eef0f2]")}
            >
              {t.label}
              {typeof t.count === "number" ? <span className="tabular-nums text-[#9ca3af]">{t.count}</span> : null}
            </button>
          ))}
        </div>

        {tab === "updates" ? <Updates screen={screen} posts={posts} setPosts={setPosts} notice={notice} /> : null}
        {tab === "members" ? <Members screen={screen} /> : null}
        {tab === "settings" ? (
          <Settings
            screen={screen}
            onSaved={(status, slug, title) => {
              setScreen((x) => ({ ...x, product: { ...x.product, status, slug: slug ?? x.product.slug, title } }))
              router.refresh()
            }}
          />
        ) : null}
      </div>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--app-nav-room,0px)+1rem)] z-40 flex justify-center px-4 md:bottom-6">
        {toast ? <p className="pointer-events-auto rounded-full bg-[#1a1a2e] px-4 py-2 text-[13.5px] font-medium text-white shadow-lg">{toast}</p> : null}
      </div>
    </div>
  )
}


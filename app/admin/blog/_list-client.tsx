"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button, ConfirmDialog, Filters, SearchField, cx } from "@/app/admin/_console/ui"
import type { AdminListRow } from "@/lib/blog/admin-store"

import { BlogBar, PostStatusDot, formatAgo, formatWhen, inline } from "./_ui"

/**
 * The blog's posts, as the server read them (app/admin/blog/page.tsx).
 * Search, the status, category and author filters and the sort all run
 * over the rows already here, so each is instant. Ticking rows offers
 * Publish and Unpublish for all of them at once, and Copy external images:
 * every picture the ticked posts link from another site, copied into
 * Storelib (app/api/admin/blog/copy-image), one post after another, with
 * what happened to each post listed when it is done.
 */

interface CopyReport {
  id: string
  title: string
  copied: number
  failed: { url: string; error: string }[]
  none?: boolean
  error?: string
}

function copyLine(r: CopyReport): string {
  if (r.error) return r.error
  if (r.none) return "No pictures from other sites."
  return [r.copied ? `${r.copied} copied.` : "", r.failed.length ? `${r.failed.length} not copied: ${r.failed[0].error}` : ""].filter(Boolean).join(" ")
}

type StatusFilter = "all" | "draft" | "scheduled" | "published"
type Sort = "edited" | "published" | "title" | "views"

/* Short enough for a phone's third of a row: the select says "Sort" to a screen reader. */
const SORTS: { id: Sort; label: string }[] = [
  { id: "edited", label: "Edited" },
  { id: "published", label: "Published" },
  { id: "title", label: "Title" },
  { id: "views", label: "Views" },
]

export default function BlogListClient({ rows, error, categories, authors, full, note345 }: { rows: AdminListRow[]; error: string | null; categories: string[]; authors: { id: string; name: string }[]; full: boolean; note345: string }) {
  const router = useRouter()
  const [q, setQ] = React.useState("")
  const [status, setStatus] = React.useState<StatusFilter>("all")
  const [category, setCategory] = React.useState("")
  const [author, setAuthor] = React.useState("")
  const [sort, setSort] = React.useState<Sort>("edited")
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null)
  const [deleting, setDeleting] = React.useState<AdminListRow | null>(null)
  const [copying, setCopying] = React.useState<{ done: number; of: number } | null>(null)
  const [copyReports, setCopyReports] = React.useState<CopyReport[] | null>(null)
  const [refreshing, startTransition] = React.useTransition()

  const counts = React.useMemo(() => {
    const c = { all: rows.length, draft: 0, scheduled: 0, published: 0 }
    for (const r of rows) c[r.status]++
    return c
  }, [rows])

  /* The field answers every key at once; the list follows a beat behind on a long list, never holding a key up. */
  const query = React.useDeferredValue(q)
  const shown = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    const out = rows.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (!category || r.category === category) &&
        (!author || (author === "none" ? !r.author_id : r.author_id === author)) &&
        (!needle || r.title.toLowerCase().includes(needle) || r.slug.includes(needle) || r.tags.some((t) => t.toLowerCase().includes(needle))),
    )
    const by: Record<Sort, (a: AdminListRow, b: AdminListRow) => number> = {
      edited: (a, b) => (b.edited_at ?? "").localeCompare(a.edited_at ?? ""),
      published: (a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""),
      title: (a, b) => a.title.localeCompare(b.title),
      views: (a, b) => b.views - a.views,
    }
    return out.sort(by[sort])
  }, [rows, query, status, category, author, sort])

  const pickedRows = rows.filter((r) => picked.has(r.id))
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.id))

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function bulk(action: "publish" | "unpublish") {
    setBusy(action)
    setMessage(null)
    const res = await fetch("/api/admin/blog/posts/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...picked], action }) })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) return setMessage({ tone: "bad", text: typeof data.error === "string" ? data.error : "That did not work." })
    const done = (data.done ?? []).length
    const failed = (data.failed ?? []) as { id: string; error: string }[]
    setMessage(failed.length ? { tone: "bad", text: `${done} done. ${failed.length} could not be changed: ${failed[0].error}` } : { tone: "good", text: `${done === 1 ? "1 post" : `${done} posts`} ${action === "publish" ? "published" : "unpublished"}.` })
    setPicked(new Set())
    startTransition(() => router.refresh())
  }

  /* One post a request, in turn: each post's pictures are fetched one by one, and a request has only so long. */
  async function copyImages() {
    const ids = [...picked]
    setBusy("copy")
    setMessage(null)
    setCopyReports(null)
    const reports: CopyReport[] = []
    for (const [i, id] of ids.entries()) {
      setCopying({ done: i, of: ids.length })
      const title = rows.find((r) => r.id === id)?.title ?? ""
      try {
        const res = await fetch("/api/admin/blog/copy-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) })
        const data = await res.json().catch(() => ({}))
        const got = Array.isArray(data.results) ? (data.results[0] as CopyReport | undefined) : undefined
        reports.push(got ? { ...got, title: got.title || title } : { id, title, copied: 0, failed: [], error: typeof data.error === "string" ? data.error : "That did not work." })
      } catch {
        reports.push({ id, title, copied: 0, failed: [], error: "No connection. Nothing was changed." })
      }
      setCopyReports([...reports])
    }
    setCopying(null)
    setBusy(null)
    setPicked(new Set())
    if (reports.some((r) => r.copied)) startTransition(() => router.refresh())
  }

  async function remove(row: AdminListRow) {
    setBusy("delete")
    const res = await fetch(`/api/admin/blog/posts/${row.id}`, { method: "DELETE" })
    setBusy(null)
    setDeleting(null)
    if (!res.ok) return setMessage({ tone: "bad", text: "The post could not be deleted." })
    setMessage({ tone: "good", text: `Deleted “${row.title}”.` })
    startTransition(() => router.refresh())
  }

  const statusOptions = [
    { id: "all" as const, label: `All ${counts.all}` },
    { id: "draft" as const, label: `Drafts ${counts.draft}` },
    { id: "scheduled" as const, label: `Scheduled ${counts.scheduled}` },
    { id: "published" as const, label: `Published ${counts.published}` },
  ]

  const cols = "28px minmax(0,1fr) 168px 140px 150px 104px 64px"

  return (
    <div className="min-h-[100dvh] bg-[#0b0b0f] text-[#ededf0] [color-scheme:dark]">
      <BlogBar current="/admin/blog">
        <a href="/blog" target="_blank" rel="noopener noreferrer" className="flex h-8 items-center px-2 text-[13px] text-[#9b9ba6] hover:text-[#ededf0] max-md:hidden">
          View blog
        </a>
        <a href="/admin/blog/posts/new" className="inline-flex h-8 items-center rounded-[7px] bg-[#ededf0] px-3 text-[13px] font-medium text-[#0b0b0f] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70">
          New post
        </a>
      </BlogBar>

      <main className="mx-auto max-w-[1200px] space-y-3 px-4 pb-16 pt-6 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Posts</h1>
          {!full ? <p className="hidden text-[12px] text-[#9b9ba6] sm:block">Drafts of live posts, history, tags, authors and redirects: {note345}</p> : null}
        </div>
        {!full ? <p className="text-[12px] text-[#9b9ba6] sm:hidden">Drafts of live posts, history, tags, authors and redirects: {note345}</p> : null}

        <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <Filters options={statusOptions} value={status} onChange={setStatus} label="Status" />
          <div className="grid min-w-0 grid-cols-3 gap-2 sm:flex sm:items-center">
            <div className="col-span-3 flex min-w-0 sm:w-[300px] sm:flex-none">
              <SearchField value={q} onChange={setQ} placeholder="Search titles, slugs, tags" label="Search posts" />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={inline}>
              <option value="">Category</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="Author" className={inline} disabled={!authors.length}>
              <option value="">Author</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              {authors.length ? <option value="none">No profile</option> : null}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className={inline}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {message ? (
          <p role="status" className={cx("rounded-[10px] border px-4 py-2.5 text-[13px]", message.tone === "good" ? "border-[#3fb950]/30" : "border-[#f47067]/40 text-[#f47067]")}>
            {message.text}
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#f47067]/40 px-4 py-2">
            <p className="text-[13px] text-[#f47067]">{error}</p>
            <Button variant="plain" onClick={() => startTransition(() => router.refresh())} disabled={refreshing}>
              {refreshing ? "Trying…" : "Try again"}
            </Button>
          </div>
        ) : null}
        {copyReports ? (
          <section aria-label="Copy external images" className="rounded-[10px] border border-white/[0.08] px-4 py-2.5" data-copy-report="">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium">{copying ? `Copying pictures: ${copyReports.length} of ${copying.of} posts done` : `Copied pictures for ${copyReports.length === 1 ? "1 post" : `${copyReports.length} posts`}`}</p>
              {!copying ? (
                <Button variant="quiet" onClick={() => setCopyReports(null)}>
                  Close
                </Button>
              ) : null}
            </div>
            <ul className="mt-1.5 space-y-1 text-[13px]">
              {copyReports.map((r) => (
                <li key={r.id} className="flex min-w-0 gap-2">
                  <span className={cx("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", r.error || (r.failed.length && !r.copied) ? "bg-[#f47067]" : r.failed.length ? "bg-[#d4a72c]" : r.copied ? "bg-[#3fb950]" : "bg-[#6b6b76]")} aria-hidden />
                  <span className="min-w-0">
                    <span className="text-[#ededf0]">{r.title || "Untitled"}</span> <span className="text-[#9b9ba6]">{copyLine(r)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111116]" aria-label="Posts">
          {picked.size ? (
            <div className="flex min-h-[44px] flex-wrap items-center gap-2 border-b border-white/[0.08] bg-[#8b5cf6]/[0.06] px-4 py-1.5">
              <span className="text-[13px]">{picked.size} selected</span>
              <Button variant="plain" disabled={busy !== null || pickedRows.every((r) => r.status !== "draft" && !r.hasDraft)} onClick={() => bulk("publish")}>
                {busy === "publish" ? "Publishing…" : "Publish"}
              </Button>
              <Button variant="plain" disabled={busy !== null || pickedRows.every((r) => r.status === "draft")} onClick={() => bulk("unpublish")}>
                {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
              </Button>
              <Button variant="plain" disabled={busy !== null} onClick={copyImages}>
                {busy === "copy" && copying ? `Copying ${copying.done + 1} of ${copying.of}…` : "Copy external images"}
              </Button>
              <Button variant="quiet" onClick={() => setPicked(new Set())} className="ml-auto">
                Clear
              </Button>
            </div>
          ) : null}

          <div role="row" className="hidden items-center gap-3 border-b border-white/[0.08] px-4 py-2 lg:grid" style={{ gridTemplateColumns: cols }}>
            <input type="checkbox" aria-label="Select every post shown" checked={allShownPicked} onChange={() => setPicked(allShownPicked ? new Set() : new Set(shown.map((r) => r.id)))} className="h-4 w-4 accent-[#8b5cf6]" />
            {["Post", "Status", "Category", "Author", "Edited", "Views"].map((h, i) => (
              <span key={h} className={cx("truncate text-[12px] font-medium text-[#6b6b76]", i === 5 && "text-right")}>
                {h}
              </span>
            ))}
          </div>

          {!shown.length && error && !rows.length ? null : !shown.length ? (
            <div className="px-4 py-14 text-center">
              <p className="text-[14px] text-[#ededf0]">{rows.length ? "No post matches." : "No posts yet."}</p>
              {rows.length ? (
                <Button
                  variant="plain"
                  className="mt-3"
                  onClick={() => {
                    setQ("")
                    setStatus("all")
                    setCategory("")
                    setAuthor("")
                  }}
                >
                  Clear the search and filters
                </Button>
              ) : (
                <a href="/admin/blog/posts/new" className="mt-3 inline-flex h-8 items-center rounded-[7px] bg-[#ededf0] px-3 text-[13px] font-medium text-[#0b0b0f] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70">
                  Write the first post
                </a>
              )}
            </div>
          ) : (
            shown.map((r) => <Row key={r.id} row={r} cols={cols} picked={picked.has(r.id)} onPick={() => toggle(r.id)} onDelete={() => setDeleting(r)} />)
          )}
          <p className="border-t border-white/[0.08] px-4 py-2.5 text-[12px] tabular-nums text-[#6b6b76]">{shown.length === rows.length ? `${rows.length} ${rows.length === 1 ? "post" : "posts"}` : `${shown.length} of ${rows.length} posts`}</p>
        </section>
      </main>

      <ConfirmDialog open={Boolean(deleting)} title="Delete this post?" confirmLabel="Delete" danger busy={busy === "delete"} onClose={() => setDeleting(null)} onConfirm={() => deleting && remove(deleting)}>
        <p>
          “{deleting?.title}” and its history are deleted for good.{deleting?.status === "published" ? <> storelib.com/blog/{deleting.slug} will answer 404.</> : null} Unpublish keeps it instead.
        </p>
      </ConfirmDialog>
    </div>
  )
}

function Row({ row, cols, picked, onPick, onDelete }: { row: AdminListRow; cols: string; picked: boolean; onPick: () => void; onDelete: () => void }) {
  const href = `/admin/blog/posts/${row.id}`
  const statusLabel = row.status === "scheduled" ? `Scheduled ${formatWhen(row.published_at, false)}` : row.status === "published" && row.hasDraft ? "Published, edited" : undefined
  const check = <input type="checkbox" aria-label={`Select ${row.title}`} checked={picked} onChange={onPick} className="relative z-10 h-4 w-4 accent-[#8b5cf6]" />
  return (
    <div role="row" className={cx("group/row relative border-b border-white/[0.06] px-4 py-2.5 last:border-b-0 hover:bg-white/[0.03]", picked && "bg-[#8b5cf6]/[0.05]")} data-row>
      <div className="hidden min-h-8 items-center gap-3 lg:grid" style={{ gridTemplateColumns: cols }}>
        {check}
        <div className="flex min-w-0 items-center gap-3">
          <Thumb url={row.cover_image_url} />
          <div className="min-w-0">
            <a href={href} className="block truncate text-[13px] font-medium text-[#ededf0] outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[#8b5cf6]/70">
              {row.title || "Untitled"}
            </a>
            <p className="truncate text-[12px] text-[#6b6b76]">/blog/{row.slug}</p>
          </div>
        </div>
        <PostStatusDot status={row.status} label={statusLabel} />
        <span className="truncate text-[13px] text-[#c9c9d1]">{row.category}</span>
        <span className="truncate text-[13px] text-[#c9c9d1]">{row.author.split(" - ")[0]}</span>
        <span className="truncate text-[13px] text-[#9b9ba6]" title={formatWhen(row.edited_at)}>
          {formatAgo(row.edited_at)}
        </span>
        {/* Views, and Delete in their place on hover or keyboard focus: always in the page, so Tab reaches it. */}
        <span className="relative flex items-center justify-end text-right text-[13px] tabular-nums text-[#c9c9d1]">
          <span className="group-hover/row:invisible group-focus-within/row:invisible">{row.views.toLocaleString("en-US")}</span>
          <button type="button" onClick={onDelete} aria-label={`Delete ${row.title || "Untitled"}`} className="absolute right-0 z-10 rounded-[4px] text-[12px] text-[#f47067] opacity-0 outline-none hover:underline focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
            Delete
          </button>
        </span>
      </div>
      <div className="flex min-w-0 items-start gap-3 lg:hidden">
        <span className="relative z-10 pt-0.5">{check}</span>
        <div className="min-w-0 flex-1">
          <a href={href} className="line-clamp-2 text-[14px] font-medium leading-[19px] text-[#ededf0] outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[#8b5cf6]/70">
            {row.title || "Untitled"}
          </a>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-[#9b9ba6]">
            <PostStatusDot status={row.status} label={statusLabel} />
            <span>{row.category}</span>
            <span>{row.author.split(" - ")[0]}</span>
          </div>
          <p className="mt-0.5 text-[12px] tabular-nums text-[#6b6b76]">
            Edited {formatAgo(row.edited_at)} · {row.views.toLocaleString("en-US")} {row.views === 1 ? "view" : "views"}
          </p>
        </div>
        <Thumb url={row.cover_image_url} small />
      </div>
    </div>
  )
}

function Thumb({ url, small }: { url: string | null; small?: boolean }) {
  const [broken, setBroken] = React.useState(false)
  return (
    <span className={cx("relative block shrink-0 overflow-hidden rounded-[5px] border border-white/[0.06] bg-white/[0.03]", small ? "mt-0.5 h-[42px] w-[72px]" : "h-9 w-[64px]")}>
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : null}
    </span>
  )
}

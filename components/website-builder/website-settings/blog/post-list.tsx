"use client"

/**
 * The posts: a search, the status filter with its counts, category, tag and
 * author filters, the order, and a page of rows. A row is its check box, its
 * title (the press that opens it), its status, date and category, and its
 * menu. Selecting rows brings the bulk bar up from the bottom of the page.
 *
 * Every change of filter asks the server for that page (the list can be
 * thousands of posts); a search waits for typing to stop. A row's action
 * answers by reloading the page it is on, so counts and order are the
 * server's, never guessed here.
 */
import * as React from "react"
import { Archive, ArchiveRestore, Copy, ExternalLink, FileText, MoreHorizontal, Pencil, Search, Trash2, Undo2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { AdminPostSummary, SitePostStatus } from "@/lib/site-blog/types"
import { Badge, Card, ErrorNote, iconButtonClass, inputClass, buttonClass } from "../parts"
import type { SettingsContext } from "../types"
import { BlogApiError, POSTS_PER_PAGE, bulkPosts, deletePost, listPosts, postAction, type BlogOverview, type BulkAction, type PostPage, type PostQuery, type PostSort, type PostStatusFilter } from "./api"
import { BULK_MAX, EMPTY_COUNTS, STATUS_TABS, bulkOutcome, countFor, pageCount, pageSelection, rowActions, rowDate, statusLabel, statusTone, toggleAllOnPage, toggleOne, type RowAction } from "./model"
import { BulkBar } from "./bulk-bar"
import { BlogDialog, CheckBox, PillRow, SelectField, SkeletonRows } from "./ui"

const SEARCH_WAIT_MS = 300

export function PostList({
  ctx,
  overview,
  reloadKey,
  onEdit,
  onNewPost,
  onChanged,
  onSqlMissing,
}: {
  ctx: SettingsContext
  overview: BlogOverview
  /** Bumped by the screen when a post was saved or created elsewhere (the editor closed). */
  reloadKey: number
  onEdit: (postId: string) => void
  onNewPost: () => void
  /** Something changed that the rest of the screen counts (tags, categories' counts). */
  onChanged: () => void
  onSqlMissing: () => void
}) {
  const [query, setQuery] = React.useState<PostQuery>({ status: "all", sort: "updated", page: 1 })
  const [searchText, setSearchText] = React.useState("")
  const [page, setPage] = React.useState<PostPage | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  /** The statuses of selected posts as last seen, for which bulk actions apply. */
  const known = React.useRef(new Map<string, SitePostStatus>())
  const [notice, setNotice] = React.useState<{ tone: "ok" | "partial" | "failed"; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<{ ids: string[]; title: string | null } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [dialogError, setDialogError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)
  const seq = React.useRef(0)

  /* Typing in the search asks once it stops, from page 1. */
  React.useEffect(() => {
    const t = setTimeout(() => setQuery((q) => ((q.search ?? "") === searchText.trim() ? q : { ...q, search: searchText.trim(), page: 1 })), SEARCH_WAIT_MS)
    return () => clearTimeout(t)
  }, [searchText])

  React.useEffect(() => {
    const mine = ++seq.current
    setLoading(true)
    listPosts(ctx.installId, query)
      .then((p) => {
        if (mine !== seq.current) return
        for (const post of p.posts) known.current.set(post.id, post.status)
        setPage(p)
        setError(null)
        /* A page past the last (a delete emptied it): the last one there is. */
        const last = pageCount(p.total, POSTS_PER_PAGE)
        if ((query.page ?? 1) > last && p.posts.length === 0) setQuery((q) => ({ ...q, page: last }))
      })
      .catch((e: unknown) => {
        if (mine !== seq.current) return
        if (e instanceof BlogApiError && e.sql) return onSqlMissing()
        setError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false)
      })
  }, [ctx.installId, query, reloadKey, tick, onSqlMissing])

  const reload = React.useCallback(() => {
    setTick((t) => t + 1)
    onChanged()
  }, [onChanged])

  const set = (patch: Partial<PostQuery>) => setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 1 }))
  const posts = page?.posts ?? []
  const counts = page?.counts ?? EMPTY_COUNTS
  const pages = pageCount(page?.total ?? 0, POSTS_PER_PAGE)
  const currentPage = query.page ?? 1
  const pageIds = posts.map((p) => p.id)
  const onPage = pageSelection(selected, pageIds)
  const filtered = Boolean(query.search || query.categoryId || query.tag || query.authorId || (query.status && query.status !== "all"))
  const categoryName = (id: string | null) => (id ? overview.categories.find((c) => c.id === id)?.name ?? null : null)

  /* ── One post ────────────────────────────────────────────────────────── */

  async function act(post: AdminPostSummary, action: RowAction) {
    if (action === "edit") return onEdit(post.id)
    if (action === "delete") {
      setDialogError(null)
      return setConfirmDelete({ ids: [post.id], title: post.title || tt("Untitled") })
    }
    if (action === "view") return
    setNotice(null)
    try {
      if (action === "duplicate") {
        const copy = await postAction(ctx.installId, post.id, "duplicate")
        setNotice({ tone: "ok", text: tt("Duplicated as a draft: {title}", { title: copy.title || tt("Untitled") }) })
      } else {
        await postAction(ctx.installId, post.id, action)
        setNotice({ tone: "ok", text: action === "publish" ? tt("Published") : action === "unpublish" ? tt("Unpublished. It is a draft again and its address no longer opens.") : action === "archive" ? tt("Archived") : tt("Back in drafts") })
      }
      reload()
    } catch (e) {
      setNotice({ tone: "failed", text: e instanceof Error ? e.message : tt("Something went wrong. Try again.") })
    }
  }

  function menuFor(post: AdminPostSummary): ActionMenuItem[] {
    const title = post.title || tt("Untitled")
    return rowActions(post).map((a): ActionMenuItem => {
      switch (a) {
        case "edit":
          return { label: tt("Edit"), icon: <Pencil />, onClick: () => void act(post, a), id: "edit" }
        case "view":
          return { label: tt("View on website"), icon: <ExternalLink />, href: `${overview.liveBase}${post.livePath}`, target: "_blank", id: "view" }
        case "duplicate":
          return { label: tt("Duplicate"), icon: <Copy />, onClick: () => void act(post, a), id: "duplicate" }
        case "unpublish":
          return { label: post.status === "scheduled" ? tt("Cancel schedule") : tt("Unpublish"), icon: <Undo2 />, onClick: () => void act(post, a), id: "unpublish" }
        case "archive":
          return { label: tt("Archive"), icon: <Archive />, onClick: () => void act(post, a), id: "archive" }
        case "unarchive":
          return { label: tt("Move to drafts"), icon: <ArchiveRestore />, onClick: () => void act(post, a), id: "unarchive" }
        case "delete":
          return { label: tt("Delete"), icon: <Trash2 />, onClick: () => void act(post, a), variant: "destructive", separatorBefore: true, id: "delete" }
        default:
          return { label: title }
      }
    })
  }

  /* ── Many posts ──────────────────────────────────────────────────────── */

  const selectedIds = [...selected]
  const selectedStatuses = selectedIds.map((id) => known.current.get(id))

  async function runBulk(action: BulkAction, arg?: string | null): Promise<boolean> {
    const ids = selectedIds.slice(0, BULK_MAX)
    if (!ids.length) return false
    setBusy(true)
    setNotice(null)
    try {
      const r = await bulkPosts(ctx.installId, ids, action, arg)
      const outcome = bulkOutcome(r.done.length, r.failed)
      setNotice(outcome)
      /* What was done is no longer selected; what was not stays, to try again. */
      setSelected(new Set(r.failed.map((f) => f.id)))
      reload()
      return outcome.tone !== "failed"
    } catch (e) {
      const text = e instanceof Error ? e.message : tt("Something went wrong. Try again.")
      setNotice({ tone: "failed", text })
      setDialogError(text)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeletion() {
    const ask = confirmDelete
    if (!ask) return
    setDialogError(null)
    if (ask.ids.length === 1 && ask.title !== null) {
      setBusy(true)
      try {
        await deletePost(ctx.installId, ask.ids[0])
        setSelected((s) => {
          const n = new Set(s)
          n.delete(ask.ids[0])
          return n
        })
        setNotice({ tone: "ok", text: tt("Deleted {title}", { title: ask.title }) })
        setConfirmDelete(null)
        reload()
      } catch (e) {
        setDialogError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
      } finally {
        setBusy(false)
      }
      return
    }
    if (await runBulk("delete")) setConfirmDelete(null)
  }

  /* ── Drawing ─────────────────────────────────────────────────────────── */

  const statusOptions = STATUS_TABS.map((t) => ({ id: t.id, label: t.label(), count: countFor(counts, t.id) }))
  const noPostsAtAll = !loading && !error && !filtered && countFor(counts, "all") === 0 && countFor(counts, "archived") === 0 && posts.length === 0

  return (
    <>
      <Card className="overflow-visible" footer={notice ? <span role="status" className={cn(notice.tone === "failed" ? "text-red-300" : notice.tone === "partial" ? "text-amber-200" : "text-white/70")}>{notice.text}</span> : undefined}>
        {/* The filters: search and status first, the rest under them. */}
        <div className="space-y-3 px-4 py-4 md:px-6" data-blog-filters="">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={tt("Search posts")}
              aria-label={tt("Search posts")}
              className={cn(inputClass, "pl-9 md:w-full")}
              data-blog-search=""
            />
            {searchText && (
              <button type="button" onClick={() => setSearchText("")} aria-label={tt("Clear search")} className={cn(iconButtonClass, "absolute right-0 top-1/2 -translate-y-1/2 md:right-1")}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <PillRow label={tt("Status")} options={statusOptions} value={query.status ?? "all"} onChange={(status) => set({ status })} />
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
            <SelectField label={tt("Category")} value={query.categoryId ?? ""} onChange={(v) => set({ categoryId: v || undefined })} className="md:w-[180px]">
              <option value="">{tt("All categories")}</option>
              {overview.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField label={tt("Tag")} value={query.tag ?? ""} onChange={(v) => set({ tag: v || undefined })} className="md:w-[160px]">
              <option value="">{tt("All tags")}</option>
              {overview.tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectField>
            <SelectField label={tt("Author")} value={query.authorId ?? ""} onChange={(v) => set({ authorId: v || undefined })} className="md:w-[170px]">
              <option value="">{tt("All authors")}</option>
              {overview.authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
            <SelectField label={tt("Sort by")} value={query.sort ?? "updated"} onChange={(v) => set({ sort: v as PostSort })} className="md:ml-auto md:w-[180px]">
              <option value="updated">{tt("Last edited")}</option>
              <option value="published">{tt("Publish date")}</option>
              <option value="title">{tt("Title, A to Z")}</option>
            </SelectField>
          </div>
        </div>

        {/* The header: select the page, and how many there are. */}
        {posts.length > 0 && (
          <div className="flex items-center gap-3 bg-white/[0.02] px-4 py-2.5 text-[13px] text-white/55 md:px-6">
            <CheckBox
              checked={onPage === "all"}
              mixed={onPage === "some"}
              onChange={() => setSelected((s) => toggleAllOnPage(s, pageIds))}
              label={onPage === "all" ? tt("Deselect the posts on this page") : tt("Select the posts on this page")}
            />
            <span className="tabular-nums">{tt("{count, plural, one {# post} other {# posts}}", { count: page?.total ?? 0 })}</span>
            {loading && <span className="text-white/40">{tt("Loading")}</span>}
          </div>
        )}

        {error ? (
          <div className="px-4 py-6 md:px-6">
            <ErrorNote>{error}</ErrorNote>
            <button type="button" onClick={() => setTick((t) => t + 1)} className={cn(buttonClass, "mt-3")}>
              {tt("Try again")}
            </button>
          </div>
        ) : !page && loading ? (
          <SkeletonRows />
        ) : noPostsAtAll ? (
          <div className="flex flex-col items-center px-6 py-12 text-center" data-blog-empty="">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.06]">
              <FileText aria-hidden className="h-5 w-5 text-white/60" />
            </span>
            <p className="mt-4 text-[16px] font-semibold text-white">{tt("Write your first post")}</p>
            <p className="mt-1 max-w-[360px] text-[14px] leading-relaxed text-white/55">{tt("Posts appear on your website's blog page once you publish them. Drafts stay private.")}</p>
            <button type="button" onClick={onNewPost} className={cn(buttonClass, "mt-5")}>
              {tt("New post")}
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="px-4 py-10 text-center md:px-6">
            <p className="text-[14.5px] text-white/70">{tt("No posts match these filters.")}</p>
            <button
              type="button"
              onClick={() => {
                setSearchText("")
                setQuery({ status: "all", sort: query.sort, page: 1 })
              }}
              className={cn(buttonClass, "mt-4")}
            >
              {tt("Clear filters")}
            </button>
          </div>
        ) : (
          <ul aria-label={tt("Posts")} aria-busy={loading || undefined} className={cn("transition-opacity duration-150", loading && "opacity-60")} data-blog-posts="">
            {posts.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                category={categoryName(post.categoryId)}
                selected={selected.has(post.id)}
                onSelect={() => setSelected((s) => toggleOne(s, post.id))}
                onOpen={() => onEdit(post.id)}
                menu={menuFor(post)}
              />
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav aria-label={tt("Pages of posts")} className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
            <button type="button" disabled={currentPage <= 1 || loading} onClick={() => set({ page: currentPage - 1 })} className={buttonClass}>
              {tt("Previous")}
            </button>
            <span className="text-[13px] tabular-nums text-white/55" aria-live="polite">
              {tt("Page {page} of {pages}", { page: currentPage, pages })}
            </span>
            <button type="button" disabled={currentPage >= pages || loading} onClick={() => set({ page: currentPage + 1 })} className={buttonClass}>
              {tt("Next")}
            </button>
          </nav>
        )}
      </Card>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          statuses={selectedStatuses}
          categories={overview.categories}
          tags={overview.tags}
          busy={busy}
          onClear={() => setSelected(new Set())}
          onRun={runBulk}
          onDelete={() => {
            setDialogError(null)
            setConfirmDelete({ ids: selectedIds, title: null })
          }}
        />
      )}

      {confirmDelete && (
        <BlogDialog
          destructive
          title={confirmDelete.title !== null ? tt("Delete this post?") : tt("{count, plural, one {Delete # post?} other {Delete # posts?}}", { count: confirmDelete.ids.length })}
          lead={
            confirmDelete.title !== null
              ? tt("{title} is deleted for good, with its history. If it is live, its address stops working.", { title: confirmDelete.title })
              : tt("They are deleted for good, with their history. Live ones stop working at their addresses.")
          }
          confirmLabel={tt("Delete")}
          busyLabel={tt("Deleting")}
          busy={busy}
          error={dialogError}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void confirmDeletion()}
        />
      )}
    </>
  )
}

const PostRow = React.memo(function PostRow({
  post,
  category,
  selected,
  onSelect,
  onOpen,
  menu,
}: {
  post: AdminPostSummary
  category: string | null
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  menu: ActionMenuItem[]
}) {
  const title = post.title.trim() || tt("Untitled")
  return (
    <li data-blog-post={post.id} className={cn("flex items-center gap-3 border-t border-white/[0.07] pl-4 pr-2 md:pl-6 md:pr-4", selected && "bg-white/[0.03]")}>
      <CheckBox checked={selected} onChange={onSelect} label={tt("Select {title}", { title })} />
      <button type="button" onClick={onOpen} className="group flex min-h-[68px] min-w-0 flex-1 items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:min-h-[64px] [-webkit-tap-highlight-color:transparent]">
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverImageUrl} alt="" loading="lazy" className="hidden h-11 w-14 shrink-0 rounded-md bg-white/[0.06] object-cover md:block" />
        ) : (
          <span aria-hidden className="hidden h-11 w-14 shrink-0 place-items-center rounded-md bg-white/[0.04] md:grid">
            <FileText className="h-4 w-4 text-white/30" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[15px] font-medium group-hover:underline group-hover:underline-offset-2 md:text-[14.5px]", post.title.trim() ? "text-white" : "text-white/50")}>{title}</span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-white/50">
            <Badge tone={statusTone(post.status)}>{statusLabel(post.status)}</Badge>
            {post.hasUnpublishedChanges && <Badge tone="attention">{tt("Unpublished changes")}</Badge>}
            {post.featured && <Badge tone="neutral">{tt("Featured")}</Badge>}
            <span className="truncate">{rowDate(post)}</span>
            {category && <span className="truncate before:mr-2 before:content-['·']">{category}</span>}
          </span>
        </span>
      </button>
      <ResponsiveActionMenu
        title={title}
        items={menu}
        trigger={
          <button type="button" className={iconButtonClass} aria-label={tt("Actions for {title}", { title })} data-blog-row-menu="">
            <MoreHorizontal className="h-[18px] w-[18px]" />
          </button>
        }
      />
    </li>
  )
})

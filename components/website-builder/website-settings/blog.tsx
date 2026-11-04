"use client"

/**
 * ===========================================================================
 *  BLOG: THE WEBSITE'S POSTS, IN WEBSITE SETTINGS › CONTENT
 * ===========================================================================
 * One place for the blog, under Pages, and nowhere else: no item in the
 * app's sidebar, no tab on the Website page. It reads like the other
 * subjects here (parts.tsx): the title and its one action (New post), the
 * posts in a card (blog/post-list.tsx), then the blog's own things in one
 * small card whose rows open in place, Categories, Authors and Blog
 * settings, as Pages opens a page's search result. Last, the two templates,
 * whose Edit goes to the builder.
 *
 * A post opens over all of this in its own full-screen writer
 * (blog/post-editor.tsx), loaded only when one is opened.
 *
 * Before SQL part 355 is run the routes answer 503 { sql: 355 }, and the
 * screen says so, once, instead of a list that cannot load.
 */
import * as React from "react"
import dynamic from "next/dynamic"
import { ChevronDown, Loader2 } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { blogPath } from "@/lib/site-blog/urls"
import type { SiteBlogSettings } from "@/lib/site-blog/types"
import { Card, ErrorNote, Lead, PageTitle, buttonClass, primaryButtonClass } from "./parts"
import { storeNameFor } from "./seo"
import type { SettingsContext } from "./types"
import { BlogApiError, createPost, getBlog, type BlogOverview } from "./blog/api"
import type { AdminPost } from "@/lib/site-blog/types"
import { PostList } from "./blog/post-list"
import { CategoriesEditor } from "./blog/categories"
import { AuthorsEditor } from "./blog/authors"
import { BlogOptions } from "./blog/blog-options"
import { TemplatesCard } from "./blog/templates-card"

/* The writer is large (the block editor with it): fetched when a post is first opened, never with Settings. */
const loadWriter = () => import("./blog/post-editor")
const SitePostEditor = dynamic(() => loadWriter().then((m) => m.SitePostEditor), { ssr: false })

type Load = { kind: "loading" } | { kind: "ready"; overview: BlogOverview } | { kind: "sql" } | { kind: "error"; message: string }
type Part = "categories" | "authors" | "settings"

export function BlogSettings({ ctx }: { ctx: SettingsContext }) {
  const [load, setLoad] = React.useState<Load>({ kind: "loading" })
  const [editing, setEditing] = React.useState<string | null>(null)
  /* A post just made by New post, handed to the writer so it opens without reading it back. */
  const [opened, setOpened] = React.useState<{ post: AdminPost; overview: BlogOverview } | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const [part, setPart] = React.useState<Part | null>(null)
  const seq = React.useRef(0)

  const refresh = React.useCallback(() => {
    const mine = ++seq.current
    getBlog(ctx.installId)
      .then((overview) => mine === seq.current && setLoad({ kind: "ready", overview }))
      .catch((e: unknown) => {
        if (mine !== seq.current) return
        if (e instanceof BlogApiError && e.sql) setLoad({ kind: "sql" })
        else setLoad((l) => (l.kind === "ready" ? l : { kind: "error", message: e instanceof Error ? e.message : tt("Something went wrong. Try again.") }))
      })
  }, [ctx.installId])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  /* The writer's code fetched while the list is read, so the first post opened does not wait for it. */
  React.useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback
    const go = () => void loadWriter().catch(() => {})
    if (idle) idle(go)
    else setTimeout(go, 400)
  }, [])

  const sqlMissing = React.useCallback(() => setLoad({ kind: "sql" }), [])
  const overview = load.kind === "ready" ? load.overview : null

  async function newPost() {
    if (!overview || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const post = await createPost(ctx.installId, { meta: { authorId: overview.authors.length === 1 ? overview.authors[0].id : null } })
      setOpened({ post, overview })
      setEditing(post.id)
    } catch (e) {
      if (e instanceof BlogApiError && e.sql) setLoad({ kind: "sql" })
      else setCreateError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
    } finally {
      setCreating(false)
    }
  }

  const setSettings = (settings: SiteBlogSettings) => setLoad((l) => (l.kind === "ready" ? { kind: "ready", overview: { ...l.overview, settings } } : l))
  const toggle = (p: Part) => setPart((x) => (x === p ? null : p))
  const address = overview ? `${overview.liveBase.replace(/^https?:\/\//, "")}${blogPath(overview.settings.handle)}` : ""

  return (
    <>
      <PageTitle
        aside={
          <button type="button" onClick={() => void newPost()} disabled={!overview || creating} className={cn(primaryButtonClass, "px-4")} data-blog-new="">
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {tt("New post")}
          </button>
        }
      >
        {tt("Blog")}
      </PageTitle>
      {/* One line: where the posts are listed (round 51, less text). */}
      <Lead>{overview ? tt("Your posts are listed at {address}.", { address }) : tt("Posts for your website.")}</Lead>
      {createError && <ErrorNote>{createError}</ErrorNote>}

      {load.kind === "loading" && (
        <Card>
          <div className="flex items-center gap-3 px-4 py-6 text-[14px] text-white/55 md:px-6" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tt("Loading the blog")}
          </div>
        </Card>
      )}

      {load.kind === "sql" && (
        <Card footer={tt("Nothing on your website changes until then.")}>
          <div className="px-4 py-5 md:px-6" data-blog-sql="355">
            <p className="text-[15px] font-medium text-white">{tt("Blog turns on after the database update (SQL part 355).")}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-white/55">{tt("Your store's database is missing the blog's tables. Once SQL part 355 has been run, posts, categories and authors are kept here.")}</p>
            <button type="button" onClick={() => { setLoad({ kind: "loading" }); refresh() }} className={cn(buttonClass, "mt-4")}>
              {tt("Check again")}
            </button>
          </div>
        </Card>
      )}

      {load.kind === "error" && (
        <>
          <ErrorNote>{load.message}</ErrorNote>
          <button type="button" onClick={() => { setLoad({ kind: "loading" }); refresh() }} className={cn(buttonClass, "mt-3")}>
            {tt("Try again")}
          </button>
        </>
      )}

      {overview && (
        <>
          <PostList ctx={ctx} overview={overview} reloadKey={reloadKey} onEdit={(id) => { setOpened(null); setEditing(id) }} onNewPost={() => void newPost()} onChanged={refresh} onSqlMissing={sqlMissing} />

          <Card>
            <PartRow
              label={tt("Categories")}
              hint={tt("{count, plural, =0 {None yet} one {# category} other {# categories}}", { count: overview.categories.length })}
              open={part === "categories"}
              onToggle={() => toggle("categories")}
            >
              <CategoriesEditor installId={ctx.installId} categories={overview.categories} handle={overview.settings.handle} liveBase={overview.liveBase.replace(/^https?:\/\//, "")} onChanged={refresh} />
            </PartRow>
            <PartRow
              label={tt("Authors")}
              hint={tt("{count, plural, =0 {None yet} one {# author} other {# authors}}", { count: overview.authors.length })}
              open={part === "authors"}
              onToggle={() => toggle("authors")}
            >
              <AuthorsEditor installId={ctx.installId} authors={overview.authors} onChanged={refresh} />
            </PartRow>
            <PartRow label={tt("Blog settings")} hint={tt("Address, name, search")} open={part === "settings"} onToggle={() => toggle("settings")}>
              <BlogOptions installId={ctx.installId} settings={overview.settings} liveBase={overview.liveBase} siteName={storeNameFor(ctx)} onSaved={setSettings} />
            </PartRow>
          </Card>

          <TemplatesCard templates={overview.templates} onEditPage={ctx.onEditPage} />
        </>
      )}

      {editing && overview && (
        <SitePostEditor
          ctx={ctx}
          postId={editing}
          opened={opened}
          onClose={() => {
            setEditing(null)
            setOpened(null)
            setReloadKey((k) => k + 1)
            refresh()
          }}
        />
      )}
    </>
  )
}

/** A row of the blog's small card: its name and a count, opening its editor in place under it. */
function PartRow({ label, hint, open, onToggle, children }: { label: string; hint: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const id = React.useId()
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="group flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left md:min-h-[60px] md:px-6 [-webkit-tap-highlight-color:transparent]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-white md:text-[14.5px]">{label}</span>
          <span className="mt-0.5 block truncate text-[13px] text-white/50">{hint}</span>
        </span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-white/50 transition-[transform,rotate,color] duration-200 ease-out group-hover:text-white/70 motion-reduce:transition-none", open && "rotate-180 text-white/70")} />
      </button>
      <Reveal open={open} id={id} className="border-t border-white/[0.06]">
        {children}
      </Reveal>
    </div>
  )
}

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { readAdminPost } from "@/lib/blog/admin-store"
import { editorStateFromRow, readTimeFor } from "@/lib/blog/editor-model"
import { verifyPreviewToken } from "@/lib/blog/preview-token"
import { expandSnippets, readBlogAuthor, readBlogSnippets } from "@/lib/blog/post"
import { postStatus } from "@/lib/blog/schedule"

import { PreviewBlocks } from "./_article"

/**
 * ===========================================================================
 *  A DRAFT, FOR WHOEVER HOLDS THE LINK
 * ===========================================================================
 * /admin/blog/preview/<token>: the post's draft (or the post itself when it
 * has no draft), drawn the way the article draws it. The token is the key
 * (lib/blog/preview-token.ts): signed, for one post, seven days. A token
 * that does not verify is a 404, whoever asks.
 *
 * Never indexed: noindex, nofollow and nocache here, /admin is disallowed in
 * robots.txt, no sitemap lists anything under it, and the page is drawn for
 * each request, never cached.
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function BlogPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const postId = verifyPreviewToken(decodeURIComponent(token))
  if (!postId) notFound()
  const admin = await isAdminAuthenticated()
  const row = await readAdminPost(createAdminClient(), postId)
  if (!row) notFound()

  const { meta, blocks, hasDraft } = editorStateFromRow(row)
  const [snippets, author] = await Promise.all([readBlogSnippets(blocks), readBlogAuthor(meta.author_id)])
  const body = expandSnippets(blocks, snippets)
  const status = postStatus(row as { is_published?: boolean; published_at?: string })
  const byline = author ? (author.role ? `${author.name}, ${author.role}` : author.name) : meta.author_name.split(" - ")[0]

  return (
    <div className="min-h-screen bg-white text-neutral-900 [color-scheme:light]">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-neutral-900 px-4 py-2 text-[13px] text-white">
        <span>
          Preview of {hasDraft ? "unpublished changes" : status === "published" ? "the live post" : status === "scheduled" ? "a scheduled post" : "a draft"}. Not indexed, not listed.
        </span>
        {admin ? (
          <a href={`/admin/blog/posts/${postId}`} className="underline underline-offset-2">
            Back to the editor
          </a>
        ) : null}
      </div>
      <article className="mx-auto max-w-2xl px-5 pb-20 pt-10 sm:px-6 lg:max-w-[806px]">
        {meta.category ? <p className="mb-5 inline-block rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700">{meta.category}</p> : null}
        <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{meta.title || "Untitled"}</h1>
        <p className="mb-7 text-sm text-neutral-400">
          {byline ? `${byline} · ` : ""}
          {meta.read_time || readTimeFor(body)}
        </p>
        {meta.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meta.cover_image_url} alt={meta.cover_alt || meta.title} className="mb-8 w-full rounded-xl object-cover" />
        ) : null}
        <section>
          <PreviewBlocks blocks={body} />
        </section>
        {meta.tags.length ? (
          <p className="mt-10 flex flex-wrap gap-2">
            {meta.tags.map((t) => (
              <span key={t} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">
                {t}
              </span>
            ))}
          </p>
        ) : null}
      </article>
    </div>
  )
}

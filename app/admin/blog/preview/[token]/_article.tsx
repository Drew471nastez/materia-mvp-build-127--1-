import type { Block } from "@/lib/blog/blocks"
import { normalizeBlocks } from "@/lib/blog/article"
import { ArticleBlocks } from "@/app/(marketing)/blog/_components/article-blocks"

/**
 * A post's blocks drawn for the preview by the public article's own
 * renderer (app/(marketing)/blog/_components/article-blocks.tsx), so the
 * preview shows exactly what the post will: the same sanitising, anchors,
 * YouTube player, embeds and boxes. Snippets arrive already expanded.
 */
export function PreviewBlocks({ blocks, title = "" }: { blocks: Block[]; title?: string }) {
  return <ArticleBlocks blocks={normalizeBlocks(blocks)} postTitle={title} />
}

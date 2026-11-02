/** The blocks a creator's post is made of: storelib.com's blog blocks without snippets, plus gallery and button. */
import type { Block, BlockType } from "@/lib/blog/blocks"

export type { Block, BlockType }
export type SiteBlock = Block

export const SITE_BLOCK_TYPES: readonly BlockType[] = ["p", "h2", "h3", "hr", "img", "gallery", "youtube", "video", "embed", "table", "quote", "callout", "ul", "ol", "code", "cta", "button"]

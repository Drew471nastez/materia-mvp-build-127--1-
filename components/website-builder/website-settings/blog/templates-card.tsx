"use client"

/**
 * The blog's two pages in the builder: the listing (every post, featured
 * ones, category filters, pagination) and the post page, one design every
 * post is drawn in. Edit closes Settings and opens that template in the
 * builder, as Pages' Edit does. An imported theme's are its own Blog and
 * Article templates (the route says which keys: lib/site-blog/urls.ts
 * blogTemplateKeys).
 */
import { tt } from "@/lib/i18n/text"
import type { BlogTemplateKeys } from "@/lib/site-blog/types"
import { Card, Row, buttonClass } from "../parts"

export function TemplatesCard({ templates, onEditPage }: { templates: BlogTemplateKeys; onEditPage: (pageKey: string) => void }) {
  return (
    <Card title={tt("Templates")} footer={tt("Posts are written here; how they look is designed in the builder, once for every post.")}>
      <Row label={tt("Blog page")} hint={tt("The list of posts: its layout, featured posts, categories and pages.")} inline>
        <button type="button" onClick={() => onEditPage(templates.listing)} className={buttonClass} data-blog-template={templates.listing}>
          {tt("Edit")}
        </button>
      </Row>
      <Row label={tt("Post page")} hint={tt("One article layout for every post: the cover, the author, related posts.")} inline>
        <button type="button" onClick={() => onEditPage(templates.post)} className={buttonClass} data-blog-template={templates.post}>
          {tt("Edit")}
        </button>
      </Row>
    </Card>
  )
}

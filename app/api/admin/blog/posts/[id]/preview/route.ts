import { NextRequest } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { signPreviewToken } from "@/lib/blog/preview-token"
import { blogJson } from "@/lib/blog/admin-http"

/**
 * A preview link for a post's draft: /admin/blog/preview/<signed token>,
 * good for seven days (lib/blog/preview-token.ts). The page it opens is
 * noindex and is never in a sitemap.
 */
export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const { id } = await context.params
  const token = signPreviewToken(id)
  if (!token) return blogJson({ error: "Previews need BLOG_ADMIN_SECRET or the service role key in the environment." }, 503)
  return blogJson({ url: `/admin/blog/preview/${token}` })
}

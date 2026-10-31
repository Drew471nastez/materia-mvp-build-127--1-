/**
 * A Help Center path (/help/<category>/<slug>) as a link: the article's own
 * title and its public address (help.storelib.com). Null for a path that is
 * not an article, so a page never links a Help Center 404.
 */
import { helpArticle } from "@/lib/help/articles"
import { publicHelpUrl } from "@/lib/help/paths"

export function helpLink(path: string): { href: string; title: string } | null {
  const [, root, category, slug] = path.split("/")
  if (root !== "help" || !category || !slug) return null
  const a = helpArticle(category, slug)
  return a ? { href: publicHelpUrl(path.slice("/help".length)), title: a.title } : null
}

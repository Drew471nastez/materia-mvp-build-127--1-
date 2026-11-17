/*
  THE BLOG LISTS' TITLES, ONE COPY. The pages' metadata (../_blog-index.tsx,
  ../_blog-category.tsx) and the tab title a category switch writes in the
  browser (./blog-lists.tsx) read the same words, so a list reached by a
  pill and the same list loaded fresh carry the same title.
*/
export function blogIndexTitle(page: number): string {
  return page <= 1 ? "Storelib Blog: guides for selling digital products" : `Storelib Blog, page ${page}`
}

export function blogCategoryTitle(name: string, page: number): string {
  return page > 1 ? `${name}, page ${page} | Storelib Blog` : `${name} | Storelib Blog`
}

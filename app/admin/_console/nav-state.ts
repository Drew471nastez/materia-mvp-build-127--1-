import type { ViewId } from "@/lib/admin/types"

/**
 * Where the console is, as the address bar says it: `/admin?view=orders&
 * filter=failed&q=…&page=2`. The server reads the same parameters for the
 * first paint, so a link to a filtered list opens on that list.
 */
export type Route = { view: ViewId; q: string; filter: string; page: number; id: string }

export const VIEWS: ViewId[] = ["overview", "ops", "creators", "creator", "products", "orders", "payouts", "websites", "email", "audience", "people", "audit", "system"]

export function parseRoute(get: (k: string) => string | null | undefined): Route {
  const view = (get("view") ?? "overview") as ViewId
  const page = Number.parseInt(get("page") ?? "1", 10)
  return {
    view: VIEWS.includes(view) ? view : "overview",
    q: (get("q") ?? "").slice(0, 120),
    filter: (get("filter") ?? "").slice(0, 40),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    id: (get("id") ?? "").slice(0, 60),
  }
}

export function routeQuery(r: Route): string {
  const p = new URLSearchParams()
  if (r.view !== "overview") p.set("view", r.view)
  if (r.id) p.set("id", r.id)
  if (r.q) p.set("q", r.q)
  if (r.filter) p.set("filter", r.filter)
  if (r.page > 1) p.set("page", String(r.page))
  const s = p.toString()
  return s ? `?${s}` : ""
}

/** The parameters the data route takes for a view. */
export function apiQuery(r: Route): string {
  const p = new URLSearchParams()
  if (r.id) p.set("id", r.id)
  if (r.q) p.set("q", r.q)
  if (r.filter) p.set("filter", r.filter)
  if (r.page > 1) p.set("page", String(r.page))
  const s = p.toString()
  return s ? `?${s}` : ""
}

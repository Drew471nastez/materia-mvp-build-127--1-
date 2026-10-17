/** The managed page's views, in order: their own module, so the integration page can list its tabs without loading the views themselves. */
export const MANAGE_VIEWS = ["overview", "reviews", "requests", "widgets", "analytics", "settings"] as const
export type ManageView = (typeof MANAGE_VIEWS)[number]

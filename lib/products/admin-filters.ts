import { isArchivedProduct } from "./archive"

export type ProductListStatus = "published" | "draft" | "archived"
export type StockFilter = "available" | "sold-out"
export interface ProductFilterValue { statuses: ProductListStatus[]; stock: StockFilter[] }
export interface FilterableProduct {
  status: string
  archived?: boolean | null
  inventory_count?: number | null
  max_purchases?: number | null
  sales_count?: number | null
}

export function matchesProductFilters(product: FilterableProduct, filters: ProductFilterValue): boolean {
  const archived = isArchivedProduct(product)
  const status = archived ? "archived" : product.status === "published" ? "published" : "draft"
  // With no status chosen the working catalogue excludes archived products.
  if (filters.statuses.length ? !filters.statuses.includes(status) : archived) return false
  const stock = product.inventory_count
  const limit = product.max_purchases
  const soldOut = (typeof stock === "number" && stock <= 0) || (typeof limit === "number" && limit > 0 && (product.sales_count ?? 0) >= limit)
  return !filters.stock.length || filters.stock.includes(soldOut ? "sold-out" : "available")
}

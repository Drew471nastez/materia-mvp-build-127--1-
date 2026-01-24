import Link from "next/link"
import Image from "next/image"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, MoreHorizontal, Package } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { getProductUrl } from "@/lib/url-helpers"

export default async function ProductsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: creator } = await supabase.from("creators").select("id, slug").eq("user_id", user!.id).single()

  // Fetch creator's profile for username
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user!.id)
    .single()

  const creatorUsername = profile?.username || creator?.slug || ""

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("creator_id", creator!.id)
    .order("created_at", { ascending: false })

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa]">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">Products</h1>
            <p className="text-[14px] text-[#6b7280] mt-1">Manage your digital products</p>
          </div>
          <Button asChild className="w-full sm:w-auto min-h-[44px] bg-[#1a1a2e] hover:bg-[#2d2d44] text-white rounded-xl">
            <Link href="/app/products/new">
              <Plus className="mr-2 h-4 w-4" />
              New product
            </Link>
          </Button>
        </div>

        {products && products.length > 0 ? (
          <>
            {/* Mobile view */}
            <div className="grid gap-4 sm:hidden">
              {products.map((product) => (
                <div key={product.id} className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex gap-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f3f4f6]">
                      {product.thumbnail_url ? (
                        <Image
                          src={product.thumbnail_url || "/placeholder.svg"}
                          alt={product.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Package className="h-6 w-6 text-[#9ca3af]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link href={`/app/products/${product.id}`} className="text-[14px] font-medium text-[#1a1a2e] hover:text-[#8b5cf6] line-clamp-1 transition-colors">
                        {product.title}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium text-[#6b7280] bg-[#f3f4f6] px-2 py-0.5 rounded-full capitalize">
                          {product.type}
                        </span>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${
                          product.status === "published"
                            ? "text-emerald-700 bg-emerald-50"
                            : "text-[#6b7280] bg-[#f3f4f6]"
                        }`}>
                          {product.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold text-[#1a1a2e]">{formatPrice(product.price_cents)}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 rounded-lg hover:bg-[#f3f4f6]">
                          <MoreHorizontal className="h-4 w-4 text-[#9ca3af]" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/products/${product.id}`}>Edit</Link>
                        </DropdownMenuItem>
                        {product.status === "published" && (
                          <DropdownMenuItem asChild>
                            <a href={getProductUrl(creatorUsername, product.slug)} target="_blank" rel="noopener noreferrer">
                              View public page
                            </a>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop view */}
            <div className="hidden sm:block bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="table-scroll">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e5e7eb]">
                      <th className="px-5 py-4 text-left text-[13px] font-medium text-[#6b7280]">Product</th>
                      <th className="px-5 py-4 text-left text-[13px] font-medium text-[#6b7280]">Type</th>
                      <th className="px-5 py-4 text-left text-[13px] font-medium text-[#6b7280]">Price</th>
                      <th className="px-5 py-4 text-left text-[13px] font-medium text-[#6b7280]">Status</th>
                      <th className="px-5 py-4 text-right text-[13px] font-medium text-[#6b7280]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id} className="border-b border-[#e5e7eb]/60 last:border-0 hover:bg-[#f9fafb] transition-colors">
                        <td className="px-5 py-4">
                          <Link href={`/app/products/${product.id}`} className="text-[14px] font-medium text-[#1a1a2e] hover:text-[#8b5cf6] transition-colors">
                            {product.title}
                          </Link>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[12px] font-medium text-[#6b7280] bg-[#f3f4f6] px-2.5 py-1 rounded-full capitalize">
                            {product.type}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[14px] font-semibold text-[#1a1a2e]">{formatPrice(product.price_cents)}</td>
                        <td className="px-5 py-4">
                          <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full capitalize ${
                            product.status === "published"
                              ? "text-emerald-700 bg-emerald-50"
                              : "text-[#6b7280] bg-[#f3f4f6]"
                          }`}>
                            {product.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="rounded-lg hover:bg-[#f3f4f6]">
                                <MoreHorizontal className="h-4 w-4 text-[#9ca3af]" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl">
                              <DropdownMenuItem asChild>
                                <Link href={`/app/products/${product.id}`}>Edit</Link>
                              </DropdownMenuItem>
                              {product.status === "published" && (
                                <DropdownMenuItem asChild>
                                  <a href={getProductUrl(creatorUsername, product.slug)} target="_blank" rel="noopener noreferrer">
                                    View public page
                                  </a>
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-[#e5e7eb] p-8 sm:p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Package className="mx-auto h-12 w-12 text-[#d1d5db]" />
            <h3 className="mt-4 text-[15px] font-semibold text-[#1a1a2e]">No products yet</h3>
            <p className="mt-1 text-[13px] text-[#6b7280]">Create your first product to start selling.</p>
            <Button className="mt-4 min-h-[44px] bg-[#1a1a2e] hover:bg-[#2d2d44] text-white rounded-xl" asChild>
              <Link href="/app/products/new">
                <Plus className="mr-2 h-4 w-4" />
                Create product
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

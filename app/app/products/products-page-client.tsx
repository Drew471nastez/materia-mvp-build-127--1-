"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, MoreHorizontal, Package } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { getProductUrl } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"

interface Product {
  id: string
  title: string
  type: string
  price_cents: number
  status: string
  thumbnail_url: string | null
  slug: string
}

interface ProductsPageClientProps {
  products: Product[]
  creatorUsername: string
}

export function ProductsPageClient({ products, creatorUsername }: ProductsPageClientProps) {
  const [isScrolled, setIsScrolled] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const headerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY
      const threshold = 60 // Start fading at 60px scroll
      const fadeDistance = 40 // Complete fade over 40px

      // Calculate progress (0 to 1) for smooth transition
      const progress = Math.min(Math.max((scrollY - threshold) / fadeDistance, 0), 1)
      setScrollProgress(progress)
      setIsScrolled(scrollY > threshold + fadeDistance)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll() // Check initial state

    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  return (
    <div className="relative">
      {/* Fixed/Sticky header that appears on scroll */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-30 bg-[#f8f9fa]/95 backdrop-blur-md border-b border-neutral-200/50 transition-all duration-300 ease-out md:left-[220px]",
          scrollProgress > 0.5
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        )}
        style={{
          opacity: scrollProgress,
          transform: `translateY(${(1 - scrollProgress) * -8}px)`,
        }}
      >
        <div className="px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-neutral-900">Products</h2>
              {products.length > 0 && (
                <Badge variant="secondary" className="text-xs font-medium">
                  {products.length}
                </Badge>
              )}
            </div>
            <Button asChild size="sm" className="h-9 gap-1.5">
              <Link href="/app/products/new">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New product</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Main content with smooth header transition */}
      <div className="px-4 sm:px-6 py-6 space-y-6">
        {/* Original header that fades out on scroll */}
        <div
          ref={headerRef}
          className="transition-all duration-300 ease-out"
          style={{
            opacity: 1 - scrollProgress,
            transform: `translateY(${scrollProgress * -10}px)`,
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
              <p className="text-muted-foreground">Manage your digital products</p>
            </div>
            <Button asChild className="w-full sm:w-auto min-h-[44px]">
              <Link href="/app/products/new">
                <Plus className="mr-2 h-4 w-4" />
                New product
              </Link>
            </Button>
          </div>
        </div>

        {/* Product list */}
        {products && products.length > 0 ? (
          <>
            <div className="grid gap-4 sm:hidden">
              {products.map((product) => (
                <Card key={product.id}>
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {product.thumbnail_url ? (
                          <Image
                            src={product.thumbnail_url || "/placeholder.svg"}
                            alt={product.title}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package className="h-6 w-6 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link href={`/app/products/${product.id}`} className="font-medium hover:underline line-clamp-1">
                          {product.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="capitalize text-xs">
                            {product.type}
                          </Badge>
                          <Badge
                            variant={product.status === "published" ? "default" : "outline"}
                            className="capitalize text-xs"
                          >
                            {product.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{formatPrice(product.price_cents)}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="hidden sm:block rounded-lg border border-border">
              <div className="table-scroll">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Product</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Type</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Price</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <Link href={`/app/products/${product.id}`} className="font-medium hover:underline">
                            {product.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="capitalize">
                            {product.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatPrice(product.price_cents)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={product.status === "published" ? "default" : "outline"} className="capitalize">
                            {product.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
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
          <div className="rounded-lg border border-dashed border-border p-8 sm:p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-medium">No products yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Create your first product to start selling.</p>
            <Button className="mt-4 min-h-[44px]" asChild>
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

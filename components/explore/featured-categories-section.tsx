"use client"

import { useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, type LucideIcon } from "lucide-react"
import { CATEGORIES, normalizeCategoryToId } from "@/lib/marketplace/categories"
import { useLocale } from "@/components/locale-provider"

// Fallback gradients, used only until a category has a listing with a photo
const CATEGORY_GRADIENTS: Record<string, string> = {
  "womenswear": "from-pink-500 via-rose-500 to-red-500",
  "menswear": "from-blue-500 via-indigo-500 to-slate-600",
  "sneakers": "from-orange-500 via-amber-500 to-yellow-500",
  "bags-accessories": "from-amber-600 via-orange-700 to-stone-700",
  "jewellery": "from-yellow-400 via-amber-500 to-orange-500",
  "beauty": "from-fuchsia-500 via-pink-500 to-rose-400",
  "books": "from-emerald-500 via-green-600 to-teal-600",
  "home": "from-stone-500 via-neutral-500 to-zinc-600",
  "vintage": "from-violet-500 via-purple-500 to-fuchsia-500",
}

// The layout below is fixed at 3 big + 6 small tiles, which is exactly the
// taxonomy minus "All" — keep those two in step if a category is ever added.
const CATEGORIES_CONFIG: Array<{
  id: string
  name: string
  slug: string
  gradient: string
  icon: LucideIcon
}> = CATEGORIES.filter((category) => category.id !== "all").map((category) => ({
  id: category.id,
  name: category.label,
  slug: category.id,
  gradient: CATEGORY_GRADIENTS[category.id] || "from-neutral-500 via-stone-500 to-zinc-500",
  icon: category.icon,
}))

interface FeaturedCategoriesSectionProps {
  products?: any[]
}

export function FeaturedCategoriesSection({ products = [] }: FeaturedCategoriesSectionProps) {
  const { t } = useLocale()
  // Get cover images from top products in each category
  const categoriesWithImages = useMemo(() => {
    return CATEGORIES_CONFIG.map(category => {
      // Find top product in this category with a thumbnail
      // Normalized equality only — substring matching would let "bags-accessories"
      // pick up a cover photo from any listing whose category merely contains it.
      const categoryProducts = products.filter(p => {
        return normalizeCategoryToId(p.category || p.categoryName) === category.id
      })

      const topProduct = categoryProducts.find(p => p.thumbnail_url)

      return {
        ...category,
        coverImage: topProduct?.thumbnail_url || null,
        Icon: category.icon,
      }
    })
  }, [products])

  // Split categories into big (first 3) and small (next 6)
  const bigCategories = categoriesWithImages.slice(0, 3)
  const smallCategories = categoriesWithImages.slice(3, 9)

  return (
    <section className="mt-6 md:mt-10 pt-[26px] pb-[6px] border-t border-neutral-100">
      {/* Main grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8">
        {/* Left side - Headline and CTA */}
        <div className="lg:col-span-3 flex flex-col justify-center mb-2 lg:mb-0">
          <div className="flex items-start justify-between gap-3 lg:block">
            <h2 className="text-lg sm:text-2xl lg:text-4xl font-bold text-neutral-900 leading-tight mb-2 lg:mb-6">
              {t("marketplace.shop_preloved")}
            </h2>
            {/* Mobile navigation arrows - inline with heading */}
            <div className="flex items-center gap-2 lg:hidden flex-shrink-0 mt-0.5">
              <button
                type="button"
                className="w-9 h-9 rounded-full bg-neutral-900 hover:bg-neutral-700 flex items-center justify-center transition-colors cursor-pointer active:scale-95 shadow-sm"
                aria-label={t("marketplace.previous")}
                onClick={() => {
                  const container = document.getElementById('mobile-categories-scroll')
                  if (container) container.scrollBy({ left: -container.clientWidth * 0.7, behavior: 'smooth' })
                }}
              >
                <ArrowRight className="w-4 h-4 text-white rotate-180" />
              </button>
              <button
                type="button"
                className="w-9 h-9 rounded-full bg-neutral-900 hover:bg-neutral-700 flex items-center justify-center transition-colors cursor-pointer active:scale-95 shadow-sm"
                aria-label={t("marketplace.next")}
                onClick={() => {
                  const container = document.getElementById('mobile-categories-scroll')
                  if (container) container.scrollBy({ left: container.clientWidth * 0.7, behavior: 'smooth' })
                }}
              >
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
          <Link
            href="/explore"
            className="hidden lg:inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-full hover:bg-neutral-800 transition-colors w-fit"
          >
            {t("marketplace.browse_categories")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Right side - Big category cards (swipeable on mobile) */}
        <div className="lg:col-span-9">
          {/* Mobile: First 3 categories in swipeable row with 4:3 ratio */}
          <div className="md:hidden relative">
            {/* Swipeable container with touch support */}
            <div
              id="mobile-categories-scroll"
              className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4 snap-x snap-mandatory touch-manipulation"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {bigCategories.map((category) => (
                <div key={category.id} className="flex-shrink-0 w-[70%] snap-center">
                  <Link
                    href={`/explore?category=${category.slug}&scroll=recommended`}
                    className="group relative overflow-hidden rounded-2xl aspect-[4/3] bg-neutral-100 block transition-all duration-300 ease-out [@media(hover:hover)]:hover:shadow-lg"
                  >
                    {category.coverImage ? (
                      <Image
                        src={category.coverImage}
                        alt={category.name}
                        fill
                        sizes="70vw"
                        className="object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105"
                      />
                    ) : (
                      <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient}`} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    {/* Centered Icon */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center w-14 h-14">
                        <category.Icon className="text-white/90 w-7 h-7" />
                      </div>
                    </div>
                    {/* Category name */}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <span className="inline-block px-3 py-1 rounded-full bg-white/90 backdrop-blur-sm font-medium text-neutral-900 text-sm">
                        {category.name}
                      </span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Desktop: Grid layout */}
          <div className="hidden md:grid grid-cols-3 gap-4">
            {bigCategories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                size="large"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row - Small category cards (2 per row on mobile) */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {smallCategories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            size="small"
          />
        ))}
      </div>
    </section>
  )
}

// Individual category card component
interface CategoryCardProps {
  category: {
    id: string
    name: string
    slug: string
    gradient: string
    coverImage: string | null
    Icon: LucideIcon
  }
  size: "large" | "small"
}

function CategoryCard({ category, size }: CategoryCardProps) {
  const isLarge = size === "large"
  const Icon = category.Icon

  return (
    <Link
      href={`/explore?category=${category.slug}&scroll=recommended`}
      className={`
        group relative overflow-hidden rounded-2xl ${isLarge ? "rounded-3xl" : "rounded-2xl"}
        ${isLarge ? "aspect-[4/5] sm:aspect-[3/4]" : "aspect-[4/3]"}
        bg-neutral-100
        transition-all duration-300 ease-out
        [@media(hover:hover)]:hover:-translate-y-1 [@media(hover:hover)]:hover:shadow-xl
      `}
    >
      {/* Background image or gradient */}
      {category.coverImage ? (
        <Image
          src={category.coverImage}
          alt={category.name}
          fill
          sizes={isLarge ? "(max-width: 640px) 100vw, 33vw" : "(max-width: 640px) 50vw, 16vw"}
          className="object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient}`} />
      )}

      {/* Dark overlay for text readability - subtle fade at bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Centered Icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`
          rounded-full bg-white/20 backdrop-blur-sm
          flex items-center justify-center
          ${isLarge ? "w-16 h-16" : "w-12 h-12"}
        `}>
          <Icon className={`text-white/90 ${isLarge ? "w-8 h-8" : "w-6 h-6"}`} />
        </div>
      </div>

      {/* Arrow button - top right */}
      <div className={`
        absolute top-3 right-3 w-8 h-8 rounded-full
        bg-white/80 backdrop-blur-sm
        flex items-center justify-center
        opacity-0 group-hover:opacity-100
        transition-opacity duration-200
        ${isLarge ? "w-9 h-9" : "w-7 h-7"}
      `}>
        <ArrowRight className={`text-neutral-900 ${isLarge ? "w-4 h-4" : "w-3.5 h-3.5"}`} />
      </div>

      {/* Category name - bottom left */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <span className={`
          inline-block px-3 py-1 rounded-full
          bg-white/90 backdrop-blur-sm
          font-medium text-neutral-900
          ${isLarge ? "text-sm" : "text-xs"}
        `}>
          {category.name}
        </span>
      </div>
    </Link>
  )
}

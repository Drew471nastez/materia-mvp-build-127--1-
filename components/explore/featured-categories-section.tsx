"use client"

import { useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Sparkles, Code, Megaphone, Briefcase, GraduationCap, PenTool, Music, Video, MoreHorizontal, type LucideIcon } from "lucide-react"

// Category configuration with gradients and icons for fallback images
const CATEGORIES_CONFIG: Array<{
  id: string
  name: string
  slug: string
  gradient: string
  icon: LucideIcon
}> = [
  {
    id: "design",
    name: "Design",
    slug: "design",
    gradient: "from-pink-500 via-rose-500 to-red-500",
    icon: Sparkles,
  },
  {
    id: "development",
    name: "Development",
    slug: "development",
    gradient: "from-blue-500 via-indigo-500 to-purple-500",
    icon: Code,
  },
  {
    id: "marketing",
    name: "Marketing",
    slug: "marketing",
    gradient: "from-orange-500 via-amber-500 to-yellow-500",
    icon: Megaphone,
  },
  {
    id: "business",
    name: "Business & Money",
    slug: "business",
    gradient: "from-emerald-500 via-green-500 to-teal-500",
    icon: Briefcase,
  },
  {
    id: "education",
    name: "Education",
    slug: "education",
    gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    icon: GraduationCap,
  },
  {
    id: "writing",
    name: "Writing & Publishing",
    slug: "writing",
    gradient: "from-slate-500 via-gray-500 to-zinc-600",
    icon: PenTool,
  },
  {
    id: "music",
    name: "Music & Sound Design",
    slug: "music",
    gradient: "from-cyan-500 via-sky-500 to-blue-500",
    icon: Music,
  },
  {
    id: "films",
    name: "Films",
    slug: "films",
    gradient: "from-red-500 via-rose-600 to-pink-600",
    icon: Video,
  },
  {
    id: "other",
    name: "Other",
    slug: "other",
    gradient: "from-neutral-500 via-stone-500 to-zinc-500",
    icon: MoreHorizontal,
  },
]

interface FeaturedCategoriesSectionProps {
  products?: any[]
}

export function FeaturedCategoriesSection({ products = [] }: FeaturedCategoriesSectionProps) {
  // Get cover images from top products in each category
  const categoriesWithImages = useMemo(() => {
    return CATEGORIES_CONFIG.map(category => {
      // Find top product in this category with a thumbnail
      const categoryProducts = products.filter(p => {
        const productCategory = (p.category || p.categoryName || "").toLowerCase()
        return productCategory === category.slug || productCategory.includes(category.slug)
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
    <section className="mt-8 md:mt-16 pt-6 md:pt-8 border-t border-neutral-100">
      {/* Main grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8">
        {/* Left side - Headline and CTA */}
        <div className="lg:col-span-3 flex flex-col justify-center mb-4 lg:mb-0">
          <h2 className="text-xl sm:text-2xl lg:text-4xl font-bold text-neutral-900 leading-tight mb-4 lg:mb-6">
            Explore categories you can build with
          </h2>
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-full hover:bg-neutral-800 transition-colors w-fit"
          >
            Browse categories
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Right side - Big category cards (swipeable on mobile) */}
        <div className="lg:col-span-9">
          {/* Mobile: First 3 categories in swipeable row with 4:3 ratio */}
          <div className="md:hidden relative">
            {/* Navigation arrows - right aligned */}
            <div className="flex items-center justify-end gap-2 mb-3">
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                aria-label="Previous"
                onClick={() => {
                  const container = document.getElementById('mobile-categories-scroll')
                  if (container) container.scrollBy({ left: -container.clientWidth * 0.7, behavior: 'smooth' })
                }}
              >
                <ArrowRight className="w-4 h-4 text-neutral-700 rotate-180" />
              </button>
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                aria-label="Next"
                onClick={() => {
                  const container = document.getElementById('mobile-categories-scroll')
                  if (container) container.scrollBy({ left: container.clientWidth * 0.7, behavior: 'smooth' })
                }}
              >
                <ArrowRight className="w-4 h-4 text-neutral-700" />
              </button>
            </div>
            {/* Swipeable container with touch support */}
            <div
              id="mobile-categories-scroll"
              className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4 snap-x snap-mandatory touch-pan-x"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {bigCategories.map((category) => (
                <div key={category.id} className="flex-shrink-0 w-[70%] snap-center">
                  <Link
                    href={`/explore?category=${category.slug}`}
                    className="group relative overflow-hidden rounded-2xl aspect-[4/3] bg-neutral-100 block transition-all duration-300 ease-out hover:shadow-lg"
                  >
                    {category.coverImage ? (
                      <Image
                        src={category.coverImage}
                        alt={category.name}
                        fill
                        sizes="70vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
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
      href={`/explore?category=${category.slug}`}
      className={`
        group relative overflow-hidden rounded-2xl ${isLarge ? "rounded-3xl" : "rounded-2xl"}
        ${isLarge ? "aspect-[4/5] sm:aspect-[3/4]" : "aspect-[4/3]"}
        bg-neutral-100
        transition-all duration-300 ease-out
        hover:-translate-y-1 hover:shadow-xl
      `}
    >
      {/* Background image or gradient */}
      {category.coverImage ? (
        <Image
          src={category.coverImage}
          alt={category.name}
          fill
          sizes={isLarge ? "(max-width: 640px) 100vw, 33vw" : "(max-width: 640px) 50vw, 16vw"}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
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

import { CategoryLoading } from "@/components/explore/category-skeleton"

/**
 * The category page itself, with the products still to come.
 *
 * Same ground, same container and the same parts as page.tsx
 * (components/explore/category-skeleton), so nothing moves when the products
 * arrive. The heading, the pills and Filters paint at once; only the cards
 * are placeholders, and they stay invisible for the first 200ms.
 */
export default function CategoryLoadingPage() {
  return (
    <div className="explore-ground min-h-screen bg-[#f8f9fa]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8">
        <CategoryLoading />
      </div>
    </div>
  )
}

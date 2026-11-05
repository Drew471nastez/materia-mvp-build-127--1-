import { ProductDetailSkeleton } from "@/components/library/library-skeletons"

/** One purchase while it loads, in the shape it draws (components/library/library-product.tsx). */
export default function ProductLoading() {
  return (
    <div data-library-skeleton="" className="skeleton-deferred">
      <ProductDetailSkeleton />
    </div>
  )
}

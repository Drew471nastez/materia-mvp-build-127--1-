import { Skeleton } from "@/components/ui/skeleton"

export default function StorefrontLoading() {
  // Use neutral colors that work with all themes
  // The actual page will load with theme-specific colors
  return (
    <div className="min-h-screen bg-background">
      {/* Subscribe Bar Skeleton */}
      <div className="py-3 px-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 border-b border-border bg-background">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-32 sm:w-48" />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Skeleton className="h-10 flex-1 sm:w-48 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>

      {/* Cover Image Skeleton */}
      <Skeleton className="h-48 sm:h-64 w-full" />

      {/* Header Section */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <div className="flex flex-col items-center text-center">
          {/* Avatar overlapping cover */}
          <Skeleton className="h-20 w-20 sm:h-24 sm:w-24 rounded-full -mt-12 border-4 border-background" />

          {/* Display name */}
          <Skeleton className="mt-4 h-7 sm:h-8 w-40 sm:w-48" />

          {/* Headline */}
          <Skeleton className="mt-2 h-4 sm:h-5 w-56 sm:w-64" />

          {/* Tags */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Skeleton className="h-6 w-16 sm:w-20 rounded-full" />
            <Skeleton className="h-6 w-20 sm:w-24 rounded-full" />
            <Skeleton className="h-6 w-16 sm:w-20 rounded-full" />
          </div>

          {/* Bio */}
          <div className="mt-6 w-full max-w-xl space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5 mx-auto" />
          </div>

          {/* Stats */}
          <div className="mt-6 flex gap-6 sm:gap-8">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 sm:h-5 sm:w-5" />
              <Skeleton className="h-4 w-20 sm:w-24" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 sm:h-5 sm:w-5" />
              <Skeleton className="h-4 w-16 sm:w-20" />
            </div>
          </div>
        </div>
      </div>

      {/* Featured Products Section */}
      <div className="py-10 sm:py-12 px-4 bg-background">
        <div className="max-w-6xl mx-auto">
          {/* Section title and description */}
          <div className="mb-6 sm:mb-8">
            <Skeleton className="h-7 sm:h-8 w-40 sm:w-48 mb-3" />
            <Skeleton className="h-4 w-56 sm:w-64" />
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8">
            <Skeleton className="h-8 w-14 sm:w-16 rounded-full" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-16 sm:w-20 rounded-full" />
            ))}
          </div>

          {/* Products Grid */}
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-border overflow-hidden bg-card"
              >
                <Skeleton className="aspect-video w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-20 mt-3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* About Section Skeleton */}
      <div className="py-10 sm:py-12 px-4 bg-background">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col items-center text-center">
            {/* Section title */}
            <Skeleton className="h-7 sm:h-8 w-24 sm:w-32 mb-6" />

            {/* Avatar */}
            <Skeleton className="h-16 w-16 sm:h-20 sm:w-20 rounded-full mb-4" />

            {/* Creator name */}
            <Skeleton className="h-6 w-36 sm:w-48 mb-2" />

            {/* Headline */}
            <Skeleton className="h-4 w-48 sm:w-64 mb-4" />

            {/* Bio */}
            <div className="w-full max-w-md space-y-2 mb-6">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5 mx-auto" />
            </div>

            {/* Stats */}
            <div className="flex gap-6 sm:gap-8">
              <div className="text-center">
                <Skeleton className="h-6 w-8 mx-auto mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="text-center">
                <Skeleton className="h-6 w-12 mx-auto mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="text-center">
                <Skeleton className="h-6 w-16 mx-auto mb-1" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Skeleton */}
      <div className="py-6 sm:py-8 px-4 border-t border-border bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Skeleton className="h-4 w-32 sm:w-40" />
            <Skeleton className="h-4 w-4 hidden sm:block" />
            <Skeleton className="h-4 w-20 sm:w-24" />
          </div>
        </div>
      </div>
    </div>
  )
}

import { Skeleton } from "@/components/ui/skeleton"

export default function StorefrontLoading() {
  // Uses CSS custom properties set by the route-specific layout
  // This allows the skeleton to adapt to the creator's theme preset
  return (
    <div
      className="min-h-screen skeleton-deferred"
      style={{ backgroundColor: "var(--skeleton-bg, #ffffff)" }}
    >
      {/* Subscribe Bar Skeleton */}
      <div
        className="py-3 px-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 border-b"
        style={{
          backgroundColor: "var(--skeleton-card-bg, #ffffff)",
          borderColor: "var(--skeleton-border, #e5e7eb)"
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-full animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
            style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
          />
          <div
            className="h-4 w-32 sm:w-48 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
            style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div
            className="h-10 flex-1 sm:w-48 rounded-lg animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
            style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
          />
          <div
            className="h-10 w-24 rounded-lg animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
            style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
          />
        </div>
      </div>

      {/* Cover Image Skeleton */}
      <div
        className="h-48 sm:h-64 w-full animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
        style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
      />

      {/* Header Section */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <div className="flex flex-col items-center text-center">
          {/* Avatar overlapping cover */}
          <div
            className="h-20 w-20 sm:h-24 sm:w-24 rounded-full -mt-12 border-4 animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
            style={{
              backgroundColor: "var(--skeleton-color, #e5e7eb)",
              borderColor: "var(--skeleton-bg, #ffffff)"
            }}
          />

          {/* Display name */}
          <div
            className="mt-4 h-7 sm:h-8 w-40 sm:w-48 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
            style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
          />

          {/* Headline */}
          <div
            className="mt-2 h-4 sm:h-5 w-56 sm:w-64 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
            style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
          />

          {/* Tags */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <div
              className="h-6 w-16 sm:w-20 rounded-full animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
            <div
              className="h-6 w-20 sm:w-24 rounded-full animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
            <div
              className="h-6 w-16 sm:w-20 rounded-full animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
          </div>

          {/* Bio */}
          <div className="mt-6 w-full max-w-xl space-y-2">
            <div
              className="h-4 w-full rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
            <div
              className="h-4 w-4/5 mx-auto rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
          </div>

          {/* Stats */}
          <div className="mt-6 flex gap-6 sm:gap-8">
            <div className="flex items-center gap-2">
              <div
                className="h-4 w-4 sm:h-5 sm:w-5 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
              <div
                className="h-4 w-20 sm:w-24 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-4 w-4 sm:h-5 sm:w-5 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
              <div
                className="h-4 w-16 sm:w-20 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Featured Products Section */}
      <div
        className="py-10 sm:py-12 px-4"
        style={{ backgroundColor: "var(--skeleton-bg, #ffffff)" }}
      >
        <div className="max-w-6xl mx-auto">
          {/* Section title and description */}
          <div className="mb-6 sm:mb-8">
            <div
              className="h-7 sm:h-8 w-40 sm:w-48 mb-3 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
            <div
              className="h-4 w-56 sm:w-64 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8">
            <div
              className="h-8 w-14 sm:w-16 rounded-full animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-8 w-16 sm:w-20 rounded-full animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
            ))}
          </div>

          {/* Products Grid */}
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="rounded-lg border overflow-hidden"
                style={{
                  backgroundColor: "var(--skeleton-card-bg, #ffffff)",
                  borderColor: "var(--skeleton-border, #e5e7eb)"
                }}
              >
                <div
                  className="aspect-video w-full animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                <div className="p-4 space-y-2">
                  <div
                    className="h-5 w-3/4 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                    style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                  />
                  <div
                    className="h-4 w-1/2 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                    style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                  />
                  <div
                    className="h-6 w-20 mt-3 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                    style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* About Section Skeleton */}
      <div
        className="py-10 sm:py-12 px-4"
        style={{ backgroundColor: "var(--skeleton-bg, #ffffff)" }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col items-center text-center">
            {/* Section title */}
            <div
              className="h-7 sm:h-8 w-24 sm:w-32 mb-6 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />

            {/* Avatar */}
            <div
              className="h-16 w-16 sm:h-20 sm:w-20 rounded-full mb-4 animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />

            {/* Creator name */}
            <div
              className="h-6 w-36 sm:w-48 mb-2 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />

            {/* Headline */}
            <div
              className="h-4 w-48 sm:w-64 mb-4 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />

            {/* Bio */}
            <div className="w-full max-w-md space-y-2 mb-6">
              <div
                className="h-4 w-full rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
              <div
                className="h-4 w-4/5 mx-auto rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
            </div>

            {/* Stats */}
            <div className="flex gap-6 sm:gap-8">
              <div className="text-center">
                <div
                  className="h-6 w-8 mx-auto mb-1 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                <div
                  className="h-3 w-16 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
              </div>
              <div className="text-center">
                <div
                  className="h-6 w-12 mx-auto mb-1 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                <div
                  className="h-3 w-16 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
              </div>
              <div className="text-center">
                <div
                  className="h-6 w-16 mx-auto mb-1 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                <div
                  className="h-3 w-20 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Skeleton */}
      <div
        className="py-6 sm:py-8 px-4 border-t"
        style={{
          backgroundColor: "var(--skeleton-bg, #ffffff)",
          borderColor: "var(--skeleton-border, #e5e7eb)"
        }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <div
              className="h-4 w-32 sm:w-40 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
            <div
              className="h-4 w-4 hidden sm:block rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
            <div
              className="h-4 w-20 sm:w-24 rounded animate-[pulse_2.5s_ease-in-out_infinite] opacity-60"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

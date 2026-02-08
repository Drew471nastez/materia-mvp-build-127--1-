import { Skeleton } from "@/components/ui/skeleton"

export default function ProductLoading() {
  // Uses CSS custom properties set by the route-specific layout
  // This allows the skeleton to adapt to the creator's theme preset
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--skeleton-bg, #ffffff)" }}
    >
      {/* Main Content */}
      <div className="mx-auto max-w-[1200px] px-3 sm:px-4 lg:px-6 py-6 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-5 lg:gap-12 lg:items-start">
          {/* Left: Gallery (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <div
              className="aspect-video w-full rounded-xl animate-pulse"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 w-16 rounded-lg animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
              ))}
            </div>

            {/* Title and creator */}
            <div className="mt-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div
                  className="h-8 w-3/4 rounded animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                <div
                  className="h-6 w-20 rounded-full animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
              </div>

              {/* Desktop: Creator info */}
              <div className="hidden lg:flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-full animate-pulse"
                    style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                  />
                  <div
                    className="h-5 w-32 rounded animate-pulse"
                    style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                  />
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="h-4 w-4 rounded animate-pulse"
                        style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                      />
                    ))}
                  </div>
                </div>
                <div
                  className="h-8 w-8 rounded animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
              </div>
            </div>

            {/* Mobile: Price Card */}
            <div className="mt-6 lg:hidden">
              <div
                className="rounded-xl border p-4 sm:p-6 shadow-sm space-y-4"
                style={{
                  backgroundColor: "var(--skeleton-card-bg, #ffffff)",
                  borderColor: "var(--skeleton-border, #e5e7eb)"
                }}
              >
                <div
                  className="h-8 w-24 rounded animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                <div
                  className="h-12 w-full rounded-lg animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                <div
                  className="h-10 w-full rounded-lg animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                <div
                  className="pt-4 border-t space-y-3"
                  style={{ borderColor: "var(--skeleton-border, #e5e7eb)" }}
                >
                  <div
                    className="h-5 w-32 rounded animate-pulse"
                    style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                  />
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded animate-pulse"
                        style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                      />
                      <div
                        className="h-4 w-32 rounded animate-pulse"
                        style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile: Creator info */}
              <div
                className="mt-4 p-3 rounded-lg border flex items-center justify-between"
                style={{
                  backgroundColor: "var(--skeleton-card-bg, #ffffff)",
                  borderColor: "var(--skeleton-border, #e5e7eb)"
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-8 w-8 rounded-full animate-pulse"
                    style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                  />
                  <div
                    className="h-4 w-24 rounded animate-pulse"
                    style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                  />
                </div>
                <div
                  className="h-8 w-8 rounded animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
              </div>
            </div>

            {/* Description */}
            <div className="mt-6 space-y-2">
              <div
                className="h-6 w-32 mb-3 rounded animate-pulse"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
              <div
                className="h-4 w-full rounded animate-pulse"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
              <div
                className="h-4 w-full rounded animate-pulse"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
              <div
                className="h-4 w-3/4 rounded animate-pulse"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
            </div>

            {/* FAQ */}
            <div className="mt-8 space-y-3">
              <div
                className="h-6 w-64 mb-4 rounded animate-pulse"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
              <div className="px-2 sm:px-0 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 w-full rounded animate-pulse"
                    style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: Price Card (2 cols) - Desktop only */}
          <div className="hidden lg:block lg:col-span-2">
            <div
              className="sticky top-6 rounded-xl border p-6 shadow-sm space-y-4"
              style={{
                backgroundColor: "var(--skeleton-card-bg, #ffffff)",
                borderColor: "var(--skeleton-border, #e5e7eb)"
              }}
            >
              <div
                className="h-10 w-28 rounded animate-pulse"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
              <div
                className="h-12 w-full rounded-lg animate-pulse"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
              <div
                className="h-10 w-full rounded-lg animate-pulse"
                style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
              />
              <div
                className="pt-4 border-t space-y-3"
                style={{ borderColor: "var(--skeleton-border, #e5e7eb)" }}
              >
                <div
                  className="h-5 w-32 rounded animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="h-4 w-4 rounded animate-pulse"
                      style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                    />
                    <div
                      className="h-4 w-36 rounded animate-pulse"
                      style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* More From Seller Section */}
      <div
        className="py-12 px-4"
        style={{ backgroundColor: "var(--skeleton-bg, #ffffff)" }}
      >
        <div className="max-w-6xl mx-auto">
          <div
            className="h-7 w-48 mb-8 rounded animate-pulse"
            style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-3">
                <div
                  className="aspect-video w-full rounded-lg animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                <div
                  className="h-4 w-3/4 rounded animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                <div
                  className="h-5 w-16 rounded animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div
        className="py-12 px-4"
        style={{ backgroundColor: "var(--skeleton-bg, #ffffff)" }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div
              className="h-7 w-32 rounded animate-pulse"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-5 w-5 rounded animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
              ))}
            </div>
            <div
              className="h-5 w-24 rounded animate-pulse"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="rounded-lg border p-4 space-y-3"
                style={{
                  backgroundColor: "var(--skeleton-card-bg, #ffffff)",
                  borderColor: "var(--skeleton-border, #e5e7eb)"
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-full animate-pulse"
                    style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                  />
                  <div>
                    <div
                      className="h-4 w-24 mb-1 rounded animate-pulse"
                      style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                    />
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((j) => (
                        <div
                          key={j}
                          className="h-3 w-3 rounded animate-pulse"
                          style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div
                  className="h-4 w-full rounded animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
                <div
                  className="h-4 w-3/4 rounded animate-pulse"
                  style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="py-8 px-4 border-t"
        style={{
          backgroundColor: "var(--skeleton-bg, #ffffff)",
          borderColor: "var(--skeleton-border, #e5e7eb)"
        }}
      >
        <div className="max-w-6xl mx-auto flex justify-center">
          <div
            className="h-4 w-48 rounded animate-pulse"
            style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
          />
        </div>
      </div>
    </div>
  )
}

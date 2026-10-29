export default function BlogPostLoading() {
  return (
    <div className="min-h-screen bg-white animate-pulse skeleton-deferred">
      <div className="h-64 bg-gray-200" />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 -mt-8">
        <div className="h-8 w-36 bg-gray-200 rounded mb-5" />
        <div className="h-12 w-full bg-gray-200 rounded mb-4" />
        <div className="h-5 w-60 bg-gray-200 rounded mb-10" />
        <div className="space-y-4 pb-16">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-5 w-full bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}

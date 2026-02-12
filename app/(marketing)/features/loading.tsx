export default function FeaturesLoading() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 animate-pulse">
        <div className="h-10 w-72 bg-gray-200 rounded-xl mx-auto mb-4" />
        <div className="h-5 w-96 max-w-full bg-gray-200 rounded mx-auto mb-12" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-2xl border border-gray-200" />
          ))}
        </div>
      </div>
    </div>
  )
}

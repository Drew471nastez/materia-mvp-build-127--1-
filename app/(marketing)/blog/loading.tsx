export default function BlogLoading() {
  return (
    <div className="min-h-screen bg-neutral-50 animate-pulse skeleton-deferred">
      <div className="h-72 bg-white border-b border-neutral-100" />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="h-96 bg-white border border-neutral-200 rounded-2xl mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="h-80 bg-white border border-neutral-200 rounded-xl" />
          <div className="h-80 bg-white border border-neutral-200 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

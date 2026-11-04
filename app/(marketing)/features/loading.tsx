/* Only seen on a slow first load: the page is held for an hour. The shape of its header and first table. */
export default function FeaturesLoading() {
  return (
    <div className="min-h-screen bg-white skeleton-deferred">
      <div className="mx-auto max-w-[1200px] animate-pulse px-4 pt-12 sm:px-6 lg:px-8">
        <div className="h-10 w-80 max-w-full rounded-xl bg-gray-200" />
        <div className="mt-5 h-5 w-[640px] max-w-full rounded bg-gray-200" />
        <div className="mt-2 h-5 w-[520px] max-w-full rounded bg-gray-200" />
        <div className="mt-12 h-[320px] rounded-2xl border border-gray-200 bg-gray-100" />
      </div>
    </div>
  )
}

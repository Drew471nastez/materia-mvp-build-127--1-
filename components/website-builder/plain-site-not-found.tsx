import Link from "next/link"

/** A page that is not there, on somebody's own website, when their own 404 page cannot be drawn. */
export function PlainSiteNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3.5 px-6 py-24 text-center">
      <h1 className="text-[26px] font-semibold tracking-tight text-[#1a1a2e] sm:text-[30px]">That page is not here</h1>
      <p className="max-w-sm text-[15px] leading-relaxed text-[#6b7280]">
        The link may be old, or the page may have moved.
      </p>
      {/* `/` is the front page of whatever address the visitor is already at. */}
      <Link
        href="/"
        className="mt-3 inline-flex h-11 items-center rounded-xl bg-[#1a1a2e] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#2d2d4e]"
      >
        Back to the home page
      </Link>
    </main>
  )
}

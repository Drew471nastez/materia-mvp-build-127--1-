/**
 * The account page's shape while its data comes: the heading at once, the
 * cards as quiet blocks. `skeleton-deferred`, so a quick load never shows a
 * grey block at all.
 */
export default function AccountLoading() {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-10 pt-6 sm:px-6 sm:pt-10" aria-busy="true">
      <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Account</h1>
      <div className="skeleton-deferred mt-[52px] space-y-4 sm:space-y-5">
        {[148, 172, 104, 104].map((h, i) => (
          <div key={i} className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm" style={{ height: h }} />
        ))}
      </div>
    </div>
  )
}

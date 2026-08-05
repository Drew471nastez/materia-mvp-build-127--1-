import { ArrowLeft } from "lucide-react"

/**
 * The shell /profile/edit paints the instant it is tapped.
 *
 * Without one, a `force-dynamic` route has no static shell to prefetch — so
 * tapping Editează profilul sat on the profile, doing nothing visible, until a
 * server render with two database round trips behind it came back. That stall
 * is what a page transition "not being smooth" actually is most of the time: it
 * is not the animation, it is that there is nothing to animate to yet.
 *
 * Its only job is to be the same shape as what replaces it. Every measurement
 * below is taken from components/member/profile-edit-form.tsx — the header row,
 * the 168px preview, the avatar's -44px straddle, the section headings and the
 * field heights — so the swap moves nothing at all.
 *
 * The constants are drawn rather than skeletonised: the back arrow, the title,
 * the save button and the section headings say the same thing on every account,
 * so a grey bar in their place would only be one more thing to swap.
 */
export default function ProfileEditLoading() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col pb-16">
      <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 bg-white/95 px-2 py-2 backdrop-blur-md">
        <span className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-800">
          <ArrowLeft className="h-5 w-5" />
        </span>
        <h1 className="text-[15.5px] font-semibold text-neutral-900">Editează profilul</h1>
        <span className="mr-1 flex h-9 min-w-[84px] items-center justify-center rounded-full bg-[#7c3aed] px-4 text-[13.5px] font-semibold text-white">
          Salvează
        </span>
      </div>

      <div className="px-4 pt-4">
        <div className="h-[168px] w-full animate-pulse rounded-2xl bg-neutral-200" />
        <div className="flex items-start gap-4">
          <div className="-mt-11 h-[88px] w-[88px] shrink-0 animate-pulse rounded-full bg-neutral-100 shadow-[0_6px_18px_-8px_rgba(15,15,15,0.35)] ring-4 ring-white" />
          <div className="min-w-0 flex-1 space-y-2 pt-3">
            <div className="h-5 w-32 animate-pulse rounded bg-neutral-100" />
            <div className="h-3.5 w-24 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
      </div>

      <Field title="Nume" height="h-12" />
      <Field title="Despre tine" height="h-[104px]" />

      <section className="px-4 pt-7">
        <h2 className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-neutral-400">Coperta</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-[16/7] animate-pulse rounded-xl bg-neutral-100 ring-1 ring-black/10" />
          ))}
        </div>
      </section>
    </div>
  )
}

function Field({ title, height }: { title: string; height: string }) {
  return (
    <section className="px-4 pt-7">
      <h2 className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-neutral-400">{title}</h2>
      <div className={`${height} w-full animate-pulse rounded-2xl border border-neutral-200 bg-neutral-50`} />
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="h-3 w-40 animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-6 animate-pulse rounded bg-neutral-100" />
      </div>
    </section>
  )
}

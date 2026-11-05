import { Delayed, Placeholder } from "../_console/ui"

/** Drawn only when the first read takes long enough to notice. */
export default function Loading() {
  return (
    <main className="min-h-screen bg-[#0b0b0f]">
      <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-14 sm:px-6 lg:px-8">
        <Delayed>
          <Placeholder rows={10} />
        </Delayed>
      </div>
    </main>
  )
}

import Link from "next/link"
import { ALTERNATIVES, HUB_PATH, alternativePath } from "@/lib/alternatives"

/**
 * "Compare Storelib" under the plans on /pricing: one line of links to each
 * comparison, read from the same list the hub is. Somebody weighing the
 * price is usually weighing it against what they pay now.
 */
export function CompareStrip() {
  return (
    <section aria-labelledby="compare-strip-h" className="border-b border-[#eef0f2] bg-white">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between">
        <h2 id="compare-strip-h" className="text-[15px] font-semibold text-[#1a1a2e]">
          <Link href={HUB_PATH} className="underline-offset-4 hover:underline">Compare Storelib</Link>
        </h2>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
          {ALTERNATIVES.map((c) => (
            <li key={c.slug}>
              <Link href={alternativePath(c.slug)} className="text-[#4b5563] underline-offset-4 hover:text-[#1a1a2e] hover:underline">
                vs {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

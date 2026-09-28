import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/**
 * My Downloads was a second list of the same purchases. The library itself
 * is that list now, with every file one press away (app/library/page.tsx),
 * so an old link or bookmark lands there.
 */
export default function MyDownloadsPage() {
  redirect("/library")
}

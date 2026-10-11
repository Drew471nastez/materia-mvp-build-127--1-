import "server-only"

/**
 * Work a route does after its answer has gone (next/server `after`), so the
 * answer cannot say, by what it says or by how long it took, what the work
 * found. Outside a request (a script) it simply runs. Never throws.
 */
import { after } from "next/server"

export function later(task: () => Promise<unknown>): void {
  const run = () =>
    task().catch((e) => {
      console.warn("[reviews] background step stopped:", e instanceof Error ? e.message.slice(0, 120) : "unknown")
    })
  try {
    after(run)
  } catch {
    void run()
  }
}

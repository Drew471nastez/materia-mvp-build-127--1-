/**
 * ===========================================================================
 *  A READ THAT DECIDES WHICH PARTS OF A PAGE EXIST (round 53)
 * ===========================================================================
 * Some reads do not fill a part of a page, they decide whether it is there:
 * Analytics draws its sales reports only for a store with products, and its
 * products read ignored an error, so with the database failing the store
 * "had no products" and the reports went missing with nothing in their
 * place (scripts/check-app-resilience-r53.mjs, "missing silently").
 *
 * Such a read is asked again once after a blip (paid from the instance's
 * retry budget, lib/net/retry-budget), and a second failure is thrown as a
 * ServiceUnavailable, which the page's boundary asks the server for again
 * quietly (app/app/error.tsx) instead of drawing the page without the part.
 */
import { dataOrThrow, isServiceUnavailable } from "./service-error"
import { supabaseRetryBudget } from "./retry-budget"

type Result<T> = { data: T; error: unknown; status?: number }

export async function decisiveRead<T>(where: string, run: () => PromiseLike<Result<T>>, pauseMs = 250): Promise<T> {
  try {
    return dataOrThrow(where, await run())
  } catch (e) {
    if (!isServiceUnavailable(e) || !e.transient || !supabaseRetryBudget.spend()) throw e
    await new Promise((r) => setTimeout(r, pauseMs + Math.round(Math.random() * 150)))
    return dataOrThrow(where, await run())
  }
}

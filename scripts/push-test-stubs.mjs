/**
 * A second resolve hook, for a suite that runs a real route handler with
 * some of its imports swapped for stand-ins: the email sender, the Supabase
 * clients, the storage signer. The suite registers it itself, with the map:
 *
 *   register(new URL("./push-test-stubs.mjs", ...), { data: { stubs: { "@/lib/email": "file:///…/email.mjs" } } })
 *
 * and then imports the route dynamically. Hooks registered later run first,
 * so a named specifier is answered here and everything else falls through
 * to scripts/push-test-loader.mjs as usual. It only affects the process that
 * registered it: every suite runs in its own.
 */
let stubs = {}

export async function initialize(data) {
  stubs = (data && data.stubs) || {}
}

export async function resolve(specifier, context, nextResolve) {
  const bare = specifier.includes("?") ? specifier.slice(0, specifier.indexOf("?")) : specifier
  if (Object.prototype.hasOwnProperty.call(stubs, bare)) return { url: stubs[bare], shortCircuit: true }
  return nextResolve(specifier, context)
}

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * ===========================================================================
 *  THE ONLY WAY TO BUILD A STORAGE IMAGE URL
 * ===========================================================================
 * Supabase bills Storage Image Transformations per origin image transformed
 * per month, and the project went over its allowance (106 / 100) on a free
 * plan with a spend cap. There is no way to serve one more transformed image
 * without either paying or lifting the cap — so the app must stop asking for
 * transformed images at all.
 *
 * The endpoint that costs money:
 *
 *     /storage/v1/render/image/public/<bucket>/<path>?width=…&height=…
 *
 * The endpoint that is free, unmetered, and CDN-cached:
 *
 *     /storage/v1/object/public/<bucket>/<path>
 *
 * They differ by one path segment, which is exactly why this happened: the
 * offending code was a single `String.replace("/object/public/",
 * "/render/image/public/")` sitting in a component, six words long, in a file
 * nobody would think to check when wondering where a storage bill came from.
 *
 * ---------------------------------------------------------------------------
 * Why a helper rather than just deleting the three call sites
 * ---------------------------------------------------------------------------
 * Deleting them fixes today. This makes the wrong thing hard to write again:
 * there is now one named function to reach for, it takes no size arguments,
 * and it cannot return a /render/image/ URL even if it is handed one. Anything
 * that wants a transformed image has to go around it deliberately, and
 * tests/no-image-transforms.test.ts fails the build when something does.
 *
 * ---------------------------------------------------------------------------
 * How images are sized now
 * ---------------------------------------------------------------------------
 * By CSS, at display time — `object-fit: cover` inside a fixed aspect-ratio
 * box — and by compressing ONCE at upload, in the browser, before the bytes
 * ever reach Supabase. See lib/images/compress.ts. That is strictly better
 * than transforming on read: it is paid once per image rather than once per
 * viewer, and the result is cached by the CDN like any other object.
 */

/**
 * The public URL of a stored object. Never a transformation.
 *
 * Deliberately takes no width, height, quality, format or resize parameter,
 * and has nowhere to put one. That is the entire point of the signature: a
 * function that cannot express the expensive thing cannot accidentally do it.
 */
export function getStorageImageUrl(
  client: SupabaseClient,
  bucket: string,
  path: string,
): string {
  const { data } = client.storage.from(bucket).getPublicUrl(path)
  // Normalised on the way out too. getPublicUrl does not produce a render URL
  // today, but this function's promise is about what it RETURNS, not about
  // what the SDK currently happens to do.
  return toOriginalImageUrl(data.publicUrl)
}

/**
 * A private-bucket URL. Never a transformation.
 *
 * `createSignedUrl` accepts a `transform` option as its third argument and
 * that option is what bills. This wrapper does not forward one and has no
 * parameter for it, so the only thing a caller can vary is how long the link
 * lives.
 */
export async function getSignedStorageImageUrl(
  client: SupabaseClient,
  bucket: string,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
  if (error || !data?.signedUrl) return null
  return toOriginalImageUrl(data.signedUrl)
}

/**
 * Turn any Supabase image URL into the original-object form, and strip the
 * transformation query parameters that only mean anything to the render
 * endpoint.
 *
 * This exists for URLs the app did not build this second: values already
 * written into `profiles.avatar_url`, `products.thumbnail_url` and the rest.
 * If any of those were ever stored in the transformed form — and the whole
 * point of a bug like this is that nobody is sure — rendering them would keep
 * billing long after the code was fixed. Running every stored URL through this
 * on the way to an `<img>` makes that impossible without a data migration.
 *
 * Anything that is not a Supabase storage URL comes back untouched: an OAuth
 * avatar on googleusercontent.com, an external image, a data: URI. Those are
 * not ours to rewrite.
 */
export function toOriginalImageUrl(url: string | null | undefined): string {
  if (!url) return ""
  if (!url.includes("/storage/v1/")) return url

  let out = url
    .replace("/storage/v1/render/image/public/", "/storage/v1/object/public/")
    .replace("/storage/v1/render/image/sign/", "/storage/v1/object/sign/")
    .replace("/storage/v1/render/image/authenticated/", "/storage/v1/object/authenticated/")

  // The size parameters. Dropped rather than left behind, because a URL that
  // still carries `?width=280` reads as though it does something — and the next
  // person to see one may well "fix" it by pointing it back at the endpoint
  // that honours it.
  //
  // `token` is NOT in this list: it is what makes a signed URL work, and
  // stripping it would turn every private image into a 400.
  try {
    const u = new URL(out, "https://placeholder.invalid")
    for (const p of ["width", "height", "resize", "quality", "format"]) u.searchParams.delete(p)
    out = out.startsWith("http") ? u.toString() : `${u.pathname}${u.search}`
  } catch {
    // Not parseable as a URL — leave the path rewrite, which is the part that
    // actually stops the billing.
  }
  return out
}

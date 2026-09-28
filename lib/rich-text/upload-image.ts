/**
 * A picture for a product description: compressed in the browser and put in
 * the product images bucket, the same bucket, folder and compression profile
 * as the product's own photos (app/app/products/new/product-editor.tsx,
 * lib/images/compress.ts). The description then holds its URL and nothing
 * else, never the bytes: the old editor wrote pictures into the HTML as data:
 * URLs, and a description with two photos in it was a megabyte row.
 */
import { createClient } from "@/lib/supabase/client"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { COMPRESS_PROFILES, compressImage } from "@/lib/images/compress"

export interface UploadedImage {
  url: string
  width: number
  height: number
}

/** Anything bigger is not a photo somebody meant to put in a description. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024

/** Why a file cannot be a description picture, in words the editor shows; null when it can. */
export function imageFileProblem(file: File): string | null {
  if (!file.type.startsWith("image/")) return "That file is not a picture."
  /* An SVG can carry script, and is drawn from a host we do not control
     once somebody opens it directly. Photos only. */
  if (/svg/i.test(file.type)) return "SVG files cannot go in a description. Use a JPEG, PNG or WebP."
  if (file.size > MAX_IMAGE_BYTES) return "That picture is over 25 MB. Choose a smaller one."
  return null
}

async function measure(file: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error("decode failed"))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function uploadDescriptionImage(file: File, owner: { creatorId: string; productId?: string | null }): Promise<UploadedImage> {
  const problem = imageFileProblem(file)
  if (problem) throw new Error(problem)
  const upload = await compressImage(file, COMPRESS_PROFILES["product-images"])
  const size = await measure(upload).catch(() => ({ width: 0, height: 0 }))

  const supabase = createClient()
  const ext = (upload.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
  const path = `${owner.creatorId}/${owner.productId || "temp"}/${Date.now()}_description_${Math.random().toString(36).slice(2, 8)}.${ext}`
  /* A new path for every upload, so the bytes at a URL never change and it
     can be cached for a year, like the rest of the bucket's uploads. */
  const { error } = await supabase.storage.from("product-images").upload(path, upload, {
    cacheControl: "31536000",
    contentType: upload.type,
    upsert: false,
  })
  if (error) throw new Error("The picture did not upload. Check the connection and try again.")
  confirmUpload("product-images", path)
  const { data } = supabase.storage.from("product-images").getPublicUrl(path)
  return { url: data.publicUrl, width: size.width, height: size.height }
}

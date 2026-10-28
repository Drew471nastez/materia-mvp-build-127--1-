"use client"

/**
 * ===========================================================================
 *  "YOUR FILES", NEXT TO EVERY UPLOAD IN THE ONEPAGE EDITOR
 * ===========================================================================
 * "For uploading images anywhere in the OnePage editor, I can also pick from
 * my own Storelib files."
 *
 * The chooser is the one the website builder and Settings already open
 * (components/files/files-library FilesLibraryChooser): the store's pictures,
 * or its videos, in the same sheet on a phone and window on a computer.
 * This file is only the two ways the OnePage editor asks for it:
 *
 *   LibraryRow     a row in a "Profile Image" style sheet, shaped like the
 *                  Upload row beside it
 *   LibraryButton  a small secondary button beside an Upload button
 *
 * and `fileFromLibrary`, for the pickers that crop: a picture in Files is
 * fetched once (storage answers CORS) and handed to the cropper exactly as a
 * file from the device would be, so the crop, the HEIC rule and the upload
 * that follows are all the same path.
 *
 * The chooser itself is placed by the caller OUTSIDE its sheets: a sheet
 * that closes unmounts what it holds, and the chooser has to outlive the
 * sheet it was asked for from.
 */
import * as React from "react"
import { ChevronRight, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { prefetchLibrary, type LibraryKind } from "@/components/files/files-library"

export { FilesLibraryChooser } from "@/components/files/files-library"

/** A row for a sheet of choices, the shape of the Upload row next to it. Hovering it fetches the list ahead. */
export function LibraryRow({ kind = "image", onClick, className }: { kind?: LibraryKind; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => void prefetchLibrary(kind, { warmFirst: true })}
      onFocus={() => void prefetchLibrary(kind)}
      data-library-pick={kind}
      className={cn("w-full flex items-center gap-4 p-4 rounded-xl border hover:bg-gray-50 transition-colors cursor-pointer", className)}
    >
      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
        <FolderOpen className="h-6 w-6 text-gray-600" strokeWidth={1.75} />
      </div>
      <div className="flex-1 text-left">
        <p className="font-medium">{kind === "video" ? tt("Choose from your videos") : tt("Choose from your files")}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-gray-400" />
    </button>
  )
}

/** A compact secondary button: "Your files". */
export function LibraryButton({ kind = "image", onClick, disabled, className }: { kind?: LibraryKind; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onPointerEnter={() => void prefetchLibrary(kind, { warmFirst: true })}
      data-library-pick={kind}
      className={cn(
        "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#e3e4e8] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8] disabled:cursor-default disabled:opacity-50",
        className,
      )}
    >
      {tt("Your files")}
    </button>
  )
}

/**
 * A picture from Files as a File, for a cropper. The stored original, not a
 * resized copy, so the crop is drawn from every pixel there is.
 */
export async function fileFromLibrary(url: string): Promise<File> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" })
  if (!res.ok) throw new Error(tt("That file could not be opened. Try another one."))
  const blob = await res.blob()
  const name = decodeURIComponent(new URL(url, "https://x.invalid").pathname.split("/").pop() || "photo")
  return new File([blob], name, { type: blob.type || "image/jpeg" })
}

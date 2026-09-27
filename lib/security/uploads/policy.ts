/**
 * ===========================================================================
 *  WHAT EACH KIND OF UPLOAD MAY BE
 * ===========================================================================
 * The one table every upload path reads (lib/security/uploads/inspect.ts):
 * where a file is going decides how large it may be and which kinds of file
 * it may be. Pure and dependency free, so the product editor can refuse a
 * file before a byte is sent, with the same rule the server applies after.
 *
 *   product_file     a paid or free product's file, including variant files
 *                    and bundles. Private bucket, delivered as a download.
 *                    BROAD on purpose: creators sell audio, video, design
 *                    files, presets, plugins, fonts, code, templates and
 *                    sample packs, and a kind of file we do not recognise is
 *                    allowed rather than refused. Only things that run when
 *                    they are double clicked are refused.
 *   link_page_file   a file a OnePage hands out (a lead magnet). Public URL,
 *                    so nothing a browser would render as a page either.
 *   public_image     avatars, covers, product and gallery pictures, email
 *                    and blog pictures. Real raster pictures only.
 *   video            a product video. Real video containers only.
 *   theme_package    a website theme export. A ZIP, and nothing else.
 *
 * Words a creator or buyer sees are here too (USER_MESSAGES). They name what
 * to do next and nothing about how the check works.
 */

export type UploadContext = "product_file" | "link_page_file" | "public_image" | "video" | "theme_package"

export const UPLOAD_CONTEXTS: readonly UploadContext[] = ["product_file", "link_page_file", "public_image", "video", "theme_package"]

const GB = 1024 * 1024 * 1024
const MB = 1024 * 1024

/**
 * The largest file each context takes. Checked on the size declared before
 * the upload and again on the size storage recorded once it arrived, because
 * a signed upload URL cannot limit what is sent through it.
 */
export const MAX_UPLOAD_BYTES: Record<UploadContext, number> = {
  /* 10 GB per file on every plan (lib/storage/plans.ts maxFileSizeBytes). */
  product_file: 10 * GB,
  link_page_file: 1 * GB,
  public_image: 25 * MB,
  /* The product-videos bucket is made with a limit just under 2 GB. */
  video: 2_000_000_000,
  theme_package: 50 * MB,
}

/** "10 GB", "25 MB": the limit as a person reads it. */
export function formatLimit(bytes: number): string {
  if (bytes >= GB && bytes % GB === 0) return `${bytes / GB} GB`
  if (bytes >= GB) return `${Number((bytes / GB).toFixed(1))} GB`
  return `${Math.round(bytes / MB)} MB`
}

/* ── Things that run when they are opened ─────────────────────────────── */

/**
 * Refused as the name of any upload, in every context. Programs, installers,
 * shortcuts and scripts that Windows or macOS run on a double click, and
 * the other kinds Storelib has always refused here (lib/storage/security.ts
 * kept this list before; nothing that list allowed is refused now except the
 * macOS installer package, below).
 *
 * macOS: .app and .dmg were already refused and still are, and .pkg and
 * .mpkg (the macOS installer, which runs its scripts as an administrator)
 * are refused with them, as .msi is on Windows. An app developer can still
 * sell their app as a ZIP of the .app bundle, which is how most Mac apps
 * outside the App Store are shipped. Android .apk is allowed, as it always
 * was: a phone will not install one without the owner turning on installs
 * from unknown sources for that app first.
 */
export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  // Windows programs, installers and shortcuts
  "exe", "bat", "cmd", "com", "scr", "pif", "msi", "msp", "mst", "msix", "msixbundle", "appx", "appxbundle",
  "cpl", "hta", "inf", "ins", "isp", "lnk", "reg", "rgs", "scf", "gadget", "application",
  "sct", "shb", "shs", "ws",
  // Windows Script Host
  "vbe", "vbs", "vb", "jse", "js", "jsx", "mjs", "wsc", "wsf", "wsh",
  // PowerShell
  "ps1", "psm1", "psd1", "ps1xml", "ps2", "ps2xml",
  // Unix shells and interpreters
  "sh", "bash", "csh", "ksh", "zsh", "py", "pyc", "pyw", "rb", "pl", "php", "asp", "aspx", "jsp",
  // macOS
  "app", "command", "action", "workflow", "pkg", "mpkg",
  // Java
  "jar", "class", "jnlp",
  // Libraries
  "dll", "so", "dylib",
  // Disk images, which open as a drive and can carry an autorun
  "iso", "img", "dmg", "vhd", "vhdx",
  // Shortcuts that open something
  "url", "webloc", "desktop",
  // Certificates and keys, which install trust when opened
  "cer", "crt", "der", "p7b", "pfx", "p12",
])

/**
 * Refused INSIDE a ZIP a product file carries. Only the Windows programs and
 * launchers that run on a double click once the archive is unpacked.
 *
 * Source code and scripts are NOT on this list: .js, .ts, .py, .sh, .php,
 * .html and the rest are what a template, theme, plugin or code product is
 * made of, and selling those is a core use of Storelib. Unpacking a ZIP never
 * runs them, and a person who runs a script from a code product meant to.
 *
 * Nor are .dll and .jar: a Windows audio plugin (VST) is a .dll, a Unity
 * package and a game mod carry them, and a Minecraft plugin is a .jar. None
 * of those runs on a double click; each is loaded by the program it was
 * made for. They stay refused as a whole upload (above), where a single
 * .dll or .jar has no reason to be sold alone.
 */
export const BLOCKED_IN_ARCHIVE: ReadonlySet<string> = new Set([
  "exe", "scr", "com", "pif", "msi", "msp", "mst", "msix", "msixbundle", "appx", "appxbundle",
  "bat", "cmd", "vbs", "vbe", "vb", "jse", "wsf", "wsh", "wsc", "ws", "hta", "cpl", "lnk", "reg", "scf",
  "ps1", "psm1", "sct", "shs", "shb", "gadget", "application",
])

/** Declared types that say "program" whatever the name is. */
export const DANGEROUS_DECLARED_TYPES: ReadonlySet<string> = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-sharedlib",
  "application/x-dosexec",
  "application/hta",
  "application/x-ms-shortcut",
  "application/x-ms-installer",
  "application/x-msi",
  "application/vnd.microsoft.portable-executable",
])

/**
 * Extensions that promise a document or media file. A script or a web page
 * behind one of these names is a disguise, and refused; the same text in a
 * file with a code or unknown extension is simply code.
 */
export const DOCUMENT_OR_MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
  "pdf", "txt", "csv", "rtf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "epub", "mobi",
  "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "tif", "tiff", "heic", "heif", "psd", "dng",
  "mp3", "wav", "flac", "aif", "aiff", "m4a", "aac", "ogg", "opus", "wma",
  "mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv", "mpg", "mpeg", "3gp",
  "zip",
])

/** Binary media: text of any kind inside one of these is a disguise. */
export const BINARY_MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
  "pdf", "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "tif", "tiff", "heic", "heif",
  "mp3", "wav", "flac", "aif", "aiff", "m4a", "aac", "ogg", "opus",
  "mp4", "mov", "m4v", "webm", "mkv", "avi", "mpg", "mpeg", "3gp",
])

/* ── ZIP limits ───────────────────────────────────────────────────────── */

export interface ArchiveLimits {
  /** Entries in the central directory. */
  maxEntries: number
  /** Everything unpacked, added up. */
  maxTotalUncompressed: number
  /** Unpacked over packed for one entry, counted only for entries past `ratioFloorBytes`. */
  maxEntryRatio: number
  ratioFloorBytes: number
  /** Archives inside the archive; more than this is not a real product. */
  maxNestedArchives: number
  /** Folder depth of one entry's path. */
  maxPathDepth: number
  /** The most of the central directory read to inspect it. */
  maxDirectoryBytes: number
}

/**
 * A sample pack can hold tens of thousands of files and a course tens of
 * gigabytes, so the product limits are generous; they exist for archives
 * built to unpack into far more than any product is (a "zip bomb"). DEFLATE
 * cannot compress past about 1032 to 1, so a single entry above that is
 * crafted, and 200 to 1 on something over a gigabyte is a file of nothing.
 */
export const ARCHIVE_LIMITS: Record<"product" | "theme", ArchiveLimits> = {
  product: {
    maxEntries: 200_000,
    maxTotalUncompressed: 100 * GB,
    maxEntryRatio: 1100,
    ratioFloorBytes: 10 * MB,
    maxNestedArchives: 2000,
    maxPathDepth: 48,
    maxDirectoryBytes: 32 * MB,
  },
  theme: {
    maxEntries: 5000,
    maxTotalUncompressed: 500 * MB,
    maxEntryRatio: 1100,
    ratioFloorBytes: 1 * MB,
    maxNestedArchives: 0,
    maxPathDepth: 24,
    maxDirectoryBytes: 4 * MB,
  },
}

/* ── What a person is told ────────────────────────────────────────────── */

/**
 * Every refusal is one of these, and a person only ever sees these words.
 * The reason behind it (which check, which entry of which ZIP) goes to the
 * security log for the admin, never to the creator or the buyer.
 */
export type UserFacingCode = "unsupported_type" | "too_large" | "empty" | "not_accepted" | "not_an_image" | "not_a_video"

export function userMessage(code: UserFacingCode, context: UploadContext, limitBytes = MAX_UPLOAD_BYTES[context]): string {
  switch (code) {
    case "unsupported_type":
      return "This file type isn't supported."
    case "not_an_image":
      return "This file type isn't supported. Use a JPEG, PNG, WebP, GIF or AVIF."
    case "not_a_video":
      return "This file type isn't supported. Use MP4, MOV or WebM."
    case "too_large":
      return `This file is too large. The limit is ${formatLimit(limitBytes)}.`
    case "empty":
      return "This file is empty. Try another file."
    case "not_accepted":
    default:
      return "We couldn't accept this file. Try another file."
  }
}

/** For a buyer when a download can't be handed out for a moment. */
export const DOWNLOAD_TRY_AGAIN = "This file isn't available right now. Try again in a minute."
/** For a buyer when a file was refused and will not come back. */
export const DOWNLOAD_UNAVAILABLE = "This file isn't available. Contact the seller for help."

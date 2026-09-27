/**
 * ===========================================================================
 *  THE OLD NAMES FOR THE UPLOAD CHECKS
 * ===========================================================================
 * scanFile(), preUploadCheck() and BLOCKED_EXTENSIONS were the upload checks
 * before they moved to lib/security/uploads (inspect.ts, policy.ts). They are
 * kept here with the shapes their callers expect and answer with the central
 * check, so no path keeps rules of its own. `reason` is the plain sentence a
 * person may be shown; what exactly was found is only in the security log.
 *
 * Client safe: the link page editor imports this.
 */
import {
  BLOCKED_EXTENSIONS as CENTRAL_BLOCKED,
  containsEicar,
  inspectHead,
  MAX_UPLOAD_BYTES,
  precheckUpload,
  type RefusalCode,
  type UploadContext,
} from "@/lib/security/uploads"

/** Maximum bytes to read for magic-byte / header inspection. */
const HEADER_SCAN_BYTES = 8192

/** Extensions that are always refused (lib/security/uploads/policy.ts). */
export const BLOCKED_EXTENSIONS: ReadonlySet<string> = CENTRAL_BLOCKED

export interface SecurityScanResult {
  safe: boolean
  reason?: string
  threatType?: "blocked_extension" | "double_extension" | "executable_binary" | "embedded_script" | "disguised_file" | "malware_signature"
  severity?: "critical" | "high" | "medium"
  /** The central check's own code, for a log. */
  code?: RefusalCode
}

/** The EICAR test string in the first bytes of a file. */
export function headerHasEicar(header: Uint8Array): boolean {
  return containsEicar(header)
}

function threatOf(code: RefusalCode): SecurityScanResult["threatType"] {
  if (code === "malware_test_signature") return "malware_signature"
  if (code === "executable_signature" || code === "disguised_file") return "disguised_file"
  if (code === "script_in_document") return "embedded_script"
  return "blocked_extension"
}

/**
 * The central check on a name, a declared type and the first bytes, for a
 * product file unless another context is given. A file with no bytes to look
 * at is judged by its name.
 */
export function scanFile(
  fileName: string,
  contentType: string,
  fileHeader?: ArrayBuffer | Uint8Array | null,
  context: UploadContext = "product_file",
): SecurityScanResult {
  const head = fileHeader ? (fileHeader instanceof Uint8Array ? fileHeader : new Uint8Array(fileHeader)) : null
  const verdict = inspectHead({
    fileName,
    declaredMime: contentType,
    /* Size is checked where the size is known; here only the kind of file is. */
    size: Math.max(1, head?.length ?? 1),
    head,
    context,
  })
  if (verdict.ok) return { safe: true }
  return { safe: false, reason: verdict.userMessage, threatType: threatOf(verdict.code as RefusalCode), severity: "critical", code: verdict.code as RefusalCode }
}

/** Read the first N bytes of a File for header inspection. */
export async function readFileHeader(file: File | Blob, bytes: number = HEADER_SCAN_BYTES): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, bytes).arrayBuffer())
}

/** Read file header from a Buffer (server-side). */
export function readBufferHeader(buffer: Buffer | ArrayBuffer, bytes: number = HEADER_SCAN_BYTES): Uint8Array {
  if (typeof Buffer !== "undefined" && buffer instanceof Buffer) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(buffer.length, bytes))
  }
  return new Uint8Array(buffer as ArrayBuffer, 0, Math.min((buffer as ArrayBuffer).byteLength, bytes))
}

/**
 * 10 GB per file, on every plan: the most one digital product file may be.
 * Checked on the size declared before the upload (prepare), and again on the
 * size storage actually recorded once it arrives (complete), because a signed
 * upload URL cannot limit what is sent through it.
 */
export const MAX_DIGITAL_PRODUCT_FILE_SIZE = MAX_UPLOAD_BYTES.product_file

/** Size, name and first bytes together, for a page about to upload a product file. */
export function preUploadCheck(
  fileName: string,
  fileSize: number,
  contentType: string,
  fileHeader?: ArrayBuffer | Uint8Array | null,
): SecurityScanResult & { sizeOk: boolean; sizeError?: string } {
  const pre = precheckUpload({ fileName, size: fileSize, declaredMime: contentType, context: "product_file" })
  if (!pre.ok && (pre.code === "too_large" || pre.code === "empty")) {
    return { safe: false, sizeOk: false, sizeError: pre.userMessage, reason: pre.userMessage, threatType: "blocked_extension", severity: "high" }
  }
  return { ...scanFile(fileName, contentType, fileHeader), sizeOk: true }
}

/**
 * File security scanning for uploads.
 * Detects dangerous file types, malware signatures, and suspicious content.
 *
 * Strategy: defense-in-depth with multiple layers:
 * 1. Extension blocklist (known dangerous extensions)
 * 2. MIME type / magic byte verification (detect disguised files)
 * 3. Content pattern scanning (detect scripts/macros inside archives/docs)
 * 4. Double extension detection (e.g., file.pdf.exe)
 */

/** Maximum bytes to read for magic-byte / header inspection. */
const HEADER_SCAN_BYTES = 8192

/** Extensions that are ALWAYS blocked — executables, scripts, system files. */
export const BLOCKED_EXTENSIONS = new Set([
  // Windows executables & installers
  "exe", "bat", "cmd", "com", "scr", "pif", "msi", "msp", "mst",
  "cpl", "hta", "inf", "ins", "isp", "lnk", "reg", "rgs",
  "sct", "shb", "shs", "ws",
  // Script files
  "vbe", "vbs", "vb",
  "jse", "js", "jsx", "mjs", // JavaScript (server-side risk)
  "wsc", "wsf", "wsh",
  "ps1", "psm1", "psd1", "ps1xml", "ps2", "ps2xml", // PowerShell
  "sh", "bash", "csh", "ksh", "zsh", // Unix shells
  "py", "pyc", "pyw", // Python
  "rb", "pl", "php", "asp", "aspx", "jsp", // Server scripts
  // macOS specific
  "app", "command", "action", "workflow",
  // Java
  "jar", "class", "jnlp",
  // Dynamic libraries
  "dll", "so", "dylib",
  // Disk images / ISOs (can contain auto-run)
  "iso", "img", "dmg", "vhd", "vhdx",
  // Shortcuts & config that can execute
  "url", "webloc", "desktop",
  // Cert/key manipulation
  "cer", "crt", "der", "p7b", "pfx", "p12",
])

/** Suspicious double-extension patterns that indicate disguised files. */
const DOUBLE_EXT_DANGEROUS = /\.(pdf|doc|docx|txt|jpg|jpeg|png|gif|mp4|mp3|zip)\.(exe|bat|cmd|com|scr|pif|msi|js|vbs|ps1|sh|py|php|jar)$/i

/** Magic bytes for known dangerous file types (detect renamed executables). */
const DANGEROUS_MAGIC_BYTES: Array<{ bytes: number[]; offset: number; description: string }> = [
  // Windows PE executable (MZ header)
  { bytes: [0x4D, 0x5A], offset: 0, description: "Windows executable (PE/MZ)" },
  // ELF binary (Linux executable)
  { bytes: [0x7F, 0x45, 0x4C, 0x46], offset: 0, description: "Linux executable (ELF)" },
  // Mach-O binary (macOS executable)
  { bytes: [0xFE, 0xED, 0xFA, 0xCE], offset: 0, description: "macOS executable (Mach-O 32-bit)" },
  { bytes: [0xFE, 0xED, 0xFA, 0xCF], offset: 0, description: "macOS executable (Mach-O 64-bit)" },
  { bytes: [0xCE, 0xFA, 0xED, 0xFE], offset: 0, description: "macOS executable (Mach-O reverse)" },
  { bytes: [0xCF, 0xFA, 0xED, 0xFE], offset: 0, description: "macOS executable (Mach-O 64 reverse)" },
  // Java class file
  { bytes: [0xCA, 0xFE, 0xBA, 0xBE], offset: 0, description: "Java class file" },
  // Windows shortcut (LNK)
  { bytes: [0x4C, 0x00, 0x00, 0x00], offset: 0, description: "Windows shortcut (LNK)" },
  // MS-DOS COM executable (starts with various opcodes, but common ones)
  // Note: COM files don't have a reliable magic byte — they just run raw code
]

/** Suspicious text patterns in file headers (for script files disguised as other types). */
const SUSPICIOUS_TEXT_PATTERNS = [
  /^#!\s*\/(?:usr\/)?(?:local\/)?bin\//m,        // Shebang (#!/bin/bash, #!/usr/bin/python, etc.)
  /<\?php/i,                                       // PHP opening tag
  /<%@?\s*(?:page|import|include)/i,              // JSP/ASP tags
  /<script[^>]*>/i,                                // HTML script tag (in non-HTML files)
  /\bpowershell\b.*-(?:enc|exec|command)/i,       // PowerShell encoded commands
  /\bcmd\.exe\s*\/[ck]\b/i,                       // cmd.exe execution
  /\bwscript\b|\bcscript\b/i,                     // Windows Script Host
  /\bSet-ExecutionPolicy\b/i,                      // PowerShell policy bypass
  /\bInvoke-(?:Expression|WebRequest|Command)\b/i, // PowerShell remote execution
]

export interface SecurityScanResult {
  safe: boolean
  reason?: string
  threatType?: "blocked_extension" | "double_extension" | "executable_binary" | "embedded_script" | "disguised_file" | "malware_signature"
  severity?: "critical" | "high" | "medium"
}

/**
 * Scan a file for security threats.
 * Call this BEFORE uploading the file to storage.
 *
 * @param fileName - Original file name from the user
 * @param contentType - MIME type reported by the browser
 * @param fileHeader - First N bytes of the file (for magic byte inspection)
 */
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

/** The EICAR test string at the start of a file, as the standard defines it (leading whitespace allowed). */
export function headerHasEicar(header: Uint8Array): boolean {
  const text = new TextDecoder("latin1").decode(header.subarray(0, 256)).trimStart()
  return text.startsWith(EICAR)
}

export function scanFile(
  fileName: string,
  contentType: string,
  fileHeader?: ArrayBuffer | Uint8Array | null,
): SecurityScanResult {
  const normalizedName = fileName.toLowerCase().trim()

  // --- Layer 1: Extension blocklist ---
  const ext = normalizedName.split(".").pop() || ""
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      safe: false,
      reason: `File type ".${ext}" is blocked for security reasons. This file type can contain executable code.`,
      threatType: "blocked_extension",
      severity: "critical",
    }
  }

  // --- Layer 2: Double extension detection ---
  if (DOUBLE_EXT_DANGEROUS.test(normalizedName)) {
    return {
      safe: false,
      reason: `File "${fileName}" has a suspicious double extension. This is a common technique used to disguise dangerous files.`,
      threatType: "double_extension",
      severity: "critical",
    }
  }

  // --- Layer 3: Magic byte analysis (detect renamed executables) ---
  if (fileHeader) {
    const header = fileHeader instanceof Uint8Array ? fileHeader : new Uint8Array(fileHeader)

    /*
      THE EICAR TEST FILE, which every antivirus engine flags on purpose so a
      scanner can be tested without real malware. Refused here too, so the
      whole path (the header read back from storage, the refusal, the file
      removed) can be tried by anyone with a 68 byte text file.
    */
    if (headerHasEicar(header)) {
      return {
        safe: false,
        reason: "This file matches the EICAR antivirus test signature, so it cannot be uploaded.",
        threatType: "malware_signature",
        severity: "critical",
      }
    }

    for (const sig of DANGEROUS_MAGIC_BYTES) {
      if (header.length >= sig.offset + sig.bytes.length) {
        let match = true
        for (let i = 0; i < sig.bytes.length; i++) {
          if (header[sig.offset + i] !== sig.bytes[i]) {
            match = false
            break
          }
        }
        if (match) {
          // Allow if the extension matches the binary type (e.g., .exe already blocked above)
          // This catches renamed files: "safe_document.pdf" that is actually an EXE
          return {
            safe: false,
            reason: `File appears to be a ${sig.description} disguised as ".${ext}". Upload blocked for security.`,
            threatType: "disguised_file",
            severity: "critical",
          }
        }
      }
    }

    // --- Layer 4: Suspicious text content in non-script files ---
    // Only scan if the file claims to be a safe type (document, image, etc.)
    const safeClaimedTypes = [
      "application/pdf", "image/", "video/", "audio/",
      "application/zip", "text/plain", "text/csv",
    ]
    const claimsToBeGood = safeClaimedTypes.some(t =>
      contentType.startsWith(t) || ext === "pdf" || ext === "txt" || ext === "csv"
    )

    if (claimsToBeGood && header.length > 0) {
      // Try to decode header as text for pattern matching
      try {
        const textDecoder = new TextDecoder("utf-8", { fatal: false })
        const headerText = textDecoder.decode(header.slice(0, Math.min(header.length, 2048)))

        for (const pattern of SUSPICIOUS_TEXT_PATTERNS) {
          if (pattern.test(headerText)) {
            return {
              safe: false,
              reason: `File "${fileName}" contains suspicious script content inconsistent with its file type. Upload blocked for security.`,
              threatType: "embedded_script",
              severity: "high",
            }
          }
        }
      } catch {
        // Binary content — can't decode as text, that's fine
      }
    }
  }

  // --- Layer 5: MIME type vs extension mismatch for dangerous MIME types ---
  const dangerousMimeTypes = [
    "application/x-msdownload",
    "application/x-msdos-program",
    "application/x-executable",
    "application/x-sharedlib",
    "application/x-dosexec",
    "application/hta",
    "application/x-ms-shortcut",
  ]
  if (dangerousMimeTypes.includes(contentType)) {
    return {
      safe: false,
      reason: `File type "${contentType}" is not allowed for security reasons.`,
      threatType: "blocked_extension",
      severity: "critical",
    }
  }

  return { safe: true }
}

/**
 * Read the first N bytes of a File for header inspection.
 * Works in both browser and Node.js (with File API).
 */
export async function readFileHeader(file: File | Blob, bytes: number = HEADER_SCAN_BYTES): Promise<Uint8Array> {
  const slice = file.slice(0, bytes)
  const buffer = await slice.arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * Read file header from a Buffer (server-side).
 */
export function readBufferHeader(buffer: Buffer | ArrayBuffer, bytes: number = HEADER_SCAN_BYTES): Uint8Array {
  if (buffer instanceof Buffer) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(buffer.length, bytes))
  }
  return new Uint8Array(buffer, 0, Math.min(buffer.byteLength, bytes))
}

/**
 * 10 GB per file, on every plan: the most one digital product file may be.
 * Checked on the size declared before the upload (prepare), and again on the
 * size storage actually recorded once it arrives (complete), because a signed
 * upload URL cannot limit what is sent through it.
 */
export const MAX_DIGITAL_PRODUCT_FILE_SIZE = 10 * 1024 * 1024 * 1024

/**
 * Full pre-upload security check combining size limit + file scanning.
 * Use on the client side before initiating upload.
 */
export function preUploadCheck(
  fileName: string,
  fileSize: number,
  contentType: string,
  fileHeader?: ArrayBuffer | Uint8Array | null,
): SecurityScanResult & { sizeOk: boolean; sizeError?: string } {
  // Size check
  if (fileSize > MAX_DIGITAL_PRODUCT_FILE_SIZE) {
    const limitGB = MAX_DIGITAL_PRODUCT_FILE_SIZE / (1024 * 1024 * 1024)
    return {
      safe: false,
      sizeOk: false,
      sizeError: `File size (${formatFileSize(fileSize)}) exceeds the ${limitGB} GB limit for digital product uploads.`,
      reason: `File size exceeds the ${limitGB} GB limit.`,
      threatType: "blocked_extension",
      severity: "high",
    }
  }

  if (fileSize <= 0) {
    return {
      safe: false,
      sizeOk: false,
      sizeError: "File is empty (0 bytes).",
      reason: "File is empty.",
      threatType: "blocked_extension",
      severity: "medium",
    }
  }

  // Security scan
  const scan = scanFile(fileName, contentType, fileHeader)

  return {
    ...scan,
    sizeOk: true,
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

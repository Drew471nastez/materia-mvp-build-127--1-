/**
 * ===========================================================================
 *  STORELIB'S UPLOAD SECURITY, IN ONE PLACE
 * ===========================================================================
 * Everything any upload path needs to decide whether a file may be kept, and
 * everything the browser may import (pure, no server code):
 *
 *   policy.ts           contexts, size limits, what is refused, the words
 *   filename.ts         names for storage, for display, for downloads; path guard
 *   inspect.ts          inspectUpload(), precheckUpload(), inspectHead()
 *   zip.ts              a ZIP's table of contents and its checks
 *   provider-config.ts  which malware engine the flag switches on (none by default)
 *
 * Server only, imported by path:
 *
 *   stored.ts           the same checks on a file already in storage, and its SHA-256
 *   providers.ts        MalwareProvider: builtin (always), clamav (by flag)
 *   pipeline.ts         scan_status from upload to download, the daily sweep
 *   audit.ts            the security log (public.file_security_events)
 */
export * from "./policy"
export * from "./filename"
export * from "./inspect"
export { checkZipDirectory, findEndRecord, parseCentralDirectory, readZipDirectory, ZIP_TAIL_BYTES, type ZipDirectory, type ZipEntry, type ZipReport } from "./zip"
export { readProviderSetting, clamavRequested, KNOWN_PROVIDERS, type ProviderName, type ProviderSetting } from "./provider-config"

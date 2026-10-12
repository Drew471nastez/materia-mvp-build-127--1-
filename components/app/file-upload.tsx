"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Upload,
  X,
  FileIcon,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
  RotateCcw,
  Loader2,
} from "lucide-react"
import {
  DirectUploader,
  type UploadResult,
  type UploadStatus,
  type UploadError,
} from "@/lib/storage/chunked-upload"
import { precheckUpload, userMessage } from "@/lib/security/uploads"
import { uploadRowState, uploadStatusLabel, useUploadChecking } from "@/lib/storage/upload-state"
import { plainError } from "@/app/app/products/new/file-uploads"
import { tt } from "@/lib/i18n/text"

interface UploadedFile {
  id?: string
  file_name: string
  file_path: string
  file_size: number
}

interface ActiveUpload {
  file: File
  uploader: DirectUploader
  progress: number
  status: UploadStatus
  error?: string
  bytesUploaded: number
  bytesTotal: number
}

interface FileUploadProps {
  productId: string
  existingFiles?: UploadedFile[]
  onUploadComplete?: (files: UploadedFile[]) => void
  maxSizeBytes?: number
}

export function FileUpload({
  productId,
  existingFiles = [],
  onUploadComplete,
  maxSizeBytes = 1024 * 1024 * 1024, // 1GB default
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>(existingFiles)
  const [activeUploads, setActiveUploads] = useState<Map<string, ActiveUpload>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return tt("0 Bytes")
    const k = 1024
    const sizes = [tt("Bytes"), "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }


  const isUploading = Array.from(activeUploads.values()).some(
    (u) => !["complete", "error", "aborted", "paused"].includes(u.status),
  )

  // Overall progress across all active uploads
  const overallProgress = activeUploads.size > 0
    ? Math.round(
        Array.from(activeUploads.values()).reduce((sum, u) => sum + u.progress, 0) /
          activeUploads.size,
      )
    : 0

  const handleUpload = useCallback(
    async (selectedFiles: FileList | null) => {
      if (!selectedFiles || selectedFiles.length === 0) return
      setError(null)

      for (const file of Array.from(selectedFiles)) {
        /* The same rule the server applies (lib/security/uploads): size, and not a program. */
        const verdict = precheckUpload({ fileName: file.name, size: file.size, declaredMime: file.type, context: "product_file", maxBytes: maxSizeBytes })
        if (!verdict.ok) {
          setError(verdict.code === "too_large" ? userMessage("too_large", "product_file", maxSizeBytes) : verdict.userMessage)
          continue
        }

        const uploadKey = `${file.name}-${file.size}-${Date.now()}`

        const uploader = new DirectUploader({
          file,
          productId,
          folder: "digital",
          onProgress: (percent, bytesUploaded, bytesTotal) => {
            setActiveUploads((prev) => {
              const next = new Map(prev)
              const entry = next.get(uploadKey)
              if (entry) {
                next.set(uploadKey, { ...entry, progress: percent, bytesUploaded, bytesTotal })
              }
              return next
            })
          },
          onStatusChange: (status) => {
            setActiveUploads((prev) => {
              const next = new Map(prev)
              const entry = next.get(uploadKey)
              if (entry) {
                next.set(uploadKey, { ...entry, status })
              }
              return next
            })
          },
          onComplete: (result) => {
            const newFile: UploadedFile = {
              id: result.assetId || undefined,
              file_name: result.fileName,
              file_path: result.path,
              file_size: result.fileSize,
            }

            setFiles((prev) => {
              const updated = [...prev, newFile]
              onUploadComplete?.(updated)
              return updated
            })

            // Remove from active uploads after a brief delay
            setTimeout(() => {
              setActiveUploads((prev) => {
                const next = new Map(prev)
                next.delete(uploadKey)
                return next
              })
            }, 2000)

            // Trigger background antivirus scan
            if (result.assetId) {
              fetch("/api/v2/upload/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetId: result.assetId }),
              }).catch(() => {
                // Non-critical: scan will be picked up by cron
              })
            }
          },
          onError: (err) => {
            setActiveUploads((prev) => {
              const next = new Map(prev)
              const entry = next.get(uploadKey)
              if (entry) {
                next.set(uploadKey, { ...entry, status: "error", error: plainError(err).text })
              }
              return next
            })
          },
        })

        // Add to active uploads
        setActiveUploads((prev) => {
          const next = new Map(prev)
          next.set(uploadKey, {
            file,
            uploader,
            progress: 0,
            status: "idle",
            bytesUploaded: 0,
            bytesTotal: file.size,
          })
          return next
        })

        // Start upload (don't await (allow parallel uploads))
        uploader.start().catch(() => {
          // Error already handled by onError callback
        })
      }
    },
    [productId, maxSizeBytes, onUploadComplete],
  )

  const handlePause = useCallback((uploadKey: string) => {
    const entry = activeUploads.get(uploadKey)
    if (entry) {
      entry.uploader.pause()
    }
  }, [activeUploads])

  const handleResume = useCallback((uploadKey: string) => {
    const entry = activeUploads.get(uploadKey)
    if (entry) {
      entry.uploader.resume().catch(() => {})
    }
  }, [activeUploads])

  const handleRetry = useCallback((uploadKey: string) => {
    const entry = activeUploads.get(uploadKey)
    if (entry) {
      setActiveUploads((prev) => {
        const next = new Map(prev)
        next.set(uploadKey, { ...entry, progress: 0, status: "idle", error: undefined })
        return next
      })
      entry.uploader.start().catch(() => {})
    }
  }, [activeUploads])

  const handleCancel = useCallback((uploadKey: string) => {
    const entry = activeUploads.get(uploadKey)
    if (entry) {
      entry.uploader.abort()
      setActiveUploads((prev) => {
        const next = new Map(prev)
        next.delete(uploadKey)
        return next
      })
    }
  }, [activeUploads])

  const handleDelete = async (fileToDelete: UploadedFile) => {
    if (!fileToDelete.id) return
    setError(null)

    try {
      const response = await fetch(`/api/storage/upload-file?assetId=${fileToDelete.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json()
        setError(errorData.error && !/error|failed/i.test(errorData.error) ? errorData.error : tt("The file could not be removed. Try again."))
        return
      }

      const updatedFiles = files.filter((f) => f.id !== fileToDelete.id)
      setFiles(updatedFiles)
      onUploadComplete?.(updatedFiles)
    } catch (err) {
      console.error("[file-upload] Delete error:", err)
      setError(tt("The file could not be removed. Try again."))
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      handleUpload(e.dataTransfer.files)
    },
    [handleUpload],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-blue-500 bg-blue-500/5" : "border-border"
        } ${isUploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
          disabled={isUploading}
        />
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">
          {isUploading ? tt("Uploading…") : tt("Click to upload or drag and drop")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {tt("Up to {maxSizeBytes} each", { maxSizeBytes: formatFileSize(maxSizeBytes) })}
        </p>
      </div>

      {/* Active Uploads with Real Progress */}
      {activeUploads.size > 0 && (
        <div className="space-y-3">
          {Array.from(activeUploads).map(([key, upload]) => (
            <UploadRow
              key={key}
              upload={upload}
              formatFileSize={formatFileSize}
              onPause={() => handlePause(key)}
              onResume={() => handleResume(key)}
              onRetry={() => handleRetry(key)}
              onCancel={() => handleCancel(key)}
            />
          ))}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Uploaded Files List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{tt("Uploaded files")}</p>
          {files.map((file, idx) => (
            <div
              key={file.id || idx}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="flex items-center gap-3">
                <FileIcon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{file.file_name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.file_size)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(file)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * ONE ROW, WITH THE SAME STATES THE PRODUCT EDITOR'S LIST SHOWS. The words
 * and the rule that nothing is said for a step over in a blink both come from
 * lib/storage/upload-state.ts, so a file uploaded here and a file uploaded in
 * the product editor read the same at every moment.
 */
function UploadRow({
  upload,
  formatFileSize,
  onPause,
  onResume,
  onRetry,
  onCancel,
}: {
  upload: ActiveUpload
  formatFileSize: (bytes: number) => string
  onPause: () => void
  onResume: () => void
  onRetry: () => void
  onCancel: () => void
}) {
  const checking = useUploadChecking(upload.status)
  return (
    <div className="rounded-lg border border-border p-3 space-y-2" data-upload-row="" data-state={uploadRowState(upload.status, checking)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {upload.status === "error" ? (
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          ) : upload.status === "complete" ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          ) : (
            <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{upload.file.name}</p>
            <p className="text-xs text-muted-foreground">
              {uploadStatusLabel(upload.status, checking)}
              {upload.status === "uploading" && upload.bytesTotal > 0 && (
                <> · {tt("{bytesUploaded} of {bytesTotal}", { bytesUploaded: formatFileSize(upload.bytesUploaded), bytesTotal: formatFileSize(upload.bytesTotal) })}</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {upload.status === "uploading" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onPause() }}
              title={tt("Pause upload")}
            >
              <Pause className="h-3.5 w-3.5" />
            </Button>
          )}
          {upload.status === "paused" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onResume() }}
              title={tt("Resume upload")}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          {upload.status === "error" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onRetry() }}
              title={tt("Retry upload")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          {upload.status !== "complete" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onCancel() }}
              title={tt("Cancel upload")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Real progress bar */}
      <Progress value={upload.progress} className="h-1.5" />

      {/* Error message */}
      {upload.error && (
        <p className="text-xs text-destructive">{upload.error}</p>
      )}
    </div>
  )
}

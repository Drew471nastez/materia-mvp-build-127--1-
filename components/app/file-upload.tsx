"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Upload, X, FileIcon, CheckCircle2, AlertCircle } from "lucide-react"

interface UploadedFile {
  id?: string
  file_name: string
  file_path: string
  file_size: number
}

interface FileUploadProps {
  productId: string
  existingFiles?: UploadedFile[]
  onUploadComplete?: (files: UploadedFile[]) => void
  maxSizeBytes?: number // Default 1GB
}

export function FileUpload({
  productId,
  existingFiles = [],
  onUploadComplete,
  maxSizeBytes = 1024 * 1024 * 1024, // 1GB
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>(existingFiles)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const handleUpload = useCallback(
    async (selectedFiles: FileList | null) => {
      if (!selectedFiles || selectedFiles.length === 0) return

      setError(null)
      setUploading(true)
      setProgress(0)

      const newFiles: UploadedFile[] = []
      const totalFiles = selectedFiles.length
      let completedFiles = 0

      try {
        for (const file of Array.from(selectedFiles)) {
          // Check file size
          if (file.size > maxSizeBytes) {
            setError(`File "${file.name}" exceeds maximum size of ${formatFileSize(maxSizeBytes)}`)
            continue
          }

          // Use the new API route that uses admin client (bypasses RLS)
          const formData = new FormData()
          formData.append("file", file)
          formData.append("productId", productId)

          // Start progress simulation
          const progressInterval = setInterval(() => {
            setProgress((prev) => {
              const newProgress = prev + 5
              return newProgress < 90 ? newProgress : prev
            })
          }, 200)

          try {
            const response = await fetch("/api/storage/upload-file", {
              method: "POST",
              body: formData,
            })

            clearInterval(progressInterval)

            if (!response.ok) {
              const errorData = await response.json()
              console.error("[v0] Upload error:", errorData)
              setError(`Failed to upload "${file.name}": ${errorData.error || "Upload failed"}`)
              continue
            }

            const { asset } = await response.json()

            newFiles.push({
              id: asset.id,
              file_name: asset.file_name,
              file_path: asset.file_path,
              file_size: asset.file_size,
            })

            completedFiles++
            setProgress(Math.round((completedFiles / totalFiles) * 100))
          } catch (uploadErr) {
            clearInterval(progressInterval)
            console.error("[v0] Upload request error:", uploadErr)
            setError(`Failed to upload "${file.name}": Network error`)
            continue
          }
        }

        const updatedFiles = [...files, ...newFiles]
        setFiles(updatedFiles)
        onUploadComplete?.(updatedFiles)
      } catch (err) {
        console.error("[v0] Upload error:", err)
        setError("An unexpected error occurred during upload")
      } finally {
        setUploading(false)
        setProgress(0)
      }
    },
    [productId, files, maxSizeBytes, onUploadComplete],
  )

  const handleDelete = async (fileToDelete: UploadedFile) => {
    if (!fileToDelete.id) return

    setError(null)

    try {
      // Use the new API route for deletion
      const response = await fetch(`/api/storage/upload-file?assetId=${fileToDelete.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json()
        setError(`Failed to delete file: ${errorData.error || "Delete failed"}`)
        return
      }

      const updatedFiles = files.filter((f) => f.id !== fileToDelete.id)
      setFiles(updatedFiles)
      onUploadComplete?.(updatedFiles)
    } catch (err) {
      console.error("[v0] Delete error:", err)
      setError("Failed to delete file")
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
        } ${uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
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
          disabled={uploading}
        />
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">{uploading ? "Uploading..." : "Click to upload or drag and drop"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Max file size: {formatFileSize(maxSizeBytes)}</p>
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-center text-sm text-muted-foreground">{progress}% uploaded</p>
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
          <p className="text-sm font-medium">Uploaded files</p>
          {files.map((file, idx) => (
            <div key={file.id || idx} className="flex items-center justify-between rounded-lg border border-border p-3">
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

"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
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
  maxSizeBytes?: number // Default 5GB
}

export function FileUpload({
  productId,
  existingFiles = [],
  onUploadComplete,
  maxSizeBytes = 5 * 1024 * 1024 * 1024, // 5GB
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

      const supabase = createClient()
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

          // Generate unique path
          const timestamp = Date.now()
          const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
          const filePath = `products/${productId}/${timestamp}_${safeName}`

          const { error: uploadError } = await supabase.storage.from("product-files").upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          })

          if (uploadError) {
            console.error("[v0] Upload error:", uploadError)
            setError(`Failed to upload "${file.name}": ${uploadError.message}`)
            continue
          }

          const { data: urlData } = supabase.storage.from("product-files").getPublicUrl(filePath)

          // Save to digital_assets table
          const { data: asset, error: dbError } = await supabase
            .from("digital_assets")
            .insert({
              product_id: productId,
              file_name: file.name,
              file_path: filePath, // Store the path, not the full URL
              file_size: file.size,
            })
            .select()
            .single()

          if (dbError) {
            console.error("[v0] DB error:", dbError)
            setError(`Failed to save "${file.name}" metadata`)
            continue
          }

          newFiles.push({
            id: asset.id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
          })

          completedFiles++
          setProgress(Math.round((completedFiles / totalFiles) * 100))
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

    const supabase = createClient()

    // Delete from database
    const { error } = await supabase.from("digital_assets").delete().eq("id", fileToDelete.id)

    if (error) {
      setError("Failed to delete file")
      return
    }

    // Try to delete from storage
    try {
      await supabase.storage.from("product-files").remove([fileToDelete.file_path])
    } catch {
      // Storage deletion is best-effort
    }

    const updatedFiles = files.filter((f) => f.id !== fileToDelete.id)
    setFiles(updatedFiles)
    onUploadComplete?.(updatedFiles)
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

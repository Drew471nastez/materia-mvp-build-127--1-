"use client"

import { useState, useEffect } from "react"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  MobileBottomSheet,
  MobileBottomSheetContent,
  MobileBottomSheetHeader,
  MobileBottomSheetTitle,
  MobileBottomSheetDescription,
  MobileBottomSheetFooter,
} from "@/components/ui/mobile-bottom-sheet"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

interface UnsavedChangesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => Promise<void>
  onDiscard: () => void
  isSaving?: boolean
}

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onSave,
  onDiscard,
  isSaving = false,
}: UnsavedChangesDialogProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleSave = async () => {
    await onSave()
  }

  // Mobile view: Bottom sheet
  if (isMobile) {
    return (
      <MobileBottomSheet open={open} onOpenChange={onOpenChange}>
        <MobileBottomSheetContent className="max-h-[50vh]">
          <MobileBottomSheetHeader>
            <MobileBottomSheetTitle>Unsaved Changes</MobileBottomSheetTitle>
            <MobileBottomSheetDescription>
              You have unsaved changes. Would you like to save them before leaving?
            </MobileBottomSheetDescription>
          </MobileBottomSheetHeader>

          <MobileBottomSheetFooter>
            <div className="flex flex-col gap-2 w-full">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-purple-600 text-white hover:bg-purple-700 w-full"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={onDiscard}
                disabled={isSaving}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 w-full"
              >
                Discard Changes
              </Button>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </MobileBottomSheetFooter>
        </MobileBottomSheetContent>
      </MobileBottomSheet>
    )
  }

  // Desktop view: Alert dialog
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Would you like to save them before leaving?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onDiscard}
            disabled={isSaving}
            className="border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Discard Changes
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-purple-600 text-white hover:bg-purple-700"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

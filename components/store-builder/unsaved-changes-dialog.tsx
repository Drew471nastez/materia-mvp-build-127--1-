"use client"

import {
  MobileBottomSheet,
  MobileBottomSheetContent,
  MobileBottomSheetHeader,
  MobileBottomSheetBody,
  MobileBottomSheetFooter,
  MobileBottomSheetTitle,
  MobileBottomSheetDescription,
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
  const handleSave = async () => {
    await onSave()
  }

  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange}>
      <MobileBottomSheetContent>
        <MobileBottomSheetHeader>
          <MobileBottomSheetTitle>Unsaved Changes</MobileBottomSheetTitle>
          <MobileBottomSheetDescription>
            You have unsaved changes. Would you like to save them before leaving?
          </MobileBottomSheetDescription>
        </MobileBottomSheetHeader>

        <MobileBottomSheetBody>
          <div className="text-sm text-muted-foreground">
            Your changes will be lost if you don't save them.
          </div>
        </MobileBottomSheetBody>

        <MobileBottomSheetFooter>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98] transition-transform"
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
            className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-transform"
          >
            Discard Changes
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="w-full text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-transform"
          >
            Cancel
          </Button>
        </MobileBottomSheetFooter>
      </MobileBottomSheetContent>
    </MobileBottomSheet>
  )
}

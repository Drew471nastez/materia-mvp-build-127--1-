"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Share2, X, Link2, Facebook } from "lucide-react"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface ShareButtonProps {
  productTitle: string
  productSlug: string
  className?: string
  size?: "default" | "sm" | "lg" | "icon"
  iconSize?: string
}

export function ShareButton({ 
  productTitle, 
  productSlug, 
  className,
  size = "icon",
  iconSize = "h-5 w-5"
}: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  
  const shareUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/p/${productSlug}` 
    : `/p/${productSlug}`
  
  const shareText = `Check out ${productTitle}`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleShareTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
    window.open(twitterUrl, "_blank", "noopener,noreferrer")
  }

  const handleShareFacebook = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
    window.open(facebookUrl, "_blank", "noopener,noreferrer")
  }

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        className={className}
        onClick={() => setIsOpen(true)}
      >
        <Share2 className={iconSize} />
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[280px] p-4 rounded-2xl">
          <div className="flex flex-col gap-3">
            <Button
              className="w-full justify-center gap-2 h-14 rounded-xl bg-black text-white hover:bg-black/90 text-base font-medium"
              onClick={handleShareTwitter}
            >
              <X className="h-5 w-5" />
              Share on X
            </Button>
            <Button
              className="w-full justify-center gap-2 h-14 rounded-xl bg-[#4267B2] text-white hover:bg-[#4267B2]/90 text-base font-medium"
              onClick={handleShareFacebook}
            >
              <Facebook className="h-5 w-5" />
              Share on Facebook
            </Button>
            <Button
              variant="outline"
              className="w-full justify-center gap-2 h-14 rounded-xl text-base font-medium border-2"
              onClick={handleCopyLink}
            >
              <Link2 className="h-5 w-5" />
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

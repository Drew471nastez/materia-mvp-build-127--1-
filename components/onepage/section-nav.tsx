"use client"

import { useOnePage } from "@/lib/onepage/context"
import { cn } from "@/lib/utils"
import {
  User,
  Palette,
  LayoutList,
  Share2,
  Mail,
  Settings,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const sections = [
  { id: "profile" as const, icon: User, label: "Profile" },
  { id: "theme" as const, icon: Palette, label: "Theme" },
  { id: "blocks" as const, icon: LayoutList, label: "Blocks" },
  { id: "socials" as const, icon: Share2, label: "Socials" },
  { id: "leads" as const, icon: Mail, label: "Leads" },
  { id: "settings" as const, icon: Settings, label: "Settings" },
]

export function SectionNav() {
  const { activeSection, setActiveSection } = useOnePage()

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col gap-1 p-2 border-r border-border bg-muted/30">
        {sections.map(({ id, icon: Icon, label }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setActiveSection(id)}
                className={cn(
                  "p-3 rounded-lg transition-all",
                  activeSection === id
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <Icon className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{label}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}

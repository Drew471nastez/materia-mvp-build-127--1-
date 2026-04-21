"use client"

// Team members — grid / list / carousel of team cards with headshot,
// name, role, bio, and up to 4 social links.

import { Twitter, Linkedin, Instagram, Globe } from "lucide-react"
import { str, SectionWrapper, type SectionProps } from "../_shared"

export function TeamMembersSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const blocks = section.blocks ?? []
  const bg = str(s.bg_color, "#ffffff")
  const color = str(s.text_color, "#111827")
  const cols = str(s.columns, "3")
  const layout = str(s.layout, "grid")
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60

  const gridClass = layout === "list"
    ? "space-y-6"
    : cols === "2" ? "grid gap-6 md:grid-cols-2"
    : cols === "4" ? "grid gap-6 md:grid-cols-2 lg:grid-cols-4"
    : "grid gap-6 md:grid-cols-2 lg:grid-cols-3"

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-[1230px] mx-auto px-6" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {(!!s.heading || !!s.subheading) && (
          <div className="text-center mb-10">
            {!!s.heading && <h2 className="text-3xl font-bold mb-2">{str(s.heading)}</h2>}
            {!!s.subheading && <p className="opacity-70 max-w-2xl mx-auto">{str(s.subheading)}</p>}
          </div>
        )}
        <div className={gridClass}>
          {blocks.map(b => {
            const bs = b.settings
            const photo = str(bs.photo)
            return (
              <div key={b.id} className={layout === "list" ? "flex gap-6 items-start" : "text-center"}>
                <div className={layout === "list" ? "w-32 h-32 shrink-0 overflow-hidden rounded" : "w-full aspect-square overflow-hidden rounded mb-4"}>
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt={str(bs.name)} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">Photo</div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{str(bs.name, "Name")}</h3>
                  <p className="text-sm opacity-70 mb-2">{str(bs.role, "Role")}</p>
                  {!!bs.bio && <p className="text-sm opacity-80 mb-3">{str(bs.bio)}</p>}
                  <div className={`flex gap-3 ${layout === "list" ? "" : "justify-center"}`}>
                    {!!bs.social_twitter && (<a href={str(bs.social_twitter)} aria-label="Twitter"><Twitter className="w-4 h-4 opacity-70 hover:opacity-100" /></a>)}
                    {!!bs.social_linkedin && (<a href={str(bs.social_linkedin)} aria-label="LinkedIn"><Linkedin className="w-4 h-4 opacity-70 hover:opacity-100" /></a>)}
                    {!!bs.social_instagram && (<a href={str(bs.social_instagram)} aria-label="Instagram"><Instagram className="w-4 h-4 opacity-70 hover:opacity-100" /></a>)}
                    {!!bs.social_url && (<a href={str(bs.social_url)} aria-label="Website"><Globe className="w-4 h-4 opacity-70 hover:opacity-100" /></a>)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default TeamMembersSection

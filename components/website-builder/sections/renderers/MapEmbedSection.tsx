"use client"

// Map embed — accepts either a Google Maps embed URL or a raw iframe.
// The raw iframe is rendered via dangerouslySetInnerHTML because it
// comes from the creator's own settings.

import { MapPin, Phone, Mail, Clock } from "lucide-react"
import { str, bool, SectionWrapper, type SectionProps } from "../_shared"

export function MapEmbedSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const color = str(s.text_color, "#0f172a")
  const panelBg = str(s.panel_bg_color, "#f8fafc")
  const accent = str(s.accent_color, "#6366f1")
  const height = typeof s.map_height === "number" ? s.map_height : 450
  const radius = typeof s.border_radius === "number" ? s.border_radius : 12
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60
  const layout = str(s.layout, "map_right")
  const showInfo = bool(s.show_info_panel, true)

  const embedCode = str(s.embed_code)
  const embedUrl = str(s.embed_url)
  const mapBlock = embedCode ? (
    <div
      className="w-full overflow-hidden"
      style={{ height, borderRadius: radius }}
      dangerouslySetInnerHTML={{ __html: embedCode }}
    />
  ) : embedUrl ? (
    <iframe
      src={embedUrl}
      className="w-full border-0"
      style={{ height, borderRadius: radius }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      title="Map"
    />
  ) : (
    <div
      className="w-full flex items-center justify-center text-sm opacity-60 border-2 border-dashed border-current"
      style={{ height, borderRadius: radius }}
    >
      Paste a Google Maps embed URL in the settings panel.
    </div>
  )

  const infoBlock = (
    <div className="p-6" style={{ background: panelBg, borderRadius: radius }}>
      {!!s.heading && <h2 className="text-2xl font-bold mb-2">{str(s.heading)}</h2>}
      {!!s.subheading && <p className="text-sm opacity-70 mb-5">{str(s.subheading)}</p>}
      <div className="space-y-3 text-sm">
        {!!s.address_line1 && (
          <div className="flex gap-3">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: accent }} />
            <div>
              <div>{str(s.address_line1)}</div>
              {!!s.address_line2 && <div>{str(s.address_line2)}</div>}
              {!!s.city_state_zip && <div>{str(s.city_state_zip)}</div>}
              {!!s.country && <div>{str(s.country)}</div>}
            </div>
          </div>
        )}
        {!!s.phone && (
          <div className="flex gap-3 items-center">
            <Phone className="w-4 h-4 shrink-0" style={{ color: accent }} />
            <a href={`tel:${str(s.phone)}`}>{str(s.phone)}</a>
          </div>
        )}
        {!!s.email && (
          <div className="flex gap-3 items-center">
            <Mail className="w-4 h-4 shrink-0" style={{ color: accent }} />
            <a href={`mailto:${str(s.email)}`}>{str(s.email)}</a>
          </div>
        )}
        {!!s.hours && (
          <div className="flex gap-3">
            <Clock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: accent }} />
            <pre className="whitespace-pre-wrap font-sans text-sm">{str(s.hours)}</pre>
          </div>
        )}
      </div>
      {!!s.directions_url && (
        <a
          href={str(s.directions_url)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-5 px-4 py-2 text-sm font-semibold rounded"
          style={{ background: accent, color: "#fff" }}
        >
          {str(s.directions_text, "Get directions")}
        </a>
      )}
    </div>
  )

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-[1230px] mx-auto px-6" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {layout === "full" ? (
          mapBlock
        ) : layout === "info_above" ? (
          <div className="space-y-6">
            {showInfo && infoBlock}
            {mapBlock}
          </div>
        ) : (
          <div className={`grid gap-6 @[768px]:grid-cols-2 ${layout === "map_left" ? "" : ""}`}>
            {layout === "map_left" ? <>{mapBlock}{showInfo && infoBlock}</> : <>{showInfo && infoBlock}{mapBlock}</>}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default MapEmbedSection

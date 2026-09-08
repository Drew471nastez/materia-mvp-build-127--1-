"use client"

// Author bio — photo + bio + credentials + stats + social links.
// Matches the schema's 3 layouts: photo-left, photo-right, centered.

import { Twitter, Instagram, Linkedin, Globe, BookOpen, ShoppingCart } from "lucide-react"
import { str, bool, SectionWrapper, type SectionProps } from "../_shared"

export function AuthorBioSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#f9f6f1")
  const color = str(s.text_color, "#1a1a1a")
  const accent = str(s.accent_color, "#c0813a")
  const layout = str(s.layout, "left")
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 80
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 80

  const photo = (
    <div className="w-full max-w-xs mx-auto">
      {str(s.photo_url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={str(s.photo_url)} alt={str(s.name)} className="w-full aspect-square object-cover rounded-full" />
      ) : (
        <div className="w-full aspect-square rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-500">
          Photo
        </div>
      )}
    </div>
  )

  const stats = bool(s.show_stats, true) && (
    <div className="grid grid-cols-2 @[640px]:grid-cols-4 gap-4 text-center pt-6 border-t" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
      {!!s.books_count && (
        <div><div className="text-2xl font-bold" style={{ color: accent }}>{String(s.books_count)}</div><div className="text-xs opacity-70">Books</div></div>
      )}
      {!!s.years_experience && (
        <div><div className="text-2xl font-bold" style={{ color: accent }}>{String(s.years_experience)}+</div><div className="text-xs opacity-70">Years</div></div>
      )}
      {!!s.students_count && (
        <div><div className="text-2xl font-bold" style={{ color: accent }}>{str(s.students_count)}</div><div className="text-xs opacity-70">Readers</div></div>
      )}
      {!!s.publications_count && (
        <div><div className="text-2xl font-bold" style={{ color: accent }}>{String(s.publications_count)}</div><div className="text-xs opacity-70">Press</div></div>
      )}
    </div>
  )

  const social = bool(s.show_social, true) && (
    <div className="flex gap-3 pt-3">
      {!!s.social_twitter && <a href={str(s.social_twitter)} aria-label="Twitter"><Twitter className="w-5 h-5 opacity-70 hover:opacity-100" /></a>}
      {!!s.social_instagram && <a href={str(s.social_instagram)} aria-label="Instagram"><Instagram className="w-5 h-5 opacity-70 hover:opacity-100" /></a>}
      {!!s.social_linkedin && <a href={str(s.social_linkedin)} aria-label="LinkedIn"><Linkedin className="w-5 h-5 opacity-70 hover:opacity-100" /></a>}
      {!!s.social_goodreads && <a href={str(s.social_goodreads)} aria-label="Goodreads"><BookOpen className="w-5 h-5 opacity-70 hover:opacity-100" /></a>}
      {!!s.social_amazon && <a href={str(s.social_amazon)} aria-label="Amazon"><ShoppingCart className="w-5 h-5 opacity-70 hover:opacity-100" /></a>}
      {!!s.website_url && <a href={str(s.website_url)} aria-label="Website"><Globe className="w-5 h-5 opacity-70 hover:opacity-100" /></a>}
    </div>
  )

  const info = (
    <div className="space-y-4">
      <h2 className="text-3xl font-bold">{str(s.name, "Author")}</h2>
      {!!s.title_line && <p className="text-sm uppercase tracking-widest" style={{ color: accent }}>{str(s.title_line)}</p>}
      {!!s.bio && <p className="opacity-85">{str(s.bio)}</p>}
      {!!s.credentials && (
        <ul className="text-sm space-y-1 opacity-85">
          {str(s.credentials).split("\n").filter(Boolean).map((c, i) => (
            <li key={i} className="before:content-['•'] before:mr-2" style={{ color: accent }}>
              <span style={{ color }}>{c}</span>
            </li>
          ))}
        </ul>
      )}
      {!!s.featured_quote && (
        <blockquote className="border-l-4 pl-4 italic text-lg" style={{ borderColor: accent }}>
          &ldquo;{str(s.featured_quote)}&rdquo;
          {!!s.quote_attribution && (
            <footer className="mt-2 text-sm not-italic opacity-70">{str(s.quote_attribution)}</footer>
          )}
        </blockquote>
      )}
      {social}
    </div>
  )

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-5xl mx-auto px-6" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {layout === "centered" ? (
          <div className="text-center space-y-6">
            {photo}
            {info}
            {stats}
          </div>
        ) : (
          <>
            <div className="grid @[768px]:grid-cols-[260px_1fr] gap-8 items-start">
              {layout === "right" ? <>{info}{photo}</> : <>{photo}{info}</>}
            </div>
            {stats && <div className="mt-8">{stats}</div>}
          </>
        )}
      </div>
    </SectionWrapper>
  )
}

export default AuthorBioSection

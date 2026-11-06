"use client"

import { useState, type CSSProperties, type ReactNode } from "react"
import { useAvatarImage } from "@/lib/account/avatar-image"
import { presentationOf, presentationVars, safeCardMedia, socialPresentation, type BlockPresentation } from "@/lib/onepage/block-presentation"
import type { OnePageBlock, OnePageTheme, LinkButtonBlockData } from "@/lib/onepage/types"
import { themeButtonStyle, buttonHoverVars, buttonHover, buttonShadow } from "@/lib/onepage/button-style"
import { LinkIcon } from "./brand-icons"
import { resolveLinkIcon } from "./link-icons"
import { CompactInstagramPost } from "./compact-post"
import { onePageImageSrc } from "@/lib/onepage/display-image"

/** Native lazy loading starts the bounded optimizer/original retry loader only
 * when this card reaches the viewport. The frame keeps its size on failure. */
function CardMedia({src,width,height,className}:{src:string;width:number;height:number;className:string}) {
  const [started,setStarted]=useState(false)
  const [failed,setFailed]=useState<string|null>(null)
  const image=useAvatarImage(src,started)
  return image.src ? <img src={image.src} alt="" loading="lazy" decoding="async" width={width} height={height} className={className} style={{visibility:failed===image.src?"hidden":undefined}} onLoad={()=>{setFailed(null);setStarted(true)}} onError={()=>{setFailed(image.src!);setStarted(true);image.onError()}} /> : <span aria-hidden className={className} />
}

export function BlockSubtitle({ subtitle }: { subtitle?: string }) {
  return subtitle?.trim() ? <span data-block-subtitle="" className="block whitespace-pre-wrap break-words">{subtitle}</span> : null
}

/** The legacy renderer stays untouched until a creator opts into a setting. */
export function BlockPresentationFrame({ block, children }: { block: OnePageBlock; children: ReactNode }) {
  if (!block.style?.presentation) return <>{children}</>
  const p = presentationOf(block)
  return <div data-block-presentation="" data-block-align={p.align} data-title-size={p.title_size} data-title-weight={p.title_weight} data-title-color={p.title_color} data-icon-size={p.icon_size} data-icon-color={p.icon_color} data-block-gap={p.gap} data-block-padding={p.padding} style={{...presentationVars(p), textAlign:p.align}}>
    {children}
    {!["link_button","product","pdf_document","food_menu","calendly"].includes(block.type) ? <BlockSubtitle subtitle={p.subtitle} /> : null}
  </div>
}

export function VisualLinkCard({block,theme,onClick}: {block:OnePageBlock;theme:OnePageTheme;onClick:()=>void}) {
  const d=block.data as LinkButtonBlockData, p=presentationOf(block)
  const social=socialPresentation(d.url)
  const image=safeCardMedia(p.image_url || d.thumbnail_url || social?.thumbnail)
  const native=p.media_mode === "native" && social
  const variant=p.variant || "visual"
  const icon=resolveLinkIcon(d.icon,d.url)
  const visual=variant === "visual" || variant === "featured"
  const minimum=variant === "featured" ? 280 : variant === "compact" ? 64 : variant === "image-first" ? 96 : 180
  const colors=visual ? {color:p.title_color || "#ffffff",background:theme.button_color || "#202025"} : {color:p.title_color || theme.button_text_color}
  const title=<span data-block-title="" className="block break-words font-semibold leading-tight">{d.label || social?.platform || "Link"}</span>
  const words=<span className="relative z-[1] flex min-w-0 flex-col" style={{gap:p.gap ?? 6}}>{title}<BlockSubtitle subtitle={p.subtitle} /></span>
  const iconNode=icon ? <span data-block-icon="" className="relative z-[1] inline-flex shrink-0" style={{color:p.icon_color || "currentColor"}}><LinkIcon name={icon} size={p.icon_size ?? 22} /></span> : null
  const textAlign=p.align || (visual ? "left" : "center")
  const style:CSSProperties={...themeButtonStyle(theme),...buttonHoverVars(theme),...colors,borderRadius:Math.min(theme.button_border_radius??16,24),textAlign,overflow:"hidden",position:"relative",width:"100%",padding:0}
  return <div data-visual-link={variant} className="h-full min-w-0">
    {native && social.platform === "Instagram" ? <div data-native-social="Instagram"><CompactInstagramPost src={social.embed} title={`${social.platform}: ${d.label ?? "Media"}`} radius={Math.min(theme.button_border_radius??16,24)}/></div> : native ? <div data-native-social={social.platform} className="overflow-hidden rounded-t-[inherit]" style={{borderRadius:`${Math.min(theme.button_border_radius??16,24)}px`,aspectRatio:social.aspect,height:social.height,maxHeight:social.platform==="Instagram"||social.platform==="TikTok"?380:560,background:theme.button_color}}>
      <iframe loading="lazy" title={`${social.platform}: ${d.label ?? "Media"}`} src={social.embed} className="h-full w-full border-0" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" />
    </div> : null}
    <a href={d.url} target={d.action?.type==="phone"||d.action?.type==="email"?undefined:"_blank"} rel="noopener noreferrer" onClick={onClick} className="op-btn group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" style={style} data-hover={buttonHover(theme,true)} data-shadow={buttonShadow(theme)} data-visual-link-action="">
      {variant === "image-first" && image && !native ? <CardMedia key={image} src={onePageImageSrc(image,960)!} width={1200} height={675} className="aspect-video w-full object-cover" /> : null}
      <span className="relative flex w-full min-w-0" style={{minHeight:native?undefined:minimum,padding:p.padding??(variant==="compact"?14:22),gap:p.gap??12,flexDirection:visual?"column":"row",alignItems:visual?(textAlign==="center"?"center":textAlign==="right"?"flex-end":"flex-start"):"center",justifyContent:visual?(p.position==="top"?"flex-start":p.position==="center"?"center":"flex-end"):textAlign==="left"?"flex-start":textAlign==="right"?"flex-end":"center"}}>
        {visual && !native ? <>
          {image ? <CardMedia key={image} src={onePageImageSrc(image,960)!} width={1200} height={800} className="absolute inset-0 h-full w-full object-cover" /> : null}
          <span aria-hidden className="absolute inset-0" style={{background:p.gradient_from && p.gradient_to?`linear-gradient(160deg, color-mix(in srgb, ${p.gradient_from} ${p.overlay??55}%, transparent), color-mix(in srgb, ${p.gradient_to} ${p.overlay??75}%, transparent))`:`linear-gradient(to bottom,transparent 20%,rgba(0,0,0,${(p.overlay??65)/250}) 58%,rgba(0,0,0,${(p.overlay??65)/100}) 100%)`}} />
        </> : null}
        {variant==="compact" && image && !native ? <CardMedia key={image} src={onePageImageSrc(image,96)!} width={48} height={48} className="relative z-[1] h-12 w-12 shrink-0 rounded-lg object-cover" /> : iconNode}{words}
      </span>
    </a>
  </div>
}
export type { BlockPresentation }

"use client"

import { useState, type CSSProperties, type ReactNode } from "react"
import { useAvatarImage } from "@/lib/account/avatar-image"
import { aspectCss, blockSurfaceOf, embedIsTool, presentationOf, presentationVars, safeCardMedia, socialPresentation, socialProfile, type BlockPresentation } from "@/lib/onepage/block-presentation"
import type { OnePageBlock, OnePageTheme, LinkButtonBlockData } from "@/lib/onepage/types"
import { themeButtonStyle, buttonHoverVars, buttonHover, buttonShadow } from "@/lib/onepage/button-style"
import { LinkIcon } from "./brand-icons"
import { resolveLinkIcon } from "./link-icons"
import { CompactInstagramPost } from "./compact-post"
import { onePageImageSrc } from "@/lib/onepage/display-image"

/** Native lazy loading starts the bounded optimizer/original retry loader only
 * when this card reaches the viewport. The frame keeps its size on failure. */
function CardMedia({src,width,height,className,style}:{src:string;width:number;height:number;className:string;style?:CSSProperties}) {
  const [started,setStarted]=useState(false)
  const [failed,setFailed]=useState<string|null>(null)
  const image=useAvatarImage(src,started)
  return image.src ? <img src={image.src} alt="" loading="lazy" decoding="async" width={width} height={height} className={className} style={{...style,visibility:failed===image.src?"hidden":undefined}} onLoad={()=>{setFailed(null);setStarted(true)}} onError={()=>{setFailed(image.src!);setStarted(true);image.onError()}} /> : <span aria-hidden className={className} style={style} />
}

export function BlockSubtitle({ subtitle }: { subtitle?: string }) {
  return subtitle?.trim() ? <span data-block-subtitle="" className="block whitespace-pre-wrap break-words">{subtitle}</span> : null
}

/**
 * The legacy renderer stays untouched until a creator opts into a setting.
 * The same frame draws the editor's preview, the live preview and the
 * published page (components/onepage/public-onepage PublicBlockRenderer); the
 * rules it switches on are in app/globals.css under [data-block-presentation].
 */
export function BlockPresentationFrame({ block, children }: { block: OnePageBlock; children: ReactNode }) {
  if (!block.style?.presentation) return <>{children}</>
  const p = presentationOf(block)
  return <div data-block-presentation="" data-block-surface={blockSurfaceOf(block)} data-block-align={p.align} data-title-size={p.title_size} data-title-weight={p.title_weight} data-title-color={p.title_color} data-icon-size={p.icon_size} data-icon-color={p.icon_color} data-block-gap={p.gap} data-block-padding={p.padding} data-block-bg={p.background} data-block-radius={p.radius} data-block-shadow={p.shadow} style={{...presentationVars(p), textAlign:p.align}}>
    {children}
    {!["link_button","product","pdf_document","food_menu","calendly"].includes(block.type) ? <BlockSubtitle subtitle={p.subtitle} /> : null}
  </div>
}

/** The fade at a picture's foot: into the card's own colour, so there is no edge. */
const footFade = (into: string) => `linear-gradient(to bottom, transparent 45%, color-mix(in srgb, ${into} 70%, transparent) 78%, ${into} 100%)`
const shade = (p: BlockPresentation) => p.gradient_from && p.gradient_to
  ? `linear-gradient(160deg, color-mix(in srgb, ${p.gradient_from} ${p.overlay??55}%, transparent), color-mix(in srgb, ${p.gradient_to} ${p.overlay??75}%, transparent))`
  : `linear-gradient(to bottom,transparent 20%,rgba(0,0,0,${(p.overlay??65)/250}) 58%,rgba(0,0,0,${(p.overlay??65)/100}) 100%)`

export function VisualLinkCard({block,theme,onClick}: {block:OnePageBlock;theme:OnePageTheme;onClick:()=>void}) {
  const d=block.data as LinkButtonBlockData, p=presentationOf(block)
  const social=socialPresentation(d.url)
  const profile=socialProfile(d.url)
  const image=safeCardMedia(p.image_url || d.thumbnail_url || social?.thumbnail)
  const native=p.media_mode === "native" && social
  const variant=p.variant || "visual"
  const icon=resolveLinkIcon(d.icon,d.url)
  /* Words over the picture: the card, the tall cover and the media tile. */
  const overImage=variant === "visual" || variant === "featured" || variant === "tile"
  const minimum=variant === "featured" ? 280 : variant === "compact" ? 64 : variant === "image-first" || variant === "profile" ? 96 : 180
  const surface=p.background || theme.button_color || "#202025"
  const colors=overImage ? {color:p.title_color || "#ffffff",background:surface} : {color:p.title_color || theme.button_text_color,...(p.background?{background:p.background}:{})}
  const radius=p.radius ?? Math.min(theme.button_border_radius??16,24)
  const title=<span data-block-title="" className="block break-words font-semibold leading-tight">{d.label || social?.platform || profile?.platform || "Link"}</span>
  const subtitle=p.subtitle || (variant === "profile" && profile ? `@${profile.handle}` : undefined)
  const words=<span className="relative z-[1] flex min-w-0 flex-col" style={{gap:p.gap ?? 6}}>{title}<BlockSubtitle subtitle={subtitle} /></span>
  const iconNode=icon ? <span data-block-icon="" className="relative z-[1] inline-flex shrink-0" style={{color:p.icon_color || "currentColor"}}><LinkIcon name={icon} size={p.icon_size ?? 22} /></span> : null
  const textAlign=p.align || (overImage ? "left" : "center")
  const fade=p.fade ?? overImage
  const aspect=aspectCss(p.aspect) ?? (variant === "tile" ? "1 / 1" : undefined)
  const style:CSSProperties={...themeButtonStyle(theme),...buttonHoverVars(theme),...colors,borderRadius:radius,textAlign,overflow:"hidden",position:"relative",width:"100%",padding:0,...(p.shadow?{boxShadow:"var(--op-block-shadow)"}:{})}
  const column=overImage || variant === "profile"
  const align=textAlign==="center"?"center":textAlign==="right"?"flex-end":"flex-start"
  /* Round AR3, the owner: "be able to select how I want the image to show, cover, fit, full". Cover crops to the card, Fit shows all of it on the card's colour, Full is the picture's own shape. */
  const fit=d.display_mode === "contain" || d.display_mode === "full" ? d.display_mode : "cover"
  const fitClass=fit === "contain" ? "object-contain" : "object-cover"
  const fullOver=fit === "full" && overImage && !native && !!image
  return <div data-visual-link={variant} data-link-fade={fade && !native ? "" : undefined} className="h-full min-w-0">
    {native && social.platform === "Instagram" ? <div data-native-social="Instagram"><CompactInstagramPost src={social.embed} title={`${social.platform}: ${d.label ?? "Media"}`} radius={radius}/></div> : native ? <div data-native-social={social.platform} className="overflow-hidden rounded-t-[inherit]" style={{borderRadius:`${radius}px`,aspectRatio:aspectCss(p.aspect) ?? social.aspect,height:p.aspect?undefined:social.height,maxHeight:social.platform==="Instagram"||social.platform==="TikTok"?380:embedIsTool(social.platform)?720:560,background:theme.button_color}}>
      {/* Round AR3: a form or a booking page is filled in inside its frame, so forms are allowed there. */}
      <iframe loading="lazy" title={`${social.platform}: ${d.label ?? "Media"}`} src={social.embed} className="h-full w-full border-0" allow="encrypted-media; fullscreen; picture-in-picture; clipboard-write" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox={embedIsTool(social.platform) ? "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms" : "allow-scripts allow-same-origin allow-popups allow-presentation"} />
    </div> : null}
    <a href={d.url} target={d.action?.type==="phone"||d.action?.type==="email"?undefined:"_blank"} rel="noopener noreferrer" onClick={onClick} className="op-btn group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" style={style} data-hover={buttonHover(theme,true)} data-shadow={buttonShadow(theme)} data-visual-link-action="">
      {variant === "image-first" && image && !native ? <span className="relative block w-full" data-picture-fit={fit} style={{aspectRatio:fit === "full" ? undefined : aspect ?? "16 / 9"}}>
        <CardMedia key={image} src={onePageImageSrc(image,960)!} width={1200} height={675} className={fit === "full" ? "relative block h-auto w-full" : "absolute inset-0 h-full w-full " + fitClass} />
        {fade ? <span aria-hidden data-image-fade="" className="absolute inset-0" style={{background:footFade(String(colors.background ?? style.background ?? surface))}} /> : null}
      </span> : null}
      {fullOver ? <span aria-hidden className="relative block w-full" data-picture-fit="full">
        <CardMedia key={image} src={onePageImageSrc(image,960)!} width={1200} height={800} className="relative block h-auto w-full" />
      </span> : null}
      <span className={fullOver ? "absolute inset-0 flex min-w-0" : "relative flex w-full min-w-0"} data-picture-fit={overImage && !native && image ? fit : undefined} style={{minHeight:native||fullOver||aspect&&overImage?undefined:minimum,aspectRatio:overImage&&!native&&!fullOver?aspect:undefined,padding:p.padding??(variant==="compact"?14:22),gap:p.gap??12,flexDirection:column?"column":"row",alignItems:column?(variant==="profile"?"center":align):"center",justifyContent:overImage?(p.position==="top"?"flex-start":p.position==="center"?"center":"flex-end"):variant==="profile"?"center":align}}>
        {overImage && !native ? <>
          {image && !fullOver ? <CardMedia key={image} src={onePageImageSrc(image,960)!} width={1200} height={800} className={"absolute inset-0 h-full w-full " + fitClass} /> : null}
          {fade ? <span aria-hidden data-image-fade="" className="absolute inset-0" style={{background:shade(p)}} /> : null}
        </> : null}
        {variant==="profile" && !native ? (image ? <CardMedia key={image} src={onePageImageSrc(image,192)!} width={72} height={72} className="relative z-[1] h-[72px] w-[72px] shrink-0 rounded-full object-cover" /> : iconNode) : variant==="compact" && image && !native ? <CardMedia key={image} src={onePageImageSrc(image,96)!} width={48} height={48} className={"relative z-[1] h-12 w-12 shrink-0 rounded-lg " + fitClass} /> : iconNode}{words}
      </span>
    </a>
  </div>
}
export type { BlockPresentation }

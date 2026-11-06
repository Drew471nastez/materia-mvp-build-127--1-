import assert from "node:assert/strict"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { presentationOf, socialPresentation, safeCardMedia, presentationVars, PRESENTABLE_BLOCKS } from "../lib/onepage/block-presentation"
import { BlockPresentationFrame, VisualLinkCard } from "../components/onepage/block-presentation"
import { defaultTheme, type OnePageBlock } from "../lib/onepage/types"
import { blockLayoutOf, pairLinkTiles } from "../lib/onepage/theme-layout"
import { execFileSync } from "node:child_process"
import { stripResolved } from "../lib/onepage/storelib-blocks"

const block:OnePageBlock={id:"link",type:"link_button",enabled:true,sort_order:0,data:{label:"Book a session",url:"https://example.com"}}
assert.deepEqual(presentationOf(block),{})
assert.deepEqual(presentationOf(null),{})
assert.equal(renderToStaticMarkup(React.createElement(BlockPresentationFrame,{block,children:React.createElement("a",{href:"https://example.com"},"Legacy")})), '<a href="https://example.com">Legacy</a>',"Unconfigured existing blocks keep identical markup")
const styled:OnePageBlock={...block,style:{presentation:{subtitle:"A plan for you",variant:"featured",size:"half",align:"left",title_size:24,subtitle_color:"#eeeeee",image_url:"/cover.jpg",overlay:60}}}
const html=renderToStaticMarkup(React.createElement(VisualLinkCard,{block:styled,theme:defaultTheme,onClick:()=>{}}))
assert.ok(html.includes("A plan for you")&&html.includes('data-visual-link="featured"'))
assert.ok(html.includes('loading="lazy"')&&html.includes('width="1200"')&&html.includes('rel="noopener noreferrer"'))
assert.deepEqual(stripResolved([styled]),[styled],"Saving does not discard appearance or description")
assert.equal(presentationVars(presentationOf(styled))["--op-block-title-size" as keyof React.CSSProperties],"24px")
assert.equal(blockLayoutOf({block_layout:"masonry"}),"masonry")
assert.equal(pairLinkTiles([styled,block],"grid").length,2,"Individually sized blocks are never swallowed by legacy pairing")
const hostile={...block,style:{presentation:{title_size:10000,overlay:-2,image_url:"javascript:alert(1)",title_color:"red;position:fixed",size:"broken"}}} as unknown as OnePageBlock
assert.equal(presentationOf(hostile).title_size,40)
assert.equal(presentationOf(hostile).overlay,0)
assert.equal(presentationOf(hostile).image_url,undefined)
assert.equal(presentationOf(hostile).title_color,undefined)
assert.equal(presentationOf(hostile).size,undefined)
for(const bad of ["javascript:alert(1)","//evil.example/pic","data:text/html,hello"]) assert.equal(safeCardMedia(bad),undefined)
const urls=["https://youtu.be/dQw4w9WgXcQ","https://www.instagram.com/reel/ABC_def/","https://www.tiktok.com/@creator/video/1234567890123456789","https://open.spotify.com/intl-ro/track/abc123","https://soundcloud.com/artist/song"]
for(const url of urls) {
 const social=socialPresentation(url);assert.ok(social,url)
 const card={...styled,data:{label:"Watch",url},style:{presentation:{media_mode:"native" as const}}}
 const markup=renderToStaticMarkup(React.createElement(VisualLinkCard,{block:card,theme:defaultTheme,onClick:()=>{}}))
 assert.ok(markup.includes("iframe")&&markup.includes('loading="lazy"')&&markup.includes('href="'+url+'"'),"Native embeds retain an accessible link when a provider is unavailable")
}
for(const bad of ["https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ","javascript://youtube.com/watch?v=dQw4w9WgXcQ","https://instagram.com/p/../../bad", "https://tiktok.com/@x/video/not-an-id"])assert.equal(socialPresentation(bad),null)
for(const type of ["product","calendly","pdf_document","music","course","email_capture","link_button"])assert.ok(PRESENTABLE_BLOCKS.has(type))
execFileSync(process.execPath,["scripts/check-onepage-product-captions.mjs"],{stdio:"inherit"})
console.log("Modern blocks: legacy markup, descriptions, safe media, native social embeds, mixed sizes and save preservation passed")

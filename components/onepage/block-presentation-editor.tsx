"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import type { OnePageBlock } from "@/lib/onepage/types"
import { PRESENTABLE_BLOCKS, presentationOf, socialPresentation, type BlockPresentation } from "@/lib/onepage/block-presentation"
import { uploadOnePageMedia } from "@/lib/onepage/media-upload"

const field="w-full min-w-0 rounded-lg border border-[#e3e4e8] bg-white px-3 py-2 text-sm text-[#1a1a2e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
function Field({label,children}:{label:string;children:ReactNode}) {return <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-[#4b5563]">{label}{children}</label>}
export function BlockPresentationEditor({block,onChange,getBlock}:{block:OnePageBlock;getBlock?:()=>OnePageBlock|undefined;onChange:(updates:Partial<OnePageBlock>)=>void}) {
  const latest=useRef(block);latest.current=block
  const upload=useRef<AbortController|null>(null)
  useEffect(()=>()=>{upload.current?.abort()},[])
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
  if (!PRESENTABLE_BLOCKS.has(block.type)) return null
  const p=presentationOf(block)
  const current=()=>getBlock?.() || latest.current
  const set=(patch:Partial<BlockPresentation>)=>{const source=current();onChange({style:{...source.style,presentation:{...source.style?.presentation,...patch}}})}
  const select=(label:string,key:keyof BlockPresentation,values:readonly string[],labels?:readonly string[])=><Field label={label}><select className={field} value={String(p[key]??"")} onChange={e=>set({[key]:e.target.value||undefined})}><option value="">Page default</option>{values.map((value,i)=><option key={value} value={value}>{labels?.[i]||value}</option>)}</select></Field>
  const numeric=(label:string,key:keyof BlockPresentation,min:number,max:number)=><Field label={label}><input className={field} type="number" min={min} max={max} placeholder="Auto" value={typeof p[key]==="number"?String(p[key]):""} onChange={e=>set({[key]:e.target.value===""?undefined:Math.max(min,Math.min(max,Number(e.target.value)))})} /></Field>
  const color=(label:string,key:keyof BlockPresentation)=><Field label={label}><span className="flex items-center gap-2"><input aria-label={label} className="h-9 w-12 rounded border bg-white" type="color" value={String(p[key]||"#111111").slice(0,7)} onChange={e=>set({[key]:e.target.value})} /><button type="button" className="text-xs underline" onClick={()=>set({[key]:undefined})}>Reset</button></span></Field>
  const url=(block.data as {url?:string}).url||""
  return <details className="rounded-xl border border-[#e3e4e8] bg-white p-3" data-block-appearance="">
    <summary className="cursor-pointer text-sm font-semibold text-[#1a1a2e]">Appearance & description</summary>
    <div className="mt-4 space-y-4">
      <Field label="Subtitle / description"><textarea data-block-description="" className={field} rows={2} maxLength={600} value={p.subtitle||""} placeholder="Add a little more detail" onChange={e=>set({subtitle:e.target.value})} /></Field>
      <div className="grid grid-cols-2 gap-3">
        {select("Block size","size",["auto","full","half","tall"],["Automatic","Full width","Half width","Tall tile"])}
        {select("Text alignment","align",["left","center","right"],["Left","Center","Right"])}
        {numeric("Title size","title_size",12,40)}
      </div>
      <Field label="Title weight"><select className={field} value={p.title_weight??""} onChange={e=>set({title_weight:e.target.value?Number(e.target.value):undefined})}><option value="">Page default</option><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></select></Field>
      <div className="grid grid-cols-2 gap-3">
        {color("Title color","title_color")}{color("Subtitle color","subtitle_color")}
        {numeric("Subtitle size","subtitle_size",11,24)}{numeric("Icon size","icon_size",16,48)}
        {color("Icon color","icon_color")}{numeric("Content spacing","gap",0,24)}
        {numeric("Inner padding","padding",8,40)}
      </div>
      {block.type==="link_button" ? <>
        {select("Card presentation","variant",["original","visual","image-first","featured","compact"],["Classic button","Image background","Image-first tile","Featured card","Compact list row"])}
        {socialPresentation(url)?select("Social presentation","media_mode",["card","native"],["Link card","Native embed"]):null}
        {select("Text position","position",["top","center","bottom"],["Top","Middle","Bottom"])}
        <Field label="Background image URL"><input aria-label="Background image URL" className={field} type="url" placeholder="https://" value={block.style?.presentation?.image_url||""} onChange={e=>set({image_url:e.target.value})}/></Field>
        <Field label={busy?"Uploading image…":"Upload a background image"}><input className="text-xs" type="file" accept="image/*" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;setBusy(true);setError(null);const controller=new AbortController();upload.current=controller;try {const result=await uploadOnePageMedia(file,{prefix:"link-card",want:"image",signal:controller.signal});if(controller.signal.aborted)return;set({image_url:result.url,variant:current().style?.presentation?.variant||"visual"})}catch(err){if(controller.signal.aborted)return;setError(err instanceof Error?err.message:"Image could not be uploaded")}finally{if(upload.current===controller)setBusy(false)}}}/></Field>
        {error?<p role="alert" className="text-xs text-red-700">{error}</p>:null}
        {numeric("Dark overlay (%)","overlay",0,90)}
        <div className="grid grid-cols-2 gap-3">{color("Gradient start","gradient_from")}{color("Gradient end","gradient_to")}</div>
      </>:null}
      <button type="button" className="text-xs font-medium underline" onClick={()=>{upload.current?.abort();setBusy(false);setError(null);onChange({style:{...current().style,presentation:undefined}})}}>Reset block appearance</button>
    </div>
  </details>
}

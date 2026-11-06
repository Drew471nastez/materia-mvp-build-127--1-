/** Actual product renderer: subtitles appear once in every existing layout. */
import {build} from 'esbuild'
import {createRequire} from 'node:module'
const source=`
import assert from "node:assert/strict"
import React from "react"
import {renderToStaticMarkup} from "react-dom/server"
import {OnePageProductBlock} from "@/components/onepage/product-block"
import {defaultTheme, type OnePageBlock} from "@/lib/onepage/types"
const block:OnePageBlock={id:"product",type:"product",enabled:true,sort_order:0,data:{product_id:"product",cta_text:"Get plan",show_price:true,show_description:true,style:"callout"}}
for(const style of ["button","callout","preview","row","side","minimal","overlay","tile"] as const) {
 const product:OnePageBlock={...block,type:"product",data:{product_id:"product",product_title:"Coaching",product_price:1200,cta_text:"Get plan",show_price:true,show_description:true,style},style:{presentation:{subtitle:"Your unique plan"}}}
 const markup=renderToStaticMarkup(React.createElement(OnePageProductBlock,{block:product,theme:defaultTheme,seller:{name:"Coach",avatarUrl:null},pageMoney:c=>String(c),plainText:t=>t||"",trackClick:()=>{},animationClass:"",quick:null}))
 assert.equal((markup.match(/Your unique plan/g)||[]).length,1,style+": the subtitle renders once, inside the product")
}

console.log("Product subtitles render once in all eight layouts")
`
const result=await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',logLevel:'warning',plugins:[{name:'server-boundary',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'',loader:'js'}))}}]})
const module={exports:{}}
new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports)

(function(){if(!('IntersectionObserver' in window)||!Element.prototype.getAnimations)return;var seen=new WeakSet();
function looping(s){var out=[],list;try{list=s.getAnimations({subtree:true})}catch(x){return out}for(var i=0;i < list.length;i++){var a=list[i],t=a.effect&&a.effect.getTiming?a.effect.getTiming():null;if(t&&t.iterations===Infinity)out.push(a)}return out}
var due=new Set(),frame=0;
function flush(){frame=0;var jobs=[];due.forEach(function(s){if(s.__slOn===true&&!s.__slHas)return;jobs.push([s,s.__slOn!==false])});due.clear();
var lists=jobs.map(function(j){return looping(j[0])});
for(var k=0;k < jobs.length;k++){var on=jobs[k][1],list=lists[k];jobs[k][0].__slHas=0;for(var i=0;i < list.length;i++){var a=list[i];if(on){if(a.__slHeld){a.__slHeld=0;a.play()}}else{if(a.playState==='running'){a.__slHeld=1;a.pause()}if(a.__slHeld)jobs[k][0].__slHas=1}}}}
function sweep(s){due.add(s);if(!frame)frame=requestAnimationFrame(flush)}
var io=new IntersectionObserver(function(es){for(var i=0;i < es.length;i++){var e=es[i];e.target.__slOn=e.isIntersecting;sweep(e.target)}},{rootMargin:'200px 0px'});
function watch(){var ss=document.querySelectorAll('main .shopify-section');for(var i=0;i < ss.length;i++){if(!seen.has(ss[i])){seen.add(ss[i]);io.observe(ss[i])}}}
watch();document.addEventListener('DOMContentLoaded',watch,{once:true});
document.addEventListener('animationstart',function(e){var s=e.target&&e.target.closest&&e.target.closest('main .shopify-section');if(s&&s.__slOn===false)sweep(s)},true);
['storelib:section-load','shopify:section:load'].forEach(function(n){document.addEventListener(n,function(e){var s=e.target&&e.target.closest?e.target.closest('main .shopify-section'):null;if(s){io.unobserve(s);seen.delete(s)}watch()})});})();
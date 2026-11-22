(function(){var painted=false,rm=false;try{rm=matchMedia('(prefers-reduced-motion: reduce)').matches;requestAnimationFrame(function(){requestAnimationFrame(function(){painted=true})})}catch(e){painted=true}
var seen={};function op(e){return parseFloat(getComputedStyle(e).opacity)}
function show(i,fresh){if(!i||i.tagName!=='IMG'||i.__mtShown||!i.classList.contains('bls-loading-image'))return;i.__mtShown=1;var u=i.currentSrc||i.src;if(seen[u])fresh=false;seen[u]=1;
var fade=fresh&&painted&&!rm&&i.animate&&i.naturalWidth>1&&i.style.opacity===''&&!i.hasAttribute('data-no-fade');var r;if(fade){r=i.getBoundingClientRect();fade=r.width>=48&&r.height>=48&&r.bottom>0&&r.top<innerHeight&&op(i)<0.5}
i.classList.remove('bls-loading-image');var m=i.closest&&i.closest('motion-element.bls-loading-image');if(m)m.classList.remove('bls-loading-image');
if(fade&&op(i)>0.5)try{i.animate([{opacity:0},{opacity:1}],{duration:280,easing:'cubic-bezier(.2,.7,.2,1)'})}catch(e){}}
document.addEventListener('load',function(e){show(e.target,true)},true);
document.addEventListener('DOMContentLoaded',function(){var l=document.querySelectorAll('img.bls-loading-image');for(var k=0;k<l.length;k++)if(l[k].complete&&l[k].naturalWidth>0)show(l[k],false)},{once:true});})();
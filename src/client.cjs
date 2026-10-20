const sheetCache=new Map();
function selectedSkin(id) {return SKINS.find(skin=>skin.id===id)||SKINS[0];}
function loadSpriteSheet(skin) {
  if(sheetCache.has(skin.id))return sheetCache.get(skin.id);
  const promise=new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>{
      try {
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
        const pixels=context.getImageData(0,0,image.width,image.height).data;
        resolve({image,...spriteGeometry(image.width,image.height,pixels,skin)});
      } catch(error){reject(error);}
    };image.onerror=()=>reject(Error('角色素材加载失败'));image.src=skin.imageData;
  });sheetCache.set(skin.id,promise);return promise;
}
function Sprite({frame,size=128,skin,pixelated=false}) {
  const canvas=React.useRef(null);const [loaded,setLoaded]=React.useState(null);const [failed,setFailed]=React.useState(false);
  React.useEffect(()=>{let active=true;setFailed(false);loadSpriteSheet(skin).then(sheet=>{if(active)setLoaded({id:skin.id,sheet});},()=>{if(active)setFailed(true);});return()=>{active=false;};},[skin]);
  const ratio=pixelated?1:Math.max(1,Math.ceil(size*(window.devicePixelRatio||1)/skin.rendering.logicalSize));
  const logical=skin.rendering.logicalSize*ratio;
  React.useLayoutEffect(()=>{
    if(!canvas.current)return;
    const ctx=canvas.current.getContext('2d');ctx.imageSmoothingEnabled=!pixelated;ctx.imageSmoothingQuality='high';ctx.clearRect(0,0,logical,logical);
    if(loaded?.id!==skin.id)return;
    const {sheet}=loaded,cell=sheet.cells[frame],scale=sheet.scale*ratio;if(!cell)return;
    const align=value=>pixelated?Math.round(value):value;
    ctx.drawImage(sheet.image,cell.sx,cell.sy,cell.cw,cell.ch,align(logical/2-cell.anchor*scale),align(skin.rendering.baseline*ratio-cell.bottom*scale),align(cell.cw*scale),align(cell.ch*scale));
  },[loaded,frame,skin,logical,ratio,pixelated]);
  return failed?h('span',{className:'aq-fallback','aria-hidden':true,style:{width:size,height:size,fontSize:size/2,lineHeight:size+'px'}},'🐋'):h('canvas',{ref:canvas,width:logical,height:logical,style:{width:size,height:size,imageRendering:pixelated?'pixelated':'auto'},className:'aq-sprite','aria-hidden':true});
}
function useAnimation(mode,paused,skin) {
  const timeline=React.useRef(null);
  if(!timeline.current||timeline.current.skin!==skin)timeline.current=new SpriteTimeline(mode,skin);
  const [snapshot,setSnapshot]=React.useState(()=>({skin,frame:timeline.current.frame}));
  timeline.current.request(mode);
  React.useEffect(()=>{
    setSnapshot({skin,frame:timeline.current.frame});if(paused)return;
    let timer;let active=true;
    const tick=()=>{if(!active)return;setSnapshot({skin,frame:timeline.current.tick()});timer=setTimeout(tick,timeline.current.delay);};
    timer=setTimeout(tick,timeline.current.delay);return()=>{active=false;clearTimeout(timer);};
  },[paused,skin]);
  return snapshot.skin===skin?snapshot.frame:timeline.current.frame;
}
function useHiddenDocument() {
  const [hidden,setHidden]=React.useState(()=>document.hidden);
  React.useEffect(()=>{const change=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
  return hidden;
}
function useViewport() {
  const read=()=>({width:window.innerWidth,height:window.innerHeight});const [viewport,setViewport]=React.useState(read);
  React.useEffect(()=>{const change=()=>setViewport(read());window.addEventListener('resize',change);return()=>window.removeEventListener('resize',change);},[]);
  return viewport;
}
function usePreferences(preferences) {return React.useSyncExternalStore(preferences.subscribe,preferences.getSnapshot,preferences.getSnapshot);}
function AnimatedPet({mode='idle',paused=false,size=128,skin,pixelated=false}) {
  const hidden=useHiddenDocument();const frame=useAnimation(mode,paused||hidden,skin);
  return h('div',{className:'aq-character','data-mode':mode,role:'img','aria-label':skin.name+'，'+LABELS[mode]},h(Sprite,{frame,size,skin,pixelated}));
}
function Aquarium({preferences,activity,desktop}) {
  const prefs=usePreferences(preferences);const state=React.useSyncExternalStore(activity.subscribe,activity.getSnapshot,activity.getSnapshot);
  const native=React.useSyncExternalStore(desktop.subscribe,desktop.getSnapshot,desktop.getSnapshot);
  const drag=React.useRef(null);const [moving,setMoving]=React.useState(null);
  const viewport=useViewport();const side=Math.min(prefs.size,Math.max(32,viewport.width-16),Math.max(32,viewport.height-64));
  const top=(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-chrome-top'))||0)+12;
  const position=clampPosition(moving||prefs.position,viewport,{width:side,height:side},top);
  if(!prefs.visible||native.active)return null;
  const down=event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,y:event.clientY,position};};
  const move=event=>{if(!drag.current)return;setMoving({x:drag.current.position.x+event.clientX-drag.current.x,y:drag.current.position.y+event.clientY-drag.current.y});};
  const end=event=>{if(!drag.current)return;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);preferences.update({position});drag.current=null;setMoving(null);};
  return h('div',{className:'aq-widget',style:{left:position.x,top:position.y,width:side,height:side},onPointerDown:down,onPointerMove:move,onPointerUp:end,onPointerCancel:end,'data-state':state.mode},h(AnimatedPet,{mode:state.mode,paused:prefs.paused,size:side,skin:selectedSkin(prefs.skin),pixelated:prefs.pixelated}));
}
function AquariumSettings({preferences}) {
  const prefs=usePreferences(preferences);const [mode,setMode]=React.useState('idle');const sizeId=React.useId();
  const [sizeDraft,setSizeDraft]=React.useState(String(prefs.size));
  React.useEffect(()=>setSizeDraft(String(prefs.size)),[prefs.size]);
  const changeSize=event=>{const value=event.target.valueAsNumber;if(Number.isFinite(value))preferences.update({size:value});};
  const commitSize=()=>{
    const value=Number(sizeDraft);if(sizeDraft.trim()&&Number.isFinite(value))preferences.update({size:value});
    setSizeDraft(String(preferences.getSnapshot().size));
  };
  return h('section',{className:'aq-settings','aria-label':'DSH桌宠设置'},h('h1',null,'DSH桌宠'),
    h('div',{className:'aq-preview'},h(AnimatedPet,{mode,paused:prefs.paused,size:128,skin:selectedSkin(prefs.skin),pixelated:prefs.pixelated}),h('span',null,LABELS[mode])),
    h('div',{className:'aq-demo-modes','aria-label':'动作预览'},...Object.entries(LABELS).map(([key,label])=>h('button',{key,type:'button','aria-pressed':mode===key,onClick:()=>setMode(key)},label))),
    h('div',{className:'aq-options'},
      SKINS.length>1?h('label',{className:'aq-option-row'},h('span',null,'桌宠样式'),h('select',{value:selectedSkin(prefs.skin).id,onChange:event=>preferences.update({skin:event.target.value})},...SKINS.map(skin=>h('option',{key:skin.id,value:skin.id},skin.name)))):null,
      h('label',{className:'aq-option-row'},h('span',null,'显示桌宠'),h('input',{type:'checkbox',checked:prefs.visible,onChange:event=>preferences.update({visible:event.target.checked})})),
      h('div',{className:'aq-option-row aq-size-row'},h('label',{htmlFor:sizeId},'桌宠大小'),h('div',{className:'aq-size-controls'},h('input',{id:sizeId,type:'range',min:64,max:320,step:1,value:prefs.size,onChange:changeSize,'aria-label':'桌宠大小'}),h('input',{type:'number',min:64,max:320,step:1,value:sizeDraft,onChange:event=>setSizeDraft(event.target.value),onBlur:commitSize,onKeyDown:event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}},'aria-label':'桌宠大小数值'}),h('span',null,'px'))),
      h('label',{className:'aq-option-row'},h('span',null,'暂停动画'),h('input',{type:'checkbox',checked:prefs.paused,onChange:event=>preferences.update({paused:event.target.checked})})),
      h('label',{className:'aq-option-row'},h('span',null,'像素化'),h('input',{type:'checkbox',checked:prefs.pixelated,onChange:event=>preferences.update({pixelated:event.target.checked})}))),
    preferences.error?h('p',{role:'status',className:'aq-description'},preferences.error):null);
}
// DSH 0.2 has a fixed nav glyph map. Give only this settings row a paw glyph.
function settingsNavIcon() {
  const mark=()=>{
    for(const button of document.querySelectorAll('[data-shortcut-modal="settings"] nav button'))if(button.querySelector('span')?.textContent==='DSH桌宠')button.setAttribute('data-dsh-pet-nav','');
  };
  const observer=new MutationObserver(mark);observer.observe(document.body,{childList:true,subtree:true});mark();
  return()=>{observer.disconnect();for(const button of document.querySelectorAll('[data-dsh-pet-nav]'))button.removeAttribute('data-dsh-pet-nav');};
}
const inject=['slots','sessions','uiSession','connection','remote'];
async function apply(ctx) {
  if(ctx.remote)await mountDesktopRemote(ctx);
  ctx.effect(()=>{const style=document.createElement('style');style.dataset.plugin=AQUARIUM_ID;style.textContent=AQUARIUM_CSS;document.head.appendChild(style);return()=>style.remove();});
  let storage;try{storage=window.localStorage;}catch{}
  const preferences=new Preferences(storage,window);const activity=new ActivityController(ctx);
  const desktop=new DesktopBridge(ctx,preferences,activity);
  ctx.effect(()=>()=>{desktop.dispose();activity.dispose();preferences.dispose();});ctx.effect(settingsNavIcon);
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:AQUARIUM_ID,order:40,inject:()=>({preferences,activity,desktop})},Aquarium));
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'dsh-aquarium-settings',order:4,label:'DSH桌宠',inject:()=>({preferences})},AquariumSettings));
}
module.exports={apply,inject,Preferences,ActivityController,DesktopBridge,Aquarium,AquariumSettings,AnimatedPet,Sprite,loadSpriteSheet,selectedSkin};

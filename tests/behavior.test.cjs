const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {TurnActivity,activityState,normalizePreferences,clampPosition,STORAGE_KEY}=require('../src/core.cjs');
const {SpriteTimeline,spriteGeometry}=require('../src/core.cjs');
const skin=require('../skins/whale-girl/skin.json');
const {validateSkin,loadSkins}=require('../scripts/skin-loader.cjs');
const client=fs.readFileSync(path.join(__dirname,'../lib/client.js'),'utf8');
function exportsOf(extra={}) {
  let result;
  const sandbox={setTimeout,clearTimeout,setInterval,clearInterval,...extra,window:{addEventListener(){},removeEventListener(){},__ModuleLoader__:{load({factory}){result=factory(name=>{assert.equal(name,'react');return {createElement:()=>null};});}},...extra.window}};
  vm.runInNewContext(client,sandbox,{filename:'client.js'});
  return result;
}
function source(value) {
  const listeners=new Set();
  return {getSnapshot:()=>value,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},set(next){value=next;for(const listener of [...listeners]) listener();},get count(){return listeners.size;}};
}
let seq=0;
const event=(type,data={},turn=1)=>({type:'event',event:{type,seq:++seq,data:{turn,...data}}});
function fixture() {
  const session=source({running:false});
  const eventSource=source({entries:[],change:{kind:'replace',entries:[]}});
  const binding={sessionId:'a',session,eventSource};
  const current=source({key:'a'}),statuses=source(new Map()),list=source({byId:{a:{id:'a'}}}),generation=source({id:1});
  const ctx={sessions:{list,binding:id=>id==='a'?binding:undefined},uiSession:{current,sessionStatus:statuses},connection:{generation}};
  const {ActivityController}=exportsOf();
  const controller=new ActivityController(ctx);
  const append=e=>eventSource.set({entries:[...eventSource.getSnapshot().entries,e],change:{kind:'append',entries:[e]}});
  return {ctx,controller,binding,current,statuses,list,generation,append};
}
test('reasoning, text, parallel tools, and the next step have distinct states',()=>{
  const turn=new TurnActivity();const state=()=>activityState({session:{running:true},turn});
  turn.accept(event('turn/start'));assert.equal(state(),'thinking');
  turn.accept(event('assistant/live-chunk',{chunk:{type:'text-delta'}}));assert.equal(state(),'generating');
  turn.accept(event('assistant/message',{message:{content:[{type:'tool-call',id:'x'},{type:'tool-call',id:'y'}]}}));
  turn.accept(event('tool/call',{callId:'x'}));assert.equal(state(),'tool');
  turn.accept(event('tool/result',{message:{source:{callId:'x'}}}));assert.equal(state(),'tool');
  turn.accept(event('tool/result',{message:{source:{callId:'y'}}}));assert.equal(state(),'thinking');
  turn.accept(event('assistant/live-chunk',{chunk:{type:'reasoning-delta'}}));assert.equal(state(),'thinking');
  turn.accept(event('step/end'));assert.equal(turn.calls.size,0);
});
test('waiting and offline outrank live activity; stopped errors are distinct',()=>{
  const turn=new TurnActivity();
  assert.equal(activityState({session:{running:true},status:{pendingInteraction:{}},turn}),'waiting');
  assert.equal(activityState({connected:false,session:{running:true},status:{pendingInteraction:{}},turn}),'offline');
  assert.equal(activityState({session:{running:false,promptError:{}},turn}),'error');
  assert.equal(activityState({session:{running:false},feedback:'complete',turn}),'complete');
  assert.equal(activityState({session:{removed:true},feedback:'complete',turn}),'idle');
});
test('replay follows only the newest turn and ignores late old-turn frames',()=>{
  const turn=new TurnActivity();
  turn.replay([event('turn/start',{},1),event('tool/call',{callId:'old'},1),event('turn/end',{reason:{kind:'error'}},1),event('turn/start',{},2),event('assistant/live-chunk',{chunk:{type:'text-delta'}},2)]);
  assert.equal(turn.phase,'generating');assert.equal(turn.calls.size,0);assert.equal(turn.ended,null);
  turn.accept(event('tool/call',{callId:'late'},1));assert.equal(turn.calls.size,0);
});
test('the controller uses borrowed current bindings and responds without polling',()=>{
  const f=fixture();try {
    f.binding.session.set({running:true});assert.equal(f.controller.getSnapshot().mode,'thinking');
    f.append(event('turn/start'));f.append(event('assistant/live-chunk',{chunk:{type:'text-delta'}}));assert.equal(f.controller.getSnapshot().mode,'generating');
    f.statuses.set(new Map([['a',{running:true,pendingInteraction:{}}]]));assert.equal(f.controller.getSnapshot().mode,'waiting');
    f.generation.set(undefined);assert.equal(f.controller.getSnapshot().mode,'offline');
  } finally {f.controller.dispose();}
});
test('completion celebrates only a live completed turn, and cancellation stays idle',()=>{
  const f=fixture();try {
    f.binding.session.set({running:true});f.append(event('turn/start'));
    f.append(event('turn/end',{reason:{kind:'completed'}}));f.binding.session.set({running:false});
    assert.equal(f.controller.getSnapshot().mode,'complete');
    f.append(event('turn/start',{},2));f.binding.session.set({running:true});
    f.append(event('turn/end',{reason:{kind:'interrupted'}},2));f.binding.session.set({running:false});
    assert.equal(f.controller.getSnapshot().mode,'idle');
  } finally {f.controller.dispose();}
});
test('opening history, paging backwards, and reconnecting do not celebrate past work',()=>{
  const f=fixture();try {
    const entries=[event('turn/start'),event('turn/end',{reason:{kind:'completed'}})];
    f.binding.eventSource.set({entries,change:{kind:'replace',entries}});assert.equal(f.controller.getSnapshot().mode,'idle');
    f.binding.eventSource.set({entries:[event('turn/start',{},0),...entries],change:{kind:'prepend',entries:[]}});assert.equal(f.controller.getSnapshot().mode,'idle');
    f.generation.set(undefined);f.generation.set({id:2});assert.equal(f.controller.getSnapshot().mode,'idle');
  } finally {f.controller.dispose();}
});
test('switching sessions clears feedback, borrowed subscriptions, and pending timers',()=>{
  const f=fixture();
  f.binding.session.set({running:true});f.append(event('turn/start'));f.append(event('turn/end',{reason:{kind:'completed'}}));f.binding.session.set({running:false});
  f.current.set({key:undefined});assert.equal(f.controller.getSnapshot().mode,'idle');assert.equal(f.binding.eventSource.count,0);assert.equal(f.binding.session.count,0);
  f.controller.dispose();
  for(const s of [f.current,f.statuses,f.list,f.generation]) assert.equal(s.count,0);
  assert.equal(f.controller.feedbackTimer,null);
});
test('the fixed corner position stays inside resized windows',()=>{
  assert.deepEqual(clampPosition({x:9999,y:9999},{width:420,height:500},{width:268,height:248},48),{x:144,y:244});
  assert.deepEqual(clampPosition({x:-50,y:-50},{width:420,height:500},{width:76,height:76},48),{x:8,y:48});
  assert.equal(normalizePreferences({position:{x:'42',y:NaN},visible:'no'}).size,128);
  assert.equal(normalizePreferences({visible:'no'}).visible,true);
});
test('preferences persist, reject corrupt storage, and recover from unavailable storage',()=>{
  const {Preferences}=exportsOf();let saved=null;
  const storage={getItem:()=>saved,setItem:(key,value)=>{assert.equal(key,STORAGE_KEY);saved=value;}};
  const prefs=new Preferences(storage);prefs.update({paused:true,size:173});
  const restored=new Preferences(storage);assert.equal(restored.getSnapshot().paused,true);assert.equal(restored.getSnapshot().size,173);
  storage.setItem=()=>{throw Error('unavailable');};prefs.update({size:212});assert.equal(prefs.getSnapshot().size,212);assert.ok(prefs.error);
  saved='{bad';assert.equal(new Preferences(storage).getSnapshot().visible,true);
  prefs.dispose();restored.dispose();
});
test('cross-window preferences follow storage updates, including reset',()=>{
  const {Preferences}=exportsOf();let listener;let removed=false;
  const events={addEventListener:(name,fn)=>{listener=fn;},removeEventListener:()=>{removed=true;}};
  const prefs=new Preferences(null,events);
  listener({key:STORAGE_KEY,newValue:'{"visible":false,"paused":true}'});assert.equal(prefs.getSnapshot().visible,false);
  listener({key:null,newValue:null});assert.equal(prefs.getSnapshot().visible,true);assert.equal(prefs.getSnapshot().paused,false);
  prefs.dispose();assert.equal(removed,true);
});
test('built lazy client registers public slots and unloads owned resources',async()=>{
  const styles=[];const effects=[];const slots=[];const f=fixture();f.controller.dispose();
  const {apply}=exportsOf({document:{body:{},querySelectorAll:()=>[],createElement:()=>({dataset:{},remove(){styles.pop();}}),head:{appendChild:style=>styles.push(style)}},MutationObserver:class{observe(){}disconnect(){}}});
  const ctx={...f.ctx,effect:fn=>{effects.push(fn());},slots:{inject:(name,fn)=>fn(),register:(options)=>{slots.push(options.name);}}};
  await apply(ctx);assert.equal(styles.length,1);assert.deepEqual(slots,['shell.overlay','settings.section']);
  for(const cleanup of effects.reverse()) cleanup();assert.equal(styles.length,0);assert.equal(f.current.count,0);assert.equal(f.binding.eventSource.count,0);
});
test('sprite actions return through neutral poses and coalesce rapid status changes',()=>{
  const timeline=new SpriteTimeline('tool',skin);timeline.tick();
  timeline.request('thinking');const held=timeline.frame;timeline.tick();assert.equal(timeline.frame,held);
  timeline.request('waiting');timeline.tick();assert.equal(timeline.frame,3);timeline.tick();assert.equal(timeline.frame,0);timeline.tick();
  assert.equal(timeline.mode,'waiting');assert.equal(timeline.frame,8);
});
test('completion plays once, settles, and can transition back to real activity',()=>{
  const timeline=new SpriteTimeline('complete',skin);for(let i=0;i<20;i++)timeline.tick();
  assert.equal(timeline.frame,0);assert.equal(timeline.done,true);
  timeline.request('thinking');for(let i=0;i<4;i++)timeline.tick();assert.equal(timeline.frame,4);assert.equal(timeline.done,false);
});
test('size preferences migrate from the old small mode and clamp invalid values',()=>{
  assert.equal(normalizePreferences({collapsed:true}).size,96);
  assert.equal(normalizePreferences({size:100.4}).size,100);
  assert.equal(normalizePreferences({size:9999}).size,320);
  assert.equal(normalizePreferences({size:-8}).size,64);
  assert.equal(normalizePreferences({size:NaN}).size,128);
  assert.deepEqual(normalizePreferences({position:{x:8,y:8},collapsed:true}).position,{x:8,y:8});
  assert.equal(normalizePreferences({}).pixelated,false);assert.equal(normalizePreferences({pixelated:true}).pixelated,true);
});
test('new skins can change grids, state mappings, timing, and transition poses without player edits',()=>{
  const custom=structuredClone(skin);custom.id='robot';custom.grid={columns:2,rows:2};custom.neutralFrame=3;custom.transition={frames:[2,3],ms:180};
  custom.actions={rest:{frames:[3,2],ms:400},work:{frames:[0,1],ms:120}};
  custom.states=Object.fromEntries(Object.keys(skin.states).map(state=>[state,state==='tool'?'work':'rest']));
  validateSkin(custom);const timeline=new SpriteTimeline('idle',custom);assert.equal(timeline.frame,3);assert.equal(timeline.delay,400);
  timeline.request('tool');timeline.tick();assert.equal(timeline.delay,180);timeline.tick();assert.equal(timeline.frame,2);timeline.tick();assert.equal(timeline.frame,3);timeline.tick();assert.equal(timeline.frame,0);assert.equal(timeline.delay,120);
});
test('skin validation catches missing actions, out-of-grid frames, and wrong image types before building',()=>{
  const bad=structuredClone(skin);bad.actions.tool.frames=[16];assert.throws(()=>validateSkin(bad),/invalid action tool/);
  const missing=structuredClone(skin);missing.states.waiting='not-there';assert.throws(()=>validateSkin(missing),/missing action/);
  const skins=loadSkins(path.resolve(__dirname,'..'));assert.equal(skins.length,1);assert.ok(skins[0].imageData.startsWith('data:image/png;base64,'));
});
test('sprite geometry supports uneven sheet dimensions and true transparent margins',()=>{
  const width=30,height=30;const pixels=new Uint8ClampedArray(width*height*4);
  for(let frame=0;frame<16;frame++) {
    const col=frame%4,row=Math.floor(frame/4),sx=Math.floor(col*width/4),sy=Math.floor(row*height/4);
    for(let y=sy+1;y<sy+5;y++)for(let x=sx+2;x<sx+5;x++)pixels[(y*width+x)*4+3]=255;
  }
  const geometry=spriteGeometry(width,height,pixels);
  assert.equal(geometry.cells.length,16);
  for(const cell of geometry.cells){assert.equal(cell.anchor,3);assert.equal(cell.bottom,4);assert.equal(cell.top,1);assert.ok(Number.isInteger(cell.sx));}
  assert.equal(geometry.cells[3].sx+geometry.cells[3].cw,width);
});
test('custom source boundaries keep adjacent poses out of each frame',()=>{
  const width=20,height=30,pixels=new Uint8ClampedArray(width*height*4);
  const definition={grid:{columns:1,rows:2,rowEdges:[0,18,30]},rendering:{height:12,anchor:'center'}};
  for(let y=2;y<17;y++)pixels[(y*width+10)*4+3]=255;
  for(let y=20;y<28;y++)pixels[(y*width+9)*4+3]=255;
  const cells=spriteGeometry(width,height,pixels,definition).cells;
  assert.equal(cells[0].ch,18);assert.equal(cells[0].bottom,16);assert.equal(cells[1].sy,18);assert.equal(cells[1].top,2);
  const bad=structuredClone(skin);bad.grid.rowEdges=[0,334,330,960,1254];assert.throws(()=>validateSkin(bad),/invalid rowEdges/);
});
test('desktop handoff hides the app overlay only after a successful native response and releases on unload',async()=>{
  const requests=[];const {DesktopBridge,Preferences}=exportsOf({window:{location:{protocol:'dsh-app:'},crypto:{randomUUID:()=> 'test'}}});
  const preferences=new Preferences(null);const activity=source({mode:'tool'});
  const ctx={remote:{desktopPet:{update:async input=>{requests.push(input);return {ok:true,value:{active:true}};},release:async input=>{requests.push({release:input});return {ok:true,value:{active:false}};}}}};
  const bridge=new DesktopBridge(ctx,preferences,activity);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bridge.getSnapshot().active,true);assert.equal(requests[0].prefs.pixelated,false);assert.equal(requests[0].mode,'tool');
  preferences.update({pixelated:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.at(-1).prefs.pixelated,true);
  bridge.dispose();preferences.dispose();assert.equal(requests.at(-1).release.clientId,bridge.id);
});

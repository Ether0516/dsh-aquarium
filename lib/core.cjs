const AQUARIUM_ID = 'dsh-aquarium';
const STORAGE_KEY = 'dsh-aquarium:v1';
const LABELS = Object.freeze({idle:'自在闲游',thinking:'潜心思考',generating:'正在回答',tool:'工具执行中',waiting:'等你确认',complete:'任务完成',error:'遇到问题',offline:'连接休息中'});
const DEFAULT_PREFS = Object.freeze({visible:true,size:128,paused:false,pixelated:false,skin:'whale-girl',position:null});
function spriteGeometry(width,height,pixels,definition={}) {
  const columns=definition.grid?.columns || 4,rows=definition.grid?.rows || 4;
  const rendering=definition.rendering || {};
  const cells=[];
  for(let frame=0;frame<columns*rows;frame++) {
    const col=frame%columns,row=Math.floor(frame/columns);
    const sx=definition.grid?.columnEdges?.[col] ?? Math.floor(col*width/columns);
    const sy=definition.grid?.rowEdges?.[row] ?? Math.floor(row*height/rows);
    const cw=(definition.grid?.columnEdges?.[col+1] ?? Math.floor((col+1)*width/columns))-sx;
    const ch=(definition.grid?.rowEdges?.[row+1] ?? Math.floor((row+1)*height/rows))-sy;
    let minX=cw,maxX=-1,minY=ch,maxY=-1,headX=0,headCount=0;
    for(let y=0;y<ch;y++) for(let x=0;x<cw;x++) {
      if(pixels[((sy+y)*width+sx+x)*4+3]<(rendering.alphaThreshold ?? 192)) continue;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      if(y<ch*.58){headX+=x;headCount++;}
    }
    const anchor=rendering.anchor==='center' ? (maxX>=0?(minX+maxX)/2:cw/2) : (headCount?headX/headCount:maxX>=0?(minX+maxX)/2:cw/2);
    cells.push({sx,sy,cw,ch,anchor,bottom:maxY>=0?maxY:ch-1,top:maxY>=0?minY:0});
  }
  return {cells,scale:(rendering.height || 54)/Math.max(1,...cells.map(cell=>cell.bottom-cell.top))};
}
class SpriteTimeline {
  constructor(mode,skin) {this.skin=skin;this.mode=this.resolve(mode);this.target=this.mode;this.index=0;this.bridge=null;this.done=false;}
  resolve(mode) {return this.skin.states[mode] || (this.skin.actions[mode]?mode:this.skin.states.idle);}
  request(mode) {this.target=this.resolve(mode);}
  get frame() {return this.bridge ? this.bridge.frames[this.bridge.index] : this.done ? this.skin.neutralFrame : this.skin.actions[this.mode].frames[this.index];}
  get delay() {return this.bridge ? this.skin.transition.ms : this.done ? this.skin.actions[this.skin.states.idle].ms : this.skin.actions[this.mode].ms;}
  tick() {
    if(this.bridge) {
      this.bridge.index++;
      if(this.bridge.index>=this.bridge.frames.length) {
        this.mode=this.target;this.index=0;this.bridge=null;this.done=false;
      }
    } else if(this.target!==this.mode) {
      // Finish the current pose, lower the arms, then enter the newest requested action.
      // Coalesce rapid state changes rather than replaying stale intermediate states.
      this.bridge={frames:[this.frame,...this.skin.transition.frames],index:0};
    } else if(!this.done) {
      this.index++;
      if(this.index>=this.skin.actions[this.mode].frames.length) {
        this.index=0;
        if(this.skin.actions[this.mode].once) this.done=true;
      }
    }
    return this.frame;
  }
}
function normalizePreferences(value) {
  const prefs = value && typeof value === 'object' ? value : {};
  const previousSize=prefs.collapsed===true ? 96 : DEFAULT_PREFS.size;
  return {
    visible: typeof prefs.visible === 'boolean' ? prefs.visible : true,
    size:Number.isFinite(prefs.size) ? Math.min(320,Math.max(64,Math.round(prefs.size))) : previousSize,
    paused: typeof prefs.paused === 'boolean' ? prefs.paused : false,
    pixelated: prefs.pixelated===true,
    position:prefs.position&&Number.isFinite(prefs.position.x)&&Number.isFinite(prefs.position.y)?{x:Math.round(prefs.position.x),y:Math.round(prefs.position.y)}:null,
    skin:typeof prefs.skin==='string' && /^[a-z0-9_-]{1,64}$/.test(prefs.skin)?prefs.skin:DEFAULT_PREFS.skin
  };
}
function clampPosition(position, viewport, size, top = 12) {
  const maxX = Math.max(8, viewport.width - size.width - 8);
  const minY = Math.min(Math.max(8,top),Math.max(8,viewport.height-size.height-8));
  const maxY = Math.max(minY,viewport.height - size.height - 8);
  const p = position || {x:maxX-16,y:Math.max(minY,76)};
  return {x:Math.round(Math.max(8,Math.min(maxX,p.x))),y:Math.round(Math.max(minY,Math.min(maxY,p.y)))};
}
// Only reduce the journal's current turn. No prompt or result text is retained.
class TurnActivity {
  constructor() { this.reset(); }
  reset() { this.turn=null; this.phase='thinking'; this.calls=new Set(); this.ended=null; }
  accept(entry) {
    const event=entry?.event || entry;
    if (!event || !event.data) return;
    const d=event.data;
    if (event.type==='turn/start') {this.reset();this.turn=d.turn;return;}
    if (d.turn!==undefined && this.turn!==null && d.turn!==this.turn) return;
    if (this.turn===null && d.turn!==undefined) this.turn=d.turn;
    switch(event.type) {
      case 'step/start': this.calls.clear();this.phase='thinking';this.ended=null;break;
      case 'assistant/live-chunk': {
        const kind=d.chunk?.type;
        if(kind==='reasoning-delta') this.phase='thinking';
        else if(kind==='text-delta') this.phase='generating';
        else if(kind==='tool-call-delta') this.phase='tool';
        break;
      }
      case 'assistant/message':
        for(const block of d.message?.content || []) if(block.type==='tool-call') this.calls.add(block.id);
        if(this.calls.size) this.phase='tool';
        break;
      case 'tool/call': this.calls.add(d.callId);this.phase='tool';break;
      case 'tool/result':
        this.calls.delete(d.message?.source?.callId);
        if(!this.calls.size) this.phase='thinking';
        break;
      case 'step/end': this.calls.clear();this.phase='thinking';break;
      case 'turn/end': this.calls.clear();this.ended=d.reason?.kind || 'interrupted';break;
    }
  }
  replay(entries) {
    this.reset();
    let start=entries.length-1;
    while(start>0 && entries[start]?.event?.type!=='turn/start') start--;
    for(let i=start;i<entries.length;i++) this.accept(entries[i]);
  }
}
function activityState({connected=true,session,status,turn,feedback=null}) {
  if(!connected) return 'offline';
  if(!session || session.removed) return 'idle';
  if(status?.pendingInteraction!==undefined) return 'waiting';
  const running=status?.running ?? session.running;
  if(running) return turn?.calls.size ? 'tool' : turn?.phase || 'thinking';
  if(session.promptError || session.lastAgentError || session.openError) return 'error';
  return feedback || 'idle';
}
module.exports = {AQUARIUM_ID,STORAGE_KEY,LABELS,DEFAULT_PREFS,SpriteTimeline,spriteGeometry,normalizePreferences,clampPosition,TurnActivity,activityState};

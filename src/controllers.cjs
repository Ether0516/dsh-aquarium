const React=require('react');
const h=React.createElement;
const NOOP=()=>{};

class Preferences {
  constructor(storage,events) {
    this.storage=storage;this.listeners=new Set();this.error=null;
    let saved;
    try {saved=JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');} catch {this.error='设置暂时无法保存，仍可在当前窗口使用。';}
    this.value=normalizePreferences(saved);
    this.getSnapshot=()=>this.value;
    this.subscribe=listener=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
    this.onStorage=event=>{
      if(event.key!==STORAGE_KEY && event.key!==null) return;
      try {this.value=normalizePreferences(JSON.parse(event.newValue || 'null'));this.notify();} catch {}
    };
    this.events=events;events?.addEventListener('storage',this.onStorage);
  }
  notify() {for(const listener of this.listeners) listener();}
  update(patch) {
    this.value=normalizePreferences({...this.value,...patch});
    try {this.storage?.setItem(STORAGE_KEY,JSON.stringify(this.value));this.error=null;}
    catch {this.error='设置暂时无法保存，仍可在当前窗口使用。';}
    this.notify();
  }
  dispose() {this.events?.removeEventListener('storage',this.onStorage);this.listeners.clear();}
}

class ActivityController {
  constructor(ctx) {
    this.ctx=ctx;this.listeners=new Set();this.binding=null;this.localOff=[];this.turn=new TurnActivity();
    this.feedback=null;this.feedbackTimer=null;this.endKey=null;this.disposed=false;
    this.value={mode:'idle',sessionId:null};
    this.getSnapshot=()=>this.value;
    this.subscribe=listener=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
    this.sync=this.sync.bind(this);
    this.off=[ctx.sessions.list.subscribe(this.sync),ctx.uiSession.current.subscribe(this.sync),ctx.uiSession.sessionStatus.subscribe(this.sync),ctx.connection.generation.subscribe(this.sync)];
    this.sync();
  }
  clearFeedback() {clearTimeout(this.feedbackTimer);this.feedbackTimer=null;this.feedback=null;}
  latestEnd(entries) {
    for(let i=entries.length-1;i>=0;i--) {
      const event=entries[i].event;
      if(event?.type==='turn/start') return null;
      if(event?.type==='turn/end') return `${event.seq}:${event.data.turn}:${event.data.reason?.kind}`;
    }
    return null;
  }
  eventsChanged(initial=false) {
    if(this.disposed || !this.binding) return;
    const snapshot=this.binding.eventSource.getSnapshot();
    const change=snapshot.change;
    if(initial || change?.kind==='replace' || change?.kind==='settle-assistant') this.turn.replay(snapshot.entries);
    else if(change?.kind==='append') for(const entry of change.entries) this.turn.accept(entry);
    // Loading older pages never changes the active turn or replays celebrations.
    if(change?.kind==='prepend' && !initial) return;
    const nextEnd=this.turn.ended===null ? null : this.latestEnd(snapshot.entries);
    if(nextEnd && nextEnd!==this.endKey && !initial && change?.kind!=='replace') {
      this.clearFeedback();
      this.feedback=this.turn.ended==='completed' ? 'complete' : this.turn.ended==='error' ? 'error' : null;
      if(this.feedback) this.feedbackTimer=setTimeout(()=>{this.feedback=null;this.sync();},6500);
    } else if(this.turn.ended===null) this.clearFeedback();
    this.endKey=nextEnd;
    this.publish();
  }
  sync() {
    if(this.disposed) return;
    const id=this.ctx.uiSession.current.getSnapshot().key;
    const binding=id===undefined ? null : this.ctx.sessions.binding(id) || null;
    if(binding!==this.binding) {
      for(const off of this.localOff) off();this.localOff=[];
      this.binding=binding;this.turn.reset();this.clearFeedback();this.endKey=null;
      if(binding) {
        this.localOff=[binding.session.subscribe(()=>this.publish()),binding.eventSource.subscribe(()=>this.eventsChanged())];
        this.eventsChanged(true);
      }
    }
    if(this.ctx.connection.generation.getSnapshot()===undefined) this.clearFeedback();
    this.publish();
  }
  publish() {
    if(this.disposed) return;
    const session=this.binding?.session.getSnapshot();
    const id=this.binding?.sessionId || null;
    const status=id ? this.ctx.uiSession.sessionStatus.getSnapshot().get(id) : undefined;
    const mode=activityState({connected:this.ctx.connection.generation.getSnapshot()!==undefined,session,status,turn:this.turn,feedback:this.feedback});
    if(this.value.mode===mode && this.value.sessionId===id) return;
    this.value={mode,sessionId:id};
    for(const listener of this.listeners) listener();
  }
  dispose() {this.disposed=true;this.clearFeedback();for(const off of [...this.off,...this.localOff]) off();this.listeners.clear();}
}

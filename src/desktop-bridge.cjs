async function mountDesktopRemote(ctx) {
  const codec={mode:'strict',typeSymbol:AQUARIUM_ID+'#desktop-input',create:()=>({parse:value=>value})};
  await ctx.remote.$mount({package:AQUARIUM_ID,descriptors:['update','release'].map(method=>({id:AQUARIUM_ID+'#desktopPet/'+method,service:'desktopPet',namespace:'desktopPet',method,invocation:{kind:'direct'},parameters:[{name:'input',wire:'input',source:'json',codec}],result:{mode:'src-json'}}))});
}
class DesktopBridge {
  constructor(ctx,preferences,activity) {
    this.ctx=ctx;this.preferences=preferences;this.activity=activity;this.disposed=false;this.pending=false;this.busy=false;this.value={active:false};this.listeners=new Set();
    this.getSnapshot=()=>this.value;this.subscribe=listener=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
    this.enabled=window.location?.protocol==='dsh-app:'&&!!ctx.remote;
    this.id='pet-'+(window.crypto?.randomUUID?.()||Math.random().toString(36).slice(2));
    if(!this.enabled){this.off=[];return;}
    this.send=this.send.bind(this);this.off=[preferences.subscribe(this.send),activity.subscribe(this.send)];
    this.heartbeat=setInterval(this.send,5000);this.send();
  }
  async send() {
    if(this.disposed)return;if(this.busy){this.pending=true;return;}this.busy=true;
    try {
      const result=await this.ctx.remote.desktopPet.update({clientId:this.id,desktop:true,prefs:this.preferences.getSnapshot(),mode:this.activity.getSnapshot().mode});
      if(this.disposed){await this.ctx.remote.desktopPet.release({clientId:this.id});return;}
      const next={active:result.ok&&result.value.active===true};
      if(this.value.active!==next.active){this.value=next;for(const listener of this.listeners)listener();}
    } catch {if(this.value.active){this.value={active:false};for(const listener of this.listeners)listener();}}
    finally {this.busy=false;if(this.pending){this.pending=false;this.send();}}
  }
  dispose() {
    this.disposed=true;clearInterval(this.heartbeat);for(const off of this.off)off();this.listeners.clear();
    if(this.enabled)Promise.resolve(this.ctx.remote.desktopPet.release({clientId:this.id})).catch(NOOP);
  }
}

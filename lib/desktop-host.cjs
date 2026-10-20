const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{homedir}=require('node:os');
const {normalizePreferences,SpriteTimeline,LABELS}=require('./core.cjs');
class DesktopPetController {
  constructor(root,options={}) {
    this.root=root;this.platform=options.platform||process.platform;this.spawn=options.spawn||spawn;this.now=options.now||Date.now;this.args=options.args||[];
    this.statePath=options.statePath||path.join(process.env.DSH_HOME||path.join(homedir(),'.dsh'),'desktop-pet','position.json');
    this.clients=new Map();this.child=null;this.ready=false;this.closed=false;this.error=null;this.frameTimer=null;
    this.skins=JSON.parse(fs.readFileSync(path.join(root,'lib/skins.json'),'utf8')).map(skin=>({...skin,imagePath:path.resolve(root,skin.imagePath)}));
    try{const saved=JSON.parse(fs.readFileSync(this.statePath,'utf8'));if(Number.isFinite(saved.x)&&Number.isFinite(saved.y))this.position=saved;}catch{}
    this.sweep=setInterval(()=>this.expire(),30000);this.sweep.unref?.();
  }
  write(command){if(this.child?.stdin.writable)this.child.stdin.write(JSON.stringify(command)+'\n');}
  async start() {
    if(this.child)return this.starting;if(this.closed||this.platform!=='win32')return;
    const executable=path.join(this.root,'native/bin/DSHDesktopPet.exe');if(!fs.existsSync(executable)){this.error='桌面浮窗程序缺失，请重新安装完整插件包。';return;}
    this.error=null;
    const child=this.child=this.spawn(executable,this.args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.starting=new Promise(resolve=>{
      let buffer='',settled=false;const settle=()=>{if(!settled){settled=true;clearTimeout(deadline);resolve();}};
      const deadline=setTimeout(()=>{this.error='桌面浮窗启动超时。';this.stop();settle();},8000);
      child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
        buffer+=chunk;if(buffer.length>65536){buffer='';return;}
        let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{
          const event=JSON.parse(line);if(event.type==='ready'){this.ready=true;settle();}
          if(event.type==='position'&&Number.isFinite(event.x)&&Number.isFinite(event.y)){this.position={x:Math.round(event.x),y:Math.round(event.y)};this.savePosition();}
          if(event.type==='error'){this.error=event.message;this.ready=false;settle();}
        }catch{}}
      });
      child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{this.error=String(chunk).slice(0,500);});
      child.on('error',error=>{this.error=error.message;this.ready=false;this.child=null;settle();});
      child.on('exit',()=>{if(this.child===child){this.child=null;this.ready=false;clearTimeout(this.frameTimer);}settle();});
      child.stdin.on('error',()=>{});
      this.write({type:'configure',skins:this.skins,position:this.position||null});
    });return this.starting;
  }
  savePosition(){try{fs.mkdirSync(path.dirname(this.statePath),{recursive:true});fs.writeFileSync(this.statePath,JSON.stringify(this.position));}catch{}}
  async update(input) {
    if(!input||typeof input.clientId!=='string'||input.clientId.length>100||input.desktop!==true)return {active:false};
    const prefs=normalizePreferences(input.prefs),mode=Object.hasOwn(LABELS,input.mode)?input.mode:'idle';
    this.clients.set(input.clientId,{prefs,mode,time:this.now()});this.current=input.clientId;
    if(this.platform!=='win32'||this.closed)return {active:false};
    if(!this.child&&!prefs.visible)return {active:false};
    await this.start();if(!this.ready||this.closed)return {active:false,error:this.error};
    this.render();return {active:true};
  }
  render() {
    clearTimeout(this.frameTimer);if(!this.ready||this.closed)return;
    const state=this.clients.get(this.current)||[...this.clients.values()].pop();
    if(!state){this.stop();return;}const {prefs,mode}=state;
    const skin=this.skins.find(skin=>skin.id===prefs.skin)||this.skins[0];
    if(!this.timeline||this.timeline.skin!==skin)this.timeline=new SpriteTimeline(mode,skin);this.timeline.request(mode);
    const draw=()=>this.write({type:'render',skin:skin.id,frame:this.timeline.frame,size:prefs.size,pixelated:prefs.pixelated,visible:prefs.visible});
    draw();if(prefs.paused||!prefs.visible)return;
    const tick=()=>{if(!this.ready||this.closed)return;this.timeline.tick();draw();this.frameTimer=setTimeout(tick,this.timeline.delay);};
    this.frameTimer=setTimeout(tick,this.timeline.delay);
  }
  release(input){this.clients.delete(input?.clientId);this.render();return {active:this.ready};}
  expire(){for(const [id,client] of this.clients)if(this.now()-client.time>150000)this.clients.delete(id);if(!this.clients.size)this.stop();}
  stop(){clearTimeout(this.frameTimer);const child=this.child;if(child){this.write({type:'quit'});child.stdin.end();const timer=setTimeout(()=>{if(child.exitCode===null)child.kill();},1500);timer.unref?.();}this.child=null;this.ready=false;this.timeline=null;}
  dispose(){this.closed=true;clearInterval(this.sweep);this.clients.clear();this.stop();}
}
module.exports={DesktopPetController};

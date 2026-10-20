const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');const {DesktopPetController}=require('../src/desktop-host.cjs');
const root=path.resolve(__dirname,'..');
function fixture(options={}) {
  const commands=[],spawned=[];
  const spawn=()=>{
    const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;child.kill=()=>{child.exitCode=0;child.emit('exit',0);};
    let pending='';child.stdin.on('data',chunk=>{pending+=chunk;let end;while((end=pending.indexOf('\n'))>=0){const command=JSON.parse(pending.slice(0,end));pending=pending.slice(end+1);commands.push(command);if(command.type==='configure')setImmediate(()=>child.stdout.write('{"type":"ready"}\n'));if(command.type==='quit')setImmediate(()=>child.kill());}});
    spawned.push(child);return child;
  };
  const controller=new DesktopPetController(root,{spawn,platform:'win32',statePath:path.join(root,'qa/test-position-'+Date.now()+'.json'),...options});
  return {controller,commands,spawned};
}
test('the desktop helper receives portable paths, smooth defaults, and real state animation',async()=>{
  const f=fixture();try {
    assert.deepEqual(await f.controller.update({clientId:'a',desktop:true,prefs:{},mode:'tool'}),{active:true});
    assert.equal(f.spawned.length,1);const config=f.commands.find(c=>c.type==='configure');assert.ok(path.isAbsolute(config.skins[0].imagePath));assert.ok(fs.existsSync(config.skins[0].imagePath));
    const render=f.commands.find(c=>c.type==='render');assert.equal(render.pixelated,false);assert.equal(render.frame,12);
    await f.controller.update({clientId:'a',desktop:true,prefs:{pixelated:true,size:173,paused:true},mode:'tool'});
    assert.equal(f.commands.at(-1).pixelated,true);assert.equal(f.commands.at(-1).size,173);assert.equal(f.controller.frameTimer._destroyed,true);
    await f.controller.update({clientId:'a',desktop:true,prefs:{visible:false},mode:'idle'});assert.equal(f.commands.at(-1).visible,false);
  }finally{f.controller.dispose();}
});
test('off-window screen coordinates, including negative monitor coordinates, survive restart',async()=>{
  const f=fixture();try {
    await f.controller.update({clientId:'a',desktop:true,prefs:{paused:true},mode:'idle'});
    f.spawned[0].stdout.write('{"type":"position","x":-450,"y":860}\n');
    assert.deepEqual(JSON.parse(fs.readFileSync(f.controller.statePath,'utf8')),{x:-450,y:860});
    const next=fixture({statePath:f.controller.statePath});try{assert.deepEqual(next.controller.position,{x:-450,y:860});}finally{next.controller.dispose();}
  }finally{f.controller.dispose();if(fs.existsSync(f.controller.statePath))fs.unlinkSync(f.controller.statePath);}
});
test('one helper is shared, released on the last client, and never started by a web caller',async()=>{
  const f=fixture();try {
    assert.deepEqual(await f.controller.update({clientId:'web',desktop:false,prefs:{}}),{active:false});assert.equal(f.spawned.length,0);
    await Promise.all(['a','b'].map(clientId=>f.controller.update({clientId,desktop:true,prefs:{paused:true},mode:'idle'})));assert.equal(f.spawned.length,1);
    f.controller.release({clientId:'a'});assert.equal(f.controller.ready,true);f.controller.release({clientId:'b'});assert.equal(f.controller.ready,false);assert.equal(f.commands.at(-1).type,'quit');
  }finally{f.controller.dispose();}
});
test('crashed or unsupported native windows fall back and stale clients release the helper',async()=>{
  let now=1;const f=fixture({now:()=>now});try {
    await f.controller.update({clientId:'a',desktop:true,prefs:{paused:true},mode:'idle'});f.spawned[0].kill();assert.equal(f.controller.ready,false);
    await f.controller.update({clientId:'a',desktop:true,prefs:{paused:true},mode:'idle'});assert.equal(f.spawned.length,2);
    now=200000;f.controller.expire();assert.equal(f.controller.ready,false);
    const other=fixture({platform:'darwin'});try{assert.deepEqual(await other.controller.update({clientId:'a',desktop:true,prefs:{}}),{active:false});assert.equal(other.spawned.length,0);}finally{other.controller.dispose();}
  }finally{f.controller.dispose();}
});

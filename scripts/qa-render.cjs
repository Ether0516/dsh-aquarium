const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const deps=process.env.DSH_QA_NODE_MODULES;
const dependency=name=>deps?require(path.join(deps,name)):require(name);
const {chromium}=dependency('playwright');const {PNG}=dependency('pngjs');
const root=path.resolve(__dirname,'..'),runtime=process.env.DSH_QA_RUNTIME,out=path.join(root,'qa');fs.mkdirSync(out,{recursive:true});
const reactFile=(name,file)=>runtime?path.join(runtime,name+'.js'):path.join(path.dirname(require.resolve(name+'/package.json')),'umd',file);
const html=`<!doctype html><html><head><meta charset="utf-8"><style>
:root{--dsw-alias-state-business-primary:#bd93f9;--dsw-alias-label-primary:#f8f8f2;--dsw-alias-label-tertiary:#a8aabb;--dsw-alias-bg-base:#2c2e3d;--dsw-alias-border-l3:#4b4e62}body{margin:0;font:14px 'Microsoft YaHei',sans-serif;background:#22232d;color:var(--dsw-alias-label-primary)}[data-shortcut-modal]{box-sizing:border-box;display:grid;grid-template-columns:224px 1fr;margin:8px;border:1px solid #454858;border-radius:22px;min-height:780px;background:#2c2e3d}nav{padding:26px 16px}nav strong{display:block;margin:0 14px 28px;font-size:20px;font-weight:500}nav button{display:flex;align-items:center;gap:12px;width:100%;padding:14px;border:0;border-radius:10px;background:#bd93f919;color:var(--dsw-alias-label-primary);font:14px inherit}nav svg{width:18px;height:18px}main{padding:60px 30px 30px;min-width:0}.shell-qa{height:800px}
</style></head><body><div data-shortcut-modal="settings"><nav><strong>设置</strong><button><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" stroke="currentColor" fill="none"/></svg><span>DSH桌宠</span></button></nav><main id="settings"></main></div><div id="overlay"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>
window.__ModuleLoader__={load({factory}){window.petPlugin=factory(name=>{if(name==='react')return React;throw Error(name);});}};
</script><script src="/plugin.js"></script><script>
function source(value){return{getSnapshot:()=>value,subscribe:()=>()=>{}}};
const entries={},disposers=[];
const ctx={effect(fn){const disposer=fn();if(typeof disposer==='function')disposers.push(disposer);},slots:{inject(name,cb){return cb();},register(options,Component){entries[options.name]={Component,props:options.inject()};}},sessions:{list:source({byId:{}}),binding:()=>undefined},uiSession:{current:source({}),sessionStatus:source(new Map())},connection:{generation:source({id:1})}};
(async()=>{await petPlugin.apply(ctx);window.qaEntries=Object.keys(entries);window.qaPreferences=entries['settings.section'].props.preferences;
ReactDOM.createRoot(document.getElementById('settings')).render(React.createElement(entries['settings.section'].Component,entries['settings.section'].props));
ReactDOM.createRoot(document.getElementById('overlay')).render(React.createElement(entries['shell.overlay'].Component,entries['shell.overlay'].props));
})();
</script></body></html>`;
async function main(){
 const server=http.createServer((req,res)=>{const files={'/react.js':reactFile('react','react.production.min.js'),'/react-dom.js':reactFile('react-dom','react-dom.production.min.js'),'/plugin.js':path.join(root,'lib/client.js')};res.setHeader('Content-Type',req.url==='/'?'text/html; charset=utf-8':'application/javascript');res.end(req.url==='/'?html:files[req.url]?fs.readFileSync(files[req.url]):'');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.DSH_QA_BROWSER?{executablePath:process.env.DSH_QA_BROWSER}:process.platform==='win32'?{channel:'msedge'}:{})});
  const page=await browser.newPage({viewport:{width:1020,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.waitForFunction(()=>{const c=document.querySelector('.aq-preview canvas');return c&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((n,i)=>i%4===3&&n>0);});
  assert.deepEqual(await page.evaluate(()=>qaEntries),['shell.overlay','settings.section']);
  const buttons=page.locator('.aq-demo-modes button');assert.equal(await buttons.count(),8);
  const boxes=await buttons.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width};}));
  for(let i=0;i<4;i++){assert.equal(boxes[i].y,boxes[0].y);assert.equal(boxes[i+4].y,boxes[4].y);assert.equal(boxes[i].x,boxes[i+4].x);}
  assert.ok(boxes[4].y>boxes[0].y);assert.equal(await page.locator('[data-dsh-pet-nav]').count(),1);
  assert.equal(await page.getByLabel('像素化',{exact:true}).isChecked(),false);
  assert.equal(await page.locator('.aq-preview canvas').evaluate(canvas=>canvas.width),128);
  await page.getByLabel('像素化',{exact:true}).check();assert.equal(await page.locator('.aq-preview canvas').evaluate(canvas=>canvas.width),64);
  await page.reload();await page.waitForFunction(()=>qaPreferences.getSnapshot().pixelated===true);assert.equal(await page.getByLabel('像素化',{exact:true}).isChecked(),true);
  await page.getByLabel('像素化',{exact:true}).uncheck();
  const pet=await page.locator('.aq-widget').boundingBox();await page.mouse.move(pet.x+pet.width/2,pet.y+pet.height/2);await page.mouse.down();await page.mouse.move(pet.x+pet.width/2-170,pet.y+pet.height/2+90,{steps:10});await page.mouse.up();
  assert.ok(await page.evaluate(()=>qaPreferences.getSnapshot().position.x<window.innerWidth-250));
  const savedPosition=await page.evaluate(()=>qaPreferences.getSnapshot().position);await page.reload();await page.waitForFunction(()=>!!qaPreferences.getSnapshot().position);assert.deepEqual(await page.evaluate(()=>qaPreferences.getSnapshot().position),savedPosition);
  assert.equal(await page.locator('[data-dsh-pet-nav]>svg').evaluate(node=>getComputedStyle(node).display),'none');
  assert.equal(await page.getByRole('button',{name:'恢复默认位置'}).count(),0);assert.equal(await page.locator('.aq-pet-button,.aq-menu,.aq-sidebar-toggle').count(),0);
  await page.screenshot({path:path.join(out,'settings-dark.png')});
  await page.getByRole('slider',{name:'桌宠大小',exact:true}).focus();await page.keyboard.press('End');
  await page.waitForFunction(()=>qaPreferences.getSnapshot().size===320);assert.equal(await page.locator('.aq-widget canvas').evaluate(node=>getComputedStyle(node).width),'320px');
  await page.getByRole('spinbutton',{name:'桌宠大小数值'}).focus();await page.keyboard.press('Control+A');await page.keyboard.type('173');await page.keyboard.press('Enter');await page.waitForFunction(()=>qaPreferences.getSnapshot().size===173);
  await page.getByLabel('暂停动画',{exact:true}).check();await page.waitForTimeout(80);
  const before=await page.locator('.aq-preview canvas').evaluate(canvas=>canvas.toDataURL());await page.waitForTimeout(500);
  assert.equal(await page.locator('.aq-preview canvas').evaluate(canvas=>canvas.toDataURL()),before);
  await page.getByLabel('显示桌宠',{exact:true}).uncheck();assert.equal(await page.locator('.aq-widget').count(),0);await page.getByLabel('显示桌宠',{exact:true}).check();
  assert.equal(await page.locator('.aq-widget').count(),1);
  await page.reload();await page.waitForFunction(()=>qaPreferences.getSnapshot().size===173);assert.equal(await page.getByLabel('暂停动画',{exact:true}).isChecked(),true);
  await page.getByLabel('暂停动画',{exact:true}).uncheck();
  for(const name of ['潜心思考','工具执行中','等你确认','任务完成']){await page.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(650);}
  await page.getByRole('button',{name:'自在闲游',exact:true}).click();
  await page.setViewportSize({width:720,height:780});await page.screenshot({path:path.join(out,'settings-narrow.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
  await page.setViewportSize({width:1020,height:900});await page.evaluate(()=>{document.documentElement.style.setProperty('--dsw-alias-label-primary','#243040');document.documentElement.style.setProperty('--dsw-alias-label-tertiary','#657080');document.documentElement.style.setProperty('--dsw-alias-bg-base','#ffffff');document.documentElement.style.setProperty('--dsw-alias-border-l3','#dce1e8');document.querySelector('[data-shortcut-modal]').style.background='#ffffff';});
  await page.screenshot({path:path.join(out,'settings-light.png')});assert.deepEqual(errors,[]);
  const png=PNG.sync.read(fs.readFileSync(path.join(root,'assets/whale-girl-v2.png')));let transparent=0;for(let i=3;i<png.data.length;i+=4)if(png.data[i]===0)transparent++;
  assert.ok(transparent>png.width*png.height*.2);console.log(JSON.stringify({checks:'4x2 grid, settings entry, paw icon, slider, numeric size, pause, visibility, default smooth rendering, pixel switch persistence, drag position persistence, narrow layout, no page errors',png:{width:png.width,height:png.height,transparentPixels:transparent},screenshots:out}));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');const root=path.resolve(__dirname,'..');
const skins=JSON.parse(fs.readFileSync(path.join(root,'lib/skins.json'),'utf8')).map(skin=>({...skin,imagePath:path.resolve(root,skin.imagePath)}));
const input=path.join(root,'qa/native-input.json');fs.mkdirSync(path.dirname(input),{recursive:true});fs.writeFileSync(input,JSON.stringify({skins,output:path.join(root,'qa/native')}));
const result=spawnSync(path.join(root,'native/bin/DSHDesktopPet.exe'),['--render-check',input],{encoding:'utf8',windowsHide:true});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.status)process.exit(result.status);
if(process.argv.includes('--window')) {
  const {DesktopPetController}=require('../lib/desktop-host.cjs');const controller=new DesktopPetController(root,{args:['--qa-window'],statePath:path.join(root,'qa/native-position.json')});let prefs={paused:true,size:173};
  controller.update({clientId:'qa',desktop:true,prefs,mode:'idle'}).then(result=>console.log(JSON.stringify({native:result,pid:controller.child?.pid}))).catch(console.error);
  require('node:readline').createInterface({input:process.stdin}).on('line',async line=>{try{const request=JSON.parse(line);if(request.quit){controller.dispose();process.exit(0);}prefs={...prefs,...request};console.log(JSON.stringify(await controller.update({clientId:'qa',desktop:true,prefs,mode:request.mode||'idle'})));}catch(error){console.error(error);}});
  const heartbeat=setInterval(async()=>{const result=await controller.update({clientId:'qa',desktop:true,prefs,mode:'idle'});console.log(JSON.stringify({heartbeat:result,pid:controller.child?.pid,error:controller.error}));},5000);
  setTimeout(()=>{clearInterval(heartbeat);controller.dispose();process.exit(0);},240000);
}

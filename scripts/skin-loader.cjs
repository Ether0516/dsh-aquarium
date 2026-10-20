const fs=require('node:fs');const path=require('node:path');
const STATES=['idle','thinking','generating','tool','waiting','complete','error','offline'];
function validateSkin(skin,label='skin') {
  const fail=message=>{throw new Error(`${label}: ${message}`);};
  if(skin.formatVersion!==1)fail('formatVersion must be 1');
  if(!/^[a-z0-9_-]{1,64}$/.test(skin.id||''))fail('invalid id');
  if(typeof skin.name!=='string'||!skin.name.trim())fail('name is required');
  if(typeof skin.image!=='string')fail('image path is required');
  const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
  if(!integer(skin.grid?.columns,1,32)||!integer(skin.grid?.rows,1,32)||skin.grid.columns*skin.grid.rows>256)fail('invalid sprite grid');
  for(const [name,count] of [['columnEdges',skin.grid.columns],['rowEdges',skin.grid.rows]]) {
    const edges=skin.grid[name];
    if(edges!==undefined&&(!Array.isArray(edges)||edges.length!==count+1||edges[0]!==0||edges.some((n,i)=>!Number.isSafeInteger(n)||n<0||i>0&&n<=edges[i-1])))fail(`invalid ${name}`);
  }
  const count=skin.grid.columns*skin.grid.rows;
  const frames=value=>Array.isArray(value)&&value.length>0&&value.length<=512&&value.every(n=>integer(n,0,count-1));
  const r=skin.rendering;
  if(!r||!integer(r.logicalSize,32,128)||!integer(r.height,1,r.logicalSize-4)||!integer(r.baseline,r.height,r.logicalSize-1)||!['head','center'].includes(r.anchor)||!integer(r.alphaThreshold,1,255))fail('invalid rendering settings');
  if(!integer(skin.neutralFrame,0,count-1))fail('neutralFrame is outside grid');
  if(!frames(skin.transition?.frames)||!integer(skin.transition.ms,40,2000))fail('invalid transition frames or duration');
  if(!skin.actions||typeof skin.actions!=='object')fail('actions are required');
  for(const [name,action] of Object.entries(skin.actions)) {
    if(!/^[a-z0-9_-]+$/.test(name)||!frames(action.frames)||!integer(action.ms,40,2000)||action.once!==undefined&&typeof action.once!=='boolean')fail(`invalid action ${name}`);
  }
  for(const state of STATES)if(!skin.actions[skin.states?.[state]])fail(`state ${state} references a missing action`);
  return skin;
}
function loadSkins(root) {
  const folder=path.join(root,'skins'),ids=new Set(),skins=[];
  for(const entry of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    if(!entry.isDirectory())continue;
    const manifest=path.join(folder,entry.name,'skin.json');
    const skin=validateSkin(JSON.parse(fs.readFileSync(manifest,'utf8')),path.relative(root,manifest));
    if(ids.has(skin.id))throw Error(`duplicate skin id ${skin.id}`);ids.add(skin.id);
    const imagePath=path.resolve(path.dirname(manifest),skin.image);
    const relative=path.relative(root,imagePath);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw Error(`skin ${skin.id}: image must stay inside the project`);
    const bytes=fs.readFileSync(imagePath);
    if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||![4,6].includes(bytes[25]))throw Error(`skin ${skin.id}: use an alpha-channel PNG`);
    if(bytes.readUInt32BE(16)<skin.grid.columns||bytes.readUInt32BE(20)<skin.grid.rows)throw Error(`skin ${skin.id}: image is smaller than its grid`);
    for(const [name,dimension] of [['columnEdges',bytes.readUInt32BE(16)],['rowEdges',bytes.readUInt32BE(20)]]) {
      const edges=skin.grid[name];
      if(edges&&edges[edges.length-1]!==dimension)throw Error(`skin ${skin.id}: ${name} must end at the PNG dimension ${dimension}`);
    }
    skins.push({...skin,imagePath:relative,imageData:'data:image/png;base64,'+bytes.toString('base64')});
  }
  if(!skins.length)throw Error('At least one skin is required');return skins;
}
module.exports={validateSkin,loadSkins,STATES};

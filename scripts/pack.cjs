const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});const stage=fs.mkdtempSync(path.join(dist,'stage-'+pkg.version+'-'));const target=path.join(stage,'package');
fs.mkdirSync(target,{recursive:true});
for(const file of ['package.json',...pkg.files])fs.cpSync(path.join(root,file),path.join(target,file),{recursive:true});
const archive=path.join(dist,`${pkg.name}-${pkg.version}.tgz`);
const result=spawnSync('tar',['-czf',archive,'-C',stage,'package'],{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
console.log(archive);

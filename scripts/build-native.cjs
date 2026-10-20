const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'native/bin'),{recursive:true});
if(process.platform!=='win32')throw Error('Build the Windows helper on Windows; release packages already include the executable.');
const windows=process.env.WINDIR||'C:/Windows';const compiler=['Framework64','Framework'].map(name=>path.join(windows,'Microsoft.NET',name,'v4.0.30319/csc.exe')).find(file=>fs.existsSync(file));
if(!compiler)throw Error('The Windows .NET Framework C# compiler is required to rebuild the helper.');
const result=spawnSync(compiler,['/nologo','/target:winexe','/optimize+','/platform:anycpu','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll','/win32manifest:'+path.join(root,'native/app.manifest'),'/out:'+path.join(root,'native/bin/DSHDesktopPet.exe'),path.join(root,'native/DesktopPet.cs')],{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;if(result.status)process.exit(result.status);console.log('Built portable Windows desktop-pet helper.');

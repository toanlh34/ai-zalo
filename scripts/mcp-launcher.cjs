// NSIS installs resources beside this launcher; legacy installs use a version manifest.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
try{
  let root=__dirname;
  if(!fs.existsSync(path.join(root,'resources','engine','src','app-mcp.mjs'))){
    const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'installation.json'),'utf8').replace(/^\uFEFF/,''));
    root=path.dirname(manifest.executable);const relative=path.relative(__dirname,root);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Invalid installed path');
  }
  const child=spawn(path.join(root,'resources','runtime','node.exe'),[path.join(root,'resources','engine','src','app-mcp.mjs')],{windowsHide:true,stdio:'inherit'});
  child.on('error',()=>{console.error('Không khởi động được MCP BIMUP. Cài lại bản mới.');process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code??1;});
  process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('SIGINT',()=>child.kill('SIGINT'));
}catch{console.error('Chưa tìm thấy bản cài BIMUP Zalo Assistance có MCP.');process.exitCode=1;}

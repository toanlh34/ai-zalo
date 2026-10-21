import {mkdirSync,copyFileSync,cpSync,existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const target=join(root,'.desktop-runtime');mkdirSync(target,{recursive:true});
const runtimePath=join(target,'node.exe');
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
if(!existsSync(runtimePath)||digest(runtimePath)!==digest(process.execPath))copyFileSync(process.execPath,runtimePath);
if(process.argv.includes('--stage')){
  const engine=join(root,'.desktop-engine');mkdirSync(engine,{recursive:true});
  for(const name of ['src','agent','knowledge','config.example.json'])cpSync(join(root,name),join(engine,name),{recursive:true});
  mkdirSync(join(engine,'desktop'),{recursive:true});
  for(const name of ['controller.mjs','service.mjs'])copyFileSync(join(root,'desktop',name),join(engine,'desktop',name));
  // Resolve runtime dependencies from pnpm or npm, then dereference into the bundle.
  const copied=new Set();
  async function copyPackage(name,from){
    const {createRequire}=await import('node:module');const require=createRequire(join(from,'package.json'));
    let manifest;try{manifest=require.resolve(name+'/package.json');}catch{
      let directory=(await import('node:path')).dirname(require.resolve(name));
      while(!existsSync(join(directory,'package.json')))directory=(await import('node:path')).dirname(directory);
      manifest=join(directory,'package.json');
    }
    const fs=await import('node:fs');const path=await import('node:path');
    // Some export maps resolve package.json to a nested {type: ...} marker.
    // Walk to the package manifest with the requested package name.
    let meta=JSON.parse(fs.readFileSync(manifest,'utf8'));
    while(meta.name!==name){
      const parent=path.dirname(path.dirname(manifest));if(parent===path.dirname(manifest))throw Error('Cannot locate package manifest: '+name);
      manifest=join(parent,'package.json');meta=existsSync(manifest)?JSON.parse(fs.readFileSync(manifest,'utf8')):{};
    }
    if(copied.has(meta.name))return;copied.add(meta.name);
    const directory=(await import('node:path')).dirname(manifest);
    cpSync(directory,join(engine,'node_modules',meta.name),{recursive:true,dereference:true});
    for(const dep of Object.keys(meta.dependencies??{}))await copyPackage(dep,directory);
  }
  await copyPackage('zca-js',root);
  await copyPackage('@modelcontextprotocol/sdk',root);
  await copyPackage('zod',root);
}

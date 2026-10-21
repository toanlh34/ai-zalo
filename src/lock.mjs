import {openSync,writeFileSync,closeSync,readFileSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
export function acquireLock(path){
  const fd=openSync(path,'wx'),token=randomUUID();
  try{writeFileSync(fd,JSON.stringify({pid:process.pid,token}));}
  catch(error){closeSync(fd);rmSync(path,{force:true});throw error;}
  let released=false;
  return ()=>{
    if(released)return;released=true;closeSync(fd);
    try{if(JSON.parse(readFileSync(path,'utf8')).token===token)rmSync(path,{force:true});}
    catch(error){if(error.code!=='ENOENT')throw error;}
  };
}

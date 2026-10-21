import {openSync,writeFileSync,closeSync,readFileSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

function isPidAlive(pid){
  if(!Number.isInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);return true;}
  catch(error){return error.code==='EPERM';}
}

export function acquireLock(path){
  let fd;
  try{fd=openSync(path,'wx');}
  catch(error){
    if(error.code==='EEXIST'){
      try{
        const data=JSON.parse(readFileSync(path,'utf8'));
        if(Number.isInteger(data.pid)&&data.pid>0&&!isPidAlive(data.pid)){
          rmSync(path,{force:true});
          fd=openSync(path,'wx');
        }else throw error;
      }catch(readErr){
        throw error;
      }
    }else throw error;
  }
  const token=randomUUID();
  try{writeFileSync(fd,JSON.stringify({pid:process.pid,token}));}
  catch(error){closeSync(fd);rmSync(path,{force:true});throw error;}
  let released=false;
  return ()=>{
    if(released)return;released=true;closeSync(fd);
    try{if(JSON.parse(readFileSync(path,'utf8')).token===token)rmSync(path,{force:true});}
    catch(error){if(error.code!=='ENOENT')throw error;}
  };
}

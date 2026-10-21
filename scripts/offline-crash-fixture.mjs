import {appendFileSync} from 'node:fs';
import {openStore} from '../src/store.mjs';
import {createInbox} from '../src/filter.mjs';
import {createWorker} from '../src/worker.mjs';

if(!process.send)throw Error('Offline crash fixture requires test IPC');
const [path,effectsPath,phase]=process.argv.slice(2);
if(!['thinking','sending'].includes(phase))throw Error('Unknown fixture phase');
const store=openStore(path);
const accepted=createInbox('123').accept({type:1,threadId:'123',isSelf:false,data:{msgId:'1',uidFrom:'9',content:'chào anh',ts:'1'}});
store.add('123:1','123',accepted.item);
const wait=()=>new Promise(()=>{});
const worker=createWorker({
  store,config:{allowedGroupId:'123',ownerUserId:'456',mode:'live',autoSendCategories:['greeting']},pausePath:`${path}.paused`,
  agent:{async decide(){
    if(phase==='thinking'){process.send({phase});return wait();}
    return {action:'send',category:'greeting',reply:'Lời chào giả.',reason:'Kiểm thử',report:'Tin giả.'};
  }},
  send:async(text,to,type)=>{
    appendFileSync(effectsPath,JSON.stringify({text,to,type})+'\n');
    if(type===1){process.send({phase:'sending'});await wait();}
  }
});
setInterval(()=>{},1000);
await worker.tick();

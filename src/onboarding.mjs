import {randomBytes,timingSafeEqual,randomUUID} from 'node:crypto';
import {writeFileSync,renameSync,rmSync} from 'node:fs';
import {validateQueueLimit} from './store.mjs';
import {createInbox} from './filter.mjs';
import {allowLateCloseErrors} from './listener-utils.mjs';

export function createPairingChallenge({selfId,code=randomBytes(16).toString('hex'),timeoutMs=300000,now=Date.now}={}){
  const expires=now()+timeoutMs,expected=Buffer.from(`/jev pair ${code}`);let consumed=false;
  return {code,accept(message){
    const data=message?.data,sender=String(data?.uidFrom??'');
    if(consumed||now()>=expires||message?.type!==0||message.isSelf!==false||!/^\d+$/.test(sender)
      ||sender===String(selfId)||String(message.threadId)!==sender||typeof data.content!=='string'||data.content.length>200)return null;
    const text=Buffer.from(data.content.trim());
    if(text.length!==expected.length||!timingSafeEqual(text,expected))return null;
    consumed=true;return sender;
  }};
}
export function pairOwner({api,onCode,timeoutMs=300000,signal}){
  allowLateCloseErrors(api.listener);
  const challenge=createPairingChallenge({selfId:api.getOwnId(),timeoutMs});
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error,owner)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      api.listener.off('message',message);api.listener.off('error',errorHandler);api.listener.off('closed',closed);
      signal?.removeEventListener('abort',abort);
      try{api.listener.stop();}catch{}
      error?reject(error):resolve(owner);
    };
    const message=value=>{const owner=challenge.accept(value);if(owner)finish(null,owner);};
    const errorHandler=()=>finish(Error('Ghép chủ lỗi kết nối; chạy lại setup.'));
    const closed=()=>finish(Error('Kết nối ghép chủ đã đóng; chạy lại setup.'));
    const abort=()=>finish(Error('Đã hủy ghép chủ.'));
    const timer=setTimeout(()=>finish(Error('Mã ghép chủ đã hết hạn; chạy lại setup.')),timeoutMs);
    api.listener.on('message',message);api.listener.on('error',errorHandler);api.listener.on('closed',closed);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return;}
    try{api.listener.start({retryOnClose:false});onCode(challenge.code);}catch(error){finish(error);}
  });
}
export async function listGroups(api){
  const groups=await api.getAllGroups(),ids=Object.keys(groups.gridVerMap??{}).filter(id=>/^\d+$/.test(id)),result=[];
  for(let offset=0;offset<ids.length;offset+=20){
    const batch=ids.slice(offset,offset+20),info=await api.getGroupInfo(batch);
    for(const id of batch)if(info.gridInfoMap?.[id])result.push({id,name:String(info.gridInfoMap[id].name??id).replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,100)});
  }
  return result;
}
export function setupConfig(template,groupId,ownerUserId){
  createInbox(groupId,template.contextLimit??30);
  validateQueueLimit(template.maxPendingTasks??100);
  if(!/^\d+$/.test(ownerUserId))throw Error('Chủ không hợp lệ');
  return {...template,allowedGroupId:groupId,ownerUserId,mode:'dry-run',autoSendCategories:template.autoSendCategories??['greeting'],ai:{...template.ai,provider:'claude-cli'}};
}
export async function configureAgent({api,template,ask,log=console.log,onCode,signal}){
  let groups=await listGroups(api);
  while(!groups.length){
    log('Tạo nhóm thử với tài khoản chủ và thêm tài khoản agent vào nhóm.');
    await ask('Xong thì nhấn Enter để lấy lại danh sách nhóm: ');groups=await listGroups(api);
  }
  groups.forEach((group,index)=>log(`${index+1}. ${group.name} (${group.id})`));
  let selected;
  while(!selected){const index=Number((await ask('Chọn số thứ tự nhóm agent được trả lời: ')).trim());if(Number.isInteger(index)&&index>=1&&index<=groups.length)selected=groups[index-1];}
  log('Dùng tài khoản Zalo cá nhân của chủ, gửi mã ghép trong tin RIÊNG vào tài khoản agent.');
  const owner=await pairOwner({api,onCode,signal});
  const confirm=await ask(`Đã ghép chủ ${owner}, nhóm ${selected.name}. Gõ LUU để lưu cấu hình dry-run: `);
  if(confirm.trim().toUpperCase()!=='LUU')throw Error('Đã hủy, chưa lưu cấu hình mới.');
  return setupConfig(template,selected.id,owner);
}
export function saveConfig(path,config){
  const temp=`${path}.${randomUUID()}.tmp`;
  try{writeFileSync(temp,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});renameSync(temp,path);}
  finally{rmSync(temp,{force:true});}
}

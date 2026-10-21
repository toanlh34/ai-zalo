import {createRouter,scopeOf,defaultAssistantNames} from './filter.mjs';
import {createWorker,isSensitiveContent} from './worker.mjs';
import {createOwnerController} from './owner.mjs';
import {validateQueueLimit} from './store.mjs';
import {allowLateCloseErrors} from './listener-utils.mjs';

export function validateRuntimeConfig(config){
  createRouter({config});
  validateQueueLimit(config.maxPendingTasks??100);
  if(!/^\d+$/.test(config.ownerUserId??'')||!['live','dry-run'].includes(config.mode))throw Error('Cần cấu hình ownerUserId và mode hợp lệ');
  return config;
}

export function createRuntime({api,store,agent,config,pausePath,intervalMs=1000,log=console.log,onClosed=()=>{}}) {
  validateRuntimeConfig(config);
  let selfId='';try{selfId=String(api.getOwnId?.()??'');}catch{}
  const router=createRouter({config,selfId,names:config.assistantNames??defaultAssistantNames});
  const maxPendingTasks=validateQueueLimit(config.maxPendingTasks??100);
  const owner=createOwnerController({store,config,pausePath});
  const worker=createWorker({store,agent,config,pausePath,send:(text,to,type)=>api.sendMessage(text,to,type)});
  const groupNames=new Map(),lookups=new Set();
  // Tên nhóm chỉ để hiển thị/báo cáo; lỗi tra cứu không ảnh hưởng nhận tin.
  const lookupGroup=id=>{
    if(groupNames.has(id)||lookups.has(id)||typeof api.getGroupInfo!=='function')return;
    lookups.add(id);
    Promise.resolve().then(()=>api.getGroupInfo(id)).then(info=>{
      const name=info?.gridInfoMap?.[id]?.name;
      if(name)groupNames.set(id,String(name).replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,100));
    }).catch(()=>{}).finally(()=>lookups.delete(id));
  };
  let timer,started=false,stopping=false,stopPromise;
  const notifyDm=(id,item,note='')=>{
    const sensitive=isSensitiveContent(item.text);
    const status=sensitive?'pending':'local';
    store.db.prepare("INSERT INTO reports(task_id,text,status) VALUES(?,?,?)").run(id,`Tin riêng mới từ ${item.senderName?`${item.senderName} (${item.sender})`:item.sender}${note}:\n${item.text.slice(0,1500)}`,status);
  };
  const messageHandler=message=>{
    if(stopping)return;
    let accepted;
    try {
      if(owner.handle(message))return;
      accepted=router.accept(message);if(!accepted)return;
      const {item}=accepted,id=`${item.threadId}:${item.id}`;
      if(item.kind==='group'){
        if(groupNames.has(item.threadId))item.threadName=groupNames.get(item.threadId);else lookupGroup(item.threadId);
      }
      if(!accepted.addressed){store.addContext(id,item.threadId,item);return;}
      if(store.add(id,item.threadId,item,{maxPendingTasks})&&item.kind==='dm')notifyDm(id,item);
    } catch(error){
      if(error.code==='QUEUE_FULL'&&accepted?.item.kind==='dm'){try{notifyDm(`${accepted.item.threadId}:${accepted.item.id}`,accepted.item,' (hàng chờ đầy, AI chưa xử lý)');}catch{}}
      log(error.code==='QUEUE_FULL'
      ?'Hàng chờ đầy; tin mới chưa được lưu. Xử lý task tồn rồi gửi lại bằng tin mới.'
      :'Không lưu được yêu cầu. Kiểm tra SQLite và ổ đĩa.');}
  };

  // Quét đọc lại tin nhắn cũ chưa trả lời khi khởi động lại agent
  const catchUpHistory=async()=>{
    if(typeof api.getGroupChatHistory!=='function'||stopping)return;
    try{
      let groupIds=[];
      if(router.scope==='single'&&config.allowedGroupId){
        groupIds=[config.allowedGroupId];
      }else if(typeof api.getAllGroups==='function'){
        const all=await api.getAllGroups();
        groupIds=Object.keys(all?.gridVerMap??{}).filter(id=>/^\d+$/.test(id));
      }
      if(!groupIds.length)return;
      let queuedCount=0;
      const maxAgeMs=24*60*60*1000;
      for(const gid of groupIds){
        if(stopping)break;
        try{
          const history=await api.getGroupChatHistory(gid,25);
          const msgs=history?.groupMsgs??[];
          msgs.sort((a,b)=>Number(a.data?.ts??0)-Number(b.data?.ts??0));
          for(const msg of msgs){
            if(stopping)break;
            const ts=Number(msg.data?.ts??0);
            const isRecent=!ts||(Date.now()-ts)<=maxAgeMs;
            let accepted=router.accept(msg);
            if(!accepted)continue;
            const {item}=accepted,id=`${item.threadId}:${item.id}`;
            if(item.kind==='group'){
              if(groupNames.has(item.threadId))item.threadName=groupNames.get(item.threadId);
              else lookupGroup(item.threadId);
            }
            if(!accepted.addressed||!isRecent){
              store.addContext(id,item.threadId,item);
              continue;
            }
            if(store.add(id,item.threadId,item,{maxPendingTasks})){
              queuedCount++;
              if(item.kind==='dm')notifyDm(id,item);
            }
          }
        }catch{}
      }
      if(queuedCount>0){
        log(`Đã kiểm tra tin nhắn cũ: phát hiện ${queuedCount} tin liên quan chưa trả lời, đang xử lý.`);
      }
    }catch{}
  };

  const errorHandler=()=>log('Kết nối Zalo báo lỗi.');
  const connectedHandler=()=>{
    log(router.scope==='all'
      ?`JEV đã kết nối: nghe mọi nhóm (khi được tag/gọi tên/trả lời) và tin riêng. mode=${config.mode}. Chủ điều khiển bằng tin riêng /jev help.`
      :`JEV đã kết nối nhóm đã chọn. mode=${config.mode}. Chủ điều khiển bằng tin riêng /jev help.`);
    void catchUpHistory();
  };
  const closedHandler=()=>{void stop().then(onClosed).catch(()=>log('Chưa dừng sạch; giữ worker.lock để kiểm tra.'));};
  function stop(){
    if(stopPromise)return stopPromise;
    stopping=true;clearInterval(timer);
    api.listener.off('message',messageHandler);
    stopPromise=(async()=>{
      await worker.stop();
      api.listener.off('connected',connectedHandler);
      api.listener.off('error',errorHandler);
      api.listener.off('closed',closedHandler);
      api.listener.stop();
    })();
    return stopPromise;
  }
  return {
    scope:scopeOf(config),
    catchUpHistory,
    start(){
      if(started||stopping)throw Error('Runtime đã chạy hoặc đang dừng');started=true;
      allowLateCloseErrors(api.listener);
      api.listener.on('message',messageHandler);
      api.listener.on('connected',connectedHandler);
      api.listener.on('error',errorHandler);
      api.listener.on('closed',closedHandler);
      timer=setInterval(()=>worker.tick().catch(()=>log('Worker lỗi; kiểm tra trạng thái yêu cầu.')),intervalMs);
      try{api.listener.start({retryOnClose:false});}catch(error){void stop();throw error;}
    },
    tick:()=>worker.tick(),stop
  };
}

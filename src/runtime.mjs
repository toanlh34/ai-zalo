import {createInbox} from './filter.mjs';
import {createWorker} from './worker.mjs';
import {createOwnerController} from './owner.mjs';
import {validateQueueLimit} from './store.mjs';
import {allowLateCloseErrors} from './listener-utils.mjs';

export function validateRuntimeConfig(config){
  createInbox(config.allowedGroupId,config.contextLimit??30);
  validateQueueLimit(config.maxPendingTasks??100);
  if(!/^\d+$/.test(config.ownerUserId??'')||!['live','dry-run'].includes(config.mode))throw Error('Cần cấu hình ownerUserId và mode hợp lệ');
  return config;
}

export function createRuntime({api,store,agent,config,pausePath,intervalMs=1000,log=console.log,onClosed=()=>{}}) {
  validateRuntimeConfig(config);
  const inbox=createInbox(config.allowedGroupId,config.contextLimit??30);
  const maxPendingTasks=validateQueueLimit(config.maxPendingTasks??100);
  if(!/^\d+$/.test(config.ownerUserId??'')||!['live','dry-run'].includes(config.mode))throw Error('Cần cấu hình ownerUserId và mode hợp lệ');
  const owner=createOwnerController({store,config,pausePath});
  const worker=createWorker({store,agent,config,pausePath,send:(text,to,type)=>api.sendMessage(text,to,type)});
  let timer,started=false,stopping=false,stopPromise;
  const messageHandler=message=>{
    if(stopping)return;
    try {
      if(owner.handle(message))return;
      const accepted=inbox.accept(message);if(!accepted)return;
      store.add(`${config.allowedGroupId}:${accepted.item.id}`,config.allowedGroupId,accepted.item,{maxPendingTasks});
    } catch(error){log(error.code==='QUEUE_FULL'
      ?'Hàng chờ đầy; tin mới chưa được lưu. Xử lý task tồn rồi gửi lại bằng tin mới.'
      :'Không lưu được yêu cầu. Kiểm tra SQLite và ổ đĩa.');}
  };
  const errorHandler=()=>log('Kết nối Zalo báo lỗi.');
  const connectedHandler=()=>log(`JEV đã kết nối nhóm đã chọn. mode=${config.mode}. Chủ điều khiển bằng tin riêng /jev help.`);
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

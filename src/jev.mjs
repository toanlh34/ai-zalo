import { readFileSync, existsSync, writeFileSync, rmSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Zalo } from 'zca-js';
import { secureDirectory, loadSession } from './session.mjs';
import { createInbox } from './filter.mjs';
import { createAgent } from './agent.mjs';
import { openStore } from './store.mjs';
import { createWorker } from './worker.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=join(root,'.private'), pausePath=join(dir,'PAUSED');
let store,api,timer,lockFd;
const lockPath=join(dir,'worker.lock');
try {
  secureDirectory(dir);
  store=openStore(join(dir,'jev.sqlite'));
  const [command='run',id,...words]=process.argv.slice(2);
  if(command==='list'){console.log(JSON.stringify(store.list(),null,2));}
  else if(command==='reports'){console.log(JSON.stringify(store.db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 100').all(),null,2));}
  else if(command==='pause'){writeFileSync(pausePath,'paused');console.log('Đã dừng gửi khách.');}
  else if(command==='resume'){rmSync(pausePath,{force:true});console.log('Đã bỏ dừng gửi khách.');}
  else if(command==='approve'){
    const task=store.get(id);if(!task||task.status!=='review')throw Error('Task không ở trạng thái review');
    const d=task.decision?JSON.parse(task.decision):{action:'escalate',category:'other',reason:'Chủ xử lý',report:'Chủ cung cấp câu trả lời'};
    if(words.length)d.reply=words.join(' ');
    if(!d.reply?.trim()||d.reply.length>1800)throw Error('Cần nội dung trả lời hợp lệ');
    store.decision(id,d,'approved');store.report(id,'Anh đã duyệt nội dung trả lời.');console.log('Đã duyệt. Worker sẽ xử lý theo mode hiện tại.');
  }else if(command==='reject'){if(!store.transition(id,'review','rejected'))throw Error('Task không ở review');store.report(id,'Anh từ chối bản nháp; chưa gửi khách.');}
  else if(command==='run'){
    const config=JSON.parse(readFileSync(join(root,'config.json'),'utf8'));
    if(!['dry-run','live'].includes(config.mode))throw Error('Cần mode dry-run hoặc live');
    if(!/^\d+$/.test(config.ownerUserId??''))throw Error('Cần ownerUserId để báo cáo');
    const inbox=createInbox(config.allowedGroupId,config.contextLimit??30);
    const agent=createAgent(config.ai??{},root);
    lockFd=openSync(lockPath,'wx');writeFileSync(lockFd,String(process.pid));
    store.recover();
    api=await new Zalo({selfListen:false,logging:false,checkUpdate:false}).login(loadSession(dir));
    const worker=createWorker({store,agent,config,pausePath,send:(text,to,type)=>api.sendMessage(text,to,type)});
    api.listener.on('message',message=>{const accepted=inbox.accept(message);if(!accepted)return;store.add(`${config.allowedGroupId}:${accepted.item.id}`,config.allowedGroupId,accepted.item);});
    api.listener.on('error',()=>console.error('Listener lỗi.'));
    api.listener.on('closed',()=>{console.error('Listener đóng. Khởi động lại thủ công.');cleanup();process.exitCode=1;});
    api.listener.on('connected',()=>console.log(`JEV đã kết nối. mode=${config.mode}. Xem báo cáo: npm run jev -- reports`));
    timer=setInterval(()=>worker.tick().catch(()=>console.error('Worker lỗi; kiểm tra task và báo cáo.')),1000);
    api.listener.start({retryOnClose:false});
    process.on('SIGINT',()=>{cleanup();process.exit(0);});process.on('SIGTERM',()=>{cleanup();process.exit(0);});
  }else throw Error('Lệnh: run/list/reports/approve/reject/pause/resume');
  if(command!=='run'){store.close();store=null;}
}catch(e){console.error(`JEV chưa chạy được: ${e.code==='EEXIST'?'worker.lock đã có; kiểm tra tiến trình cũ trước khi xóa lock':e.message?.startsWith('Cần')?e.message:'Kiểm tra cấu hình/phiên và lệnh. Không chia sẻ file .private.'}`);cleanup();process.exitCode=1;}
function cleanup(){clearInterval(timer);try{api?.listener.stop();}catch{}if(lockFd!==undefined){closeSync(lockFd);rmSync(lockPath,{force:true});lockFd=undefined;}}

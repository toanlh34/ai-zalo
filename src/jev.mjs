import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {secureDirectory,loadSession} from './session.mjs';
import {createAgent} from './agent.mjs';
import {handleLocalCommand,usage} from './commands.mjs';
import {openStore} from './store.mjs';
import {createRuntime,validateRuntimeConfig} from './runtime.mjs';
import {acquireLock} from './lock.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),dir=join(root,'.private'),pausePath=join(dir,'PAUSED');
let store,runtime,releaseLock,shutdownPromise;
async function shutdown(){
  if(shutdownPromise)return shutdownPromise;
  shutdownPromise=(async()=>{
    await runtime?.stop();
    if(store){store.close();store=null;}
    releaseLock?.();releaseLock=null;
  })();
  return shutdownPromise;
}
try{
  const [command='run',...args]=process.argv.slice(2);
  if(command==='help'||command==='--help'||args.includes('--help'))console.log(`${usage}\nrun --live: bật trả lời nhóm đã cấu hình; run --dry-run: chỉ tạo bản nháp.`);
  else{
    secureDirectory(dir);
    if(command==='run')releaseLock=acquireLock(join(dir,'worker.lock'));
    store=openStore(join(dir,'jev.sqlite'));
    const [id,...words]=args;
    if(handleLocalCommand({store,command,id,words,pausePath}))await shutdown();
    else if(command==='run'){
      if(args.some(arg=>!['--live','--dry-run'].includes(arg))||(args.includes('--live')&&args.includes('--dry-run')))throw Error('Cần chọn --live hoặc --dry-run');
      let config;
      try{config=JSON.parse(readFileSync(join(root,'config.json'),'utf8'));}catch{throw Error('Cần chạy npm run setup để đăng nhập và chọn nhóm/chủ trước');}
      if(args.includes('--live'))config.mode='live';
      if(args.includes('--dry-run'))config.mode='dry-run';
      if(!/^\d+$/.test(config.allowedGroupId??'')||!/^\d+$/.test(config.ownerUserId??''))throw Error('Cần chạy npm run setup để chọn đúng nhóm và chủ');
      validateRuntimeConfig(config);
      const agent=createAgent(config.ai??{},root);
      let session;try{session=loadSession(dir);}catch{throw Error('Cần đăng nhập Zalo: npm run setup');}
      const {Zalo}=await import('zca-js');
      const api=await new Zalo({selfListen:false,logging:false,checkUpdate:false}).login(session);
      store.recover();
      runtime=createRuntime({api,store,agent,config,pausePath,onClosed:()=>{process.exitCode=1;return shutdown();}});
      const signal=()=>{console.log('Đang dừng agent và kết thúc công việc đang chạy...');void shutdown().catch(()=>{console.error('Chưa dừng sạch; kiểm tra worker.lock trước khi chạy lại.');process.exitCode=1;});};
      process.once('SIGINT',signal);process.once('SIGTERM',signal);
      runtime.start();
    }else throw Error(`Cần chọn lệnh hợp lệ. ${usage}`);
  }
}catch(error){
  console.error(`JEV chưa chạy được: ${error.code==='EEXIST'?'worker.lock đã có; kiểm tra agent hoặc setup đang chạy':error.message?.startsWith('Cần')?error.message:'Kiểm tra cấu hình/phiên Zalo và kết nối. Không chia sẻ dữ liệu .private.'}`);
  try{await shutdown();}catch{console.error('Giữ worker.lock để kiểm tra tiến trình chưa dừng sạch.');}
  process.exitCode=1;
}

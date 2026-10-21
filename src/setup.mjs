import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {existsSync,readFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {secureDirectory,loadSession} from './session.mjs';
import {acquireLock} from './lock.mjs';
import {loginWithQR} from './zalo-login.mjs';
import {configureAgent,saveConfig} from './onboarding.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
if(process.argv.includes('--help'))console.log('npm run setup: đăng nhập QR tài khoản agent, chọn nhóm, ghép chủ qua tin riêng. Chỉ lưu cấu hình dry-run; không gọi Claude hoặc gửi tin.');
else{
  let releaseLock,rl,api;
  const controller=new AbortController(),interrupt=()=>controller.abort();
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  try{
    const dir=join(root,'.private');secureDirectory(dir);releaseLock=acquireLock(join(dir,'worker.lock'));
    rl=createInterface({input:stdin,output:stdout});
    rl.on('SIGINT',interrupt);
    const ask=prompt=>rl.question(prompt,{signal:controller.signal});
    const configPath=join(root,'config.json');
    const template=JSON.parse(readFileSync(existsSync(configPath)?configPath:join(root,'config.example.json'),'utf8'));
    const {Zalo,LoginQRCallbackEventType}=await import('zca-js');
    const zalo=new Zalo({selfListen:false,logging:false,checkUpdate:false});
    if(existsSync(join(dir,'session.dpapi'))){
      const reuse=await ask('Dùng phiên Zalo đã lưu? [Y/n]: ');
      if(reuse.trim().toLowerCase()!=='n'){
        try{api=await zalo.login(loadSession(dir));}
        catch{console.log('Phiên cũ không còn dùng được. Quét QR mới để đăng nhập lại.');}
      }
    }
    if(!api)api=await loginWithQR({zalo,events:LoginQRCallbackEventType,privateDir:dir,signal:controller.signal,onQr:path=>{
      console.log(`Quét QR bằng Zalo của tài khoản agent trên điện thoại: ${path}`);
      if(process.platform==='win32')execFile('explorer.exe',[path],{windowsHide:true},()=>{});
    }});
    const config=await configureAgent({api,template,ask,signal:controller.signal,onCode:code=>console.log(`/jev pair ${code}\nMã dùng một lần, hết hạn sau 5 phút. Không chia sẻ mã hoặc QR.`)});
    saveConfig(configPath,config);
    console.log('Đã thiết lập agent với Claude CLI.\nThử không gửi: npm run agent -- --dry-run\nBật trả lời nhóm đã chọn: npm run agent -- --live\nChủ điều khiển trong tin riêng bằng /jev help.');
  }catch(error){console.error(error.code==='EEXIST'?'Agent hoặc setup đang chạy. Kiểm tra worker.lock trước khi chạy lại.':'Setup chưa hoàn tất. Kiểm tra phiên/QR, kết nối và nhóm; có thể chạy lại npm run setup.');process.exitCode=1;}
  finally{try{api?.listener.stop();}catch{}rl?.close();releaseLock?.();process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);}
}

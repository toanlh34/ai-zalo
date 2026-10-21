import {writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {saveSession} from './session.mjs';

export async function loginWithQR({zalo,events,privateDir,onQr,save=saveSession,signal}){
  const path=join(privateDir,'login-qr.png');let credentials,abortLogin;
  const abort=()=>abortLogin?.();
  if(signal?.aborted)throw Error('Đã hủy đăng nhập.');
  signal?.addEventListener('abort',abort,{once:true});
  try{
    const api=await zalo.loginQR({qrPath:path},event=>{
      if(event.actions?.abort)abortLogin=()=>event.actions.abort();
      if(signal?.aborted){abort();return;}
      if(event.type===events.QRCodeGenerated){writeFileSync(path,Buffer.from(event.data.image,'base64'),{mode:0o600});onQr(path);}
      else if(event.type===events.GotLoginInfo)credentials=event.data;
      else if([events.QRCodeExpired,events.QRCodeDeclined].includes(event.type))event.actions.abort();
    });
    if(signal?.aborted)throw Error('Đã hủy đăng nhập.');
    if(!credentials)throw Error('Không có phiên đăng nhập.');
    save(privateDir,credentials);return api;
  }finally{signal?.removeEventListener('abort',abort);rmSync(path,{force:true});}
}

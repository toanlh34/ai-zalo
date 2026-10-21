import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {secureDirectory} from './session.mjs';
import {createAppToolRouter} from './app-tools.mjs';
export async function startAppBridge({dataRoot,dispatch,onCall=()=>{},secure=secureDirectory}){
  const directory=join(dataRoot,'.private');secure(directory);
  const descriptor=join(directory,'mcp-bridge.json'),token=randomBytes(32).toString('hex');
  const route=createAppToolRouter(dispatch);
  const server=createServer(async(req,res)=>{
    const reply=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    const supplied=String(req.headers.authorization??'').replace(/^Bearer /,'');
    if(req.headers.origin||req.headers.host!==`127.0.0.1:${server.address().port}`||!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token))){reply(403,{error:'Không được phép kết nối MCP.'});return;}
    if(req.method!=='POST'||req.url!=='/call'){reply(404,{error:'Thao tác không hỗ trợ.'});return;}
    try{
      let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>300000){reply(413,{error:'Dữ liệu quá lớn.'});req.destroy();return;}chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(typeof input.name!=='string'||!input.arguments||typeof input.arguments!=='object'||Array.isArray(input.arguments))throw Error('Cần tham số MCP hợp lệ.');
      const result=await route(input.name,input.arguments);onCall(input.name);reply(200,{result});
    }catch(error){reply(400,{error:/^(Cần|Chọn|Dừng|Thao tác|Tên|Đã hủy)/.test(error.message??'')?error.message:'Chưa thực hiện được thao tác MCP. Kiểm tra app và cấu hình.'});}
  });
  server.requestTimeout=150000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  writeFileSync(descriptor,JSON.stringify({port,token,pid:process.pid}),{mode:0o600});
  return {async close(){try{if(JSON.parse(readFileSync(descriptor,'utf8')).token===token)rmSync(descriptor,{force:true});}catch{}server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}

export async function callAppTool(dataRoot,name,args={}){
  let info;try{info=JSON.parse(readFileSync(join(dataRoot,'.private','mcp-bridge.json'),'utf8'));}catch{throw Error('Cần mở BIMUP Zalo Assistance bản có MCP trước.');}
  if(!Number.isInteger(info.port)||info.port<1||info.port>65535||!/^[a-f0-9]{64}$/.test(info.token))throw Error('Cần mở lại app để khởi tạo kết nối MCP.');
  let response;
  try{response=await fetch(`http://127.0.0.1:${info.port}/call`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${info.token}`},body:JSON.stringify({name,arguments:args}),signal:AbortSignal.timeout(145000)});}catch{throw Error('Cần mở lại BIMUP Zalo Assistance; MCP chưa kết nối được.');}
  const result=await response.json();if(!response.ok)throw Error(result.error??'Thao tác MCP không thành công.');return result.result;
}

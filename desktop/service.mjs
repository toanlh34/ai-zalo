import {createInterface} from 'node:readline';
import {createDesktopController} from './controller.mjs';
import {startAppBridge} from '../src/app-mcp-bridge.mjs';
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
console.log=(...args)=>output({event:'log',data:args.map(String).join(' ')});
console.error=()=>output({event:'log',data:'Có lỗi vận hành. Kiểm tra trạng thái hoặc kết nối Zalo.'});
let service,bridge,requestId=0;
const mainCalls=new Map();
function mainDispatch(action,payload){return new Promise((resolve,reject)=>{
  const id=++requestId,timer=setTimeout(()=>{mainCalls.delete(id);reject(Error('Thao tác MCP quá thời gian chờ.'));},145000);timer.unref();
  mainCalls.set(id,{resolve,reject,timer});output({event:'mcp-request',data:{id,action,payload}});
});}
async function close(){
  for(const call of mainCalls.values()){clearTimeout(call.timer);call.reject(Error('Ứng dụng đã đóng.'));}mainCalls.clear();
  await bridge?.close();await service.close();
}
try{
  const profileKeys=JSON.parse(process.env.JEV_AI_KEYS||'{}');delete process.env.JEV_AI_KEYS;
  service=createDesktopController({dataRoot:process.env.JEV_DATA_ROOT,sourceRoot:process.env.JEV_SOURCE_ROOT,dependencies:{profileKeys},emit:(event,data)=>output({event,data})});
  let mcpError=null;
  try{bridge=await startAppBridge({dataRoot:process.env.JEV_DATA_ROOT,dispatch:mainDispatch,onCall:name=>{output({event:'log',data:'MCP quản trị: '+name});output({event:'state'});}});}
  catch(error){mcpError=error.code||'MCP_START_FAILED';}
  output({event:'ready',mcpEnabled:!!bridge,mcpError});
}catch{output({event:'fatal',data:'Không mở được dữ liệu. Có thể JEV đã chạy hoặc worker.lock còn tồn tại. Mở thư mục dữ liệu để kiểm tra.'});process.exit(1);}
let active=0,ending=false;
const reader=createInterface({input:process.stdin});
reader.on('line',async line=>{
  let message;try{message=JSON.parse(line);}catch{return;}
  if(message.event==='mcp-response'){
    const call=mainCalls.get(message.id);if(call){clearTimeout(call.timer);mainCalls.delete(message.id);message.error?call.reject(Object.assign(Error(message.error),{code:message.errorCode})):call.resolve(message.result);}return;
  }
  active++;
  try{
    if(message.action==='shutdown'){ending=true;await close();output({id:message.id,result:true});reader.close();process.exit(0);}
    output({id:message.id,result:await service.dispatch(message.action,message.payload)});
  }catch(error){
    const known=/^(Cần|Chọn|Dừng|Tải|Tên|Lệnh|Thao tác|Đã hủy|Mã ghép|Ghép chủ|Kết nối ghép)/.test(error.message??'');
    const aiErrors={AI_AUTHENTICATION:'Cần kiểm tra API key hoặc đăng nhập CLI của kết nối AI.',AI_RATE_LIMITED:'AI đã hết hạn mức hoặc số dư.',AI_TIMEOUT:'AI trả lời quá thời gian chờ.',AI_CANCELLED:'Đã hủy gọi AI.',AI_NETWORK_ERROR:'Không kết nối được AI. Kiểm tra mạng.',AI_INVALID_DECISION:'AI trả về bản nháp không hợp lệ. Chưa gửi tin.'};
    output({id:message.id,errorCode:error.code,error:aiErrors[error.code]??(known?error.message:'Chưa thực hiện được. Kiểm tra phiên Zalo, cấu hình AI và mạng; có thể đăng nhập QR lại.')});
  }finally{active--;}
});
process.stdin.on('end',async()=>{if(!ending){await close();process.exit(0);}});

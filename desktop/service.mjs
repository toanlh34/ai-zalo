import {createInterface} from 'node:readline';
import {createDesktopController} from './controller.mjs';
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
console.log=(...args)=>output({event:'log',data:args.map(String).join(' ')});
console.error=()=>output({event:'log',data:'Có lỗi vận hành. Kiểm tra trạng thái hoặc kết nối Zalo.'});
let service;
try{
  const profileKeys=JSON.parse(process.env.JEV_AI_KEYS||'{}');delete process.env.JEV_AI_KEYS;
  service=createDesktopController({dataRoot:process.env.JEV_DATA_ROOT,sourceRoot:process.env.JEV_SOURCE_ROOT,dependencies:{profileKeys},emit:(event,data)=>output({event,data})});
  output({event:'ready'});
}catch{output({event:'fatal',data:'Không mở được dữ liệu. Có thể JEV đã chạy hoặc worker.lock còn tồn tại. Mở thư mục dữ liệu để kiểm tra.'});process.exit(1);}
let active=0,ending=false;
const reader=createInterface({input:process.stdin});
reader.on('line',async line=>{
  let message;try{message=JSON.parse(line);}catch{return;}
  active++;
  try{
    if(message.action==='shutdown'){ending=true;await service.close();output({id:message.id,result:true});reader.close();process.exit(0);}
    output({id:message.id,result:await service.dispatch(message.action,message.payload)});
  }catch(error){
    const known=/^(Cần|Chọn|Dừng|Tải|Tên|Lệnh|Thao tác|Đã hủy|Mã ghép|Ghép chủ|Kết nối ghép)/.test(error.message??'');
    const aiErrors={AI_AUTHENTICATION:'Cần kiểm tra API key hoặc đăng nhập CLI của kết nối AI.',AI_RATE_LIMITED:'AI đã hết hạn mức hoặc số dư.',AI_TIMEOUT:'AI trả lời quá thời gian chờ.',AI_CANCELLED:'Đã hủy gọi AI.',AI_NETWORK_ERROR:'Không kết nối được AI. Kiểm tra mạng.',AI_INVALID_DECISION:'AI trả về bản nháp không hợp lệ. Chưa gửi tin.'};
    output({id:message.id,error:aiErrors[error.code]??(known?error.message:'Chưa thực hiện được. Kiểm tra phiên Zalo, cấu hình AI và mạng; có thể đăng nhập QR lại.')});
  }finally{active--;}
});
process.stdin.on('end',async()=>{if(!ending){await service.close();process.exit(0);}});

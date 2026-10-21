import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {join,dirname} from 'node:path';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(join(process.env.LOCALAPPDATA,'Programs','BIMUP','ZaloAssistance','installation.json'),'utf8').replace(/^\uFEFF/,''));
const root=dirname(manifest.executable),client=new Client({name:'bimup-admin-check',version:'1.0.0'});
const transport=new StdioClientTransport({command:join(root,'resources','runtime','node.exe'),args:[join(dirname(root),'mcp-launcher.cjs')]});
try{
  await client.connect(transport);
  const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw Error(r.content[0].text);return JSON.parse(r.content[0].text);};
  if(process.argv.includes('--create-mai')){
    const connections=await call('list_ai_connections'),connection=connections.find(c=>c.provider==='antigravity-cli');
    if(!connection)throw Error('Cần kết nối Antigravity trong app trước.');
    const current=await call('list_assistants');let assistant=current.assistants.find(a=>a.name==='Mai');
    if(!assistant)assistant=await call('save_assistant',{name:'Mai',age:'',personality:'Thân thiện, rõ ràng, chuyên nghiệp.',role:'Trợ lý nữ chăm sóc khách hàng BIMUP.',skill:'Đọc kiến thức riêng trước khi soạn câu trả lời. Không tự suy đoán giá, cam kết hoặc thông tin chưa có trong tài liệu. Khi thiếu căn cứ, hỏi lại hoặc chuyển chủ xác nhận. Chỉ soạn nháp; việc gửi do app kiểm soát.',connectionIds:[connection.id],strategy:'primary'});
    const verified=await call('get_assistant',{id:assistant.id});
    console.log(JSON.stringify({ok:true,tools:(await client.listTools()).tools.length,assistant:{id:verified.id,name:verified.name,provider:connection.provider},activeAssistantId:(await call('app_status')).activeAssistantId,zaloSent:false}));
  }else{
    const name=process.argv[2]||'app_status',args=process.argv[3]?JSON.parse(readFileSync(process.argv[3],'utf8')):{};
    console.log(JSON.stringify(await call(name,args)));
  }
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await client.close();}

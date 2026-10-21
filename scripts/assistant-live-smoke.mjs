import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
const installed=process.argv.includes('--installed');
let moduleUrl=new URL('../src/assistants.mjs',import.meta.url),version='source';
if(installed){const manifest=JSON.parse(readFileSync(join(process.env.LOCALAPPDATA,'Programs','BIMUP','ZaloAssistance','installation.json'),'utf8').replace(/^\uFEFF/,''));version=manifest.version;moduleUrl=pathToFileURL(join(dirname(manifest.executable),'resources','engine','src','assistants.mjs'));}
const {createAssistantRegistry,createAssistantAgent}=await import(moduleUrl.href);
const root=mkdtempSync(join(tmpdir(),'bimup-live-assistant-')),marker='BIMUP-'+randomBytes(5).toString('hex');
const started=Date.now();
try{
  const registry=createAssistantRegistry(root,{provider:'antigravity-cli',model:''});
  const connection=registry.saveConnection({name:'Antigravity smoke',provider:'antigravity-cli',model:''});
  const assistant=registry.saveAssistant({name:'Hana Test',age:'25',personality:'Điềm tĩnh',role:'Trợ lý kiểm thử tổng hợp thông tin từ hồ sơ và tài liệu.',skill:'Khi được hỏi hồ sơ, trả tên, tuổi và mã kiểm tra lấy từ tài liệu. Không dùng tool. Chỉ soạn nháp JSON.',connectionIds:[connection.id],strategy:'primary'});
  writeFileSync(join(registry.folder(assistant.id),'knowledge','test.md'),`# Dữ liệu giả để thử\nMã kiểm tra của trợ lý này: ${marker}\n`);
  const decision=await createAssistantAgent(registry,assistant.id).decide({message:{id:'synthetic-live-test',text:'Cho biết tên, tuổi trong hồ sơ của bạn và mã kiểm tra trong tài liệu.'},context:[]});
  const checks={name:decision.reply.includes('Hana Test'),age:decision.reply.includes('25'),knowledge:decision.reply.includes(marker)};
  const ok=Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ok,installed,version,durationSeconds:Math.round((Date.now()-started)/1000),checks,reply:decision.reply,zaloSent:false}));
  if(!ok)process.exitCode=1;
}catch(error){console.log(JSON.stringify({ok:false,version,code:error.code??'UNKNOWN',durationSeconds:Math.round((Date.now()-started)/1000),zaloSent:false}));process.exitCode=1;}
finally{rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}

import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createAgent} from '../src/agent.mjs';
const root=mkdtempSync(join(tmpdir(),'bimup-agy-smoke-'));
try{
  mkdirSync(join(root,'agent','skills','customer-support'),{recursive:true});mkdirSync(join(root,'knowledge'));
  writeFileSync(join(root,'agent','IDENTITY.md'),'You draft Vietnamese replies. For a greeting return action=send, category=greeting, reply="Xin chào", reason="Chào hỏi", report="Khách chào". Do not use tools.');
  writeFileSync(join(root,'agent','skills','customer-support','SKILL.md'),'Only return a JSON decision; never call tools.');
  const result=await createAgent({provider:'antigravity-cli',timeoutMs:45000},root).decide({message:{text:'Xin chào'},context:[]});
  console.log(JSON.stringify({ok:true,category:result.category,reply:result.reply}));
}catch(error){console.log(JSON.stringify({ok:false,code:error.code??'UNKNOWN',message:error.message}));process.exitCode=1;}
finally{rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}

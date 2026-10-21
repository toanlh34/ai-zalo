import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAgent} from '../src/agent.mjs';
import {resolveAntigravityCommand} from '../src/antigravity.mjs';
const decision={action:'send',category:'greeting',reply:'Xin chào',reason:'Chào hỏi',report:'Khách chào'};
function fixture(t,source,config={}){
  const root=mkdtempSync(join(tmpdir(),'bimup-agy-test-'));
  mkdirSync(join(root,'agent','skills','customer-support'),{recursive:true});mkdirSync(join(root,'knowledge'));
  writeFileSync(join(root,'agent','IDENTITY.md'),'PRIVATE_SYNTHETIC_AGY');writeFileSync(join(root,'agent','skills','customer-support','SKILL.md'),'Draft only.');
  const executable=join(root,'fake agy.mjs');
  writeFileSync(executable,"let data='';for await(const chunk of process.stdin)data+=chunk;\n"+source);
  const agent=createAgent({provider:'antigravity-cli',executable,timeoutMs:5000,...config},root,{env:{...process.env,GEMINI_API_KEY:'synthetic-key',DEEPSEEK_API_KEY:'synthetic-key'}});
  t.after(()=>rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}));return {root,agent};
}
const result=(value=decision)=>`process.stdout.write(JSON.stringify({event:'result',result:{status:'SUCCESS',response:${JSON.stringify(JSON.stringify(value))}}})+'\\n');`;
test('Antigravity streams input privately, uses isolated drafting profile, no tools, no API key',async t=>{
  const x=fixture(t,`
import {readFileSync} from 'node:fs';
const profile=readFileSync('.agents/agents/bimup-zalo-drafter.md','utf8');
if(!profile.includes('tools: []')||!profile.includes('mcpServers: []')||!profile.includes('PRIVATE_SYNTHETIC_AGY'))process.exit(9);
if(process.env.GEMINI_API_KEY||process.env.DEEPSEEK_API_KEY)process.exit(10);
if(!process.argv.includes('--disable-slash-commands')||process.argv.includes('--dangerously-skip-permissions'))process.exit(11);
const message=JSON.parse(data);if(message.event!=='user'||JSON.parse(message.message.content).message.text!=='Chào')process.exit(12);
${result()}`);
  assert.deepEqual(await x.agent.decide({message:{text:'Chào'},context:[]}),decision);
  assert.deepEqual(readdirSync(join(x.root,'.private')),[]);
});
test('Antigravity also accepts structured_output and split UTF-8 chunks',async t=>{
  const x=fixture(t,`const b=Buffer.from(JSON.stringify({event:'result',result:{status:'SUCCESS',structured_output:${JSON.stringify(decision)}}})+String.fromCharCode(10));const split=b.indexOf(Buffer.from('à'))+1;process.stdout.write(b.subarray(0,split));await new Promise(r=>setTimeout(r,20));process.stdout.write(b.subarray(split));`);
  assert.deepEqual(await x.agent.decide({}),decision);
});
for(const [name,code,source] of [
  ['quota','AI_RATE_LIMITED',`process.stdout.write(JSON.stringify({event:'result',result:{status:'ERROR',error:'RESOURCE_EXHAUSTED quota'}}));`],
  ['auth','AI_AUTHENTICATION',`process.stderr.write('authentication required PRIVATE_SYNTHETIC_AGY');process.exitCode=2;`],
  ['invalid JSON','AI_INVALID_JSON',`process.stdout.write('PRIVATE_SYNTHETIC_AGY');`],
  ['invalid decision','AI_INVALID_DECISION',result({})],
  ['incomplete','AI_CLI_ERROR',`process.stdout.write(JSON.stringify({event:'result',result:{status:'TIMEOUT',response:'{}'}}));`],
  ['tool attempt','AI_TOOL_CALL',`process.stdout.write(JSON.stringify({event:'step_update',step_update:{step_type:'tool',tool_name:'run_command'}})+String.fromCharCode(10));await new Promise(r=>setTimeout(r,60000));`],
  ['output limit','AI_OUTPUT_LIMIT',`process.stdout.write('x'.repeat(2000001));`]
])test(`Antigravity ${name} fails closed without exposing private data`,async t=>{
  const x=fixture(t,source);await assert.rejects(x.agent.decide({}),e=>e.code===code&&!String(e).includes('PRIVATE_SYNTHETIC_AGY'));
  assert.deepEqual(readdirSync(join(x.root,'.private')),[]);
});
test('Antigravity timeout and cancel terminate process and remove temporary profile',async t=>{
  const x=fixture(t,'await new Promise(r=>setTimeout(r,60000));',{timeoutMs:150});
  await assert.rejects(x.agent.decide({}),{code:'AI_TIMEOUT'});
  const controller=new AbortController(),pending=x.agent.decide({},{signal:controller.signal});controller.abort();
  await assert.rejects(pending,{code:'AI_CANCELLED'});
  await assert.rejects(x.agent.decide({},{signal:controller.signal}),{code:'AI_CANCELLED'});
});
test('Windows finds agy in user install location even with stale PATH',t=>{
  const root=mkdtempSync(join(tmpdir(),'bimup-agy-resolver-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'agy','bin'),{recursive:true});const exe=join(root,'agy','bin','agy.exe');writeFileSync(exe,'');
  assert.equal(resolveAntigravityCommand('agy',{platform:'win32',env:{LOCALAPPDATA:root,PATH:''}}).command,exe);
  assert.throws(()=>resolveAntigravityCommand('agy',{platform:'win32',env:{}}),{code:'AI_CLI_MISSING'});
  assert.throws(()=>resolveAntigravityCommand('agy.cmd',{platform:'win32',env:{}}));
});

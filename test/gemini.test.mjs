import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAgent} from '../src/agent.mjs';
import {resolveGeminiCommand,GEMINI_MODEL} from '../src/gemini.mjs';
import {setupConfig} from '../src/onboarding.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const decision={action:'send',category:'greeting',reply:'Xin chào anh',reason:'Chào hỏi',report:'Khách chào'};
const secret='SYNTHETIC_GEMINI_SECRET';
const input={message:{text:'Chào'},context:[]};
const api=(fetchImpl,config={})=>createAgent({provider:'gemini-api',...config},project,{fetchImpl,env:{GEMINI_API_KEY:secret}});
const response=(overrides={})=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(decision)}]},...overrides}]}));
test('deprecated Google personal CLI login fails with an actionable message before spawning',()=>{
  assert.throws(()=>createAgent({provider:'gemini-cli'},project),/Google đã ngừng đăng nhập/);
});
test('Gemini API sends header key, separate system instructions and structured schema',async()=>{
  const agent=api(async(url,options)=>{
    assert.equal(url,`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
    assert.ok(!url.includes(secret));assert.equal(options.headers['x-goog-api-key'],secret);assert.equal(options.redirect,'error');
    const body=JSON.parse(options.body);assert.ok(body.systemInstruction.parts[0].text.includes('JEV'));
    assert.equal(body.generationConfig.responseFormat.text.schema.type,'object');assert.equal(body.tools,undefined);
    assert.equal(JSON.parse(body.contents[0].parts[0].text).message.text,'Chào');return response();
  });assert.deepEqual(await agent.decide(input),decision);
});
test('Gemini API validates key, model and refuses MCP configuration',()=>{
  assert.throws(()=>createAgent({provider:'gemini-api'},project,{env:{}}),{code:'AI_AUTHENTICATION'});
  assert.throws(()=>api(()=>{}, {model:'../key?token=bad'}));
  assert.throws(()=>api(()=>{}, {allowedMcpTools:['send']}));
  for(const provider of ['gemini-api','gemini-cli'])assert.equal(setupConfig({ai:{provider}},'123','456').ai.provider,provider);
});
for(const [status,code] of [[401,'AI_AUTHENTICATION'],[403,'AI_AUTHENTICATION'],[429,'AI_RATE_LIMITED'],[500,'AI_HTTP_ERROR']])test(`Gemini API HTTP ${status} keeps errors private`,async()=>{
  await assert.rejects(api(async()=>new Response(secret,{status})).decide(input),error=>error.code===code&&!String(error).includes(secret));
});
test('Gemini API rejects blocked, partial, malformed and tool responses',async()=>{
  for(const data of [{finishReason:'MAX_TOKENS'},{finishReason:'SAFETY'},{content:{parts:[{functionCall:{name:'send'}}]}},{content:{parts:[{text:'{}'}]}}])await assert.rejects(api(async()=>response(data)).decide(input));
  await assert.rejects(api(async()=>new Response('not JSON')).decide(input),{code:'AI_INVALID_JSON'});
  await assert.rejects(api(async()=>new Response('x'.repeat(2000001))).decide(input),{code:'AI_OUTPUT_LIMIT'});
  assert.deepEqual(await api(async()=>response({content:{parts:[{text:'hidden reasoning',thought:true},{text:JSON.stringify(decision)}]}})).decide(input),decision);
});
test('Gemini API timeout, abort and network errors do not expose input',async()=>{
  const transport=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error(secret)),{once:true}));
  await assert.rejects(api(transport,{timeoutMs:20}).decide(input),{code:'AI_TIMEOUT'});
  const controller=new AbortController(),pending=api(transport).decide(input,{signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'AI_CANCELLED'});
  await assert.rejects(api(transport).decide(input,{signal:controller.signal}),{code:'AI_CANCELLED'});
  await assert.rejects(api(async()=>{throw Error(secret);}).decide(input),error=>error.code==='AI_NETWORK_ERROR'&&!String(error).includes(secret));
});
function fixture(t,source,config={}){
  const root=mkdtempSync(join(tmpdir(),'jev-gemini-cli-'));mkdirSync(join(root,'agent','skills','customer-support'),{recursive:true});mkdirSync(join(root,'knowledge'));
  writeFileSync(join(root,'agent','IDENTITY.md'),'SYNTHETIC_PRIVATE_INSTRUCTIONS');writeFileSync(join(root,'agent','skills','customer-support','SKILL.md'),'Test');
  const executable=join(root,'fake gemini.mjs');writeFileSync(executable,"let data='';for await(const chunk of process.stdin)data+=chunk;\n"+source);
  t.after(()=>rmSync(root,{recursive:true,force:true,maxRetries:20,retryDelay:50}));
  return {root,agent:createAgent({provider:'gemini-cli',executable,timeoutMs:5000,...config},root,{allowLegacyGeminiCli:true,env:{...process.env,GEMINI_API_KEY:secret,GOOGLE_API_KEY:secret,DEEPSEEK_API_KEY:secret}})};
}
test('Gemini CLI uses Google login, disables tools/MCP/extensions, validates JSON and cleans context',async t=>{
  const x=fixture(t,`
import {readFileSync} from 'node:fs';
const settings=JSON.parse(readFileSync(process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH));
if(settings.admin.mcp.enabled!==false||settings.admin.extensions.enabled!==false||settings.tools.core.length||settings.hooks.enabled!==false)process.exit(8);
if(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY||process.env.DEEPSEEK_API_KEY)process.exit(9);
if(!readFileSync(process.env.GEMINI_SYSTEM_MD,'utf8').includes('SYNTHETIC_PRIVATE_INSTRUCTIONS'))process.exit(10);
const args=process.argv;const policy=readFileSync(args[args.indexOf('--admin-policy')+1],'utf8');
if(!policy.includes('decision = "deny"')||args[args.indexOf('--extensions')+1]!=='none')process.exit(11);
if(JSON.parse(data).message.text!=='Chào')process.exit(12);
process.stdout.write(JSON.stringify({response:${JSON.stringify(JSON.stringify(decision))}}));`);
  assert.deepEqual(await x.agent.decide(input),decision);assert.deepEqual(readdirSync(join(x.root,'.private')),[]);
});
for(const [name,code,source] of [
  ['quota','AI_RATE_LIMITED',`process.stdout.write(JSON.stringify({error:{code:429,message:'quota'}}));`],
  ['exit','AI_CLI_ERROR',`process.stderr.write('SYNTHETIC_PRIVATE_INSTRUCTIONS');process.exitCode=3;`],
  ['JSON','AI_INVALID_JSON',`process.stdout.write('SYNTHETIC_PRIVATE_INSTRUCTIONS');`],
  ['decision','AI_INVALID_DECISION',`process.stdout.write(JSON.stringify({response:'{}'}));`],
  ['limit','AI_OUTPUT_LIMIT',`process.stdout.write('x'.repeat(2000001));`]
])test(`Gemini CLI ${name} failure stays private`,async t=>{
  const x=fixture(t,source);await assert.rejects(x.agent.decide(input),error=>error.code===code&&!String(error).includes('SYNTHETIC_PRIVATE_INSTRUCTIONS'));
  assert.deepEqual(readdirSync(join(x.root,'.private')),[]);
});
test('Gemini CLI timeout and cancellation stop the process and clean files',async t=>{
  const x=fixture(t,'await new Promise(resolve=>setTimeout(resolve,60000));',{timeoutMs:150});
  await assert.rejects(x.agent.decide(input),{code:'AI_TIMEOUT'});assert.deepEqual(readdirSync(join(x.root,'.private')),[]);
  const controller=new AbortController(),pending=x.agent.decide(input,{signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'AI_CANCELLED'});
  await assert.rejects(x.agent.decide(input,{signal:controller.signal}),{code:'AI_CANCELLED'});
});
test('Windows Gemini resolver uses the official npm bin without executing shell shims',t=>{
  const root=mkdtempSync(join(tmpdir(),'jev-gemini-resolve-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const pkg=join(root,'node_modules','@google','gemini-cli');mkdirSync(pkg,{recursive:true});
  writeFileSync(join(pkg,'package.json'),JSON.stringify({name:'@google/gemini-cli',bin:{gemini:'index.js'}}));writeFileSync(join(pkg,'index.js'),'');
  assert.deepEqual(resolveGeminiCommand('gemini',{platform:'win32',env:{PATH:root}}),{command:process.execPath,args:[join(pkg,'index.js')]});
  assert.throws(()=>resolveGeminiCommand(join(root,'untrusted.cmd'),{platform:'win32',env:{}}));
  assert.throws(()=>resolveGeminiCommand('gemini',{platform:'win32',env:{}}),{code:'AI_CLI_MISSING'});
});

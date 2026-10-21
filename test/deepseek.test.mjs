import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createAgent} from '../src/agent.mjs';
import {setupConfig} from '../src/onboarding.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const decision={action:'send',category:'greeting',reply:'Xin chào',reason:'Chào hỏi',report:'Khách chào'};
const secret='synthetic-secret';
function agent(fetchImpl,config={}){return createAgent({provider:'deepseek',...config},root,{fetchImpl,env:{DEEPSEEK_API_KEY:secret}});}
function response(content=JSON.stringify(decision),finish_reason='stop'){return new Response(JSON.stringify({choices:[{finish_reason,message:{content}}]}));}
test('DeepSeek sends context, JSON schema, model and validates decision',async()=>{
  const ai=agent(async(url,options)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');
    assert.equal(options.headers.Authorization,`Bearer ${secret}`);
    assert.equal(options.redirect,'error');
    const body=JSON.parse(options.body);
    assert.equal(body.model,'deepseek-flash');assert.equal(body.response_format.type,'json_object');
    assert.ok(body.messages[0].content.includes('JEV'));assert.ok(body.messages[0].content.includes('schema'));
    assert.equal(JSON.parse(body.messages[1].content).message.text,'Chào');
    return response();
  });
  assert.deepEqual(await ai.decide({message:{text:'Chào'},context:[]}),decision);
});
test('missing key fails before any connection; setup preserves DeepSeek',()=>{
  assert.throws(()=>createAgent({provider:'deepseek'},root,{env:{},fetchImpl:()=>assert.fail()}),{code:'AI_AUTHENTICATION'});
  assert.equal(setupConfig({ai:{provider:'deepseek',model:'custom'}},'123','456').ai.provider,'deepseek');
  assert.throws(()=>agent(()=>assert.fail(),{mcpServers:{example:{}}}));
});
for(const [status,code] of [[402,'AI_RATE_LIMITED'],[429,'AI_RATE_LIMITED'],[401,'AI_AUTHENTICATION'],[500,'AI_HTTP_ERROR']])test(`HTTP ${status} is classified without leaking provider text`,async()=>{
  await assert.rejects(agent(async()=>new Response(secret,{status})).decide({}),error=>error.code===code&&!String(error).includes(secret));
});
test('rejects malformed, invalid and truncated responses',async()=>{
  for(const res of [response('bad'),response('{}'),response(JSON.stringify(decision),'length')])await assert.rejects(agent(async()=>res).decide({}),error=>/^AI_(INVALID_DECISION|INCOMPLETE_OUTPUT)$/.test(error.code));
  await assert.rejects(agent(async()=>new Response('bad')).decide({}),{code:'AI_INVALID_JSON'});
  await assert.rejects(agent(async()=>new Response('x'.repeat(2000001))).decide({}),{code:'AI_OUTPUT_LIMIT'});
});
test('network errors never echo key or input',async()=>{
  await assert.rejects(agent(async()=>{throw Error(secret);}).decide({}),error=>error.code==='AI_NETWORK_ERROR'&&!String(error).includes(secret));
});
test('timeout and cancellation abort transport',async()=>{
  const transport=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error(secret)),{once:true}));
  await assert.rejects(agent(transport,{timeoutMs:20}).decide({}),{code:'AI_TIMEOUT'});
  const controller=new AbortController();
  const pending=agent(transport).decide({},{signal:controller.signal});controller.abort();
  await assert.rejects(pending,{code:'AI_CANCELLED'});
  await assert.rejects(agent(()=>assert.fail()).decide({},{signal:controller.signal}),{code:'AI_CANCELLED'});
});

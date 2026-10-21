import test from 'node:test';
import assert from 'node:assert/strict';
import {appTools,createAppToolRouter} from '../src/app-tools.mjs';
import {publicMcpError} from '../src/app-mcp-bridge.mjs';
test('MCP exposes configuration tools but no secrets, shell, live start or send operations',()=>{
  assert.equal(appTools.length,13);assert.equal(new Set(appTools.map(t=>t.name)).size,13);
  for(const t of appTools)assert.ok(!['start','command','login','save-key','set-key','save-profile-key'].includes(t.action));
  assert.equal(appTools.find(t=>t.name==='app_status').annotations.readOnlyHint,true);
});
test('MCP status does not disclose customer messages, keys or config payloads',async()=>{
  const route=createAppToolRouter(async()=>({running:false,connected:false,operation:null,config:{mode:'dry-run',secret:'PRIVATE'},management:{activeId:'default'},statuses:{review:1},tasks:[{input:'PRIVATE'}],reports:[{text:'PRIVATE'}]}));
  const s=await route('app_status');assert.equal(s.mode,'dry-run');assert.ok(!JSON.stringify(s).includes('PRIVATE'));
});
test('MCP rejects unknown operations and extra credential/shell fields before dispatch',async()=>{
  let calls=0;const route=createAppToolRouter(async()=>{calls++;});
  await assert.rejects(route('start'),/không hỗ trợ/);
  await assert.rejects(route('save_ai_connection',{name:'X',provider:'deepseek',apiKey:'PRIVATE'}),/schema/);
  await assert.rejects(route('save_assistant',{name:'X',role:'R',skill:'S',connectionIds:[]}),/schema/);assert.equal(calls,0);
});
test('MCP validates profile creation and forwards explicit configuration without activating',async()=>{
  const calls=[];const route=createAppToolRouter(async(action,payload)=>{calls.push({action,payload});return {id:'new-assistant'};});
  assert.equal((await route('save_assistant',{name:'Mai',age:'25',role:'CSKH',skill:'Theo tài liệu',connectionIds:['legacy-ai']})).id,'new-assistant');
  assert.equal(calls.length,1);assert.equal(calls[0].action,'save-assistant');assert.equal(calls[0].payload.strategy,'primary');
});

test('MCP AI errors retain actionable labels and never echo private provider diagnostics',()=>{
  assert.match(publicMcpError({code:'AI_RATE_LIMITED',message:'PRIVATE'}),/hết hạn mức/);
  assert.match(publicMcpError({code:'AI_INVALID_DECISION',message:'PRIVATE'}),/không hợp lệ/);
  assert.ok(!publicMcpError({code:'UNKNOWN',message:'PRIVATE'}).includes('PRIVATE'));
});

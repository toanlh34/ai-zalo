import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EventEmitter} from 'node:events';
import {createDesktopController} from '../desktop/controller.mjs';
const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
function fixture(t){
  const dataRoot=mkdtempSync(join(tmpdir(),'jev-desktop-'));
  const listener=new EventEmitter();listener.start=()=>{};listener.stop=()=>{};
  const api={listener,getOwnId:()=> '999',getAllGroups:async()=>({gridVerMap:{'123':1}}),getGroupInfo:async()=>({gridInfoMap:{'123':{name:'Nhóm thử'}}})};
  let starts=0,stops=0;const events=[],sessionDirs=[];
  const service=createDesktopController({dataRoot,sourceRoot,emit:(event,data)=>events.push({event,data}),dependencies:{
    secureDirectory:dir=>mkdirSync(dir,{recursive:true}),loadSession:dir=>{sessionDirs.push(dir);return {};},
    zalo:async()=>({Zalo:class{async login(){return api;}}}),
    createAgent:()=>({async decide(){return {action:'send',category:'greeting',reply:'Xin chào',reason:'Chào hỏi',report:'Khách chào'};}}),createRuntime:({log})=>({start(){starts++;log('JEV đã kết nối nhóm đã chọn.');},async stop(){stops++;}})
  }});
  t.after(async()=>{await service.close();rmSync(dataRoot,{recursive:true,force:true,maxRetries:10,retryDelay:50});});
  return {service,dataRoot,api,events,sessionDirs,get starts(){return starts;},get stops(){return stops;}};
}
test('desktop manages settings, group, owner pairing, start/stop without terminal',async t=>{
  const x=fixture(t),call=x.service.dispatch;
  await call('settings',{provider:'deepseek',model:'deepseek-flash',mode:'dry-run'});
  await call('groups');await call('group',{id:'123'});
  const pair=call('pair');await new Promise(resolve=>setImmediate(resolve));
  const code=x.events.find(e=>e.event==='pair'&&e.data).data;
  x.api.listener.emit('message',{type:0,threadId:'456',isSelf:false,data:{uidFrom:'456',content:code}});await pair;
  assert.equal(x.service.snapshot().config.ownerUserId,'456');
  await call('start');assert.equal(x.starts,1);assert.equal(x.service.snapshot().connected,true);
  await assert.rejects(call('settings',{provider:'deepseek'}));
  await call('command',{command:'pause'});assert.equal(x.service.snapshot().paused,true);
  await call('command',{command:'resume'});assert.equal(x.service.snapshot().paused,false);
  await call('stop');assert.equal(x.stops,1);assert.equal(x.service.snapshot().running,false);
  await call('settings',{provider:'deepseek',mode:'live'});
  await assert.rejects(call('start'),/xác nhận/);
  await call('start',{confirmLive:true});assert.equal(x.starts,2);
});
test('desktop requires selected group, limits commands and cancels pairing',async t=>{
  const x=fixture(t),call=x.service.dispatch;
  const status=await call('cli-status');assert.equal(status.supported,true);assert.ok(status.message.includes('Antigravity'));assert.ok(!status.message.includes('Cài @google/gemini-cli'));
  await call('settings',{provider:'antigravity-cli',mode:'dry-run'});assert.equal(x.service.snapshot().config.ai.executable,'agy');
  assert.equal((await call('test-ai')).ok,true);assert.equal(x.service.snapshot().tasks.length,0);
  await assert.rejects(call('group',{id:'unknown'}));
  await assert.rejects(call('command',{command:'invalid'}));
  await assert.rejects(call('start'));
  await call('groups');
  const pair=call('pair');await new Promise(resolve=>setImmediate(resolve));
  await call('cancel');await assert.rejects(pair,/hủy/);
  assert.equal(x.service.snapshot().operation,null);
  assert.equal(x.service.snapshot().config.ownerUserId,'');
});
test('desktop approves edited draft and refuses uncertain retries',async t=>{
  const x=fixture(t),call=x.service.dispatch;
  // A separate store connection represents tasks already received by the engine.
  const {openStore}=await import('../src/store.mjs');const store=openStore(join(x.dataRoot,'.private','jev.sqlite'));
  try{
  store.add('123:1','123',{text:'Giá bao nhiêu?'});store.transition('123:1','queued','review');
  await call('command',{command:'approve',id:'123:1',reply:'Anh phụ trách sẽ báo giá.'});
  assert.equal(store.get('123:1').status,'approved');
  assert.equal(JSON.parse(store.get('123:1').decision).reply,'Anh phụ trách sẽ báo giá.');
  await assert.rejects(call('settings',{provider:'deepseek',mode:'live'}),/bản đã duyệt/);
  store.transition('123:1','approved','uncertain');
  await assert.rejects(call('command',{command:'retry',id:'123:1'}));
  await call('command',{command:'close-task',id:'123:1'});assert.equal(store.get('123:1').status,'closed');
  }finally{store.close();}
});

test('desktop switches isolated assistant queues and pause state, reverts to dry-run, never exposes keys',async t=>{
  const x=fixture(t),call=x.service.dispatch;
  const c=await call('save-connection',{name:'Private API',provider:'gemini-api',model:'example'});
  await call('set-profile-key',{id:c.id,key:'SYNTHETIC_PRIVATE_PROFILE_KEY'});
  const a=await call('save-assistant',{name:'Hana',role:'Support',skill:'Japanese',connectionIds:[c.id],strategy:'primary'});
  const {openStore}=await import('../src/store.mjs');const original=openStore(join(x.dataRoot,'.private','jev.sqlite'));
  original.add('default-task','123',{text:'Default-only history'});
  try{
    await call('command',{command:'pause'});await call('settings',{provider:'deepseek',mode:'live'});
    await call('activate-assistant',{id:a.id});const snapshot=x.service.snapshot();
    assert.equal(snapshot.config.mode,'dry-run');assert.equal(snapshot.tasks.length,0);assert.equal(snapshot.paused,false);assert.equal(snapshot.config.ai.provider,'gemini-api');
    assert.equal(snapshot.management.connections.find(c=>c.name==='Private API').keySaved,true);assert.ok(!JSON.stringify(snapshot).includes('SYNTHETIC_PRIVATE_PROFILE_KEY'));
    await call('command',{command:'pause'});await call('activate-assistant',{id:'default'});
    assert.equal(x.service.snapshot().tasks[0].id,'default-task');assert.equal(x.service.snapshot().paused,true);
    await assert.rejects(call('delete-connection',{id:c.id}),/gỡ AI/);
    await call('save-connection',{...c,provider:'deepseek'});
    assert.equal(x.service.snapshot().management.connections.find(item=>item.id===c.id).keySaved,false,'Changing provider discards its previous provider key');
    await call('delete-assistant',{id:a.id});await call('delete-connection',{id:c.id});
  }finally{original.close();}
});

test('assistant Zalo connections isolate login sessions, selected group and owner',async t=>{
  const x=fixture(t),call=x.service.dispatch;
  writeFileSync(join(x.dataRoot,'.private','session.dpapi'),'synthetic-default-session');
  await call('groups');await call('group',{id:'123'});
  const pairing=call('pair');await new Promise(resolve=>setImmediate(resolve));const code=x.events.find(e=>e.event==='pair'&&e.data).data;
  x.api.listener.emit('message',{type:0,threadId:'456',isSelf:false,data:{uidFrom:'456',content:code}});await pairing;
  const a=await call('save-assistant',{name:'Hana',age:'25',personality:'Điềm tĩnh',role:'Support',skill:'Japanese',connectionIds:['legacy-ai'],strategy:'primary'});
  await call('activate-assistant',{id:a.id});let s=x.service.snapshot();assert.equal(s.session,false);assert.equal(s.config.allowedGroupId,'');assert.equal(s.config.ownerUserId,'');assert.deepEqual(s.groups,[]);
  await call('groups');assert.equal(x.sessionDirs.at(-1),join(x.dataRoot,'assistants',a.id,'.private'));
  await call('activate-assistant',{id:'default'});s=x.service.snapshot();assert.equal(s.session,true);assert.equal(s.config.allowedGroupId,'123');assert.equal(s.config.ownerUserId,'456');assert.deepEqual(s.groups,[]);
  await call('groups');assert.equal(x.sessionDirs.at(-1),join(x.dataRoot,'.private'));
  await call('activate-assistant',{id:a.id});assert.equal(x.service.snapshot().config.ownerUserId,'');
  assert.equal(x.service.snapshot().management.assistants.find(p=>p.id===a.id).age,'25');
});

test('assistant knowledge tools isolate files and reject path traversal',async t=>{
  const x=fixture(t),call=x.service.dispatch;
  const a=await call('save-assistant',{name:'Mai',role:'Support',skill:'Docs',connectionIds:['legacy-ai'],strategy:'primary'});
  await call('knowledge-write',{id:a.id,filename:'example.md',content:'Kiến thức của Mai'});
  assert.equal((await call('knowledge-read',{id:a.id,filename:'example.md'})).content,'Kiến thức của Mai');
  assert.ok((await call('knowledge-list',{id:a.id})).some(f=>f.filename==='example.md'));
  assert.ok(!(await call('knowledge-list',{id:'default'})).some(f=>f.filename==='example.md'));
  await assert.rejects(call('knowledge-write',{id:a.id,filename:'../IDENTITY.md',content:'escape'}),/tên file/);
  await assert.rejects(call('knowledge-write',{id:a.id,filename:'data.json',content:'escape'}),/tên file/);
});

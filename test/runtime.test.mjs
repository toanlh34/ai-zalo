import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {openStore} from '../src/store.mjs';
import {createRuntime} from '../src/runtime.mjs';

const greeting={action:'send',category:'greeting',reply:'Chào anh!',reason:'Giả',report:'Nội bộ giả'};
const review={...greeting,action:'escalate',category:'other',reply:'Cần chủ xác nhận.'};
const group=(id,text='Giá bao nhiêu?')=>({type:1,threadId:'123',isSelf:false,data:{msgId:id,uidFrom:'9',content:text}});
const owner=(id,text,overrides={})=>({type:0,threadId:'456',isSelf:false,data:{msgId:id,uidFrom:'456',content:text},...overrides});
function fixture(t,{mode='live',decide=()=>review,sendEffect,onClosed}={}){
  const root=mkdtempSync(join(tmpdir(),'jev-runtime-')),path=join(root,'test.sqlite'),pausePath=join(root,'PAUSED');
  let store=openStore(path),runtime;const sent=[],requests=[],logs=[];
  const listener=new EventEmitter();listener.start=()=>listener.emit('connected');listener.stop=()=>listener.emit('closed');
  const api={listener,async sendMessage(text,to,type){sent.push({text,to,type});await sendEffect?.({text,to,type});}};
  const config={allowedGroupId:'123',ownerUserId:'456',mode,autoSendCategories:['greeting']};
  const make=()=>createRuntime({api,store,config,pausePath,intervalMs:60000,log:text=>logs.push(text),onClosed,agent:{async decide(input,options){requests.push(input);return decide(input,options);}}});
  runtime=make();runtime.start();
  t.after(async()=>{await runtime.stop();store.close();assert.ok(relative(tmpdir(),root).startsWith('jev-runtime-'));rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});});
  return {sent,requests,logs,listener,get store(){return store;},get runtime(){return runtime;},message:value=>listener.emit('message',value),
    async restart(){await runtime.stop();store.close();store=openStore(path);store.recover();runtime=make();runtime.start();}};
}

test('runtime: chủ duyệt qua DM, người khác không điều khiển được và lệnh trùng không chạy lại qua restart',async t=>{
  const x=fixture(t);x.message(group('1'));await x.runtime.tick();
  assert.equal(x.store.get('123:1').status,'review');
  for(const message of [owner('bad','/jev approve 123:1',{threadId:'999'}),owner('bad','/jev approve 123:1',{data:{msgId:'bad',uidFrom:'888',content:'/jev approve 123:1'}}),owner('bad','/jev approve 123:1',{isSelf:true})])x.message(message);
  assert.equal(x.store.get('123:1').status,'review');
  assert.equal(x.store.db.prepare('SELECT COUNT(*) AS count FROM owner_commands').get().count,0);
  x.message(owner('approve-1','/jev approve 123:1 Chủ đã xác nhận.'));await x.runtime.tick();
  assert.equal(x.store.get('123:1').status,'sent');
  assert.equal(x.sent.filter(m=>m.type===1)[0].text,'Chủ đã xác nhận.');
  await x.restart();x.message(owner('approve-1','/jev approve 123:1 Nội dung khác'));await x.runtime.tick();
  assert.equal(x.sent.filter(m=>m.type===1).length,1);
  assert.equal(x.store.db.prepare('SELECT COUNT(*) AS count FROM owner_commands').get().count,1);
  assert.equal(x.requests.length,1);
});

test('runtime: lệnh duyệt và biên nhận rollback cùng nhau nếu không lưu được phản hồi chủ',async t=>{
  const x=fixture(t);x.message(group('1'));await x.runtime.tick();
  x.store.db.exec("CREATE TRIGGER fail_owner_reply BEFORE INSERT ON reports WHEN NEW.task_id LIKE 'owner-command:%' BEGIN SELECT RAISE(ABORT,'fake failure'); END");
  x.message(owner('approve','/jev approve 123:1 Đã duyệt.'));
  assert.equal(x.store.get('123:1').status,'review');
  assert.equal(x.store.db.prepare('SELECT COUNT(*) AS count FROM owner_commands').get().count,0);
  x.store.db.exec('DROP TRIGGER fail_owner_reply');
  x.message(owner('approve','/jev approve 123:1 Đã duyệt.'));await x.runtime.tick();
  assert.equal(x.store.get('123:1').status,'sent');
  assert.equal(x.sent.filter(m=>m.type===1).length,1);
});

test('runtime: dry-run nhận lệnh chủ, giữ phản hồi trong DB và không gửi DM/nhóm',async t=>{
  const x=fixture(t,{mode:'dry-run',decide:()=>greeting});
  x.message(owner('help','/jev help'));x.message(owner('status','/jev status'));x.message(group('1','chào anh'));await x.runtime.tick();
  assert.equal(x.sent.length,0);assert.equal(x.store.get('123:1').status,'dry_run');
  assert.equal(x.store.db.prepare('SELECT COUNT(*) AS count FROM owner_commands').get().count,2);
  assert.ok(x.store.pendingReports().some(report=>report.text.includes('/jev approve')));
});

test('runtime: lệnh chủ sai trả hướng dẫn một lần, không gọi AI hay lưu thành hội thoại khách',async t=>{
  const x=fixture(t);x.message(owner('invalid','/jev approve missing'));x.message(owner('invalid','/jev approve missing'));await x.runtime.tick();
  assert.equal(x.requests.length,0);assert.equal(x.store.list().length,0);
  assert.equal(x.sent.length,1);assert.equal(x.sent[0].to,'456');assert.ok(x.sent[0].text.includes('Cần task'));
});

test('runtime: dừng khi AI đang chạy giữ DB mở đến lúc xong và không gửi muộn',async t=>{
  let release,signal;const answer=new Promise(resolve=>{release=resolve;});
  const x=fixture(t,{decide:(_input,options)=>{signal=options.signal;return answer;}});
  x.message(group('1','chào anh'));const tick=x.runtime.tick();const stop=x.runtime.stop();
  assert.equal(signal.aborted,true);x.message(group('2','chào anh'));
  release(greeting);await tick;await stop;
  assert.equal(x.sent.length,0);assert.equal(x.store.get('123:2'),undefined);
  assert.equal(x.store.get('123:1').status,'approved');assert.equal(x.listener.listenerCount('message'),0);
  assert.doesNotThrow(()=>x.listener.emit('error',Error('late close error')));
  await x.runtime.tick();assert.equal(x.sent.length,0);
});

test('runtime: dừng khi đang gửi chờ xác nhận gửi rồi mới kết thúc, không gửi báo cáo tiếp',async t=>{
  let complete,entered;const delivered=new Promise(resolve=>{complete=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  const x=fixture(t,{decide:()=>greeting,sendEffect:async({type})=>{if(type===1){entered();await delivered;}}});
  x.message(group('1','chào anh'));const tick=x.runtime.tick();await started;
  const stop=x.runtime.stop();assert.equal(x.store.get('123:1').status,'sending');
  complete();await tick;await stop;
  assert.equal(x.store.get('123:1').status,'sent');assert.equal(x.sent.length,1);
  assert.ok(x.store.pendingReports().length>=2);
});

test('runtime: listener đóng thì hủy AI, ngừng nhận và gọi cleanup sau khi worker đã dừng',async t=>{
  let closed;const done=new Promise(resolve=>{closed=resolve;});
  const x=fixture(t,{onClosed:closed,decide:(_input,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('cancel'),{code:'CLAUDE_CANCELLED'})),{once:true}))});
  x.message(group('1','chào anh'));const tick=x.runtime.tick();x.listener.emit('closed');await tick;await done;
  assert.equal(x.store.get('123:1').status,'review');assert.equal(x.sent.length,0);assert.equal(x.listener.listenerCount('message'),0);
});

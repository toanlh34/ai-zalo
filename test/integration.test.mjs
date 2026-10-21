import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fork,spawn} from 'node:child_process';
import {once} from 'node:events';
import http from 'node:http';
import net from 'node:net';
import {openStore} from '../src/store.mjs';
import {createInbox} from '../src/filter.mjs';
import {createWorker} from '../src/worker.mjs';
import {handleLocalCommand} from '../src/commands.mjs';

const greeting={action:'send',category:'greeting',reply:'Chào anh, em có thể hỗ trợ gì ạ?',reason:'Chào hỏi giả',report:'NỘI BỘ: lời chào giả.'};
const escalation={action:'escalate',category:'other',reply:'Em xin chuyển anh phụ trách xác nhận.',reason:'Cần chủ duyệt',report:'NỘI BỘ: đề nghị giá giả.'};
const raw=(id,text='chào anh',overrides={})=>({type:1,threadId:'123',isSelf:false,data:{msgId:id,uidFrom:'9',content:text,ts:'1'},...overrides});
function tempRoot(t){
  const root=mkdtempSync(join(tmpdir(),'jev-integration-'));
  const cleanups=[];
  t.after(async()=>{
    for(const cleanup of cleanups.reverse())await cleanup();
    const local=relative(resolve(tmpdir()),resolve(root));
    assert.ok(local.startsWith('jev-integration-')&&!local.includes('..'));
    rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});
  });
  return {root,defer:cleanup=>cleanups.push(cleanup)};
}
function pipeline(t,{mode='live',maxPendingTasks=100,decide,sendEffect}={}){
  const {root,defer}=tempRoot(t),path=join(root,'test.sqlite'),pausePath=join(root,'PAUSED');
  let store=openStore(path),inbox=createInbox('123'),worker;
  const config={allowedGroupId:'123',ownerUserId:'456',contextLimit:30,mode,autoSendCategories:['greeting']};
  const requests=[],sent=[],output=[];
  const agent={async decide(input){requests.push(input);return decide?decide(input):input.message.text.includes('Giảm')?escalation:greeting;}};
  const send=async(text,to,type)=>{
    assert.ok((type===1&&to==='123')||(type===0&&to==='456'));
    sent.push({text,to,type});if(sendEffect)await sendEffect({text,to,type});
  };
  const makeWorker=()=>createWorker({store,agent,config,pausePath,send});worker=makeWorker();
  defer(()=>store.close());
  return {
    root,path,requests,sent,output,get store(){return store;},
    receive(message){const accepted=inbox.accept(message);return accepted?store.add(`123:${accepted.item.id}`,'123',accepted.item,{maxPendingTasks}):false;},
    tick:()=>worker.tick(),
    command(command,id,words=[]){return handleLocalCommand({store,command,id,words,pausePath,log:value=>output.push(value)});},
    restart(){store.close();store=openStore(path);store.recover();inbox=createInbox('123');worker=makeWorker();}
  };
}

test('offline: chặn mạng và tiến trình ngoài trước khi chạy kịch bản',async()=>{
  assert.equal(globalThis[Symbol.for('jev.offlineTest')],true,'Run with npm test or npm run smoke');
  assert.throws(()=>http.get('http://offline.invalid'),{code:'OFFLINE_TEST_BLOCKED'});
  assert.throws(()=>net.connect({host:'offline.invalid',port:80}),{code:'OFFLINE_TEST_BLOCKED'});
  await assert.rejects(fetch('https://offline.invalid'),{code:'OFFLINE_TEST_BLOCKED'});
  assert.throws(()=>spawn('__forbidden_external_test__',[]),{code:'OFFLINE_TEST_BLOCKED'});
  assert.throws(()=>fork('__unused__',[],{execPath:'__forbidden_external_test__'}),{code:'OFFLINE_TEST_BLOCKED'});
});

test('offline E2E: lọc tin → xếp hàng → tự chào → chủ sửa/duyệt → gửi giả → mở lại chống trùng',async t=>{
  const x=pipeline(t);
  for(const changes of [{type:0},{threadId:'999'},{isSelf:true},{data:{msgId:'ignored',uidFrom:'9',content:{href:'fake'}}}])assert.equal(x.receive(raw('ignored','tin ngoài phạm vi',changes)),false);
  assert.equal(x.store.list().length,0);assert.equal(x.requests.length,0);assert.equal(x.sent.length,0);
  assert.equal(x.receive(raw('1')),true);assert.equal(x.receive(raw('1')),false);
  assert.equal(x.receive(raw('2','Giảm giá giúp tôi')),true);
  await x.tick();await x.tick();
  assert.equal(x.store.get('123:1').status,'sent');assert.equal(x.store.get('123:2').status,'review');
  assert.deepEqual(x.requests[0].context,[]);
  assert.deepEqual(x.requests[1].context.map(m=>m.role),['user','assistant']);
  assert.equal(x.sent.filter(m=>m.type===1).length,1);
  x.command('approve','123:2',['Phản hồi đã được chủ duyệt.']);await x.tick();
  assert.equal(x.store.get('123:2').status,'sent');
  const customer=x.sent.filter(m=>m.type===1);
  assert.equal(customer[1].text,'Phản hồi đã được chủ duyệt.');assert.ok(customer.every(m=>!m.text.includes('NỘI BỘ')));
  assert.ok(x.sent.some(m=>m.type===0&&m.text.includes('NỘI BỘ')));
  x.restart();assert.equal(x.receive(raw('1')),false);await x.tick();
  assert.equal(x.requests.length,2);assert.equal(x.sent.filter(m=>m.type===1).length,2);
  assert.equal(x.store.context('123',30).filter(m=>m.role==='assistant').length,2);
  x.command('status');assert.equal(JSON.parse(x.output.at(-1)).pending,0);
  x.command('reports');assert.ok(JSON.parse(x.output.at(-1)).length>=4);
});

test('offline E2E: dry-run giữ bản nháp/báo cáo qua mở lại mà không gọi gửi',async t=>{
  const x=pipeline(t,{mode:'dry-run',sendEffect:()=>assert.fail('dry-run called send')});
  x.receive(raw('1'));await x.tick();x.restart();await x.tick();
  assert.equal(x.store.get('123:1').status,'dry_run');assert.equal(x.sent.length,0);
  assert.ok(x.store.pendingReports().length>=2);assert.equal(x.store.context('123',30).filter(m=>m.role==='assistant').length,0);
});

test('offline E2E: tin dài có nghiệp vụ phía sau phần bị cắt không được tự gửi lời chào',async t=>{
  const x=pipeline(t,{decide:()=>greeting});
  x.receive(raw('1','chào anh'+' '.repeat(8000)+'Giảm giá 50% giúp tôi'));
  await x.tick();
  assert.equal(x.store.get('123:1').status,'review');assert.equal(x.sent.filter(m=>m.type===1).length,0);
  const input=JSON.parse(x.store.get('123:1').input);
  assert.equal(input.truncated,true);assert.equal(input.text.length,8000);
  assert.ok(x.sent.some(m=>m.type===0&&m.text.includes('rút gọn')));
});

test('offline E2E: hết hạn mức, đầy hàng chờ, từ chối, resume-ai và xử lý lại không cần provider thật',async t=>{
  let quota=true;
  const x=pipeline(t,{maxPendingTasks:2,decide:()=>{if(quota)throw Object.assign(Error('fake quota'),{code:'CLAUDE_RATE_LIMITED'});return greeting;}});
  x.receive(raw('1'));x.receive(raw('2'));await x.tick();x.restart();await x.tick();
  assert.equal(x.requests.length,1);assert.equal(x.store.aiPaused(),true);
  assert.throws(()=>x.receive(raw('overflow')),{code:'QUEUE_FULL'});
  assert.equal(x.store.get('123:overflow'),undefined);
  x.command('reject','123:1');assert.equal(x.receive(raw('3')),true);
  quota=false;x.command('resume-ai');await x.tick();await x.tick();
  assert.equal(x.store.get('123:2').status,'sent');assert.equal(x.store.get('123:3').status,'sent');
  assert.equal(x.requests.length,3);assert.equal(x.store.stats().pending,0);
});

test('offline E2E: tick đồng thời và pause trong lúc AI chờ không gây gửi lặp hoặc gửi sau pause',async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const x=pipeline(t,{decide:()=>gate});x.receive(raw('1'));
  const pending=x.tick();await x.tick();assert.equal(x.requests.length,1);
  x.command('pause');release(greeting);await pending;
  assert.equal(x.store.get('123:1').status,'approved');assert.equal(x.sent.filter(m=>m.type===1).length,0);
  x.receive(raw('2'));await x.tick();assert.equal(x.requests.length,2);
  x.command('resume');await x.tick();await x.tick();
  assert.equal(x.sent.filter(m=>m.type===1).length,2);assert.equal(x.requests.length,2);
});

test('offline E2E: DM báo chủ lỗi không làm gửi lại câu đã xác nhận cho khách',async t=>{
  let failedText;
  const x=pipeline(t,{sendEffect:({text,type})=>{if(type===0&&!failedText){failedText=text;throw Error('fake DM failure');}}});
  x.receive(raw('1'));await x.tick();assert.equal(x.store.get('123:1').status,'sent');
  x.restart();await x.tick();await x.tick();
  assert.equal(x.sent.filter(m=>m.type===1).length,1);
  assert.equal(x.sent.filter(m=>m.type===0&&m.text===failedText).length,1);
  assert.equal(x.store.db.prepare("SELECT COUNT(*) AS count FROM reports WHERE status='uncertain'").get().count,1);
});

test('offline E2E: lỗi quyết định cần chủ soạn câu; reject/retry/close không vượt trạng thái',async t=>{
  const x=pipeline(t,{decide:()=>{throw Error('fake AI failure');}});x.receive(raw('1'));await x.tick();
  assert.throws(()=>x.command('approve','123:1'));
  x.command('approve','123:1',['Câu trả lời do chủ soạn.']);await x.tick();
  assert.equal(x.sent.filter(m=>m.type===1)[0].text,'Câu trả lời do chủ soạn.');
  for(const command of ['reject','retry','close-task'])assert.throws(()=>x.command(command,'123:1'));
  assert.equal(x.store.get('123:1').status,'sent');
});

for(const phase of ['thinking','sending'])test(`offline crash: dừng cưỡng bức khi ${phase}, mở DB và kiểm tra không gửi lặp`,{timeout:12000},async t=>{
  const {root,defer}=tempRoot(t),path=join(root,'crash.sqlite'),effectsPath=join(root,'effects.jsonl');
  const script=fileURLToPath(new URL('../scripts/offline-crash-fixture.mjs',import.meta.url));
  const child=fork(script,[path,effectsPath,phase],{windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{stderr+=chunk;});child.stdout.resume();
  defer(async()=>{if(child.exitCode===null&&child.signalCode===null){const closed=once(child,'close');child.kill('SIGKILL');await closed;}});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(`Crash fixture did not reach ${phase}: ${stderr}`)),5000);
    child.once('message',message=>{clearTimeout(timer);try{assert.equal(message.phase,phase);resolve();}catch(error){reject(error);}});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',()=>{clearTimeout(timer);reject(Error(`Crash fixture exited early: ${stderr}`));});
  });
  const closed=once(child,'close');child.kill('SIGKILL');await closed;
  const store=openStore(path);defer(()=>store.close());store.recover();
  assert.equal(store.get('123:1').status,phase==='thinking'?'review':'uncertain');
  let calls=0,sends=0;
  const worker=createWorker({store,config:{allowedGroupId:'123',ownerUserId:'456',mode:'dry-run',autoSendCategories:['greeting']},pausePath:join(root,'PAUSED'),agent:{async decide(){calls++;return greeting;}},send:async()=>{sends++;}});
  await worker.tick();await worker.tick();assert.equal(calls,0);assert.equal(sends,0);
  const effects=existsSync(effectsPath)?readFileSync(effectsPath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  assert.equal(effects.filter(m=>m.type===1).length,phase==='sending'?1:0);
  assert.equal(store.context('123',30).filter(m=>m.role==='assistant').length,0);
  if(phase==='sending'){
    assert.equal(store.retry('123:1'),false);
    handleLocalCommand({store,command:'close-task',id:'123:1',pausePath:join(root,'PAUSED'),log:()=>{}});
    assert.equal(store.get('123:1').status,'closed');
  }
});

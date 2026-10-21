import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../src/store.mjs';
import {createWorker} from '../src/worker.mjs';
import {cliArguments,validateDecision} from '../src/agent.mjs';
const decision={action:'send',category:'greeting',reply:'Chào anh, em có thể hỗ trợ gì ạ?',reason:'Chào hỏi',report:'Khách chào hỏi.'};
function setup(overrides={},answer=decision,sendError=false,pausePath='Z:/not-a-real-pause-file'){
  const store=openStore(':memory:');
  const config={allowedGroupId:'123',ownerUserId:'456',contextLimit:30,mode:'live',autoSendCategories:['greeting'],...overrides};
  const sent=[],requests=[];let calls=0;
  const worker=createWorker({store,config,agent:{async decide(input){calls++;requests.push(input);if(answer instanceof Error)throw answer;return answer;}},pausePath,send:async(text,to,type)=>{sent.push({text,to,type});if(sendError)throw Error('unknown');}});
  const add=(text='chào anh')=>store.add('123:1','123',{id:'1',sender:'9',text});
  return {store,worker,sent,requests,add,get calls(){return calls;}};
}
test('tự gửi greeting đúng nhóm, luôn báo chủ, không xử lý trùng',async()=>{
  const x=setup();x.add();assert.equal(x.add(),false);await x.worker.tick();await x.worker.tick();assert.equal(x.calls,1);assert.equal(x.sent.filter(m=>m.type===1).length,1);assert.ok(x.sent.some(m=>m.to==='456'&&m.type===0));assert.equal(x.store.get('123:1').status,'sent');x.store.close();
});
test('dry-run không gửi bất cứ tin nào hoặc thêm bản nháp vào lịch sử bot',async()=>{const x=setup({mode:'dry-run'});x.add();await x.worker.tick();assert.equal(x.sent.length,0);assert.equal(x.store.get('123:1').status,'dry_run');assert.ok(x.store.pendingReports().length);assert.ok(x.store.context('123',30).every(m=>m.role==='user'));x.store.close();});
test('AI không được tự gán greeting để vượt quy tắc',async()=>{const x=setup();x.add('Giảm giá 50% giúp tôi');await x.worker.tick();assert.equal(x.store.get('123:1').status,'review');assert.equal(x.sent.filter(m=>m.type===1).length,0);x.store.close();});
test('chuyển chủ, chủ duyệt rồi mới gửi',async()=>{const x=setup({}, {...decision,action:'escalate'});x.add();await x.worker.tick();assert.equal(x.store.get('123:1').status,'review');assert.equal(x.sent.filter(m=>m.type===1).length,0);assert.ok(x.store.transition('123:1','review','approved'));await x.worker.tick();assert.equal(x.store.get('123:1').status,'sent');x.store.close();});
test('lỗi AI chuyển review và báo chủ',async()=>{const x=setup({},new Error('quota'));x.add();await x.worker.tick();assert.equal(x.store.get('123:1').status,'review');assert.ok(x.sent.some(m=>m.type===0));x.store.close();});
test('gửi không rõ kết quả thì không retry tự động',async()=>{const x=setup({},decision,true);x.add();await x.worker.tick();await x.worker.tick();assert.equal(x.store.get('123:1').status,'uncertain');assert.equal(x.sent.filter(m=>m.type===1).length,1);x.store.close();});
test('khôi phục sending thành uncertain, không cho retry tự động',()=>{const x=setup();x.add();x.store.transition('123:1','queued','sending');x.store.recover();assert.equal(x.store.get('123:1').status,'uncertain');assert.equal(x.store.retry('123:1'),false);assert.ok(x.store.pendingReports().length);x.store.close();});
test('khóa công cụ CLI và kiểm tra JSON',()=>{const args=cliArguments({},'instructions');assert.equal(args[args.indexOf('--tools')+1],'');assert.ok(args.includes('--strict-mcp-config'));assert.ok(args.includes('--no-session-persistence'));assert.throws(()=>validateDecision({...decision,action:'run_shell'}));assert.throws(()=>validateDecision({...decision,reply:''}));});

test('tin tiếp theo thấy câu JEV đã gửi, không đưa các tin tương lai vào AI',async t=>{
  const x=setup();t.after(()=>x.store.close());
  x.add();x.store.add('123:2','123',{id:'2',sender:'9',text:'xin chào'});
  await x.worker.tick();await x.worker.tick();
  assert.deepEqual(x.requests[0].context,[]);
  assert.deepEqual(x.requests[1].context.map(m=>m.role),['user','assistant']);
  assert.equal(x.requests[1].context[1].text,decision.reply);
  assert.ok(x.requests[1].context.every(m=>m.id!=='2'));
});

test('hết hạn mức chỉ gọi AI một lần, giữ tin sau trong hàng chờ kể cả worker mới',async t=>{
  const x=setup({},Object.assign(Error('quota'),{code:'CLAUDE_RATE_LIMITED'}));t.after(()=>x.store.close());
  x.add();x.store.add('123:2','123',{id:'2',sender:'9',text:'xin chào'});
  await x.worker.tick();await x.worker.tick();
  assert.equal(x.calls,1);assert.equal(x.store.aiPaused(),true);assert.equal(x.store.get('123:2').status,'queued');
  let newCalls=0;
  const worker=createWorker({store:x.store,config:{allowedGroupId:'123',ownerUserId:'456',contextLimit:30,mode:'live',autoSendCategories:['greeting']},pausePath:'Z:/not-a-real-pause-file',agent:{async decide(){newCalls++;return decision;}},send:async(text,to,type)=>x.sent.push({text,to,type})});
  await worker.tick();assert.equal(newCalls,0);
  x.store.decision('123:1',decision,'approved',{from:'review',report:'Chủ duyệt thủ công.'});
  await worker.tick();assert.equal(x.store.get('123:1').status,'sent');assert.equal(newCalls,0);
  x.store.resumeAi();await worker.tick();
  assert.equal(newCalls,1);assert.equal(x.store.get('123:2').status,'sent');
});

test('pause dừng gửi khách nhưng vẫn xử lý tin mới sau task đã duyệt',async t=>{
  const root=mkdtempSync(join(tmpdir(),'jev-pause-test-')),pausePath=join(root,'PAUSED');
  t.after(()=>rmSync(root,{recursive:true,force:true}));writeFileSync(pausePath,'paused');
  const x=setup({},decision,false,pausePath);t.after(()=>x.store.close());
  x.add();x.store.add('123:2','123',{id:'2',sender:'9',text:'xin chào'});
  await x.worker.tick();await x.worker.tick();
  assert.equal(x.calls,2);assert.equal(x.sent.filter(m=>m.type===1).length,0);
  assert.equal(x.store.get('123:1').status,'approved');assert.equal(x.store.get('123:2').status,'approved');
  assert.ok(x.requests[1].context.every(m=>m.role==='user'));
  rmSync(pausePath);await x.worker.tick();
  assert.equal(x.store.get('123:1').status,'sent');assert.equal(x.calls,2);
});

test('đã gọi gửi nhưng không lưu được lịch sử thì uncertain và không gửi lại',async t=>{
  const x=setup();t.after(()=>x.store.close());x.add();
  x.store.db.exec("CREATE TRIGGER fail_bot_history BEFORE INSERT ON messages WHEN NEW.role='assistant' BEGIN SELECT RAISE(ABORT,'synthetic disk failure'); END");
  await x.worker.tick();await x.worker.tick();
  assert.equal(x.store.get('123:1').status,'uncertain');
  assert.equal(x.sent.filter(m=>m.type===1).length,1);
  assert.ok(x.store.context('123',30).every(m=>m.role==='user'));
});

test('bản nháp approved hỏng chuyển về review, không gọi gửi hoặc AI',async t=>{
  const x=setup();t.after(()=>x.store.close());x.add();
  x.store.decision('123:1',{...decision,reply:''},'approved',{from:'queued'});
  await x.worker.tick();assert.equal(x.store.get('123:1').status,'review');
  assert.equal(x.calls,0);assert.equal(x.sent.filter(m=>m.type===1).length,0);
});

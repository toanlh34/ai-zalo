import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../src/store.mjs';
import {createWorker} from '../src/worker.mjs';
import {cliArguments,validateDecision} from '../src/agent.mjs';
const decision={action:'send',category:'greeting',reply:'Chào anh, em có thể hỗ trợ gì ạ?',reason:'Chào hỏi',report:'Khách chào hỏi.'};
function setup(overrides={},answer=decision,sendError=false){
  const store=openStore(':memory:');
  const config={allowedGroupId:'123',ownerUserId:'456',contextLimit:30,mode:'live',autoSendCategories:['greeting'],...overrides};
  const sent=[];let calls=0;
  const worker=createWorker({store,config,agent:{async decide(){calls++;if(answer instanceof Error)throw answer;return answer;}},pausePath:'Z:/not-a-real-pause-file',send:async(text,to,type)=>{sent.push({text,to,type});if(sendError)throw Error('unknown');}});
  const add=(text='chào anh')=>store.add('123:1','123',{id:'1',sender:'9',text});
  return {store,worker,sent,add,get calls(){return calls;}};
}
test('tự gửi greeting đúng nhóm, luôn báo chủ, không xử lý trùng',async()=>{
  const x=setup();x.add();assert.equal(x.add(),false);await x.worker.tick();await x.worker.tick();assert.equal(x.calls,1);assert.equal(x.sent.filter(m=>m.type===1).length,1);assert.ok(x.sent.some(m=>m.to==='456'&&m.type===0));assert.equal(x.store.get('123:1').status,'sent');x.store.close();
});
test('dry-run không gửi bất cứ tin nào',async()=>{const x=setup({mode:'dry-run'});x.add();await x.worker.tick();assert.equal(x.sent.length,0);assert.equal(x.store.get('123:1').status,'dry_run');assert.ok(x.store.pendingReports().length);x.store.close();});
test('AI không được tự gán greeting để vượt quy tắc',async()=>{const x=setup();x.add('Giảm giá 50% giúp tôi');await x.worker.tick();assert.equal(x.store.get('123:1').status,'review');assert.equal(x.sent.filter(m=>m.type===1).length,0);x.store.close();});
test('chuyển chủ, chủ duyệt rồi mới gửi',async()=>{const x=setup({}, {...decision,action:'escalate'});x.add();await x.worker.tick();assert.equal(x.store.get('123:1').status,'review');assert.equal(x.sent.filter(m=>m.type===1).length,0);assert.ok(x.store.transition('123:1','review','approved'));await x.worker.tick();assert.equal(x.store.get('123:1').status,'sent');x.store.close();});
test('lỗi AI chuyển review và báo chủ',async()=>{const x=setup({},new Error('quota'));x.add();await x.worker.tick();assert.equal(x.store.get('123:1').status,'review');assert.ok(x.sent.some(m=>m.type===0));x.store.close();});
test('gửi không rõ kết quả thì không retry tự động',async()=>{const x=setup({},decision,true);x.add();await x.worker.tick();await x.worker.tick();assert.equal(x.store.get('123:1').status,'uncertain');assert.equal(x.sent.filter(m=>m.type===1).length,1);x.store.close();});
test('khôi phục thinking/sending cần kiểm tra, không gửi lại',()=>{const x=setup();x.add();x.store.transition('123:1','queued','sending');x.store.recover();assert.equal(x.store.get('123:1').status,'review');assert.ok(x.store.pendingReports().length);x.store.close();});
test('khóa công cụ CLI và kiểm tra JSON',()=>{const args=cliArguments({},'instructions');assert.equal(args[args.indexOf('--tools')+1],'');assert.ok(args.includes('--strict-mcp-config'));assert.ok(args.includes('--no-session-persistence'));assert.throws(()=>validateDecision({...decision,action:'run_shell'}));assert.throws(()=>validateDecision({...decision,reply:''}));});

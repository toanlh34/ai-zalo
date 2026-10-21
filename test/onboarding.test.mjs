import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync,existsSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {createPairingChallenge,pairOwner,listGroups,setupConfig,saveConfig,configureAgent} from '../src/onboarding.mjs';
import {loginWithQR} from '../src/zalo-login.mjs';
import {acquireLock} from '../src/lock.mjs';
import {openStore} from '../src/store.mjs';
import {createRuntime} from '../src/runtime.mjs';

const dm=(text,changes={})=>({type:0,threadId:'456',isSelf:false,data:{msgId:'1',uidFrom:'456',content:text},...changes});
function temp(t){const root=mkdtempSync(join(tmpdir(),'jev-onboarding-'));t.after(()=>{assert.ok(relative(tmpdir(),root).startsWith('jev-onboarding-'));rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});});return root;}
function api(){const listener=new EventEmitter();let stops=0;listener.start=()=>{};listener.stop=()=>{stops++;listener.emit('closed');};return {listener,getOwnId:()=> '123',get stops(){return stops;}};}

test('onboarding: mã chủ chỉ dùng một lần, đúng DM và không chấp nhận chính tài khoản bot',()=>{
  const challenge=createPairingChallenge({selfId:'123',code:'fake-code'}),text='/jev pair fake-code';
  for(const input of [dm(text,{type:1}),dm(text,{isSelf:true}),dm(text,{threadId:'789'}),dm('/jev pair wrong'),dm(text,{threadId:'123',data:{uidFrom:'123',content:text}})])assert.equal(challenge.accept(input),null);
  assert.equal(challenge.accept(dm(text)),'456');assert.equal(challenge.accept(dm(text)),null);
});

test('onboarding: mã hết hạn không thể ghép chủ',()=>{
  let time=0;const challenge=createPairingChallenge({selfId:'123',code:'fake',timeoutMs:10,now:()=>time});time=10;
  assert.equal(challenge.accept(dm('/jev pair fake')),null);
});

test('onboarding: ghép chủ qua listener rồi tháo listener/timeout, không gửi tin',async()=>{
  const client=api();const owner=await pairOwner({api:client,onCode:code=>client.listener.emit('message',dm(`/jev pair ${code}`))});
  assert.equal(owner,'456');assert.equal(client.stops,1);assert.equal(client.listener.listenerCount('message'),0);
  assert.doesNotThrow(()=>client.listener.emit('error',Error('late close error')));
});

test('onboarding: hết thời gian hoặc hủy đều đóng listener ghép chủ',async()=>{
  const timeout=api();await assert.rejects(pairOwner({api:timeout,onCode:()=>{},timeoutMs:10}));assert.equal(timeout.stops,1);
  const cancelled=api(),controller=new AbortController();
  const pending=pairOwner({api:cancelled,onCode:()=>{},signal:controller.signal});controller.abort();await assert.rejects(pending);assert.equal(cancelled.stops,1);
});

test('onboarding: danh sách nhóm chỉ giữ ID hợp lệ và tên không điều khiển terminal',async()=>{
  const groups=await listGroups({getAllGroups:async()=>({gridVerMap:{'123':1,invalid:1,'789':1}}),getGroupInfo:async ids=>{assert.deepEqual(ids,['123','789']);return {gridInfoMap:{'123':{name:'Nhóm\nThử\x1b'}}};}});
  assert.deepEqual(groups,[{id:'123',name:'Nhóm Thử '}]);
});

test('onboarding: lưu cấu hình nguyên tử, giữ Claude/model và luôn bắt đầu dry-run',t=>{
  const root=temp(t),path=join(root,'config.json');writeFileSync(path,'{"old":true}');
  const config=setupConfig({mode:'live',ai:{provider:'claude-cli',model:'custom'},contextLimit:30},'123','456');
  saveConfig(path,config);assert.equal(JSON.parse(readFileSync(path,'utf8')).mode,'dry-run');
  assert.equal(config.ai.model,'custom');assert.equal(config.allowedGroupId,'123');assert.equal(config.ownerUserId,'456');
  assert.deepEqual(readdirSync(root),['config.json']);
  assert.throws(()=>setupConfig({},'bad','456'));assert.throws(()=>setupConfig({},'123','bad'));
});

const events={QRCodeGenerated:0,QRCodeExpired:1,QRCodeDeclined:3,GotLoginInfo:4};
test('onboarding: QR lưu phiên sau đăng nhập thành công và xóa ảnh khi xong',async t=>{
  const root=temp(t),fakeApi={},credentials={synthetic:true};let saved=0,shown=0;
  const result=await loginWithQR({privateDir:root,events,onQr:path=>{shown++;assert.ok(existsSync(path));},save:(_dir,value)=>{saved++;assert.deepEqual(value,credentials);},zalo:{async loginQR(_options,callback){callback({type:0,data:{image:Buffer.from('fake image').toString('base64')}});callback({type:4,data:credentials});return fakeApi;}}});
  assert.equal(result,fakeApi);assert.equal(saved,1);assert.equal(shown,1);assert.equal(existsSync(join(root,'login-qr.png')),false);
});

test('onboarding: QR lỗi hoặc bị từ chối không ghi phiên, không để lại QR',async t=>{
  const root=temp(t);
  for(const fail of ['declined','after-credentials'])await assert.rejects(loginWithQR({privateDir:root,events,onQr:()=>{},save:()=>assert.fail('must not save failed login'),zalo:{async loginQR(_options,callback){
    callback({type:0,data:{image:Buffer.from('fake').toString('base64')}});
    if(fail==='declined')callback({type:3,actions:{abort(){throw Error('declined');}}});
    else{callback({type:4,data:{synthetic:true}});throw Error('fake network failure');}
  }}}));
  assert.equal(existsSync(join(root,'login-qr.png')),false);
});

test('onboarding: khóa chặn hai agent và release không xóa khóa thay thế',t=>{
  const path=join(temp(t),'worker.lock'),release=acquireLock(path);
  assert.throws(()=>acquireLock(path),{code:'EEXIST'});release();release();assert.equal(existsSync(path),false);
  const old=acquireLock(path);writeFileSync(path,JSON.stringify({pid:0,token:'replacement'}));old();assert.equal(existsSync(path),true);
});

test('onboarding: tự động dọn worker.lock cũ khi tiến trình trước đã kết thúc',t=>{
  const path=join(temp(t),'worker.lock');
  writeFileSync(path,JSON.stringify({pid:999999,token:'dead-pid'}));
  const release=acquireLock(path);
  assert.equal(existsSync(path),true);
  release();
  assert.equal(existsSync(path),false);
});

test('toàn luồng: QR giả → chọn nhóm → ghép chủ → lưu → nhận tin → chủ duyệt trong Zalo → gửi',async t=>{
  const root=temp(t),client=api(),sent=[];
  client.getAllGroups=async()=>({gridVerMap:{'789':1}});
  client.getGroupInfo=async()=>({gridInfoMap:{'789':{name:'Nhóm thử'}}});
  client.sendMessage=async(text,to,type)=>sent.push({text,to,type});
  const logged=await loginWithQR({privateDir:root,events,onQr:()=>{},save:()=>{},zalo:{async loginQR(_options,callback){callback({type:0,data:{image:Buffer.from('fake').toString('base64')}});callback({type:4,data:{synthetic:true}});return client;}}});
  const answers=['1','LUU'];
  const config=await configureAgent({api:logged,template:{ai:{provider:'claude-cli'}},ask:async()=>answers.shift(),log:()=>{},onCode:code=>client.listener.emit('message',dm(`/jev pair ${code}`))});
  const path=join(root,'config.json');saveConfig(path,config);
  assert.equal(config.ownerUserId,'456');assert.equal(config.allowedGroupId,'789');assert.equal(config.mode,'dry-run');
  const store=openStore(join(root,'test.sqlite'));let runtime;
  try{
    runtime=createRuntime({api:client,store,config:{...config,mode:'live'},pausePath:join(root,'PAUSED'),intervalMs:60000,log:()=>{},agent:{async decide(){return {action:'escalate',category:'other',reply:'Bản nháp giả.',reason:'Cần chủ',report:'Nội bộ'};}}});
    runtime.start();
    client.listener.emit('message',{type:1,threadId:'789',isSelf:false,data:{msgId:'task',uidFrom:'9',content:'Hỏi nghiệp vụ'}});
    await runtime.tick();assert.equal(store.get('789:task').status,'review');
    client.listener.emit('message',dm('/jev approve 789:task Câu đã duyệt.'));
    await runtime.tick();assert.equal(store.get('789:task').status,'sent');
    assert.deepEqual(sent.filter(item=>item.type===1),[{text:'Câu đã duyệt.',to:'789',type:1}]);
    assert.ok(sent.some(item=>item.to==='456'&&item.type===0));
  }finally{await runtime?.stop();store.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {openStore} from '../src/store.mjs';
import {createRuntime,validateRuntimeConfig} from '../src/runtime.mjs';
import {createRouter,scopeOf} from '../src/filter.mjs';

const SELF='111',OWNER='456';
const groupMsg=(id,text,data={},threadId='123')=>({type:1,threadId,isSelf:false,data:{msgId:id,uidFrom:'9',dName:'Khách A',content:text,...data}});
const dm=(id,text,from='777')=>({type:0,threadId:from,isSelf:false,data:{msgId:id,uidFrom:from,dName:from===OWNER?'Chủ':'Người lạ',content:text}});
const allConfig={chatScope:'all',allowedGroupId:'',ownerUserId:OWNER,mode:'live',autoSendCategories:['greeting']};

test('scope: không chọn nhóm = mọi nhóm; cấu hình cũ có nhóm = một nhóm',()=>{
  assert.equal(scopeOf({}),'all');
  assert.equal(scopeOf({allowedGroupId:'123'}),'single');
  assert.equal(scopeOf({allowedGroupId:'123',chatScope:'all'}),'all');
  assert.throws(()=>createRouter({config:{chatScope:'single',allowedGroupId:''}}));
  assert.doesNotThrow(()=>validateRuntimeConfig({...allConfig}));
});

test('router: nhóm chỉ thành yêu cầu khi được tag, trả lời tin hoặc gọi tên',()=>{
  const r=createRouter({config:allConfig,selfId:SELF});
  assert.equal(r.accept(groupMsg('1','Hôm nay họp mấy giờ?')).addressed,false);
  const tagged=r.accept(groupMsg('2','@Javis giá gói này?',{mentions:[{uid:SELF,pos:0,len:6,type:0}]}));
  assert.equal(tagged.addressed,true);assert.equal(tagged.item.addressedBy,'mention');assert.equal(tagged.item.cleanText,'giá gói này?');
  assert.equal(r.accept(groupMsg('3','Đúng rồi',{quote:{ownerId:SELF,msg:'x'}})).item.addressedBy,'reply');
  const named=r.accept(groupMsg('4','javis ơi chào'));
  assert.equal(named.addressed,true);assert.equal(named.item.cleanText,'chào');
  assert.equal(r.accept(groupMsg('5','Javisssss đâu')).addressed,false);
  assert.equal(r.accept(groupMsg('6','@Lan xem giúp',{mentions:[{uid:'222',pos:0,len:4,type:0}]})).addressed,false);
  assert.equal(r.accept(groupMsg('7','khác nhóm Javis',{},'999')).item.threadId,'999');
  assert.equal(r.accept(groupMsg('2','@Javis giá gói này?')),null,'trùng tin');
  assert.equal(r.accept({...groupMsg('8','Javis'),isSelf:true}),null);
  assert.equal(r.accept(groupMsg('9','Javis',{uidFrom:SELF})),null);
});

test('router: tin riêng phân biệt chủ và người khác; chế độ một nhóm bỏ qua tin riêng',()=>{
  const r=createRouter({config:allConfig,selfId:SELF});
  assert.deepEqual([r.accept(dm('1','hi')).item.kind,r.accept(dm('2','hi',OWNER)).item.kind],['dm','owner']);
  assert.equal(r.accept({...dm('3','x'),threadId:'888'}),null);
  const single=createRouter({config:{allowedGroupId:'123',ownerUserId:OWNER},selfId:SELF});
  assert.equal(single.accept(dm('4','hi')),null);
  assert.equal(single.accept(groupMsg('5','x',{},'999')),null);
  assert.equal(single.accept(groupMsg('6','Giá bao nhiêu?')).addressed,true);
});

function fixture(t,{decide,mode='live'}={}){
  const root=mkdtempSync(join(tmpdir(),'jev-all-')),pausePath=join(root,'PAUSED');
  const store=openStore(join(root,'test.sqlite'));const sent=[],requests=[];
  const listener=new EventEmitter();listener.start=()=>listener.emit('connected');listener.stop=()=>listener.emit('closed');
  const api={listener,getOwnId:()=>SELF,async getGroupInfo(id){return {gridInfoMap:{[id]:{name:'Nhóm Dự án'}}};},async sendMessage(text,to,type){sent.push({text,to,type});}};
  const runtime=createRuntime({api,store,config:{...allConfig,mode},pausePath,intervalMs:60000,log:()=>{},agent:{async decide(input){requests.push(input);return decide(input);}}});
  runtime.start();
  t.after(async()=>{await runtime.stop();store.close();assert.ok(relative(tmpdir(),root).startsWith('jev-all-'));rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});});
  const drain=async()=>{for(let i=0;i<6;i++)await runtime.tick();};
  return {store,sent,requests,runtime,drain,message:value=>listener.emit('message',value)};
}
const escalate={action:'escalate',category:'other',reply:'Em xin phép kiểm tra lại.',reason:'Hỏi giá',report:'Khách hỏi giá'};
const greet={action:'send',category:'greeting',reply:'Chào anh, em là Javis!',reason:'Chào',report:'Lời chào'};

test('runtime mọi nhóm: tin không gọi chỉ làm ngữ cảnh; được tag thì AI xử lý kèm ngữ cảnh và báo chủ',async t=>{
  const x=fixture(t,{decide:()=>escalate});
  x.message(groupMsg('1','Bên mình đang làm dự án Vinhomes'));
  await x.drain();
  assert.equal(x.requests.length,0);assert.equal(x.store.list().length,0);
  x.message(groupMsg('2','@Javis báo giá giúp',{mentions:[{uid:SELF,pos:0,len:6,type:0}]}));
  await x.drain();
  assert.equal(x.requests.length,1);
  assert.equal(x.requests[0].conversation.type,'group');
  assert.deepEqual(x.requests[0].context.map(m=>m.text),['Bên mình đang làm dự án Vinhomes']);
  assert.equal(x.store.get('123:2').status,'review');
  assert.equal(x.sent.filter(m=>m.to==='123').length,0,'không tự gửi câu nghiệp vụ');
  const report=x.sent.find(m=>m.to===OWNER&&m.type===0);
  assert.match(report.text,/Nhóm .*Khách A/u);
});

test('runtime mọi nhóm: gọi tên kèm lời chào thì tự trả lời đúng nhóm',async t=>{
  const x=fixture(t,{decide:()=>greet});
  x.message(groupMsg('1','Javis ơi chào',{}, '555'));
  await x.drain();
  assert.deepEqual(x.sent.find(m=>m.to==='555'),{text:greet.reply,to:'555',type:1});
  assert.equal(x.store.get('555:1').status,'sent');
  assert.equal(x.sent.filter(m=>m.to===OWNER).length,0,'không gửi DM làm phiền chủ khi đã tự trả lời câu thông thường');
});

test('runtime: chủ động trả lời câu hỏi chuyên môn/kỹ thuật thông thường mà không cần chủ duyệt',async t=>{
  const technicalAnswer={action:'send',category:'documented_answer',reply:'BIMUP hỗ trợ triển khai mô hình Revit theo chuẩn LOD 300 - 400.',reason:'Tư vấn kỹ thuật',report:'Giải đáp về Revit'};
  const x=fixture(t,{decide:()=>technicalAnswer});
  x.message(groupMsg('1','@Javis BIMUP có làm Revit LOD 400 không?',{mentions:[{uid:SELF,pos:0,len:6,type:0}]}));
  await x.drain();
  assert.equal(x.store.get('123:1').status,'sent');
  assert.deepEqual(x.sent.find(m=>m.to==='123'),{text:technicalAnswer.reply,to:'123',type:1});
  assert.equal(x.sent.filter(m=>m.to===OWNER).length,0,'chủ động trả lời, không spam Zalo chủ');
});

test('runtime: người lạ nhắn riêng thì báo chủ ngay, chỉ gửi sau khi chủ duyệt',async t=>{
  const x=fixture(t,{decide:()=>escalate});
  x.message(dm('d1','Cho em hỏi giá căn hộ'));
  const immediate=x.store.db.prepare("SELECT text FROM reports WHERE task_id='777:d1' ORDER BY id").all();
  assert.match(immediate[0].text,/Tin riêng mới từ Người lạ \(777\)/u);
  await x.drain();
  assert.equal(x.requests[0].conversation.type,'private');assert.equal(x.requests[0].conversation.withOwner,false);
  assert.equal(x.store.get('777:d1').status,'review');
  assert.equal(x.sent.filter(m=>m.to==='777').length,0);
  assert.ok(x.sent.some(m=>m.to===OWNER&&/Tin riêng mới từ/u.test(m.text)));
  x.message(dm('c1','/jev approve 777:d1 Dạ anh chờ em chút nhé.',OWNER));
  await x.drain();
  assert.deepEqual(x.sent.find(m=>m.to==='777'),{text:'Dạ anh chờ em chút nhé.',to:'777',type:0});
});

test('runtime: chủ nhắn riêng thì Javis trả lời luôn, không tạo báo cáo duyệt; lệnh /jev vẫn là lệnh',async t=>{
  const x=fixture(t,{decide:()=>({...escalate,reply:'Dạ hôm nay anh có 2 cuộc họp.'})});
  x.message(dm('o1','Javis, hôm nay anh có lịch gì?',OWNER));
  await x.drain();
  assert.equal(x.requests[0].conversation.withOwner,true);
  assert.deepEqual(x.sent.filter(m=>m.to===OWNER),[{text:'Dạ hôm nay anh có 2 cuộc họp.',to:OWNER,type:0}]);
  assert.equal(x.store.get(`${OWNER}:o1`).status,'sent');
  x.message(dm('o2','/jev status',OWNER));
  await x.drain();
  assert.equal(x.requests.length,1);
  assert.match(x.sent.at(-1).text,/JEV đang nhận lệnh/u);
});

test('runtime: thử nháp không gửi gì kể cả với chủ',async t=>{
  const x=fixture(t,{decide:()=>greet,mode:'dry-run'});
  x.message(dm('o1','chào',OWNER));x.message(dm('d1','chào'));
  await x.drain();
  assert.equal(x.sent.length,0);
  assert.equal(x.store.get(`${OWNER}:o1`).status,'dry_run');
});

test('runtime: quét đọc lại tin nhắn cũ chưa trả lời khi khởi động lại và tự động trả lời',async t=>{
  const root=mkdtempSync(join(tmpdir(),'jev-catchup-')),pausePath=join(root,'PAUSED');
  const store=openStore(join(root,'test.sqlite'));const sent=[],requests=[];
  const listener=new EventEmitter();listener.start=()=>listener.emit('connected');listener.stop=()=>listener.emit('closed');
  const pastTime=String(Date.now()-60000);
  const missedMsg=groupMsg('missed-1','@Javis cho mình hỏi về Revit',{ts:pastTime,mentions:[{uid:SELF,pos:0,len:6,type:0}]});
  const contextMsg=groupMsg('ctx-1','Ai có tài liệu không?',{ts:pastTime});
  const api={
    listener,getOwnId:()=>SELF,
    async getGroupInfo(id){return {gridInfoMap:{[id]:{name:'Nhóm Dự án'}}};},
    async getAllGroups(){return {gridVerMap:{'123':1}};},
    async getGroupChatHistory(){return {groupMsgs:[contextMsg,missedMsg]};},
    async sendMessage(text,to,type){sent.push({text,to,type});}
  };
  const answer={action:'send',category:'documented_answer',reply:'Chào bạn, Revit hỗ trợ BIM rất tốt.',reason:'Kỹ thuật',report:'Trả lời'};
  const runtime=createRuntime({api,store,config:allConfig,pausePath,intervalMs:60000,log:()=>{},agent:{async decide(input){requests.push(input);return answer;}}});
  runtime.start();
  t.after(async()=>{await runtime.stop();store.close();rmSync(root,{recursive:true,force:true});});
  await runtime.catchUpHistory();
  for(let i=0;i<6;i++)await runtime.tick();
  assert.equal(store.get('123:missed-1').status,'sent');
  assert.deepEqual(sent.find(m=>m.to==='123'),{text:answer.reply,to:'123',type:1});
  assert.deepEqual(requests[0].context.map(m=>m.text),['Ai có tài liệu không?']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore,validateQueueLimit} from '../src/store.mjs';

const decision={action:'send',category:'greeting',reply:'Chào anh!',reason:'Chào hỏi',report:'Đã chào khách.'};
const input=id=>({id,sender:'9',text:`Tin ${id}`});
function memory(t){const store=openStore(':memory:');t.after(()=>store.close());return store;}
function disk(t){
  const root=mkdtempSync(join(tmpdir(),'jev-store-test-')),stores=new Set();
  t.after(()=>{for(const store of stores)store.close();rmSync(root,{recursive:true,force:true});});
  return {path:join(root,'test.sqlite'),open(){const store=openStore(this.path);stores.add(store);return store;},close(store){store.close();stores.delete(store);}};
}
function failReports(store,condition='1'){
  store.db.exec(`CREATE TRIGGER fail_reports BEFORE INSERT ON reports WHEN ${condition} BEGIN SELECT RAISE(ABORT,'synthetic disk failure'); END`);
}

test('nhận tin và lịch sử cùng rollback khi không ghi được lịch sử',t=>{
  const store=memory(t);
  store.db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT,'synthetic disk failure'); END");
  assert.throws(()=>store.add('1','123',input('1')));
  assert.equal(store.get('1'),undefined);
  assert.deepEqual(store.context('123',30),[]);
  store.db.exec('DROP TRIGGER fail_history');
  assert.equal(store.add('1','123',input('1')),true);
  assert.equal(store.context('123',30).length,1);
});

test('hàng chờ chặn vượt giới hạn qua hai kết nối, vẫn nhận diện tin trùng',t=>{
  const file=disk(t),first=file.open(),second=file.open();
  first.add('1','123',input('1'),{maxPendingTasks:1});
  assert.equal(second.add('1','123',input('1'),{maxPendingTasks:1}),false);
  assert.throws(()=>second.add('2','123',input('2'),{maxPendingTasks:1}),{code:'QUEUE_FULL'});
  assert.equal(second.get('2'),undefined);
  assert.deepEqual(first.context('123',30).map(m=>m.id),['1']);
  first.transition('1','queued','review');
  assert.throws(()=>second.add('2','123',input('2'),{maxPendingTasks:1}),{code:'QUEUE_FULL'});
  first.transition('1','review','rejected','Chủ từ chối.');
  assert.equal(second.add('2','123',input('2'),{maxPendingTasks:1}),true);
  assert.equal(second.stats().pending,1);
});

test('giới hạn hàng chờ được kiểm tra trước khi nhận tin',()=>{
  assert.equal(validateQueueLimit(),100);
  for(const invalid of [0,-1,10001,1.5,'10',null,NaN])assert.throws(()=>validateQueueLimit(invalid));
});

test('chủ có thể đóng uncertain sau khi kiểm tra để giải phóng chỗ, không ghi giả lịch sử đã gửi',t=>{
  const store=memory(t);store.add('1','123',input('1'),{maxPendingTasks:1});
  assert.equal(store.closeTask('1'),false);
  store.transition('1','queued','uncertain');
  assert.throws(()=>store.add('2','123',input('2'),{maxPendingTasks:1}),{code:'QUEUE_FULL'});
  assert.equal(store.closeTask('1'),true);assert.equal(store.closeTask('1'),false);
  assert.equal(store.add('2','123',input('2'),{maxPendingTasks:1}),true);
  assert.equal(store.pendingReports().length,1);
  assert.ok(store.context('123',30).every(m=>m.role==='user'));
});

test('quyết định và chuyển trạng thái rollback nếu không tạo được báo cáo',t=>{
  const store=memory(t);store.add('1','123',input('1'));store.transition('1','queued','thinking');
  failReports(store);
  assert.throws(()=>store.decision('1',decision,'approved',{report:'Đề xuất.'}));
  assert.equal(store.get('1').status,'thinking');assert.equal(store.get('1').decision,null);
  assert.throws(()=>store.transition('1','thinking','review','Cần duyệt.'));
  assert.equal(store.get('1').status,'thinking');
  store.db.exec('DROP TRIGGER fail_reports');
  assert.equal(store.decision('1',decision,'approved',{report:'Đề xuất.'}),true);
  assert.equal(store.decision('1',{...decision,reply:'Bản nháp cũ'},'approved',{from:'review',report:'Không được lưu.'}),false);
  assert.equal(JSON.parse(store.get('1').decision).reply,decision.reply);
  assert.equal(store.pendingReports().length,1);
});

test('xác nhận gửi, lịch sử bot và báo cáo được lưu nguyên tử và không lặp',t=>{
  const store=memory(t);store.add('1','123',input('1'));store.transition('1','queued','sending');
  failReports(store);
  assert.throws(()=>store.finishSend('1',decision.reply,'Đã gửi.'));
  assert.equal(store.get('1').status,'sending');assert.equal(store.context('123',30).length,1);
  store.db.exec('DROP TRIGGER fail_reports');
  assert.equal(store.finishSend('1',decision.reply,'Đã gửi.'),true);
  assert.equal(store.finishSend('1',decision.reply,'Lặp.'),false);
  assert.deepEqual(store.context('123',30).map(m=>m.role),['user','assistant']);
  assert.equal(store.pendingReports().length,1);
});

test('ngữ cảnh có phản hồi đã gửi, không có nhóm khác, tin hiện tại hay tin tương lai',t=>{
  const store=memory(t);
  store.add('1','123',input('1'));store.add('other','999',input('other'));store.add('2','123',input('2'));store.add('3','123',input('3'));
  store.transition('1','queued','sending');store.finishSend('1',decision.reply,'Đã gửi.');
  const context=store.context('123',30,'2');
  assert.deepEqual(context.map(m=>[m.id,m.role]),[['1','user'],['1:reply','assistant']]);
  assert.equal(context[1].text,decision.reply);
  assert.deepEqual(store.context('123',1,'2').map(m=>m.role),['assistant']);
  for(const limit of [0,101,1.5])assert.throws(()=>store.context('123',limit));
});

test('khôi phục gián đoạn nguyên tử, không tạo báo cáo trùng hoặc gửi lại báo cáo đang gửi',t=>{
  const store=memory(t);
  store.add('1','123',input('1'));store.transition('1','queued','thinking');
  store.add('2','123',input('2'));store.transition('2','queued','sending');
  store.report('1','Báo cáo cũ.');const old=store.pendingReports()[0];store.markReport(old.id,'sending');
  failReports(store,"NEW.task_id='2'");
  assert.throws(()=>store.recover());
  assert.equal(store.get('1').status,'thinking');assert.equal(store.get('2').status,'sending');
  assert.equal(store.db.prepare('SELECT status FROM reports WHERE id=?').get(old.id).status,'sending');
  store.db.exec('DROP TRIGGER fail_reports');store.recover();store.recover();
  assert.equal(store.get('1').status,'review');assert.equal(store.get('2').status,'uncertain');
  assert.equal(store.retry('2'),false);
  assert.equal(store.pendingReports().length,2);
  assert.equal(store.db.prepare('SELECT status FROM reports WHERE id=?').get(old.id).status,'uncertain');
  assert.ok(store.context('123',30).every(m=>m.role==='user'));
});

test('nâng DB cũ giữ tin nhắn, chỉ phục hồi bot đã gửi và không lặp khi mở lại',t=>{
  const file=disk(t),legacy=new DatabaseSync(file.path);
  legacy.exec('CREATE TABLE tasks(id TEXT PRIMARY KEY,group_id TEXT NOT NULL,input TEXT NOT NULL,decision TEXT,status TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP)');
  for(const [id,status] of [['1','sent'],['2','uncertain'],['3','dry_run']])legacy.prepare('INSERT INTO tasks(id,group_id,input,decision,status) VALUES(?,?,?,?,?)').run(id,'123',JSON.stringify(input(id)),JSON.stringify(decision),status);
  legacy.close();
  let store=file.open();
  assert.equal(store.context('123',30).filter(m=>m.role==='assistant').length,1);
  assert.equal(store.context('123',30).length,4);
  assert.equal(store.get('2').status,'uncertain');
  file.close(store);store=file.open();
  assert.equal(store.context('123',30).length,4);
  assert.equal(store.add('1','123',input('1')),false);
});

test('dừng AI do hạn mức lưu qua khởi động lại; retry không tự bỏ dừng hoặc gửi lại uncertain',t=>{
  const file=disk(t);let store=file.open();
  store.add('1','123',input('1'));store.transition('1','queued','thinking');
  store.pauseAi('1','Hết hạn mức.');
  assert.equal(store.aiPaused(),true);assert.equal(store.get('1').status,'review');
  file.close(store);store=file.open();
  assert.equal(store.aiPaused(),true);
  assert.equal(store.retry('1'),true);assert.equal(store.aiPaused(),true);
  assert.equal(store.get('1').decision,null);
  store.transition('1','queued','uncertain');
  assert.equal(store.retry('1'),false);
  store.resumeAi();assert.equal(store.aiPaused(),false);
});

test('dừng AI và báo cáo cũng rollback cùng nhau khi ổ lưu trữ lỗi',t=>{
  const store=memory(t);store.add('1','123',input('1'));store.transition('1','queued','thinking');
  failReports(store);assert.throws(()=>store.pauseAi('1','Hết hạn mức.'));
  assert.equal(store.aiPaused(),false);assert.equal(store.get('1').status,'thinking');
});

test('chỉ lấy một đợt báo cáo và chỉ một bên nhận quyền gửi mỗi báo cáo',t=>{
  const store=memory(t);
  for(let i=0;i<15;i++)store.report('1',`Báo cáo ${i}`);
  assert.equal(store.pendingReports().length,10);
  const first=store.pendingReports()[0];
  assert.equal(store.markReport(first.id,'sending','pending'),true);
  assert.equal(store.markReport(first.id,'sending','pending'),false);
  assert.equal(store.stats().pendingReports,14);
});

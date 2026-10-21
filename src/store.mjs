import { DatabaseSync } from 'node:sqlite';

const pendingStatuses=['queued','thinking','approved','sending','review','uncertain'];
export function validateQueueLimit(limit=100) {
  if(!Number.isInteger(limit)||limit<1||limit>10000)throw Error('Cần maxPendingTasks là số nguyên từ 1 đến 10000');
  return limit;
}
export function openStore(path) {
  const db=new DatabaseSync(path);
  let transactionDepth=0;
  const transaction=fn=>{
    if(transactionDepth)return fn();
    db.exec('BEGIN IMMEDIATE');
    transactionDepth++;
    try {const value=fn();db.exec('COMMIT');return value;}
    catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
    finally{transactionDepth--;}
  };
  const report=(id,text)=>db.prepare('INSERT INTO reports(task_id,text) VALUES(?,?)').run(id,text);
  const change=(id,from,to,text)=>{
    const changed=db.prepare('UPDATE tasks SET status=? WHERE id=? AND status=?').run(to,id,from).changes===1;
    if(changed&&text)report(id,text);
    return changed;
  };
  const assistantMessage=(id,group,reply,timestamp=new Date().toISOString())=>db.prepare('INSERT INTO messages(task_id,group_id,role,payload) VALUES(?,?,?,?)').run(
    id,group,'assistant',JSON.stringify({id:`${id}:reply`,sender:'JEV',text:reply,timestamp}));
  const queueSize=()=>Number(db.prepare(`SELECT COUNT(*) AS count FROM tasks WHERE status IN (${pendingStatuses.map(()=>'?').join(',')})`).get(...pendingStatuses).count);
  try {
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, group_id TEXT NOT NULL, input TEXT NOT NULL, decision TEXT, status TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY, task_id TEXT, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY, task_id TEXT NOT NULL, group_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant')), payload TEXT NOT NULL, UNIQUE(task_id,role));
    CREATE TABLE IF NOT EXISTS runtime_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS owner_commands(id TEXT PRIMARY KEY,created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);
    CREATE INDEX IF NOT EXISTS messages_group_idx ON messages(group_id,seq);
    CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status);`);
  transaction(()=>{
    if(db.prepare("SELECT 1 FROM runtime_state WHERE key='history_migrated'").get())return;
    db.exec("INSERT OR IGNORE INTO messages(task_id,group_id,role,payload) SELECT id,group_id,'user',input FROM tasks ORDER BY rowid");
    for(const task of db.prepare("SELECT id,group_id,decision FROM tasks WHERE status='sent' ORDER BY rowid").all()) {
      let decision;try{decision=JSON.parse(task.decision);}catch{continue;}
      if(typeof decision?.reply==='string'&&decision.reply.trim())assistantMessage(task.id,task.group_id,decision.reply,'');
    }
    db.exec("INSERT INTO runtime_state(key,value) VALUES('history_migrated','1')");
  });
  } catch(error){db.close();throw error;}
  return {
    db,
    add(id,group,input,{maxPendingTasks=100}={}){
      validateQueueLimit(maxPendingTasks);
      return transaction(()=>{
        if(db.prepare('SELECT 1 FROM tasks WHERE id=?').get(id))return false;
        if(queueSize()>=maxPendingTasks)throw Object.assign(Error('Hàng chờ JEV đã đầy; tin mới chưa được lưu hoặc xử lý.'),{code:'QUEUE_FULL'});
        const payload=JSON.stringify(input);
        db.prepare('INSERT INTO tasks(id,group_id,input,status) VALUES(?,?,?,?)').run(id,group,payload,'queued');
        db.prepare('INSERT INTO messages(task_id,group_id,role,payload) VALUES(?,?,?,?)').run(id,group,'user',payload);
        return true;
      });
    },
    // Tin nhóm không gọi trợ lý: chỉ lưu làm ngữ cảnh, không tạo task/gọi AI. Giữ tối đa 200 tin mỗi cuộc trò chuyện.
    addContext(id,group,input){
      return transaction(()=>{
        const added=db.prepare('INSERT OR IGNORE INTO messages(task_id,group_id,role,payload) VALUES(?,?,?,?)').run(`ctx:${id}`,group,'user',JSON.stringify(input)).changes===1;
        db.prepare("DELETE FROM messages WHERE group_id=? AND task_id LIKE 'ctx:%' AND seq<=(SELECT seq FROM messages WHERE group_id=? AND task_id LIKE 'ctx:%' ORDER BY seq DESC LIMIT 1 OFFSET 200)").run(group,group);
        return added;
      });
    },
    list(){return db.prepare('SELECT id,group_id,decision,status,created FROM tasks ORDER BY rowid DESC LIMIT 100').all();},
    get(id){return db.prepare('SELECT * FROM tasks WHERE id=?').get(id);},
    next({includeQueued=true,includeApproved=true}={}){
      return db.prepare("SELECT * FROM tasks WHERE (status='queued' AND ?=1) OR (status='approved' AND ?=1) ORDER BY rowid LIMIT 1").get(Number(includeQueued),Number(includeApproved));
    },
    transition(id,from,to,text){return transaction(()=>change(id,from,to,text));},
    decision(id,d,status,{from='thinking',report:text}={}){
      return transaction(()=>{
        const changed=db.prepare('UPDATE tasks SET decision=?,status=? WHERE id=? AND status=?').run(JSON.stringify(d),status,id,from).changes===1;
        if(changed&&text)report(id,text);
        return changed;
      });
    },
    finishSend(id,reply,text){
      return transaction(()=>{
        const task=db.prepare("SELECT group_id FROM tasks WHERE id=? AND status='sending'").get(id);
        if(!task)return false;
        change(id,'sending','sent',text);
        assistantMessage(id,task.group_id,reply);
        return true;
      });
    },
    report,
    pendingReports(limit=10){return db.prepare("SELECT * FROM reports WHERE status='pending' ORDER BY id LIMIT ?").all(limit);},
    markReport(id,status,from){return (from===undefined
      ?db.prepare('UPDATE reports SET status=? WHERE id=?').run(status,id)
      :db.prepare('UPDATE reports SET status=? WHERE id=? AND status=?').run(status,id,from)).changes===1;},
    context(group,limit,beforeTaskId){
      if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('contextLimit phải từ 1 đến 100');
      const rows=beforeTaskId===undefined
        ?db.prepare('SELECT role,payload FROM messages WHERE group_id=? ORDER BY seq DESC LIMIT ?').all(group,limit)
        :db.prepare(`SELECT m.role,m.payload FROM messages m LEFT JOIN tasks t ON t.id=m.task_id WHERE m.group_id=?
          AND ((t.rowid IS NOT NULL AND t.rowid<(SELECT rowid FROM tasks WHERE id=?))
            OR (t.rowid IS NULL AND m.task_id LIKE 'ctx:%' AND m.seq<(SELECT seq FROM messages WHERE task_id=? AND role='user')))
          ORDER BY m.seq DESC LIMIT ?`).all(group,beforeTaskId,beforeTaskId,limit);
      return rows.reverse().map(row=>({...JSON.parse(row.payload),role:row.role}));
    },
    aiPaused(){return !!db.prepare("SELECT 1 FROM runtime_state WHERE key='ai_paused'").get();},
    pauseAi(id,text){return transaction(()=>{
      if(!change(id,'thinking','review',text))return false;
      db.exec("INSERT OR REPLACE INTO runtime_state(key,value) VALUES('ai_paused','quota')");
      return true;
    });},
    resumeAi(){db.exec("DELETE FROM runtime_state WHERE key='ai_paused'");},
    retry(id){return transaction(()=>{
      const changed=db.prepare("UPDATE tasks SET decision=NULL,status='queued' WHERE id=? AND status='review'").run(id).changes===1;
      if(changed)report(id,'Anh yêu cầu AI xử lý lại; bản nháp cũ đã được bỏ.');
      return changed;
    });},
    closeTask(id){return transaction(()=>change(id,'uncertain','closed','Anh đã kiểm tra và đóng task chưa rõ kết quả; JEV không tự gửi lại.'));},
    ownerCommand(id,execute){return transaction(()=>{
      if(db.prepare('SELECT 1 FROM owner_commands WHERE id=?').get(id))return false;
      db.prepare('INSERT INTO owner_commands(id) VALUES(?)').run(id);
      const reply=execute();
      if(typeof reply!=='string')throw Error('Owner command must finish synchronously');
      report(`owner-command:${id}`,reply.slice(0,1800));
      return true;
    });},
    stats(){return {
      statuses:Object.fromEntries(db.prepare('SELECT status,COUNT(*) AS count FROM tasks GROUP BY status').all().map(row=>[row.status,Number(row.count)])),
      pending:queueSize(),
      pendingReports:Number(db.prepare("SELECT COUNT(*) AS count FROM reports WHERE status='pending'").get().count),
      aiPaused:this.aiPaused()
    };},
    recover(){return transaction(()=>{
      const rows=db.prepare("SELECT id,status FROM tasks WHERE status IN ('thinking','sending')").all();
      for(const row of rows)change(row.id,row.status,row.status==='sending'?'uncertain':'review','Tiến trình bị gián đoạn. Kiểm tra thực tế trước khi xử lý; không tự gửi lại.');
      db.prepare("UPDATE reports SET status='uncertain' WHERE status='sending'").run();
    });},
    close(){db.close();}
  };
}

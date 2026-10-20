import { DatabaseSync } from 'node:sqlite';
export function openStore(path) {
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, group_id TEXT NOT NULL, input TEXT NOT NULL, decision TEXT, status TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY, task_id TEXT, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending');`);
  return {
    db,
    add(id,group,input){return db.prepare('INSERT OR IGNORE INTO tasks(id,group_id,input,status) VALUES(?,?,?,?)').run(id,group,JSON.stringify(input),'queued').changes>0;},
    list(){return db.prepare('SELECT id,group_id,decision,status,created FROM tasks ORDER BY rowid DESC LIMIT 100').all();},
    get(id){return db.prepare('SELECT * FROM tasks WHERE id=?').get(id);},
    next(){return db.prepare("SELECT * FROM tasks WHERE status IN ('queued','approved') ORDER BY rowid LIMIT 1").get();},
    transition(id,from,to){return db.prepare('UPDATE tasks SET status=? WHERE id=? AND status=?').run(to,id,from).changes===1;},
    decision(id,d,status){db.prepare('UPDATE tasks SET decision=?, status=? WHERE id=?').run(JSON.stringify(d),status,id);},
    report(id,text){db.prepare('INSERT INTO reports(task_id,text) VALUES(?,?)').run(id,text);},
    pendingReports(){return db.prepare("SELECT * FROM reports WHERE status='pending' ORDER BY id").all();},
    markReport(id,status){db.prepare('UPDATE reports SET status=? WHERE id=?').run(status,id);},
    context(group,limit){return db.prepare('SELECT input FROM tasks WHERE group_id=? ORDER BY rowid DESC LIMIT ?').all(group,limit).reverse().map(r=>JSON.parse(r.input));},
    recover(){const rows=db.prepare("SELECT id FROM tasks WHERE status IN ('thinking','sending')").all();for(const r of rows){db.prepare("UPDATE tasks SET status='review' WHERE id=?").run(r.id);this.report(r.id,'Tiến trình bị gián đoạn. Kiểm tra thực tế trước khi duyệt; không tự gửi lại.');}db.prepare("UPDATE reports SET status='uncertain' WHERE status='sending'").run();},
    close(){db.close();}
  };
}

import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {acquireLock} from '../src/lock.mjs';

// Explicit maintenance command: remove only the untouched desktop starter profile.
const root=resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Cần đường dẫn thư mục dữ liệu app.');
const file=join(root,'assistants.json');
const original=readFileSync(file,'utf8'),data=JSON.parse(original);
const profile=data.assistants.find(a=>a.id==='default');
const connection=data.connections.find(c=>c.id==='legacy-ai');
const untouched=profile?.name==='BIMUP'&&profile.role==='Trợ lý BIMUP'
  &&profile.skill==='Dùng quy tắc và kiến thức BIMUP hiện có.'&&profile.strategy==='primary'
  &&!profile.age&&!profile.personality&&JSON.stringify(profile.connectionIds)==='["legacy-ai"]'
  &&Object.values(profile.platforms??{}).every(platform=>Object.values(platform).every(value=>!value))
  &&connection?.name==='AI hiện có'&&connection.provider==='deepseek'&&connection.model==='deepseek-flash'
  &&!data.assistants.some(a=>a.id!=='default'&&a.connectionIds.includes('legacy-ai'));
if(!untouched){console.log('Không có bộ mặc định nguyên gốc để gỡ.');process.exit(0);}
if(!process.argv.includes('--apply')){console.log('Có thể gỡ trợ lý BIMUP mặc định và AI hiện có; dùng --apply để thực hiện.');process.exit(0);}
const privateDir=join(root,'.private');mkdirSync(privateDir,{recursive:true});
const release=acquireLock(join(privateDir,'worker.lock'));
try{
  if(readFileSync(file,'utf8')!==original)throw Error('Dữ liệu đã thay đổi; chạy lại kiểm tra.');
  const backup=join(root,'backups','default-cleanup-'+new Date().toISOString().replace(/[:.]/g,'-'));
  mkdirSync(backup,{recursive:true});copyFileSync(file,join(backup,'assistants.json'));
  const wasActive=data.activeId==='default';
  data.assistants=data.assistants.filter(a=>a.id!=='default');
  data.connections=data.connections.filter(c=>c.id!=='legacy-ai');
  if(wasActive)data.activeId=null;
  const configPath=join(root,'config.json');
  if(wasActive&&existsSync(configPath)){
    copyFileSync(configPath,join(backup,'config.json'));
    const config=JSON.parse(readFileSync(configPath,'utf8'));
    Object.assign(config,{allowedGroupId:'',groupName:'',ownerUserId:'',mode:'dry-run',ai:{}});
    writeFileSync(configPath+'.tmp',JSON.stringify(config,null,2)+'\n');renameSync(configPath+'.tmp',configPath);
  }
  writeFileSync(file+'.tmp',JSON.stringify(data,null,2)+'\n');renameSync(file+'.tmp',file);
  console.log('Đã gỡ 2 mục mặc định. Giữ nguyên '+data.assistants.length+' trợ lý và '+data.connections.length+' kết nối riêng; đã sao lưu cấu hình.');
}finally{release();}

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createAssistantRegistry} from '../src/assistants.mjs';

const script=fileURLToPath(new URL('../scripts/clear-legacy-defaults.mjs',import.meta.url));
const connectionId='11111111-1111-1111-1111-111111111111';
const zalo={allowedGroupId:'',groupName:'',ownerUserId:''};
function fixture(t,{customized=false,activeId='default',sharedLegacy=false}={}){
  const root=mkdtempSync(join(tmpdir(),'bimup-default-cleanup-'));
  t.after(()=>rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}));
  const starter={id:'default',name:customized?'My assistant':'BIMUP',role:'Trợ lý BIMUP',skill:'Dùng quy tắc và kiến thức BIMUP hiện có.',strategy:'primary',connectionIds:['legacy-ai'],age:'',personality:'',platforms:{zalo,teams:{tenantId:'',conversationId:''}}};
  const custom=[{id:'22222222-2222-2222-2222-222222222222',name:'Javis',role:'Custom role',skill:'Custom skill',strategy:'primary',connectionIds:[sharedLegacy?'legacy-ai':connectionId],age:'25',personality:'Custom personality',platforms:{zalo:{allowedGroupId:'123',groupName:'My group',ownerUserId:'456'}}},{id:'33333333-3333-3333-3333-333333333333',name:'BIMUP Project',role:'Project support',skill:'Project documents',strategy:'primary',connectionIds:[connectionId]}];
  const customConnection={id:connectionId,name:'Chosen CLI',provider:'claude-cli',model:'chosen-model'};
  const data={version:1,activeId,assistants:[starter,...custom],connections:[{id:'legacy-ai',name:'AI hiện có',provider:'deepseek',model:'deepseek-flash'},customConnection]};
  const original=JSON.stringify(data,null,2)+'\n';
  const config={allowedGroupId:'',groupName:'',ownerUserId:'',mode:'dry-run',contextLimit:45,ai:{provider:'deepseek',model:'deepseek-flash'}};
  const originalConfig=JSON.stringify(config,null,2)+'\n';
  writeFileSync(join(root,'assistants.json'),original);writeFileSync(join(root,'config.json'),originalConfig);
  const preserved=[['.private/session.dpapi','SYNTHETIC_SESSION'],['.private/jev.sqlite','SYNTHETIC_HISTORY'],['knowledge/kept.md','CUSTOM_KNOWLEDGE'],['ai-connections.bin','SYNTHETIC_VAULT']];
  for(const [relative,content] of preserved){const path=join(root,relative);mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,content);}
  return {root,custom,customConnection,data,original,originalConfig,preserved};
}
function run(root,apply=false){
  const result=spawnSync(process.execPath,[script,root,...(apply?['--apply']:[])],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout;
}

test('cleanup dry run reports untouched defaults without modifying configuration or data',t=>{
  const x=fixture(t);assert.match(run(x.root),/--apply/);
  assert.equal(readFileSync(join(x.root,'assistants.json'),'utf8'),x.original);
  assert.equal(readFileSync(join(x.root,'config.json'),'utf8'),x.originalConfig);
  assert.equal(existsSync(join(x.root,'backups')),false);assert.equal(existsSync(join(x.root,'.private','worker.lock')),false);
  for(const [relative,content] of x.preserved)assert.equal(readFileSync(join(x.root,relative),'utf8'),content);
});

test('cleanup applies with exact backups, preserves custom profiles and never reseeds removed defaults',t=>{
  const x=fixture(t);assert.match(run(x.root,true),/Đã gỡ 2 mục/);
  const saved=JSON.parse(readFileSync(join(x.root,'assistants.json'),'utf8'));
  assert.equal(saved.activeId,null);assert.deepEqual(saved.assistants,x.custom);assert.deepEqual(saved.connections,[x.customConnection]);
  const backupNames=readdirSync(join(x.root,'backups'));assert.equal(backupNames.length,1);
  const backup=join(x.root,'backups',backupNames[0]);
  assert.equal(readFileSync(join(backup,'assistants.json'),'utf8'),x.original);assert.equal(readFileSync(join(backup,'config.json'),'utf8'),x.originalConfig);
  const config=JSON.parse(readFileSync(join(x.root,'config.json'),'utf8'));
  assert.deepEqual(config.ai,{});assert.equal(config.mode,'dry-run');assert.equal(config.allowedGroupId,'');assert.equal(config.ownerUserId,'');assert.equal(config.contextLimit,45);
  for(const [relative,content] of x.preserved)assert.equal(readFileSync(join(x.root,relative),'utf8'),content);
  const registry=createAssistantRegistry(x.root,{provider:'deepseek',model:'deepseek-flash'},config);
  assert.ok(!registry.snapshot().assistants.some(a=>a.id==='default'));assert.ok(!registry.snapshot().connections.some(c=>c.id==='legacy-ai'));assert.equal(registry.snapshot().activeId,null);
  assert.match(run(x.root,true),/Không có/);assert.equal(readdirSync(join(x.root,'backups')).length,1);assert.equal(existsSync(join(x.root,'.private','worker.lock')),false);
});

test('cleanup leaves a custom active selection and its config unchanged',t=>{
  const activeId='22222222-2222-2222-2222-222222222222',x=fixture(t,{activeId});run(x.root,true);
  assert.equal(JSON.parse(readFileSync(join(x.root,'assistants.json'),'utf8')).activeId,activeId);
  assert.equal(readFileSync(join(x.root,'config.json'),'utf8'),x.originalConfig);
  const backup=join(x.root,'backups',readdirSync(join(x.root,'backups'))[0]);assert.equal(existsSync(join(backup,'config.json')),false);
});

test('cleanup skips customized default profiles and legacy connections shared by another profile',t=>{
  for(const options of [{customized:true},{sharedLegacy:true}]){
    const x=fixture(t,options);assert.match(run(x.root,true),/Không có/);
    assert.equal(readFileSync(join(x.root,'assistants.json'),'utf8'),x.original);assert.equal(readFileSync(join(x.root,'config.json'),'utf8'),x.originalConfig);assert.equal(existsSync(join(x.root,'backups')),false);
  }
});

test('cleanup refuses to mutate while the app holds its worker lock',t=>{
  const x=fixture(t);writeFileSync(join(x.root,'.private','worker.lock'),'APP_LOCK');
  const result=spawnSync(process.execPath,[script,x.root,'--apply'],{encoding:'utf8',windowsHide:true});
  assert.notEqual(result.status,0);assert.match(result.stderr,/EEXIST/);
  assert.equal(readFileSync(join(x.root,'assistants.json'),'utf8'),x.original);assert.equal(readFileSync(join(x.root,'.private','worker.lock'),'utf8'),'APP_LOCK');assert.equal(existsSync(join(x.root,'backups')),false);
});

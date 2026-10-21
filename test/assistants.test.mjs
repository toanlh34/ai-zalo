import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAssistantRegistry,createAssistantAgent} from '../src/assistants.mjs';
const decision={action:'send',category:'greeting',reply:'Chào',reason:'Chào hỏi',report:'Đã soạn'};
function fixture(t,legacy={provider:'deepseek',model:'old-model'},legacyZalo={}){const root=mkdtempSync(join(tmpdir(),'bimup-assistants-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'agent','skills','customer-support'),{recursive:true});mkdirSync(join(root,'knowledge'));writeFileSync(join(root,'agent','IDENTITY.md'),'DEFAULT_IDENTITY');writeFileSync(join(root,'agent','skills','customer-support','SKILL.md'),'DEFAULT_SKILL');const registry=createAssistantRegistry(root,legacy,legacyZalo);return {root,registry};}
const profile=(name,ids,strategy='fallback')=>({name,role:`Vai trò ${name}`,skill:`Skill ${name}`,connectionIds:ids,strategy});
test('fresh registry stays empty on reload even if legacy config is later supplied',t=>{
  const {root,registry:r}=fixture(t,null),empty={version:1,activeId:null,connections:[],assistants:[]};
  assert.deepEqual(r.snapshot(),empty);
  assert.deepEqual(JSON.parse(readFileSync(join(root,'assistants.json'),'utf8')),empty);
  assert.deepEqual(createAssistantRegistry(root,{provider:'deepseek',model:'old-model'}).snapshot(),empty);
  const c=r.saveConnection({name:'Chosen AI',provider:'gemini-api',model:'chosen-model'}),a=r.saveAssistant(profile('Chosen assistant',[c.id]));
  assert.equal(r.snapshot().activeId,null);r.activate(a.id);
  assert.equal(createAssistantRegistry(root).snapshot().activeId,a.id);
});
test('explicit legacy configuration migrates once and preserves platform data and root files',t=>{
  const zalo={allowedGroupId:'123',groupName:'Existing group',ownerUserId:'456'}, {root,registry:r}=fixture(t,{provider:'gemini-api',model:'existing-model'},zalo);
  assert.equal(r.snapshot().activeId,'default');assert.equal(r.folder('default'),root);
  assert.equal(r.connection('legacy-ai').provider,'gemini-api');assert.equal(r.connection('legacy-ai').model,'existing-model');
  assert.deepEqual(r.assistant('default').platforms.zalo,zalo);
  r.saveAssistant({...r.assistant('default'),name:'Existing name',role:'Existing role',skill:'Existing skill'});
  const again=createAssistantRegistry(root,{provider:'claude-cli',model:'different'},{});
  assert.equal(again.assistant('default').name,'Existing name');assert.equal(again.connection('legacy-ai').provider,'gemini-api');
  assert.deepEqual(again.assistant('default').platforms.zalo,zalo);
  assert.equal(readFileSync(join(root,'agent','IDENTITY.md'),'utf8'),'DEFAULT_IDENTITY');
  assert.equal(readFileSync(join(root,'agent','skills','customer-support','SKILL.md'),'utf8'),'DEFAULT_SKILL');
});
test('default assistant and legacy connection can be deleted without losing files or being recreated',t=>{
  const {root,registry:r}=fixture(t);writeFileSync(join(root,'knowledge','existing.md'),'EXISTING_KNOWLEDGE');
  mkdirSync(join(root,'.private'));writeFileSync(join(root,'.private','jev.sqlite'),'EXISTING_HISTORY');
  assert.throws(()=>r.removeConnection('legacy-ai'),/gỡ AI/);
  r.removeAssistant('default');assert.equal(r.snapshot().activeId,null);r.removeConnection('legacy-ai');
  const reloaded=createAssistantRegistry(root,{provider:'deepseek',model:'old-model'});
  assert.deepEqual(reloaded.snapshot(),{version:1,activeId:null,connections:[],assistants:[]});
  assert.equal(readFileSync(join(root,'knowledge','existing.md'),'utf8'),'EXISTING_KNOWLEDGE');
  assert.equal(readFileSync(join(root,'.private','jev.sqlite'),'utf8'),'EXISTING_HISTORY');
  assert.equal(readFileSync(join(root,'agent','IDENTITY.md'),'utf8'),'DEFAULT_IDENTITY');
});
test('deleting an active assistant clears selection without switching to another; last assistant can be removed',t=>{
  const {root,registry:r}=fixture(t,null),c=r.saveConnection({name:'AI',provider:'claude-cli'});
  const a=r.saveAssistant(profile('A',[c.id])),b=r.saveAssistant(profile('B',[c.id]));
  writeFileSync(join(r.folder(a.id),'knowledge','kept.md'),'KEPT');const folder=r.folder(a.id);r.activate(a.id);r.removeAssistant(a.id);
  assert.equal(r.snapshot().activeId,null);assert.equal(r.assistant(b.id).name,'B');
  assert.equal(readFileSync(join(folder,'knowledge','kept.md'),'utf8'),'KEPT');
  assert.equal(createAssistantRegistry(root).snapshot().activeId,null);
  assert.throws(()=>r.removeConnection(c.id),/gỡ AI/);r.activate(b.id);r.removeAssistant(b.id);r.removeConnection(c.id);
  assert.deepEqual(createAssistantRegistry(root).snapshot(),{version:1,activeId:null,connections:[],assistants:[]});
});
test('many assistants share AI connections, preserve order and survive reload',t=>{
  const {root,registry:r}=fixture(t),c=r.saveConnection({name:'Google',provider:'antigravity-cli',model:''});
  const a=r.saveAssistant(profile('Hana',['legacy-ai',c.id])),b=r.saveAssistant(profile('Mai',[c.id]));r.activate(a.id);
  const reloaded=createAssistantRegistry(root,{});assert.equal(reloaded.snapshot().activeId,a.id);assert.deepEqual(reloaded.assistant(a.id).connectionIds,['legacy-ai',c.id]);assert.equal(reloaded.assistant(b.id).connectionIds[0],c.id);
  assert.throws(()=>r.removeConnection(c.id),/gỡ AI/);assert.throws(()=>r.saveAssistant(profile('Bad',['unknown'])),/hợp lệ/);assert.throws(()=>r.saveConnection({id:'../../escape',name:'Bad',provider:'deepseek'}),/ID/);
});
test('fallback routes only eligible failures, isolates keys, and uses private skill/knowledge',async t=>{
  const {root,registry:r}=fixture(t);writeFileSync(join(root,'knowledge','default.md'),'PRIVATE_DEFAULT');
  const c=r.saveConnection({name:'Own API',provider:'gemini-api',model:'custom-model'}),a=r.saveAssistant(profile('Hana',['legacy-ai',c.id]));writeFileSync(join(r.folder(a.id),'knowledge','hana.md'),'HANA_ONLY');const calls=[];
  const agent=createAssistantAgent(r,a.id,{keys:{[c.id]:'OWN_KEY'},env:{GEMINI_API_KEY:'OTHER_KEY',DEEPSEEK_API_KEY:'DEFAULT_KEY'},factory:(config,folder,deps)=>({async decide(){calls.push({config,folder,key:deps.env[config.apiKeyEnv],context:deps.loadContext(folder)});if(calls.length===1)throw Object.assign(Error('Quota'),{code:'AI_RATE_LIMITED'});return decision;}})});
  assert.deepEqual(await agent.decide({}),decision);assert.deepEqual(calls.map(c=>c.key),['DEFAULT_KEY','OWN_KEY']);assert.equal(calls[1].config.model,'custom-model');assert.ok(calls.every(c=>c.context.includes('HANA_ONLY')&&!c.context.includes('PRIVATE_DEFAULT')));assert.ok(!readFileSync(join(root,'assistants.json'),'utf8').includes('OWN_KEY'));
});
test('round robin alternates and primary calls only first connection',async t=>{
  const {registry:r}=fixture(t),c=r.saveConnection({name:'CLI',provider:'antigravity-cli'}),a=r.saveAssistant(profile('A',['legacy-ai',c.id],'round-robin')),calls=[];
  const factory=config=>({async decide(){calls.push(config.provider);return decision;}});
  const agent=createAssistantAgent(r,a.id,{factory});await agent.decide({});await agent.decide({});await agent.decide({});assert.deepEqual(calls,['deepseek','antigravity-cli','deepseek']);
  r.saveAssistant({...a,strategy:'primary'});calls.length=0;const primary=createAssistantAgent(r,a.id,{factory});await primary.decide({});await primary.decide({});assert.deepEqual(calls,['deepseek','deepseek']);
});
test('auth, invalid output, tool failures and cancellation never fall through to another AI',async t=>{
  const {registry:r}=fixture(t),c=r.saveConnection({name:'CLI',provider:'antigravity-cli'}),a=r.saveAssistant(profile('A',['legacy-ai',c.id]));
  for(const code of ['AI_AUTHENTICATION','AI_INVALID_DECISION','AI_TOOL_CALL','AI_CANCELLED']){let count=0;const agent=createAssistantAgent(r,a.id,{factory:()=>({async decide(){count++;throw Object.assign(Error('fail'),{code});}})});await assert.rejects(agent.decide({}),{code});assert.equal(count,1);}
  const controller=new AbortController();controller.abort();await assert.rejects(createAssistantAgent(r,a.id).decide({},{signal:controller.signal}),{code:'AI_CANCELLED'});
});
test('named API connections never borrow an ambient key; default role edits are used',async t=>{
  const {registry:r}=fixture(t),c=r.saveConnection({name:'Own',provider:'deepseek'});let observed;
  const a=r.saveAssistant({...profile('Default',[c.id]),id:'default'});
  await createAssistantAgent(r,a.id,{env:{DEEPSEEK_API_KEY:'DO_NOT_BORROW'},factory:(config,folder,deps)=>({async decide(){observed={key:deps.env[config.apiKeyEnv],context:deps.loadContext(folder)};return decision;}})}).decide({});
  assert.equal(observed.key,'');assert.ok(observed.context.includes('Vai trò Default')&&observed.context.includes('Skill Default'));
});

test('persona fields persist, appear in instructions, and validate age without losing platform configuration',async t=>{
  const {root,registry:r}=fixture(t),a=r.saveAssistant({...profile('Hana',['legacy-ai']),age:'25',personality:'Điềm tĩnh'});
  r.saveZalo(a.id,{allowedGroupId:'123',groupName:'Khách',ownerUserId:'456'});
  r.saveAssistant({...a,role:'Vai trò mới'});const reloaded=createAssistantRegistry(root,{});
  assert.equal(reloaded.assistant(a.id).platforms.zalo.ownerUserId,'456');assert.equal(reloaded.assistant(a.id).age,'25');
  let instructions;await createAssistantAgent(reloaded,a.id,{factory:(config,folder,deps)=>({async decide(){instructions=deps.loadContext(folder);return decision;}})}).decide({});
  assert.ok(instructions.includes('25')&&instructions.includes('Điềm tĩnh'));
  assert.throws(()=>r.saveAssistant({...a,age:'-1'}),/tuổi/);assert.throws(()=>r.saveAssistant({...a,age:'151'}),/tuổi/);
});

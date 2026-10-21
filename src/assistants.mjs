import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAgent,loadContext} from './agent.mjs';

const providers=['deepseek','gemini-api','claude-cli','antigravity-cli'];
const idOK=id=>/^(legacy-ai|default|[a-f0-9-]{36})$/.test(id);
const text=(value,max=150)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Cần nhập tên hoặc nội dung hợp lệ.');return value.trim();};
export function createAssistantRegistry(root,legacy,legacyZalo={}){
  const file=join(root,'assistants.json');
  let data=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{version:1,activeId:'default',connections:[{id:'legacy-ai',name:'AI hiện có',provider:legacy.provider==='gemini-cli'?'antigravity-cli':legacy.provider,model:legacy.provider==='gemini-cli'?'':legacy.model??''}],assistants:[{id:'default',name:'BIMUP',role:'Trợ lý BIMUP',skill:'Dùng quy tắc và kiến thức BIMUP hiện có.',connectionIds:['legacy-ai'],strategy:'primary'}]};
  for(const a of data.assistants){a.age??='';a.personality??='';a.platforms??={zalo:a.id==='default'?{allowedGroupId:legacyZalo.allowedGroupId??'',groupName:legacyZalo.groupName??'',ownerUserId:legacyZalo.ownerUserId??''}:{allowedGroupId:'',groupName:'',ownerUserId:''},teams:{tenantId:'',conversationId:''}};}
  const persist=()=>{writeFileSync(file+'.tmp',JSON.stringify(data,null,2));renameSync(file+'.tmp',file);};
  const assistant=id=>{const value=data.assistants.find(a=>a.id===id);if(!value)throw Error('Chọn trợ lý hợp lệ.');return value;};
  const connection=id=>{const value=data.connections.find(a=>a.id===id);if(!value)throw Error('Chọn kết nối AI hợp lệ.');return value;};
  const folder=id=>{assistant(id);return id==='default'?root:join(root,'assistants',id);};
  return {
    snapshot:()=>structuredClone(data),assistant,connection,folder,
    saveConnection(value){
      if(!providers.includes(value.provider))throw Error('Chọn nhà cung cấp AI hợp lệ.');
      const id=value.id||randomUUID();if(!idOK(id))throw Error('Chọn ID hợp lệ.');if(value.id)connection(id);
      const item={id,name:text(value.name),provider:value.provider,model:String(value.model??'').trim()};
      if(item.model.length>150)throw Error('Tên model quá dài.');
      data.connections=data.connections.filter(c=>c.id!==id).concat(item);persist();return item;
    },
    saveAssistant(value){
      const id=value.id||randomUUID();if(!idOK(id))throw Error('Chọn ID hợp lệ.');if(value.id)assistant(id);
      if(!Array.isArray(value.connectionIds)||!value.connectionIds.length||value.connectionIds.length>20||new Set(value.connectionIds).size!==value.connectionIds.length)throw Error('Chọn ít nhất một kết nối AI, không trùng.');
      value.connectionIds.forEach(connection);
      if(!['primary','fallback','round-robin'].includes(value.strategy))throw Error('Chọn cách dùng AI hợp lệ.');
      const previous=value.id?assistant(id):null;
      const age=value.age===undefined?previous?.age??'':String(value.age).trim();if(age!==''&&(!/^\d{1,3}$/.test(age)||Number(age)>150))throw Error('Cần tuổi từ 0 đến 150 hoặc để trống.');
      const personality=String(value.personality??previous?.personality??'').trim();if(personality.length>4000)throw Error('Cần rút ngắn tính cách dưới 4000 ký tự.');
      const teams={tenantId:String(value.teams?.tenantId??previous?.platforms?.teams?.tenantId??'').trim(),conversationId:String(value.teams?.conversationId??previous?.platforms?.teams?.conversationId??'').trim()};
      if(Object.values(teams).some(v=>v.length>250))throw Error('Cần thông tin Teams dưới 250 ký tự.');
      const item={id,name:text(value.name),age,personality,role:text(value.role,12000),skill:text(value.skill,20000),connectionIds:[...value.connectionIds],strategy:value.strategy,platforms:{zalo:previous?.platforms?.zalo??{allowedGroupId:'',groupName:'',ownerUserId:''},teams}};
      data.assistants=data.assistants.filter(a=>a.id!==id).concat(item);
      const base=folder(id);mkdirSync(join(base,'agent','skills','customer-support'),{recursive:true});mkdirSync(join(base,'knowledge'),{recursive:true});
      // Existing default documents are managed in their original folders.
      if(id!=='default'){
        writeFileSync(join(base,'agent','IDENTITY.md'),`Tên: ${item.name}\n${item.role}\nChỉ soạn trả lời, không tự gửi hoặc chạy lệnh.\n`);
        writeFileSync(join(base,'agent','skills','customer-support','SKILL.md'),item.skill);
      }
      persist();return item;
    },
    activate(id){assistant(id);data.activeId=id;persist();},
    saveZalo(id,config){const a=assistant(id);a.platforms.zalo={allowedGroupId:config.allowedGroupId??'',groupName:config.groupName??'',ownerUserId:config.ownerUserId??''};persist();},
    removeAssistant(id){if(id==='default'||id===data.activeId)throw Error('Chọn trợ lý khác làm việc trước; không xóa trợ lý mặc định.');assistant(id);data.assistants=data.assistants.filter(a=>a.id!==id);persist();},
    removeConnection(id){connection(id);if(id==='legacy-ai'||data.assistants.some(a=>a.connectionIds.includes(id)))throw Error('Cần gỡ AI khỏi các trợ lý trước khi xóa; kết nối mặc định được giữ lại.');data.connections=data.connections.filter(c=>c.id!==id);persist();},
    config(id){const c=connection(id);return {provider:c.provider,model:c.model,executable:c.provider==='antigravity-cli'?'agy':'claude',apiKeyEnv:c.provider==='gemini-api'?'GEMINI_API_KEY':'DEEPSEEK_API_KEY',timeoutMs:120000,mcpServers:{},allowedMcpTools:[]};},
    persist
  };
}

export function createAssistantAgent(registry,id,{keys={},env=process.env,factory=createAgent,onUse=()=>{}}={}){
  const profile=registry.assistant(id);let turn=0;
  return {async decide(input,options={}){
    const ids=profile.connectionIds,order=profile.strategy==='round-robin'?[ids[turn++%ids.length]]:profile.strategy==='fallback'?ids:[ids[0]];
    let last;
    for(const connectionId of order){
      if(options.signal?.aborted)throw Object.assign(Error('Đã hủy gọi AI.'),{code:'AI_CANCELLED'});
      const config=registry.config(connectionId),localEnv={...env};
      // Named connections never inherit another connection's API credential.
      if(connectionId!=='legacy-ai')localEnv[config.apiKeyEnv]=keys[connectionId]??'';
      try{onUse(registry.connection(connectionId));return await factory(config,registry.folder(id),{env:localEnv,loadContext:root=>loadContext(root)+`\nTên trợ lý: ${profile.name}\nTuổi (hồ sơ nhân vật): ${profile.age||'Không đặt'}\nTính cách: ${profile.personality}\nVai trò: ${profile.role}\nSkill: ${profile.skill}`}).decide(input,options);}
      catch(error){last=error;if(!['AI_RATE_LIMITED','AI_NETWORK_ERROR','AI_TIMEOUT','AI_HTTP_ERROR','CLAUDE_RATE_LIMITED','CLAUDE_TIMEOUT'].includes(error.code))throw error;}
    }
    throw last;
  }};
}

import {z} from 'zod';
const id=z.string().min(1).max(50),name=z.string().trim().min(1).max(150);
const properties={id:id.optional(),name,age:z.string().regex(/^\d{0,3}$/).optional(),personality:z.string().max(4000).optional(),role:z.string().min(1).max(12000),skill:z.string().min(1).max(20000),connectionIds:z.array(id).min(1).max(20),strategy:z.enum(['primary','fallback','round-robin']).default('primary')};
const tool=(name,description,shape,action,readOnly=false)=>({name,description,shape,schema:z.object(shape).strict(),action,annotations:{readOnlyHint:readOnly,destructiveHint:name.startsWith('delete_'),idempotentHint:readOnly,openWorldHint:name==='test_assistant'}});
export const appTools=[
  tool('app_status','Read local app state and active assistant. No customer messages, API keys or login tokens.',{},'status',true),
  tool('list_ai_connections','List saved AI connection IDs, providers and models. Never returns credentials.',{},'list-connections',true),
  tool('save_ai_connection','Create or update a shared AI connection (name/provider/model). API credentials stay managed in the app UI.',{id:id.optional(),name,provider:z.enum(['deepseek','gemini-api','antigravity-cli','claude-cli']),model:z.string().max(150).default('')},'save-connection'),
  tool('list_assistants','List assistant profiles, assigned AI IDs and Zalo configuration, excluding authentication sessions.',{},'list-assistants',true),
  tool('get_assistant','Read one assistant profile and its assigned AI connections. No tokens or customer messages.',{id},'get-assistant',true),
  tool('save_assistant','Create an assistant by omitting id, or update an existing profile with id. Set name, age, personality, role, skill, AI IDs and strategy. Does not log in, activate or send messages.',properties,'save-assistant'),
  tool('activate_assistant','Select a saved assistant while the agent is stopped. Switches its private queue and Zalo session; always resets to dry-run. Does not start the agent.',{id},'activate-assistant'),
  tool('delete_assistant','Delete an assistant configuration while the agent is stopped, including legacy/default or selected profiles. Deleting the selected profile clears selection. Documents, Zalo session and history remain on disk.',{id},'delete-assistant'),
  tool('delete_ai_connection','Delete an unused AI connection. Rejected if any assistant uses it.',{id},'delete-connection'),
  tool('list_knowledge','List Markdown knowledge documents for a specific assistant.',{id},'knowledge-list',true),
  tool('read_knowledge','Read one assistant Markdown knowledge file; basename only, no paths.',{id,filename:z.string().max(100)},'knowledge-read',true),
  tool('write_knowledge','Create/update an assistant Markdown knowledge file. Changes the facts used for future drafts; basename only. Does not send messages.',{id,filename:z.string().max(100),content:z.string().max(60000)},'knowledge-write'),
  tool('test_assistant','Call the saved assistant with a synthetic message and its knowledge. Uses AI quota; never sends to Zalo.',{id,text:z.string().min(1).max(4000).default('Xin chào')},'test-assistant')
];
export function createAppToolRouter(dispatch){return async (name,args={})=>{
  const definition=appTools.find(t=>t.name===name);if(!definition)throw Error('Thao tác MCP không hỗ trợ.');
  const parsed=definition.schema.safeParse(args);if(!parsed.success)throw Error('Cần tham số MCP đúng schema của công cụ.');
  const payload=parsed.data;
  if(['status','list-connections','list-assistants','get-assistant'].includes(definition.action)){
    const s=await dispatch('snapshot');
    if(definition.action==='status')return {running:s.running,connected:s.connected,operation:s.operation,mode:s.config.mode,sessionPresent:s.session,activeAssistantId:s.management.activeId,counts:s.statuses};
    if(definition.action==='list-connections')return s.management.connections;
    if(definition.action==='list-assistants')return {activeId:s.management.activeId,assistants:s.management.assistants};
    const a=s.management.assistants.find(a=>a.id===payload.id);if(!a)throw Error('Chọn trợ lý hợp lệ.');return a;
  }
  const result=await dispatch(definition.action,payload);return result??{ok:true};
};}

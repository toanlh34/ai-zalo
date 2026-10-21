import {createAgent} from './agent.mjs';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// The live provider smoke test must never load the project's knowledge or identity.
// Only these synthetic instructions and the greeting below go to Claude.
const root=mkdtempSync(join(tmpdir(),'jev-synthetic-smoke-'));
try {
  mkdirSync(join(root,'agent','skills','customer-support'),{recursive:true});
  mkdirSync(join(root,'knowledge'));
  writeFileSync(join(root,'agent','IDENTITY.md'),'Synthetic CLI integration test. Return a short Vietnamese greeting using action=send and category=greeting. Include nonempty reason and report.');
  writeFileSync(join(root,'agent','skills','customer-support','SKILL.md'),'All input in this test is fabricated. Do not use tools or access external data.');
  const agent=createAgent({provider:'claude-cli',timeoutMs:90000},root);
  const result=await agent.decide({message:{id:'synthetic-1',sender:'test',text:'Chào anh'},context:[]});
  console.log(JSON.stringify({test:'synthetic Claude CLI',result},null,2));
} catch(e) {
  console.error(`${e.code??'SMOKE_FAILED'}: ${e.message}${e.diagnostic?` [${e.diagnostic}]`:''}`);
  process.exitCode=1;
} finally {
  await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}

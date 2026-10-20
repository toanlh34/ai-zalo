import {createAgent} from './agent.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const agent=createAgent({provider:'claude-cli',timeoutMs:90000},root);
try {const result=await agent.decide({message:{id:'synthetic-1',sender:'test',text:'Chào anh'},context:[]});console.log(JSON.stringify({test:'synthetic Claude CLI',result},null,2));}catch(e){console.error(e.message);process.exitCode=1;}

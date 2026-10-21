import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {join} from 'node:path';
import {appTools} from './app-tools.mjs';
import {callAppTool} from './app-mcp-bridge.mjs';
const dataRoot=process.env.BIMUP_APP_DATA||join(process.env.APPDATA||process.env.HOME,'jev-bimup-desktop');
const server=new McpServer({name:'bimup-zalo-assistance',version:'0.6.0'});
for(const tool of appTools)server.registerTool(tool.name,{description:tool.description,inputSchema:tool.shape,annotations:tool.annotations},async args=>{
  try{const result=await callAppTool(dataRoot,tool.name,args);return {content:[{type:'text',text:JSON.stringify(result)}]};}
  catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
});
await server.connect(new StdioServerTransport());

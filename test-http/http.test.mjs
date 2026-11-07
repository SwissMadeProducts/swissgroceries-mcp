import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
let child, client;
before(async () => {
  child = spawn(process.execPath, ['dist/http.js'], {env: {...process.env, PORT:String(port), MIGROS_EMAIL:'unused', MIGROS_PASSWORD:'unused'},stdio:'pipe'});
  for(let i=0;i<100;i++) {
    try { if((await fetch(`${base}/health`)).ok) break; } catch {}
    await new Promise(r=>setTimeout(r,50));
  }
  client = new Client({name:'http-regression',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});
after(async()=>{await client?.close();child?.kill();});
test('only the seven read-only tools are exposed',async()=>{
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(t=>t.name).sort(), ['find_stores','search_products','get_product','get_promotions','find_stock','health_check','plan_shopping'].sort());
  assert.ok(tools.every(t=>t.annotations.readOnlyHint && !t.annotations.destructiveHint));
  await assert.rejects(client.callTool({name:'get_profile',arguments:{}}),/Unknown tool/);
});
test('rejects malformed, oversized, and cross-origin requests',async()=>{
  const post=(body,headers={})=>fetch(`${base}/mcp`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
  assert.equal((await post('{')).status,400);
  assert.equal((await post(JSON.stringify({big:'x'.repeat(70000)}))).status,413);
  assert.equal((await post('{}',{Origin:'https://untrusted.example'})).status,403);
  const status=await new Promise((resolve,reject)=>{const r=request(`${base}/mcp`,{method:'POST',headers:{Host:'untrusted.example','Content-Type':'application/json'}},s=>{s.resume();resolve(s.statusCode)});r.on('error',reject);r.end('{}');});
  assert.equal(status,403);
  assert.equal((await fetch(`${base}/mcp`)).status,405);
});
test('rejects missing retailer selection over HTTP',async()=>{
  let r;try{r=await client.callTool({name:'search_products',arguments:{query:'milk'}});}catch(e){assert.match(String(e),/error|invalid/i);return;}
  assert.equal(r.isError,true);
});

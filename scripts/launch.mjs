import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnv } from '../lib/store.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await loadEnv(path.join(root,'.env'));
const child=spawn(process.execPath,[path.join(root,'server.js')],{cwd:root,env:process.env,stdio:['inherit','pipe','inherit'],windowsHide:true});
child.stdout.on('data',data=>process.stdout.write(data));
child.stdout.once('data',()=>{
 const port=Number(process.env.PORT||4310);if(!Number.isInteger(port)||port<1||port>65535)return;
 const url='http://127.0.0.1:'+port;
 const command=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';
 const args=process.platform==='win32'?['/c','start','',url]:[url];
 const opener=spawn(command,args,{stdio:'ignore',windowsHide:true});opener.on('error',()=>process.stdout.write('Open '+url+' in your browser.\n'));opener.unref();
});
child.on('exit',code=>{process.exitCode=code||0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill());

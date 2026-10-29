import fs from 'node:fs/promises';
const response=await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=DM+Serif+Display&display=swap',{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'}});
const css=await response.text();
for(const [name,family] of [['inter','Inter'],['dm-serif','DM Serif Display']]){
 const blocks=css.split('/* latin */').filter(x=>x.includes("font-family: '"+family+"'"));
 const block=blocks.at(-1); const url=block.match(/url\((https[^)]+)\)/)[1];
 await fs.writeFile('public/fonts/'+name+'.woff2',Buffer.from(await(await fetch(url)).arrayBuffer()));
}

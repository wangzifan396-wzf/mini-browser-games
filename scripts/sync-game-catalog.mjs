import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const readme=await readFile(new URL('README.md',root),'utf8');
const tiers=JSON.parse(await readFile(new URL('GAME_TIERS.json',root),'utf8'));
const games=[];let inside=false,category='其他';
for(const line of readme.split(/\r?\n/)){
 if(line.startsWith('## 游戏总览')){inside=true;continue}
 if(!inside)continue;
 if(line.startsWith('## '))break;
 if(line.startsWith('### ')){category=line.slice(4).trim();continue}
 const match=line.match(/^\|\s*(SSS|SS|S|A|B|C|D)\s*\|\s*\[([^\]]+)\]\(([^)]+\.html)\)\s*\|\s*([^|]+?)\s*\|/);
 if(match)games.push({rating:match[1],title:match[2],file:match[3].split('/').pop(),description:match[4].trim(),category});
}
const active=Object.entries(tiers.tiers).filter(([name])=>name!=='E').flatMap(([rating,files])=>files.map(file=>({rating,file})));
assert.equal(new Set(games.map(g=>g.file)).size,games.length,'catalog entries are unique');
assert.equal(games.length,active.length,'README covers every active game');
for(const game of games)assert.ok(active.some(a=>a.file===game.file&&a.rating===game.rating),`${game.file} tier matches`);
const payload={schemaVersion:1,archived:tiers.tiers.E.length,games};
const file=new URL('index.html',root),html=await readFile(file,'utf8');
const pattern=/<!-- CATALOG:START -->[\s\S]*?<!-- CATALOG:END -->/;
assert.ok(pattern.test(html),'embedded catalog marker exists');
const embedded=`<!-- CATALOG:START -->\n  <script id="catalogData" type="application/json">${JSON.stringify(payload).replace(/</g,'\\u003c')}</script>\n  <!-- CATALOG:END -->`;
const next=html.replace(pattern,embedded);
if(process.argv.includes('--check'))assert.equal(next,html,'Run node scripts/sync-game-catalog.mjs after editing the README catalog');
else if(next!==html)await writeFile(file,next,'utf8');
console.log(JSON.stringify({catalog:process.argv.includes('--check')?'checked':'synchronized',active:games.length,archived:payload.archived,file:fileURLToPath(file)}));

import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),target=new URL('pulse-studio.html',root);
let html=await readFile(target,'utf8'),next=html;
for(const [marker,id,file]of [['CORE','pulse-composer-core','pulse-composer-core.js'],['AUDIO','pulse-audio-engine','pulse-audio-engine.js'],['APP','pulse-composer-app','pulse-composer-app.js']]){
 const source=(await readFile(new URL('scripts/'+file,root),'utf8')).replace(/\r\n?/g,'\n').trimEnd();
 assert.ok(!/<\/script/i.test(source),'embedded source must not close its script tag');
 const pattern=new RegExp(`<!-- PULSE_${marker}:START -->[\\s\\S]*?<!-- PULSE_${marker}:END -->`);
 assert.ok(pattern.test(next),`${marker} marker exists`);
 next=next.replace(pattern,()=>`<!-- PULSE_${marker}:START -->\n<script id="${id}">\n${source}\n</script>\n<!-- PULSE_${marker}:END -->`);
}
if(process.argv.includes('--check'))assert.equal(next,html,'Run node scripts/sync-pulse-studio.mjs after changing the canonical sources');
else if(next!==html)await writeFile(target,next,'utf8');
console.log(JSON.stringify({pulseStudio:process.argv.includes('--check')?'checked':'synchronized',runtimeDependencies:0}));

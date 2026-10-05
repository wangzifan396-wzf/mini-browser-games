import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Golden archives were captured from the already published 905d0f4 engine.
// Never regenerate them from the current engine just to make a test green.
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/echo-v1.json',import.meta.url),'utf8'));
const html=fs.readFileSync(new URL('../development/echo-expedition.html',import.meta.url),'utf8');
const ctx=vm.createContext({});
vm.runInContext(html.match(/<script id="echo-engine">([\s\S]*?)<\/script>/)[1],ctx,{timeout:10000});
const E=ctx.EchoExpedition;
assert.equal(fixtures.source,'905d0f4b59b9bfee9d5fdb7a4795a952b6c7f76e');
for(const fixture of fixtures.fixtures)test(`legacy v1 archive: ${fixture.seed}, turn ${fixture.turn}`,()=>{
 const text=JSON.stringify(fixture.archive),restored=E.parse(text);
 assert.ok(restored.run);assert.equal(restored.run.turn,fixture.turn);
 assert.equal(restored.run.log.length,fixture.commands);
 assert.equal(createHash('sha256').update(JSON.stringify(restored.run)).digest('hex'),fixture.digest,'Historical map, RNG, patrols, combat, cargo and messages must replay unchanged.');
 assert.equal(E.serialize(restored.base,restored.run),text,'Do not silently migrate or discard the historical raid.');
});

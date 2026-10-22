import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');
const [readme, changelog, pages, pkgText, tiersText] = await Promise.all([
  read('README.md'), read('CHANGELOG.md'), read('.github/workflows/pages.yml'),
  read('star-cluster-arena/package.json'), read('GAME_TIERS.json')
]);
const version = JSON.parse(pkgText).version;
const activeCount = Object.entries(JSON.parse(tiersText).tiers)
  .filter(([rating]) => rating !== 'E').reduce((count, [, files]) => count + files.length, 0);
const archived = JSON.parse(tiersText).tiers.E;
const index = await read('index.html');
assert.ok(readme.includes(`Active%20Games-${activeCount}-`), 'active badge matches registry');
assert.ok(readme.includes(`Archived-${archived.length}-`), 'archive badge matches registry');
assert.ok(index.includes(`id="totalStat">${activeCount}<`), 'static homepage count matches registry');
assert.ok(index.includes(`id="archiveStat">${archived.length}<`), 'static archive count matches registry');
const embedded = JSON.parse(index.match(/<script id="catalogData" type="application\/json">([\s\S]*?)<\/script>/)[1]);
assert.equal(embedded.archived, archived.length);
assert.equal(embedded.games.length, activeCount);
for (const file of archived) {
  await access(new URL(file, root));
  assert.ok(!embedded.games.some(game => game.file === file), `${file}: archived source retained, not promoted`);
  const recommendations = readme.slice(readme.indexOf('## 推荐先玩'), readme.indexOf('## 快速开始'));
  assert.ok(!recommendations.includes('/' + file + ')'), `${file}: not in recommendations`);
}
const stableRelease = `https://github.com/wangzifan396-wzf/mini-browser-games/releases/tag/sca-v${version}`;

// README is a player-facing entry point; the catalog parser has its own tests.
const recommended = readme.indexOf('## 推荐先玩\n');
const quickStart = readme.indexOf('## 快速开始\n');
const latest = readme.indexOf('## 最新更新\n');
const catalog = readme.indexOf('## 游戏总览\n');
assert.ok(recommended >= 0 && recommended < quickStart && quickStart < latest && latest < catalog,
  'intro → recommendations → quick start → short updates → catalog');
assert.ok(readme.slice(0, recommended).split(/\r?\n/).length <= 25,
  'recommendations appear near the top, not below a long changelog');
const latestText = readme.slice(latest, catalog);
assert.equal(latestText.split(/\r?\n/).filter(line => line.startsWith('- ')).length, 3,
  'only three latest summaries belong in the README');
assert.ok(latestText.length < 1200 && latestText.includes('(CHANGELOG.md)'),
  'details are linked, not duplicated at the top');
assert.ok(readme.includes(stableRelease), 'current stable desktop download is discoverable');
assert.ok(!readme.includes('sca-v1.0.0-rc.1'), 'current root entry does not link to the historical RC');
assert.ok(readme.includes('回声禁区 · 测试版'), 'the experimental game stays explicitly labeled');
assert.ok(pages.includes('README.md CHANGELOG.md'), 'Pages publishes the linked changelog');
const artifactName = 'github-pages-${{ github.run_id }}-${{ github.run_attempt }}';
assert.equal(pages.split(artifactName).length - 1, 2,
  'upload and deploy use the same per-attempt artifact, avoiding duplicate names on retries');

const details = [...readme.matchAll(/<\/?details>/g)].map(match => match[0]);
let depth = 0;
for (const tag of details) {
  depth += tag === '<details>' ? 1 : -1;
  assert.ok(depth >= 0, 'details closing tags have matching openers');
}
assert.equal(depth, 0, 'all folded sections are closed');
assert.equal((readme.match(/<summary>/g) || []).length, 2, 'catalog and historical archive are folded separately');
const catalogText = readme.slice(catalog, readme.indexOf('## E 级历史废案'));
assert.ok(catalogText.includes(`<summary>展开全部 ${activeCount} 款活跃游戏`));
assert.ok(catalogText.indexOf('<details>') < catalogText.indexOf('<summary>'));

assert.match(changelog, /^## 2026-10-16$/m);
assert.match(changelog, /^## 2026-10-05$/m);
assert.match(changelog, /^## 2026-10-04$/m);
assert.match(changelog, /^## 更早的更新归档$/m);
const historical = changelog.slice(changelog.indexOf('## 更早的更新归档'));
assert.equal(historical.split(/\r?\n/).filter(line => line.startsWith('- ')).length, 74,
  'the migrated historical record is preserved, not silently discarded');

const docs = [
  ['README.md', readme], ['CHANGELOG.md', changelog],
  ...await Promise.all([
    'development/README.md', 'star-cluster-arena/README.md',
    'docs/collection-curation-sdd.md', 'docs/curation-2026-10-23/README.md',
    'star-cluster-arena/docs/RELEASE-NOTES-1.0.0.md',
    'star-cluster-arena/docs/GITHUB-RELEASE-1.0.0.md',
    'star-cluster-arena/docs/QA-1.0.0.md', 'star-cluster-arena/docs/SDD-RELEASE-1.0.md'
  ].map(async file => [file, await read(file)]))
];
let relativeLinks = 0;
for (const [file, content] of docs) {
  const base = new URL(file, root);
  for (const match of content.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
    const url = new URL(target, base); url.hash = ''; url.search = '';
    await access(url).catch(() => assert.fail(`${file}: missing relative link ${target}`));
    relativeLinks++;
  }
}
const releaseNotes = docs.find(([file]) => file.endsWith('/GITHUB-RELEASE-1.0.0.md'))[1];
assert.ok(releaseNotes.includes(`标签 \`sca-v${version}\``), 'release notes match package version');
assert.ok(releaseNotes.includes('二进制与 SHA-256 不变'), 'binary reuse is explicit');
assert.ok(releaseNotes.includes('没有附带正在运营的免费公共服务器'), 'self-hosted is not advertised as hosted service');
console.log(JSON.stringify({checks: 'PASS', recommendedNearTop: true, latestSummaries: 3,
  archivedUpdateEntries: 74, relativeLinks, stableTag: `sca-v${version}`}));

import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {standingsSnapshot} from '../Top-Gun-App/JS/TopGun-standings-snapshot.js';
const elements=new Map();
function node(){const el={classes:new Set(),children:[],hidden:false,textContent:'',append(...children){this.children.push(...children)},replaceChildren(){this.children=[]}};el.classList={add:name=>el.classes.add(name)};return el}
const document={getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id)},createElement:node};
let source=fs.readFileSync('Top-Gun-App/JS/TopGun-standings.js','utf8');
source=source.slice(source.indexOf('const element ='),source.indexOf('onAuthStateChanged(auth,'));
const context=vm.createContext({document,standingsSnapshot,URL,URLSearchParams,location:{search:'?teamId=test'}});
vm.runInContext(source,context);
vm.runInContext('connection={sourceUrl:standingsSnapshot.sourceUrl,teamName:"Top Gun FC",status:"pending"}; connectionLoaded=true; standingsLoaded=true; render();',context);
assert.equal(elements.get('standingsRows').children.length,10);
assert.equal(elements.get('standingsTable').hidden,false);
assert.match(elements.get('standingsUpdated').textContent,/Current Standings as of:/);
assert.doesNotMatch(elements.get('standingsUpdated').textContent,/Check the official page/);
assert.equal(elements.get('standingsRows').children.filter(row=>row.className==='standings-own-team').length,1);
assert.equal(elements.get('playoffsSection').hidden,false);
const rounds=elements.get('playoffsRounds').children;
assert.equal(rounds.length,new Set(standingsSnapshot.playoffs.games.map(game=>game.id.split('-')[0])).size);
const matches=rounds.flatMap(round=>round.children[1].children);
assert.equal(matches.length,standingsSnapshot.playoffs.games.length);
for (const game of standingsSnapshot.playoffs.games) {
    const match=matches.find(item=>item.children[1].textContent.startsWith(game.id+' ·'));
    assert.equal(match.children[0].textContent,`${game.home} vs. ${game.away}`);
    assert.equal(match.classes.has('playoff-own-team'),[game.home,game.away].includes(standingsSnapshot.teamName));
}
vm.runInContext('current={...standingsSnapshot,rows:standingsSnapshot.rows.slice(0,1),updatedAt:{toDate:()=>new Date()}}; render();',context);
assert.equal(elements.get('standingsRows').children.length,1);
assert.equal(elements.get('playoffsSection').hidden,false);
assert.match(elements.get('standingsUpdated').textContent,/Current Standings as of:/);
vm.runInContext('current=null; connection.teamName="Other Team"; render();',context);
assert.equal(elements.get('standingsRows').children.length,0);
assert.equal(elements.get('standingsTable').hidden,true);
assert.equal(elements.get('playoffsSection').hidden,true);
vm.runInContext('loadError="Permission denied"; render();',context);
assert.match(elements.get('standingsStatus').textContent,/Permission denied/);
console.log('PASS: all 10 snapshot rows, team highlight, capture label, playoff rounds and team highlight, Firebase precedence, other-team isolation, error state.');

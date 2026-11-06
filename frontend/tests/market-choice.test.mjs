import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../src/components/MatchCard.jsx',import.meta.url),'utf8');
const start=source.indexOf('function finiteNumber(');const finite=source.slice(start,source.indexOf('\n}',start)+2);
const helpers=source.slice(source.indexOf('export function marketWinProbability'),source.indexOf('export function MultiMarketBoard')).replaceAll('export function','function');
const context={};vm.createContext(context);vm.runInContext(finite+'\n'+helpers,context);
test('highest absolute probability among result, double chance and totals comes first',()=>{
 const handicap={market:'spreads',estimated_win_probability:99,pick_odds:1.3};
 const total={market:'totals',confidence:70,pick_odds:1.5};
 const chance={market:'double_chance',estimated_win_probability:85,pick_odds:1.25};
 assert.equal(context.preferredDetailChoice([handicap,total,chance]),chance);
});
test('93.7 percent calculated total outranks 81.3 percent quoted total',()=>{
 const quoted={market:'totals',estimated_win_probability:81.3,pick_odds:2.6};
 const calculated={market:'totals',estimated_win_probability:93.7,analysis_only:true,selection_available:false};
 assert.equal(context.preferredDetailChoice([quoted,calculated]),calculated);
 assert.equal(calculated.pick_odds,undefined);
});
test('unknown conditional probabilities are not ranked as absolute win probabilities',()=>{
 const real={market:'h2h',confidence:70,pick_odds:1.7};
 assert.equal(context.preferredDetailChoice([{market:'double_chance',confidence:99,probability_basis:'conditional_on_no_draw',pick_odds:1.3},real]),real);
});

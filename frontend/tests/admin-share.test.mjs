import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/components/MatchCard.jsx',import.meta.url),'utf8');
const code=source.slice(source.indexOf('export function buildShareMessages'),source.indexOf('function ShareComposer')).replace('export function','function');
const context={shareEligible:x=>Boolean(x.prediction?.pick && !x.prediction.locked),
 finiteNumber:x=>Number.isFinite(Number(x))?Number(x):null,shareClean:x=>String(x??'').trim(),
 translateBetText:x=>x,Intl};
vm.createContext(context);vm.runInContext(code,context);
const words={picks:'PRONOSTICS',results:'RÉSULTATS',caption:'Sélections individuelles.',zone:'Fuseau horaire',
 pick:'Pronostic',odds:'Cote',unavailable:'Non renseigné',bookmaker:'Bookmaker',result:'Résultat',
 won:'Gagné',lost:'Perdu',pending:'En attente'};
const helpers={t:x=>x,formatNumber:x=>Number(x).toFixed(2),formatDate:x=>x};
const match={home_team:'Mayence',away_team:'Bayern',sport_title:'Bundesliga',commence_time:'2026-11-11T19:00:00Z',
 prediction:{pick:'Bayern ou nul',market_label:'Double chance',pick_odds:1.3,label:'safe',confidence:88}};
test('share text identifies the match, market, choice, odds and time without repeating model diagnostics',()=>{
 const text=context.buildShareMessages([match],'picks',words,helpers)[0];
 for(const part of ['Mayence  vs  Bayern','Bundesliga','2026-11-11T19:00:00Z','→ Pronostic : Bayern ou nul','Double chance · Cote 1.30']) assert(text.includes(part),part);
 assert(!text.includes('safe'));assert(!text.includes('88'));
});
test('multi-match results keep their own choice and outcome in the same block',()=>{
 const matches=[{...match,prediction:{...match.prediction,status:'lost'}},
 {...match,home_team:'Paris',away_team:'Lyon',prediction:{pick:'Paris',market_label:'Vainqueur',pick_odds:1.5,status:'won'}}];
 const text=context.buildShareMessages(matches,'results',words,helpers).join('\n');
 assert(text.indexOf('Résultat : Perdu')<text.indexOf('Paris  vs  Lyon'));
 assert(text.includes('→ Pronostic : Paris'));assert(text.includes('Résultat : Gagné'));
});

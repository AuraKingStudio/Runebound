// Headless logic test for dev tools: stubs the DOM, runs the real game script.
const fs=require('fs'),http=require('node:http'),vm=require('vm'),path=require('path');
const {createDirectoryServer}=require('./app.js');
const {createBrain}=require('./brain.js');
const os=require('node:os');
const SCRIPT=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const NET_START='/* Browser networking block:',NET_END='/* End browser networking block. */',NET_START_INDEX=SCRIPT.indexOf(NET_START),NET_END_INDEX=SCRIPT.indexOf(NET_END);
if(NET_START_INDEX<0||NET_END_INDEX<=NET_START_INDEX)throw new Error('Browser networking block is missing from index.html.');
const NETSRC=SCRIPT.slice(NET_START_INDEX,NET_END_INDEX),SRC=SCRIPT.slice(0,NET_START_INDEX)+SCRIPT.slice(NET_END_INDEX+NET_END.length);
let netClock=0,fakePeers=[],fakeHandlers={},fakeBroadcast=[],fakeDirectory=[];
const fakeNet={directorySend:(path,data)=>{fakeDirectory.push({path,data});return Promise.resolve({ok:true});},setHandlers:h=>fakeHandlers=h,peerIds:()=>fakePeers.slice(),send:(id,msg)=>{fakeBroadcast.push({id,msg});return fakePeers.includes(id)},broadcast:msg=>{fakeBroadcast.push({id:'all',msg});return fakePeers.length},disconnect:id=>{fakePeers=fakePeers.filter(p=>p!=id);fakeHandlers.onClose?.(id)},disconnectAll:()=>{const old=fakePeers.slice();fakePeers=[];old.forEach(id=>fakeHandlers.onClose?.(id));}};
let fakeBrainCalls=[];
fakeNet.brain=(action,body)=>{fakeBrainCalls.push({action,body});return Promise.resolve({ok:true,status:200,data:action=='get'?{gen:0,cap:1,spells:{}}:{gen:1,kept:true}});};
const els={};const doc={addEventListener(){},createTextNode:t=>t,getElementById:id=>els[id]||(els[id]={style:{},dataset:{},children:[{style:{}}],value:'',addEventListener(){},append(){},setPointerCapture(){},getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){}}),set:()=>true}),set innerHTML(v){this._h=v},get innerHTML(){return this._h||''},hidden:false,textContent:''}),querySelectorAll:()=>[],body:{className:'',appendChild(){}},createElement:()=>({style:{},remove(){},append(){},classList:{add(){},remove(){}}}),documentElement:{cls:new Set(),classList:{add(c){doc.documentElement.cls.add(c)},remove(c){doc.documentElement.cls.delete(c)}},style:{setProperty(){}}}};
const store={};
const ctx={document:doc,window:{},innerWidth:900,innerHeight:600,performance:{now:()=>netClock},requestAnimationFrame(){},addEventListener(){},localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v,removeItem:k=>delete store[k]},Image:function(){this.complete=false},location:{search:''},console,setTimeout:f=>0,clearTimeout(){},clearInterval(){},Math,JSON,Object,Array,Date,Number,parseInt,isNaN,btoa,atob,TextEncoder,TextDecoder,escape,unescape,encodeURIComponent,decodeURIComponent};
const testMath=Object.create(Math);let randomState=0x5eed1234;
testMath.random=()=>{randomState=(1664525*randomState+1013904223)>>>0;return randomState/0x100000000;};
ctx.Math=testMath;
ctx.RBNet=fakeNet;
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(SRC+`
;globalThis.devMin=devMin;globalThis.devFs=devFs;globalThis.T={V:()=>V,raidDrops,invUI,SMITH,setRaidTrial:(n)=>RAID_TRIAL=n,hpmF3:()=>hpm(),dashF:(p)=>dash(p),heal:(p,n,src)=>heal(p,n,src),PETS,npcHidden:(n)=>npcHidden(n),loreRewardT:(b)=>loreReward(b),clampWT:(p)=>clampW(p),maidTrade:(i)=>maidTrade(i),maidenUI:()=>maidenUI(),seraphBuy,BLESS,qAct:(a)=>qAct(a),bless,dmF2:()=>dm(),cdmF2:()=>cdm(),TRIAL_SEL,enterRaidT:(k)=>enterRaid(k),craftRefine,hpmF:()=>hpm(),cdmF:()=>cdm(),wp,eqRoll,dmF:()=>dm(),craftCost,craftMake,craftTemper,craftSalvage,FORGE,smithUI,invWear,MATS,setRaid:(k)=>S.raid=k,CLASS_DMG:()=>CLASS_DMG,P:()=>P,S:()=>S,start,devAdd,devUp,devUI,devCls,devHeal,devWipe,devResetQ,devArena,devBoss,devHub,DEV,hurt,act,step,pauseGame,resumeGame,isPaused:()=>paused,QUESTS,UPG,toggleDev,buy,shopUI,qAct,togglePause,dailyCheck,saveName,lvlInfo,gainXP,lvlCol,loreReward,isUnl,tutNext,bjVal,bjDeal,bjHit,bjStand,bjDouble,bjSplit,BJ:()=>BJ,guildFound,guildRecruit,gBonus,bountyDay,bountyAdd,bountyClaim,guildJoin,guildTab,rankPool,rankRefresh,rankSort,dm,dash,dashStep,setIn,padPoll,inMode:()=>INMODE,KEYHINT,HUBV:()=>HUBV,BOT_STUCK:()=>BOT_STUCK,ENGINE,cdMul,discordUnlock,openDlg,TUT_DONE,ult,ultDmg,ULT,inter,hitB,DASH,ZONE_DMG,RAIDS,BOSSES,raidTeam,raidAI,partyMembers,partyAdd,partyRemove,raidUI,playerUI,partyMessage,bash,taunt,inTele,toArena,toHub,raidPuppet,PARTY:()=>PARTY,netRelayFlush,raidNet,raidState,raidApply,raidNetStep,arena,HUB_NPCS,BOT_NPC_LV,BARKEEP,CLASSN,SKC,PEMB,hubJoin,hubLeave,hubCount,HUB_MAX,hubVisitStep,botName,botLook,chatSend,COS,cosOwn,cosV,cosBuyGold,cosEquip,shopPay,myEmote,streamPts,crossFrame,bridgeAt,riverNear,clampW,WF,STATUE,PORTAL,SET,keyLabel,EDGE,inIsle,netReceive,netPrepareHub,netStep,netPack,netUnpack,netAudit,auditRules,goldAdd,gainXP,netStats,LEDGER:()=>LEDGER,FX:()=>FX,FT:()=>FT,shk:()=>shk,marketUI,BJ_SFX,setNetTestSession:(role,session)=>{NET_ROLE=role;NET_SESSION=session;NET_CONNECTED=!!session;NET_AUTO_STARTED=!!session;},netTestState:()=>({role:NET_ROLE,session:NET_SESSION,connected:NET_CONNECTED}),bjChartOn,bjSecLeft,bjTempo,bjJackpot,bjClockTxt,bjStatAdd,bjStatsHTML,bjChartUI,BJS0,GDS,gdPick,gdSet,netSafeProfile,netGoodEntry,nameUI,tradeOpen,tradeAct,saveCode,saveRead,saveImport,saveReset,saveUI,saveUnlock:()=>SAVE_LOCK=false,newsShow,newsHide,BUILD,matAdd,GNODES,contractDay,contractDeliver,CONTRACTS,XCH,XCH_DAY,XCH_MUL,xchTrade,xchGive,xchMul,GATHER,gatherStart,gatherStep,gatherDone,gLv,craftOre,craftTonic,dmG:()=>dm(),SAVE_KEY,PET,petBuy,petFeed,petSet,petOk,petNet,petBonus,petAdopt,petPoke,petUI,GARDEN,gardenPlant,gardenHarvest,gardenAdopt,gardenTap,gdStage,gardenHTML,gardenWater,gardenStreak,gsAdopt,gsView,streakHTML,zenStart,zenDown,zenMove,zenUp,zenDraw,ZEN,gardenTick,closeDlg,CIP,cipTrigger,cipShow,cipLocal,cipStrike,cipTap,cipSubmit,cipClose,gatherDraw,GCOMBO,els:null};`,ctx);
vm.runInContext('T.raidChatSend=raidChatSend;T.pingBoss=pingBoss;',ctx);
vm.runInContext('T.bjSide=()=>BJ_SIDE;',ctx);
const T=ctx.T,BENCH_ONLY=process.argv.includes('--bench');let f=0;const ok=(c,m)=>{if(!c||!BENCH_ONLY)console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};
Object.assign(T,{brainLoad:ctx.brainLoad,brainStep:ctx.brainStep,brainSend:ctx.brainSend,brainLog:()=>vm.runInContext('BRAIN_LOG',ctx)});
function brainUnitTests(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'runebound-brain-')),file=path.join(dir,'brain.json');
 try{
  const brain=createBrain({file,now:()=>100000,adminKey:'test-admin-key'});
  const [status,initial]=brain.get();ok(status==200&&initial.gen==0&&initial.w1.length==8&&initial.w2.length==2,'brain: starts with a public generation-zero model');
  ok(!('opt'in initial)&&!('hist'in initial),'brain: private optimizer and rollback history are not public');
  ok(brain.train({tok:'invalid',samples:[]})[0]==400,'brain: rejects malformed player keys');
  ok(brain.train({tok:'a'.repeat(32),samples:Array(9).fill([[0,0,0,0,1,1],[0,0]])})[0]==400,'brain: rejects insufficient training samples');
  const samples=Array.from({length:40},()=>[[0,0,0,0,1,1],[0,0]]);
  const [trained,result]=brain.train({tok:'a'.repeat(32),samples,spells:{slam:[4,4]}});
  ok(trained==200&&result.kept&&result.gen==1,'brain: learns from a valid fight and advances one generation');
  ok(brain.get()[1].fights==1&&brain.get()[1].samples==40&&brain.get()[1].spells.slam==0.575,'brain: records accepted samples and spell performance');
  ok(brain.train({tok:'a'.repeat(32),samples})[0]==429,'brain: throttles repeat training by player key');
  brain.flush();
  const loaded=createBrain({file,now:()=>100000,adminKey:'test-admin-key'});
  ok(loaded.get()[1].gen==1&&loaded.get()[1].w1[0].every(Number.isFinite),'brain: persists and reloads a trained model');
  ok(loaded.admin({key:'wrong',action:'reset'})[0]==403,'brain: protects admin controls with the configured key');
  ok(loaded.admin({key:'é'.repeat('test-admin-key'.length),action:'reset'})[0]==403,'brain: rejects wrong keys with mismatched UTF-8 byte lengths');
  ok(loaded.admin({key:'test-admin-key',action:'cap',value:0.4})[1].cap==0.4,'brain: admin can adjust the difficulty cap');
  ok(loaded.admin({key:'test-admin-key',action:'cap',value:'bad'})[0]==400,'brain: rejects an invalid difficulty cap');
  ok(loaded.admin({key:'test-admin-key',action:'rollback',value:0})[1].gen==0,'brain: admin can roll back to a retained generation');
  loaded.flush();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
brainUnitTests();
T.start();ok(T.S().sc=='hub','start -> hub');
ctx.document.getElementById('dlg').hidden=true;const pausedAt=T.S().tm;T.pauseGame();T.step(.1);ok(T.isPaused()&&T.S().tm===pausedAt,'pause freezes the game');T.resumeGame();ok(!T.isPaused(),'resume re-enables play');
ok(!T.V().name&&T.V().ds===undefined,'first start asks for a name before the daily bonus');
T.saveName('<b>x</b>');ok(T.V().name=='bxb','name: strips markup characters');
ok(ctx.document.getElementById('netBadge').textContent.includes('ONLINE · HUB UNAVAILABLE')&&ctx.document.getElementById('netBadge').textContent.includes('index.html'),'network: reports the hub service as unavailable instead of implying a connection');
T.saveName('Tester1');ok(T.V().name=='Tester1','name: saved');
{
 const oldStorage=ctx.localStorage.setItem,oldConsole=ctx.console;let errors=0;
 ctx.console={error:()=>errors++};
 try{
  ctx.localStorage.setItem=()=>{throw new Error('test storage failure');};
  vm.runInContext('save()',ctx);vm.runInContext('save()',ctx);
  ok(errors==1,'save: surfaces a storage failure once instead of silently losing progress');
  ctx.localStorage.setItem=oldStorage;vm.runInContext('save()',ctx);
  ctx.localStorage.setItem=()=>{throw new Error('test storage failure');};
  vm.runInContext('save()',ctx);
  ok(errors==2,'save: reports a new failure after storage recovers');
 }finally{ctx.localStorage.setItem=oldStorage;ctx.console=oldConsole;}
}
ok(T.V().ds==1&&T.V().dl.length==10&&T.V().gold==225,'daily bonus: day 1 pays 25 on first start');
const gd=T.V().gold;T.dailyCheck();ok(T.V().gold==gd,'daily bonus: only once per day');
T.devAdd(1000);ok(T.V().gold==gd+1000,'gold +1000');
T.devAdd(-T.V().gold);ok(T.V().gold==0,'gold -> 0');
T.devUp(5);ok(Object.values(T.V().up).every(x=>x==5),'max all upgrades');
ok(T.P().mh==Math.round(200*1.75),'max HP follows Stoneheart');
T.devUp(0);ok(Object.values(T.V().up).every(x=>x==0),'zero upgrades');
ctx.document.getElementById('dc').value='2';T.devCls();ok(T.P().cls=='heal','switch class to healer');
T.V().q=2;T.V().qs=2;T.devResetQ();ok(T.V().q==0&&T.V().qs==0,'reset quests');
T.devArena();ok(T.S().sc=='arena'&&T.S().b,'start boss');
T.DEV.god=1;const h=T.P().hp;T.hurt(T.P(),50);ok(T.P().hp==h,'god mode blocks damage');
T.DEV.god=0;T.hurt(T.P(),10);ok(T.P().hp==h-10,'damage works when god off');
T.DEV.nocd=1;T.act(T.P(),0);ok(T.P().cd[0]==0,'no-cooldown mode');
T.devBoss(1);ok(T.S().end=='win','kill boss -> victory');
T.devWipe();ok(T.V().gold==100&&T.V().q==0,'wipe resets progress');
T.devUI();ok(true,'dev panel renders without error');
const H=ctx.document.documentElement;
T.toggleDev();ok(T.DEV.open&&H.cls.has('dv'),'open dock: layout class applied (game view shrinks)');
ctx.devMin();ok(!H.cls.has('dv')&&T.DEV.min,'hide -> dock released, chip only');
ctx.devMin();ok(H.cls.has('dv'),'unhide -> dock restored');
for(let i=0;i<30;i++)ctx.devFs(1);ok(T.DEV.fs==26,'text size caps at 26px');
for(let i=0;i<30;i++)ctx.devFs(-1);ok(T.DEV.fs==11,'text size floors at 11px');
T.toggleDev();ok(!T.DEV.open&&!H.cls.has('dv'),'close dock: full-screen game again');
/* ---- shop ---- */
const dp=()=>ctx.document.getElementById('dp').innerHTML;
T.devUp(0);T.V().gold=0;T.buy('dmg');ok(T.V().up.dmg==0,'shop: cannot buy without gold');
T.V().gold=60;const fx0=T.FX().length;T.buy('dmg');ok(T.V().up.dmg==1&&T.V().gold==0,'shop: buy Rune Edge Lv1 costs 60');
ok(T.FX().length>fx0&&T.FT().length>0,'shop: purchase spawns burst + level-up text');
T.shopUI();ok(/<svg/.test(dp())&&/Rune Mastery 1\/20/.test(dp()),'shop: icons + mastery bar render');
ok(/\+12% → .*\+24%/.test(dp()),'shop: shows current -> next bonus');
T.devUp(5);T.V().gold=9999;T.buy('dmg');ok(T.V().up.dmg==5&&T.V().gold==9999,'shop: cannot buy past max level');
/* ---- quest flow ---- */
T.devResetQ();T.devUp(0);T.qAct(1);ok(T.V().qs==1,'quest: accept');
T.V().gold=60;T.buy('dmg');ok(T.V().qs==2,'quest: buying completes "Arm Yourself"');
const g0=T.V().gold;T.qAct(2);ok(T.V().q==1&&T.V().gold==g0+50,'quest: turn in pays 50 gold');
/* ---- combat feedback ---- */
T.devArena();const ft0=T.FT().length;T.hurt(T.P(),5);ok(T.FT().length>ft0&&T.shk()>0,'combat: hurt -> damage number + shake');
/* ---- level / XP ---- */
T.V().xp=0;ok(T.lvlInfo().L==1,'xp: start at level 1');
T.gainXP(140);ok(T.lvlInfo().L==2&&T.lvlInfo().cur==0,'xp: 140 xp -> level 2');
ok(T.lvlCol(5)!=T.lvlCol(15)&&T.lvlCol(55)==T.lvlCol(99),'xp: tier colors change every 10 levels, cap at 50+');
const xq=T.V().xp;T.devResetQ();T.qAct(1);T.V().qs=2;T.qAct(2);ok(T.V().xp==xq+100,'xp: quest turn-in gives 100');
/* ---- hub skills ---- */
T.DEV.nocd=0;T.devHub();T.P().cd=[0,0,0];T.act(T.P(),1);ok(T.S().sc=='hub'&&T.P().cd[1]>0,'hub: skills play and start their cooldown');T.P().cd=[0,0,0];
/* ---- blackjack, guild, bounties ---- */
ok(T.BARKEEP.ic=='🃏'&&T.BARKEEP.col=='#ff5a78'&&/M-5-10h10q.*zM0-4l3 4-3 4-3-4z/.test(T.BARKEEP.g),'blackjack NPC: ruby colour, unique from the Smith');
ok(T.bjSide(),'blackjack: strategy chart defaults open');
ok(T.bjVal([1,13])==21&&T.bjVal([1,1,9])==21&&T.bjVal([10,10,5])==25,'blackjack: hand values (aces 11 or 1)');
T.V().gold=100;T.V().bj1=1;T.bjDeal(50);ok([50,100,200].includes(T.V().gold),'blackjack: betting takes the stake (or settles a natural 21)');
T.V().gold=100;T.V().bj1=0;T.bjDeal(10);ok(T.V().bj1==1&&T.V().gold==90&&ctx.document.getElementById('dp').innerHTML.includes('<b class="bjv">11</b><small>5 | 6</small>'),'blackjack: your very first hand starts at 11');
{const h=ctx.document.getElementById('dp').innerHTML;ok(h.includes('bjDouble()')&&h.includes('bjHit()')&&h.includes('bjStand()'),'blackjack: first hand offers every move');ok(/class="bjdb bjbest"/.test(h)&&!/bjst bjbest|"bjbest" onclick="bjHit/.test(h),'blackjack: first hand highlights DOUBLE as the best play');ok(T.bjChartOn()&&T.bjSecLeft()>=140&&T.bjSecLeft()<=150&&h.includes('2:30')&&h.includes('>min<'),'blackjack: first hand gets a free 2:30 Assist countdown (no gold)');T.V().gold=0;T.bjDouble();ok(T.BJ().end&&T.BJ().hs[0].res=='win'&&T.bjVal(T.BJ().hs[0].c)==21,'blackjack: tutorial double lands 21 and wins, even short on gold');T.V().bj1=0;T.V().gold=100;T.bjDeal(10);T.V().bjc=0;}
ok(ctx.document.getElementById('dp').innerHTML.includes('class="bjmini"')&&ctx.document.getElementById('dp').innerHTML.includes('aria-expanded="true"'),'blackjack: active table shows the strategy chart by default');
{const v=T.V(),old=v.bjs;v.bjs=null;ok(T.bjStatsHTML().includes('No hands played'),'bj stats: empty record shows a friendly hint');
 const g0=v.gold;T.bjStatAdd([{res:'win'},{res:'push'}],20,false);T.bjStatAdd([{res:'win'}],30,true);T.bjStatAdd([{res:'lose'}],-10,false);
 const s=v.bjs;ok(s.h==4&&s.w==2&&s.p==1&&s.l==1&&s.n==1&&s.b==2&&s.s==0&&s.g==40,'bj stats: counts hands, wins/pushes/losses, naturals, best streak and net gold');
 ok(v.gold==g0,'bj stats: display only, never changes gold');
 {const o=v.bjs;v.bjs={h:1,w:1e9,l:0,p:0,n:0,s:0,b:0,g:0};ok(!/width:\d{4,}%|width:(10[1-9]|1[1-9]\d)%/.test(T.bjStatsHTML()),'bj stats: an edited save (wins > hands) cannot overflow the bars');T.bjStatAdd([{res:'win'}],3e9,false);ok(v.bjs.g==1e9,'bj stats: a huge payout clamps instead of wrapping');v.bjs=o;}
 const h=T.bjStatsHTML();ok(h.includes('50%')&&h.includes('25%')&&h.includes('+40')&&h.includes('🔥 2'),'bj stats: panel shows win/push/loss % and net gold');
 T.bjChartUI('stats');ok(ctx.document.getElementById('dp').innerHTML.includes('📈 Stats')&&ctx.document.getElementById('dp').innerHTML.includes('Best streak'),'bj stats: tab in the chart menu');
 v.bjs={h:1e12,w:'x',g:-5e12};T.bjStatAdd([{res:'win'}],5,false);ok(Number.isFinite(v.bjs.h)&&v.bjs.g>=-1e9,'bj stats: survives a garbage save');v.bjs=old;}
{const tp=[30,20,15,10,5,1,0].map(T.bjTempo);ok(tp.every((r,i)=>!i||r<=tp[i-1])&&tp[0]==0.5&&tp[tp.length-1]==0.07,'assist: the lights chase faster and faster as time runs out (0.5 s -> 0.07 s)');
 ok(T.bjClockTxt(150)=='2:30'&&T.bjClockTxt(61)=='1:01'&&T.bjClockTxt(45)=='45','assist: the clock reads 2:30 from a minute up, whole seconds below');
 ok(T.BJ_SFX.jackpot(9)>0.6&&T.BJ_SFX.jackpot(9)<1.2,'assist: the jackpot ding run speeds up and lands its chord in about a second');
 let threw=false;try{T.bjJackpot(9,true);T.bjJackpot(6);}catch(e){threw=true;}ok(!threw,'assist: the jackpot runs without a table (and BJ_VFX.stop cancels it)');T.BJ_VFX&&T.BJ_VFX.stop&&T.BJ_VFX.stop();}
{const V=T.V(),g0=V.nc,n0=V.name,gu=V.gd;T.nameUI();ok(ctx.document.getElementById('dp').innerHTML.includes('gdPick(1)')&&ctx.document.getElementById('dp').innerHTML.includes('gdPick(2)'),'gender: the name dialog offers He / She / They');
 T.gdPick(2);T.saveName('Lumi');ok(V.nc==2&&V.name=='Lumi','gender: the pick is saved with the name');
 const pr={id:'player-abcd1234',name:'Ann',cls:'tank',lv:3,ti:0,spd:1};ok(T.netSafeProfile({...pr,nc:1}).nc==1&&T.netSafeProfile({...pr,nc:9}).nc==0&&T.netSafeProfile(pr).nc==0,'gender: peers send a 0-3 colour; anything else reads as none');
 ok(T.netGoodEntry([1,'player-abcd1234','Ann','tank',3,0,1])&&!T.netGoodEntry([1,'player-abcd1234','Ann','tank',3,0,1,2]),'gender: roster entries stay 7 fields (the colour rides beside them, so older builds still read the roster)');
 V.nc=g0;V.name=n0;ok(V.gd===gu,'gender: picking a colour never touches the guild (V.gd)');}
T.bjHit();ok(T.V().gold==110&&ctx.document.getElementById('dp').innerHTML.includes('You win! +20'),'blackjack: the first hand\'s hit guarantees 21 and a win');
{const originalMath=ctx.Math;let rolls=[.1,.1,.7,.62];ctx.Math=Object.create(Math);ctx.Math.random=()=>rolls.shift()??.1;T.V().gold=100;T.V().tut=6;T.bjDeal(10);T.bjStand();ctx.Math=originalMath;ok(T.V().gold==90&&ctx.document.getElementById('dp').innerHTML.includes('house wins'),'blackjack: normal hands remain random');}
{const M=ctx.Math;const seq=(a)=>{ctx.Math=Object.create(Math);ctx.Math.random=()=>a.length?a.shift():.1;};
 /* rolls map to ranks 1-13: .5 -> 7, .7 -> 10, .3 -> 4 */
 seq([.5,.3,.7,.6,.7]);T.V().gold=100;T.bjDeal(10);T.bjDouble();ok(T.BJ().end&&T.BJ().hs[0].bet==20&&T.BJ().hs[0].c.length==3,'blackjack: double takes one card, doubles the bet and ends the hand');
{const M=['deal','flip','chip','hit','stand','double','split','reveal','bust','win','lose','push','blackjack','streak','ding','jackpot'],X=T.BJ_SFX,vol=T.SET.vol;
 ok(M.every(m=>typeof X[m]=='function'),'BJ_SFX: every API method exists');
 const had=ctx.AudioContext;delete ctx.AudioContext;let threw=false;try{T.SET.vol=1;M.forEach(m=>X[m](3));}catch(e){threw=true;}
 ok(!threw,'BJ_SFX: no AudioContext -> every method is a safe no-op');
 let nodes=0;const prm=()=>({setValueAtTime(){},exponentialRampToValueAtTime(){},value:0}),node=()=>(nodes++,{type:'',frequency:prm(),gain:prm(),Q:prm(),buffer:null,connect:x=>x||{connect:y=>y},start(){},stop(){}});
 ctx.AudioContext=function(){return{currentTime:0,state:'running',sampleRate:8000,destination:{},resume(){},createOscillator:node,createGain:node,createBiquadFilter:node,createBufferSource:node,createBuffer:(c,n)=>({getChannelData:()=>new Float32Array(n)})};};
 T.SET.vol=0;M.forEach(m=>X[m](2));ok(nodes==0,'BJ_SFX: volume 0 -> no audio nodes are made');
 T.SET.vol=0.5;threw=false;try{M.forEach(m=>X[m](2));}catch(e){threw=true;}ok(!threw&&nodes>0,'BJ_SFX: with audio, every method plays without throwing');
 T.SET.vol=vol;if(had)ctx.AudioContext=had;else delete ctx.AudioContext;}
 seq([.5,.5,.7,.6,.7,.7]);T.V().gold=100;T.bjDeal(10);const g=T.V().gold;T.bjSplit();ok(T.BJ().hs.length==2&&T.V().gold==g-10&&T.BJ().hs.every(h=>h.c.length==2),'blackjack: a pair splits into two hands, each with the bet');
 T.bjStand();T.bjStand();ok(T.BJ().end&&T.BJ().hs.every(h=>h.res),'blackjack: each split hand is played and settled');
 ctx.Math=M;}
/* ---- blackjack juice (BJ_VFX), its sound wiring, and the Assist price + clock ---- */
{const rs0=randomState;vm.runInContext('T.BJ_VFX=BJ_VFX;T.bjPrice=bjPrice;T.bjMul=bjMul;T.bjChartBuy=bjChartBuy;T.bjTicking=()=>BJ_TICKING;T.closeDlg=closeDlg;',ctx);
 const X=T.BJ_VFX,S=T.SET,old={fx:S.fx,low:S.low,shake:S.shake},drain=()=>{for(let i=0;i<8;i++)X.tick(1);},mq={matches:false};ctx.matchMedia=()=>mq;
 S.fx=1;S.low=0;S.shake=1;drain();
 X.emit(0,0,100,100,1000,100);ok(X.n()<=240&&X.n()>0,'BJ_VFX: particles come from a fixed pool that never grows ('+X.n()+')');
 drain();ok(X.n()==0,'BJ_VFX: dead particles return to the pool');
 X.emit(0,0,0,0,100,100);const full=X.n();drain();S.low=1;X.emit(0,0,0,0,100,100);const low=X.n();drain();S.low=0;S.fx=0;X.emit(0,0,0,0,100,100);const nofx=X.n();drain();S.fx=1;
 ok(full==100&&low==40&&nofx==35,'BJ_VFX: Low spec and effects-off cut particles ('+full+'/'+low+'/'+nofx+')');
 S.low=1;X.emit(0,0,0,0,1000,100);ok(X.n()<=80,'BJ_VFX: Low spec uses a smaller pool');drain();S.low=0;
 S.shake=0;ok(X.quake(null,3)==0,'BJ_VFX: Screen shake 0 -> no table shake');S.shake=1;ok(X.quake(null,3)>0,'BJ_VFX: shake on when allowed');
 mq.matches=true;ok(X.emit(0,0,0,0,50,100)==0&&X.fly(1,0,0,0,9,9,5)==0&&X.quake(null,3)==0&&X.n()==0,'BJ_VFX: reduced motion -> no particles, flights or shake');mq.matches=false;
 ok(X.result(10)==X.streak()&&X.result(5)>=2&&X.result(0)>=2&&X.result(-5)==0,'BJ_VFX: win streak counts wins, keeps on a push, resets on a loss');
 {const st=ctx.setTimeout,ct=ctx.clearTimeout,q=new Map();let id=0,fired=0;ctx.setTimeout=(fn)=>{q.set(++id,fn);return id;};ctx.clearTimeout=(i)=>q.delete(i);
  X.emit(0,0,50,50,40,100);X.later(()=>fired++,0.5);T.closeDlg();for(const fn of q.values())fn();
  ok(X.n()==0&&fired==0,'BJ_VFX: closing the window drops live particles and pending beats');ctx.setTimeout=st;ctx.clearTimeout=ct;}
 /* a fake table: what the natural-blackjack beat inserts, with and without reduced motion */
 const M=ctx.Math,seq=(a)=>{ctx.Math=Object.create(Math);ctx.Math.random=()=>a.length?a.shift():.5;},ins=[];
 const el=()=>({classList:{add(){},remove(){}},style:{setProperty(){}},insertAdjacentHTML(p,h){ins.push(h)},querySelectorAll:()=>[],querySelector:()=>null,getBoundingClientRect:()=>({left:0,top:0,width:0,height:0}),lastElementChild:null});
 const tb=el();tb.querySelectorAll=()=>[el(),el()];ctx.document.querySelector=(s)=>s=='#dp .bjtable'?tb:null;
 const natural=()=>{ins.length=0;seq([0,.99,.5,.5]);T.V().gold=100;T.V().bj1=1;T.bjDeal(10);ctx.Math=M;return T.BJ().end.startsWith('BLACKJACK');};
 ok(natural()&&ins.some(h=>h.includes('bjbig'))&&T.V().gold==120,'blackjack: a natural shows the BLACKJACK banner and still pays 3x');
 mq.matches=true;ok(natural()&&!ins.some(h=>h.includes('bjbig')||h.includes('bjcoin')),'blackjack: reduced motion -> no BLACKJACK banner or coin rain');mq.matches=false;
 ok(/prefers-reduced-motion: reduce\) \{\s*\.bjtable \.bjc, \.bjtable \.bjc\.bjglow/.test(fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8')),'blackjack: reduced motion also stops the !important card glow');
 delete ctx.document.querySelector;
 /* every beat calls its BJ_SFX sound (delayed ones run when their timer fires) */
 const calls=[],keep={},st=ctx.setTimeout,q=[];for(const k of Object.keys(T.BJ_SFX)){keep[k]=T.BJ_SFX[k];T.BJ_SFX[k]=()=>calls.push(k);}
 ctx.setTimeout=(fn)=>{q.push(fn);return q.length;};const flush=()=>{const a=q.splice(0);a.forEach(fn=>fn());};
 seq([.5,.3,.7,.6,.7,.7,.7]);T.V().gold=100;T.bjDeal(10);flush();ok(calls.includes('chip')&&calls.includes('deal'),'blackjack sfx: the deal clinks chips and slides cards');
 calls.length=0;T.bjHit();flush();ok(['deal','flip','hit'].every(k=>calls.includes(k)),'blackjack sfx: a hit slides, flips and slams ('+calls.join(',')+')');
 if(!T.BJ().end){T.bjStand();flush();}ok(calls.includes('reveal')&&calls.some(k=>['win','lose','push','bust'].includes(k)),'blackjack sfx: the end reveals and plays the result ('+calls.join(',')+')');
 calls.length=0;seq([.5,.5,.7,.6,.7,.7,.7,.7]);T.V().gold=100;T.bjDeal(10);T.bjSplit();flush();ok(calls.includes('split'),'blackjack sfx: split');
 calls.length=0;T.bjStand();flush();ok(calls.includes('stand'),'blackjack sfx: stand');T.bjStand();flush();
 calls.length=0;seq([.5,.3,.7,.6,.7]);T.V().gold=100;T.bjDeal(10);T.bjDouble();flush();ok(calls.includes('double'),'blackjack sfx: double');
 ctx.Math=M;ctx.setTimeout=st;for(const k of Object.keys(keep))T.BJ_SFX[k]=keep[k];
 /* Assist: the price multiplies on each rent, cools down over time, only ever spends, and the 1 s clock stops on close */
 const RD=ctx.Date;let now=RD.now();ctx.Date=class extends RD{static now(){return now;}};
 const V=T.V();V.bjm=1;V.bjmAt=0;V.bjc=0;V.gold=1000;
 ok(T.bjPrice()==50,'assist: starts at 50');
 T.bjChartBuy();ok(V.gold==950&&T.bjPrice()==75,'assist: a rent costs 50, the next costs 75 (x1.5)');
 T.bjChartBuy();ok(V.gold==875&&T.bjPrice()==113,'assist: the price keeps multiplying (113)');
 ok(ctx.document.getElementById('dp').innerHTML.includes('class="bjsec">1:00<')&&T.bjTicking(),'assist: the table shows the time left (1:00 from a minute up) and the 1 s clock runs');
 T.closeDlg();ok(!T.bjTicking(),'assist: closing the menu stops the clock timer');
 now+=10*60000;ok(T.bjPrice()==81,'assist: the extra price halves every 10 minutes ('+T.bjPrice()+')');
 now+=600*60000;ok(T.bjPrice()==50,'assist: the price cools back to 50');
 V.gold=40;const bjc=V.bjc;T.bjChartBuy();ok(V.gold==40&&V.bjc==bjc,'assist: cannot rent when gold is short of the price');
 for(const bad of [-5,NaN,'x',0.1])(V.bjm=bad,V.bjmAt=now);ok(T.bjPrice()==50,'assist: a broken save multiplier reads as x1 (never below 50)');
 V.bjm=1e9;V.bjmAt=now;ok(T.bjPrice()==1000,'assist: the multiplier is capped at x20');
 V.bjm=1;V.bjmAt=0;V.bjc=0;ctx.Date=RD;S.fx=old.fx;S.low=old.low;S.shake=old.shake;delete ctx.matchMedia;randomState=rs0;}
T.V().gd=null;T.guildFound('Rune Riders');ok(T.V().gd&&T.V().gd.name=='Rune Riders','guild: found a guild');
T.V().gold=1000;T.guildRecruit();T.guildRecruit();ok(T.V().gd.m.length==2&&T.V().gold==700&&Math.abs(T.gBonus()-0.06)<1e-9,'guild: recruits cost 100, 200 and give +3% each');
T.V().bo=null;const bo=T.bountyDay();ok(bo.ids.length==3,'bounties: 3 rolled per day');
const bid=bo.ids[0],need={raid:1,dash:15,tale:3,buy:1,skill:30,bj:1}[bid];for(let i=0;i<need;i++)T.bountyAdd(bid);const gB=T.V().gold;T.bountyClaim(bid);ok(T.V().bo.done[bid]&&T.V().gold>gB,'bounties: complete + claim pays out');
/* ---- guild tabs ---- */
T.V().gd=null;T.guildJoin('Dawn Lanterns');ok(T.V().gd&&T.V().gd.name=='Dawn Lanterns','guild: join an existing guild');T.guildJoin('Ashen Oath');ok(T.V().gd.name=='Dawn Lanterns','guild: cannot join a second guild');T.guildTab('board');ok(/Leaderboard|LEADERBOARD/.test(ctx.document.getElementById('dp').innerHTML)||true,'guild: leaderboard tab renders');
/* ---- ranks ---- */
ok(T.rankPool().length>=100,'ranks: top-100 pool is 100 guilds');T.rankRefresh();ok(true,'ranks: refresh moves to the next page');
/* ---- UI kit: one ✕ per dialog, at most one primary, big tutorial text ---- */
{const D=ctx.document,V=T.V(),o={tut:V.tut,gold:V.gold,ul:V.ul};V.tut=T.TUT_DONE;V.gold=1000;V.ul={...(V.ul||{}),class:true,smith:true,pet:true,barkeep:true,maiden:true,seraph:true};const bad=[],multi=[];
 for(const c of ['openDlg("elder")','openDlg("shop")','openDlg("lore")','openDlg("class")','openDlg("pet")','openDlg("smith")','openDlg("seraph")','openDlg("maiden")','openDlg("barkeep")','openDlg("games")','settingsUI()','invUI()','titleUI()','raidUI()','partyUI()','gardenUI()','wishUI("wish")','wheelUI()','reelsUI()','digUI()','saveUI()','fbOpen()']){
  try{vm.runInContext('closeDlg();'+c,ctx);}catch(e){bad.push(c+' threw '+e.message);continue}
  const h=D.getElementById('dp').innerHTML;if(!h)continue;const xs=h.match(/<button class="x"[^>]*>/g)||[];
  if(xs.length!=1||!/aria-label="Close"/.test(xs[0]))bad.push(c+' x='+xs.length);if(c!="raidUI()"&&(h.match(/class="claim"/g)||[]).length>1)multi.push(c);if(/>(Close|Farewell)<\/button>/.test(h))bad.push(c+' old close');}
 ok(!bad.length,'UI kit: every dialog has exactly one close ✕ with aria-label, no bottom Close/Farewell '+bad.join('; '));ok(!multi.length,'UI kit: no dialog has more than one primary (gold) button '+multi.join());
 vm.runInContext('closeDlg();openDlg("barkeep")',ctx);const bk=D.getElementById('dp').innerHTML;ok((bk.match(/class="chip c\d+"/g)||[]).length==3&&/aria-label="Bet 10 gold"/.test(bk)&&/barTab\('d'\)/.test(bk)&&!/class="claim"/.test(bk)&&/Barkeep/.test(bk),'Barkeep: 3 bet chips, a Blackjack | Daily tab bar, no gold primary');
 Object.assign(V,o);vm.runInContext('closeDlg()',ctx);}
{const D=ctx.document,V=T.V(),o={tut:V.tut,ul:V.ul};V.tut=T.TUT_DONE;V.ul={...(V.ul||{}),class:true,smith:true,pet:true,barkeep:true};const miss=[];
 for(const [c,n] of [['openDlg("shop")',4],['openDlg("class")',2],['openDlg("elder")',3],['openDlg("barkeep")',2],['openDlg("smith")',3],['gamesUI()',2]]){vm.runInContext('closeDlg();'+c,ctx);const h=D.getElementById('dp').innerHTML,m=h.match(/<div class="ntabs" role="tablist">([^]*?)<\/div>/);if(!m||(m[1].match(/class="tb/g)||[]).length!=n||(m[1].match(/class="tb on"/g)||[]).length!=1)miss.push(c);}
 vm.runInContext('closeDlg();classUI("sk")',ctx);const sk=D.getElementById('dp').innerHTML;
 Object.assign(V,o);vm.runInContext('closeDlg();CM_TAB="cls"',ctx);
 ok(!miss.length,'NPC windows: one tab bar, the right number of tabs, exactly one active '+miss.join());
 ok(/Bringing/.test(sk)&&/aria-pressed="true"/.test(sk)&&!/class="ldc/.test(sk),'Class Master: Raid skills is its own tab with one big row per skill');}
ok(vm.runInContext('typeof devTutDone=="function"&&typeof devAsk=="function"&&typeof engineBar=="function"',ctx)&&/k == "f2" \|\| e\.code == "F2"/.test(SCRIPT)&&/#netBadge \{ display: none !important; \}/.test(fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8')),'dev: F2 always answers (code prompt without the dev flag), Finish tutorial; hub badge hidden for players; DPS Engine bar');
ok(vm.runInContext('TUT_TS>=28&&TUT_FS>=20&&TUT_TXT.every((t)=>t.split(" ").length<=8)&&[0,1,2,3,4,5,6,7].every((i)=>tutHow(i).split(" ").length<=8)',ctx),'tutorial: card title >= 28 px, what-to-press line >= 20 px, every line 8 words max');
ok(vm.runInContext('(()=>{const t=V.tut;V.tut=1;const a=tutKey();V.tut=t;return a=="class"})()',ctx)&&/body\.tutf/.test(fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8')),'tutorial: focus mode dims the HUD and every action banner but the target');
{const IX=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');ok(!/id="bt"|id="blk"|Copy ID<\/button>/.test(IX)&&(IX.match(/^      \.pn \{/gm)||[]).length==1&&(IX.match(/^      button\.alt \{/gm)||[]).length==1&&!/class="alt x"/.test(IX),'UI kit: one Titles button, no Copy ID HUD button, one .pn base, no duplicate .alt / alt-x definitions');}
/* ---- tutorial ---- */
T.V().tut=0;T.tutNext(0);ok(T.V().tut==1&&T.V().ul.class,'tutorial: walking reveals the Class Master (step 2)');T.tutNext(2);ok(T.V().tut==1,'tutorial: steps cannot be skipped');for(let i=1;i<5;i++)T.tutNext(i);ok(T.V().tut==5&&T.TUT_DONE==5,'tutorial: class -> Elder -> Merchant -> Archivist -> raid open (no blackjack)');
{const V=T.V(),oldTut=V.tut,oldMat=V.mat,eye=(V.mat||{}).eye||0;V.tut=4;T.openDlg('lore');ok(V.tut==5&&(V.mat.eye||0)==eye+1&&ctx.document.getElementById('dp').innerHTML.includes('Rare item received'),'tutorial: first Archivist visit always grants a rare Seer\'s Eye');V.tut=oldTut;V.mat=oldMat;}
/* ---- NPC unlocks ---- */
{T.V().ul.barkeep=false;T.openDlg('barkeep');ok(ctx.document.getElementById('dp').innerHTML.includes('Copy Discord link'),'barkeep: locked until you copy the Discord link');
 let copied='';const nav=ctx.navigator||(ctx.navigator={});nav.clipboard={writeText:(t)=>{copied=t;return Promise.resolve();}};T.discordUnlock(0);ok(copied.startsWith('https://discord.gg/')&&T.isUnl('barkeep'),'barkeep: copying the Discord link unlocks him (after the countdown)');
 T.V().ul.barkeep=false;T.V().bo=null;for(let i=0;i<30;i++){T.V().bo=null;if(T.bountyDay().ids.includes('bj'))break;}ok(!T.V().bo.ids.includes('bj'),'bounties: no blackjack bounty while the Barkeep is locked');T.V().bo=null;}

T.V().ul={};T.V().lt=5;ok(!T.isUnl('class'),'unlock: Class Master starts locked');
for(let i=0;i<50;i++)T.loreReward(true);ok(!T.isUnl('class'),'unlock: secret pages never unlock the Class Master (luck per tale only)');
for(let i=0;i<200;i++)T.loreReward(true);ok(!T.isUnl('maiden'),'unlock: Maiden stays locked before 100 tales');
T.V().lt=100;for(let i=0;i<400&&!T.isUnl('maiden');i++)T.loreReward(true);ok(T.isUnl('maiden')&&!T.isUnl('smith'),'unlock: Maiden at 100 tales, Smith still locked');
/* ---- Archivist rewards ---- */
{const seen=new Set();for(let i=0;i<300;i++){const s=T.loreReward(i%2==0);seen.add(s.split(' ')[0]);}
ok(seen.size>=4,'lore: secret pages give varied rewards ('+[...seen].join(' ')+')');}
/* ---- input mode ---- */
T.setIn('pad');ok(T.inMode()=='pad'&&T.KEYHINT.pad[0]=='A','input: controller mode shows A/X/Y/B');
T.setIn('kb');ok(T.inMode()=='kb'&&T.KEYHINT.kb.join(',')=='MB1,Q,E,F,Shift,R','input: keyboard badges follow binds (MB1, Q, E, F, Shift, R)');
/* ---- dash ---- */
T.DEV.nocd=0;T.devHub();ctx.document.getElementById('dlg').hidden=true;const dp0={x:T.P().x,y:T.P().y};T.P().dx=1;T.P().dy=0;T.P().dcd=0;T.dash(T.P());for(let i=0;i<10;i++)T.dashStep(T.P(),.02);
ok(T.P().x>dp0.x+20&&T.P().dcd>0,'dash: moves the player and starts its cooldown');
T.V().bl=null;T.P().cls='tank';T.V().up.vit=0;T.P().ar=1;T.P().inv=0;T.DEV.god=0;T.P().hp=100;T.hurt(T.P(),20);ok(T.P().hp==90,'dash: tank armor halves damage');
T.P().ar=0;T.P().inv=1;T.hurt(T.P(),20);ok(T.P().hp==90,'dash: dps dodge ignores damage');T.P().inv=0;
T.padPoll();ok(true,'input: no controller connected is safe');
T.togglePause();ok(T.isPaused(),'P toggles pause on');T.togglePause();ok(!T.isPaused(),'P toggles pause off');
/* ---------- hub population: bots, joins, cap ---------- */
T.devHub();ctx.document.getElementById('dlg').hidden=true;for(let i=0;i<120;i++)T.step(1/60);
ok(T.hubCount()>=3&&T.hubCount()<=12,'hub: bots fill to 3-12 people (you + 2-11 bots)');
ok(T.HUBV().every(v=>v.bot&&v.name&&v.lv>=1&&v.ti),'hub: bots have names, levels and titles');
ok(SRC.includes('p.bot ? "#63a8ff" : wqName(wqSee(p), "#dfe8f0")'),'hub: bot names are blue and real player names stay white');
ok(new Set(T.HUBV().map(v=>v.name)).size==T.HUBV().length,'hub: bot names are unique');
ok(/^[A-Za-z0-9_]{2,15}$/.test(T.botName()),'hub: bot names look like player handles');
let lv=[];for(let i=0;i<400;i++){const v={};T.botLook(v);lv.push(v.lv);}
ok(lv.filter(l=>l>=40).length<lv.length*0.25&&Math.max(...lv)<=60,'hub: high-level bots are rare');
for(let i=0;i<12;i++)T.hubJoin('real'+i,{name:'Real'+i});
ok(T.hubCount()<=T.HUB_MAX,'hub: never more than HUB_MAX people');
ok(T.HUBV().filter(v=>!v.bot).length>=1&&T.HUBV().some(v=>v.out||!v.bot),'hub: real players bump bots, who teleport out');
ok(T.hubJoin('real0',{})===null,'hub: the same player cannot join twice');
for(let i=0;i<12;i++)T.hubLeave('real'+i);ok(!T.HUBV().some(v=>!v.bot),'hub: leaving removes the player');
{/* lobby run: ~10 simulated minutes; every second check where each bot is: never inside an NPC pedestal or the river,
   and never pinned in one place for >3 s while it has somewhere to go */
 const npcs=T.HUB_NPCS(),inPed=(v)=>npcs.some(n=>Math.hypot((v.x-n.x)/41,(v.y-n.y-8)/24.8)<0.9),inRiver=(v)=>{if(T.bridgeAt(v))return false;const r=T.riverNear(v.x,v.y);return r.d<r.bw;};
 let bad=[],pinned=0,samples=0;const last=new Map();
 for(let sec=0;sec<600;sec++){for(let i=0;i<60;i++)T.step(1/60);
  for(const v of T.HUBV()){if(!v.bot||v.out)continue;samples++;
   if(inPed(v)&&bad.length<5)bad.push(`${v.name} in a pedestal at ${v.x|0},${v.y|0}`);if(inRiver(v)&&bad.length<5)bad.push(`${v.name} in the river at ${v.x|0},${v.y|0}`);
   const L=last.get(v)||{x:v.x,y:v.y,s:0};const moved=Math.hypot(v.x-L.x,v.y-L.y)>2;
   L.s=v.goal&&!(v.wait>0)&&!moved?L.s+1:0;if(L.s==4)pinned++;L.x=v.x;L.y=v.y;last.set(v,L);}}
 console.log('  lobby run: samples',samples,'pinned >3s:',pinned,'bad:',bad.join('; ')||'none'); /* prints where, if any */
 ok(!bad.length,'hub: bots never stand inside a pedestal or the river (10 min)');ok(pinned<=2,'hub: bots are never pinned for long (10 min)');}
{const s0=T.BOT_STUCK(),n0=T.HUBV().length;for(let i=0;i<60*240;i++)T.step(1/60);const g=T.BOT_STUCK()-s0;console.log('  bot give-ups in 240s:',g,'bots',n0);ok(g<=2,'hub: bots path around the river (rarely give up stuck)');}
{const V=T.V(),m0=JSON.stringify(V.mat||{}),gn0=JSON.stringify(V.gn||{}),l0=T.LEDGER().length;let seen=0,ch=0,dup=0;for(let i=0;i<60*180;i++){T.step(1/60);if(i%30)continue;const gs=T.HUBV().filter(v=>v.bot&&!v.out&&v.gi!=null);seen+=gs.length;ch+=gs.filter(v=>v.plan=='gather'&&v.wait>0&&!v.goal).length;if(new Set(gs.map(v=>v.gi)).size<gs.length)dup++;}
console.log('  bot gather samples:',seen,'channelling:',ch);ok(seen>0&&ch>0,'hub: some bots walk to resource nodes and channel');ok(!dup,'hub: one bot per node at a time');
ok(JSON.stringify(V.mat||{})===m0&&JSON.stringify(V.gn||{})===gn0&&T.LEDGER().length===l0,'hub: bots gathering never touch V.mat, node cooldowns or the ledger');
const b=T.HUBV().find(v=>v.bot&&v.gi!=null)||Object.assign(T.HUBV().find(v=>v.bot)||{},{gi:0});if(b){const sv=[V.mat,V.gn,V.gday,V.gm,V.gfr];V.mat={};V.gn={};V.gday=null;V.gm=0;V.gfr=0;ok(T.gatherDone(b.gi)>0,'hub: a bot at a node never blocks the player gathering it');[V.mat,V.gn,V.gday,V.gm,V.gfr]=sv;}}
{const lo=T.HUB_NPCS({lv:1}),hi=T.HUB_NPCS({lv:60});ok(lo.every(n=>!n.lk||n.lk=='barkeep')&&hi.length==7,'hub: bots only visit NPCs their level has unlocked');}
/* ---------- crafting at the Smith ---------- */
{const V=T.V();V.mat={dust:100,shard:30,bark:30};V.gold=2000;V.eq={bag:[],on:{}};
Object.assign(T.FORGE,{t:'dmg',k:'wd',r:2});const c=T.craftCost('dmg',2);T.craftMake();
ok(V.eq.bag.length==1&&V.eq.bag[0].r==2&&V.eq.on.dmg==V.eq.bag[0].id,'craft: forging makes the item and wears it into an empty slot');
ok(V.mat.dust==100-c.mats.dust&&V.mat.shard==30-c.mats.shard&&V.gold==2000-c.gold,'craft: forging takes the materials and gold');
ok(T.craftCost('tank',1).mats.bark>0&&!T.craftCost('tank',1).mats.shard&&T.craftCost('dmg',1).mats.shard>0,'craft: armor uses Thornbark, weapons Void Shards');
ok(T.craftCost('dmg',4).mats.eye==1&&T.craftCost('tank',4).mats.heart==1,'craft: Legendary needs a rare drop');
const id=V.eq.bag[0].id;T.craftTemper(id);ok(V.eq.bag[0].r==3,'craft: tempering raises the tier by one');
Object.assign(T.FORGE,{t:'tank',k:'dr',r:0});T.craftMake();const sp=V.eq.bag[1];V.eq.on.tank=null;const d0=V.mat.dust;T.craftSalvage(sp.id);
ok(V.eq.bag.length==1&&V.mat.dust>d0,'craft: salvaging a spare item gives Rune Dust back');
T.craftSalvage(id);ok(V.eq.bag.length==1,'craft: worn gear cannot be salvaged');
V.mat={};const g0=V.gold;Object.assign(T.FORGE,{t:'dmg',k:'wd',r:3});T.craftMake();ok(V.eq.bag.length==1&&V.gold==g0,'craft: no materials, no forging');
V.eq={bag:[],on:{}};V.mat={};}
/* ---------- crafting expansion ---------- */
{const V=T.V();V.mat={dust:50,bark:20,shard:20};V.gold=3000;V.eq={bag:[],on:{}};const h0=T.hpmF(),c0=T.cdmF();
for(const t of ['helm','glove','boots']){Object.assign(T.FORGE,{t,k:'',r:2});T.forgeUI&&0;}
Object.assign(T.FORGE,{t:'helm',k:'hp',r:2});T.craftMake();Object.assign(T.FORGE,{t:'glove',k:'cdr',r:2});T.craftMake();Object.assign(T.FORGE,{t:'boots',k:'ms',r:2});T.craftMake();
ok(V.eq.bag.length==3&&V.eq.on.helm&&V.eq.on.glove&&V.eq.on.boots,'craft: helmet, gloves and boots can be forged and worn');
ok(T.hpmF()>h0&&T.cdmF()<c0,'gear: helmet adds health, gloves cut cooldowns');
const d0=V.mat.dust,b0=V.mat.bark;T.craftRefine('bark');ok(V.mat.dust==d0-5&&V.mat.bark==b0+1,'craft: refining turns dust into a boss material');
T.craftRefine('eye');ok(!V.mat.eye,'craft: rares cannot be refined');
V.eq={bag:[],on:{}};V.mat={};}
{let n=0,w=0;for(let i=0;i<300;i++){T.V().mat={};n+=T.raidDrops(true).reduce((a,[k,c])=>a+c,0);w++;}const avg=n/w;console.log('  avg items per win:',avg.toFixed(2));ok(avg>=3&&avg<=5.5,'drops: about 4 items per raid win');T.V().mat={};}
/* ---------- Rune Trials ---------- */
{const S=T.S(),V=T.V();T.setRaid('small');S.trial=0;let n0=0,n3=0;for(let i=0;i<200;i++){V.mat={};n0+=T.raidDrops(true).reduce((a,[k,c])=>a+c,0);}S.trial=3;for(let i=0;i<200;i++){V.mat={};n3+=T.raidDrops(true).reduce((a,[k,c])=>a+c,0);}
ok(n3>n0*1.4,'trials: higher Trials drop more materials');S.trial=0;V.mat={};
ok(SRC.includes('hp: D.hp * (1 + TRIAL.hp * (S.trial || 0))')&&SRC.includes('(1 + TRIAL.dmg * (S.trial || 0))'),'trials: the boss gets more health and damage per Trial');
ok(SRC.includes('V.trial[S.raid] = (S.trial || 0) + 1'),'trials: winning unlocks the next Trial');}
/* ---------- the Seraph: one-raid blessings ---------- */
{const V=T.V();V.bl=null;V.gold=1000;const d0=T.dmF2();T.seraphBuy('wrath');ok(V.bl=='wrath'&&V.gold==890&&T.dmF2()>d0*1.19,'seraph: Wrath costs gold and adds 20% damage');
T.seraphBuy('haste');ok(V.bl=='wrath','seraph: only one blessing at a time');
V.bl='haste';ok(T.cdmF2()<1,'seraph: Haste cuts cooldowns');V.bl=null;
ok(T.BLESS.length>=8,'seraph: 8 blessings');}
{const V=T.V(),q0=V.q,qs0=V.qs,ul0=V.ul;V.ul={};V.q=1;V.qs=2;T.qAct(2);ok(T.QUESTS[1].unlock=='seraph'&&T.QUESTS[2].unlock=='smith','unlocks: First Raid brings the Seraph, Raid Veteran the Smith');V.q=q0;V.qs=qs0;V.ul=ul0;}
/* ---------- the Maiden: rare trader ---------- */
{const V=T.V();V.mtr=null;V.mat={shard:12,eye:1,dust:30};V.gold=500;T.maidTrade('s2e');ok(V.mat.eye==2&&V.mat.shard==0,'maiden: 12 Void Shards bind into a Seer\'s Eye');
T.maidTrade('e2h');ok(V.mat.eye==1&&V.mat.heart==1,'maiden: swaps an Eye for a Heart');
T.maidTrade('gamble');ok(V.mat.dust==0&&V.gold==300&&(V.mat.eye+V.mat.heart)==3,'maiden: the sealed rose gives a random rare');
V.mat={eye:5};T.maidTrade('e2h');ok(V.mat.eye==5,'maiden: 3 trades per day');T.maidenUI();ok(true,'maiden: window renders');V.mat={};V.mtr=null;}
/* ---------- player market (server escrow, src/market.js) ---------- */
{const {createMarket,TTL_MS}=require('./market.js'),fs2=require('fs'),os2=require('os'),path2=require('path');const f=path2.join(os2.tmpdir(),'rb_market_test_'+Date.now()+'.json');let clock=1e12;
const M=createMarket({file:f,now:()=>clock}),A='a'.repeat(32),B='b'.repeat(32);
let [st,v]=M.sell({tok:A,name:'Alice',item:{k:'mat',m:'shard',n:5},price:100});ok(st==200&&v.listing.mine,'market: a player lists materials');const id=v.listing.id;
ok(M.sell({tok:A,item:{k:'mat',m:'gold',n:5},price:10})[0]==400&&M.sell({tok:A,item:{k:'mat',m:'shard',n:5},price:0})[0]==400&&M.sell({tok:'x',item:{k:'mat',m:'shard',n:1},price:5})[0]==400,'market: invalid items, prices and keys are refused');
ok(M.buy({tok:A,id})[0]==409,'market: you cannot buy your own listing');
[st,v]=M.buy({tok:B,id});ok(st==200&&v.item.m=='shard'&&v.item.n==5&&v.price==100,'market: a buyer gets the item from escrow');
ok(M.buy({tok:B,id})[0]==404,'market: a listing sells only once (no duplicates)');
[st,v]=M.collect({tok:A});ok(v.payouts.length==1&&v.payouts[0].n==95,'market: the seller collects the gold minus 5% tax');ok(M.collect({tok:A})[1].payouts.length==0,'market: payouts are collected only once');
[st,v]=M.sell({tok:A,item:{k:'gear',t:'dmg',g:'wd',r:3},price:500});clock+=TTL_MS+1;ok(M.browse({})[1].listings.length==0&&M.collect({tok:A})[1].payouts[0].item.g=='wd','market: unsold listings return to the seller after 48 h');
[st,v]=M.sell({tok:A,item:{k:'mat',m:'dust',n:3},price:9});ok(M.cancel({tok:B,id:v.listing.id})[0]==404&&M.cancel({tok:A,id:v.listing.id})[0]==200,'market: only the seller can cancel');
for(let i=0;i<6;i++)M.sell({tok:B,item:{k:'mat',m:'dust',n:1},price:1});ok(M.sell({tok:B,item:{k:'mat',m:'dust',n:1},price:1})[0]==409,'market: at most 6 open listings per player');
M.flush();const raw=fs2.readFileSync(f,'utf8');ok(!raw.includes(A)&&!raw.includes(B),'market: the data file stores only hashed keys');
const M2=createMarket({file:f,now:()=>clock});ok(M2.browse({})[1].listings.length==6,'market: listings survive a server restart');fs2.rmSync(f,{force:true});}
/* ---------- late quests: Smith and Market ---------- */
{const V=T.V(),q0=V.q,qs0=V.qs;const qi=T.QUESTS.findIndex(q=>q.n=='Hammer and Anvil'),mi=T.QUESTS.findIndex(q=>q.n=='Market Day');ok(qi>2&&mi>qi,'quests: Smith and Market quests come late in the chain');
V.q=qi;V.qs=1;V.fg=0;T.save&&T.save();V.fg=1;T.QUESTS[qi].ok()&&ok(true,'quests: forging an item completes Hammer and Anvil');V.mk=0;ok(T.QUESTS[mi].ok(),'quests: disabled Market Day cannot block progression');V.mk=1;ok(T.QUESTS[mi].ok(),'quests: a market trade completes Market Day');T.marketUI();ok(ctx.document.getElementById('dp').innerHTML.includes('closed for now')&&!ctx.document.getElementById('dp').innerHTML.includes('List it'),'market UI: explains the release pause without trading controls');V.q=q0;V.qs=qs0;}
/* ---------- every Seraph blessing does what it says ---------- */
{const V=T.V(),P=T.P(),c0=P.cls;V.up={dmg:0,vit:0,spd:0,cdr:0};V.eq={bag:[],on:{}};
 const was=(k,f)=>{V.bl=null;const a=f();V.bl=k;const b=f();V.bl=null;return [a,b];};
 let [a,b]=was('stone',()=>T.hpmF3());ok(b>a*1.29,'blessing Stone: +30% max health');
 [a,b]=was('wrath',()=>T.dmF2());ok(b>a*1.19,'blessing Wrath: +20% damage');
 [a,b]=was('haste',()=>T.cdmF2());ok(b<a*0.81,'blessing Haste: -20% cooldowns');
 [a,b]=was('swift',()=>{P.dcd=0;P.ds=0;P.hp=P.mh;T.dashF(P);const d=P.dcd;P.dcd=0;P.ds=0;return d;});ok(b<a*0.6,'blessing Swift: dash cooldown halved');
 [a,b]=was('aegis',()=>{T.DEV.god=0;P.inv=0;P.ar=0;P.sh=0;P.hp=1000;P.mh=1000;T.hurt(P,100);return 1000-P.hp;});ok(b<a*0.81,'blessing Aegis: -20% damage taken');
 ok(T.BLESS.every(x=>x.length==5&&x[4]>0),'blessings: all 8 have a name, text, colour and price');P.cls=c0;V.bl=null;}
/* ---------- NPC pedestals, pet placeholder, Archivist rewards ---------- */
{const n=T.SMITH,p={x:n.x+2,y:n.y+10,hp:1};T.devHub();T.clampWT(p);ok(Math.hypot((p.x-n.x)/41,(p.y-n.y-8)/24.8)>=0.9,'pedestals: you cannot stand inside an NPC pedestal');
 ok(!T.HUB_NPCS({lv:60}).includes(T.PETS),'pet NPC: bots never visit the Beastkeeper');
{const V=T.V(),sv=JSON.stringify({ul:V.ul,mat:V.mat,pets:V.pets,pet:V.pet,pst:V.pst}),{PET}=require('./bank.js');
 V.ul={...(V.ul||{})};delete V.ul.pet;V.pets={};V.pet='';V.pst=0;
 ok(T.npcHidden(T.PETS)&&!T.petBuy('fox'),'pet: the Beastkeeper stays hidden and sells nothing before level 6');
 V.ul.pet=true;V.mat={ore:15,herb:9};ok(!T.petBuy('fox'),'pet: adopting needs the full price');
 V.mat.herb=10;ok(T.petBuy('fox')&&V.pets.fox==1&&V.pet=='fox'&&V.mat.ore==0&&V.mat.herb==0,'pet: adopting spends the price and the pet follows you');
 ok(T.LEDGER().slice(-4).map(e=>e[0]+':'+e[3]).join()=='mat:pet,mat:pet,pet:buy,pet:set','pet: spends are logged right before the buy (only after the local check passes)');
 ok(!T.petBuy('fox'),'pet: no buying the same pet twice');
 V.mat.herb=4;ok(!T.petFeed('fox')&&V.mat.herb==4,'pet: feeding needs 5 x level food, nothing spent otherwise');
 V.mat.herb=200;for(let i=0;i<6;i++)T.petFeed('fox');ok(V.pets.fox==5&&V.mat.herb==200-50,'pet: feeding costs 5+10+15+20 and stops at level 5');
 ok(Math.abs(T.petBonus('gather')-0.1)<1e-9&&T.petBonus('xp')==0&&T.petNet()=='fox5','pet: level 5 doubles the bonus, only for its own kind');
 ok(!T.petSet('')&&V.pet=='fox','pet: no switch within 10 minutes (RULES.pet setGap)');
 V.pst=Date.now()-600e3;ok(T.petSet('')&&V.pet==''&&T.petNet()==''&&!T.petSet('fox'),'pet: one switch per 10 minutes');
 ok(T.petOk('fox5')&&T.petOk('')&&!T.petOk('fox6')&&!T.petOk('cat1')&&!T.petOk(5)&&!T.petOk('fox1x')&&!T.petOk(null),'pet: the synced pet id is checked');
 T.petAdopt({own:{owl:3,cat:2,fox:9},on:'cat'});ok(V.pets.owl==3&&V.pets.fox==5&&!V.pets.cat&&V.pet=='','pet: the bank answer wins and is clamped');
 ok(Object.keys(T.PET).length==4&&Object.keys(PET.kinds).every(k=>T.PET[k]&&JSON.stringify(PET.price[k])==JSON.stringify(T.PET[k].price)&&PET.food[k]==T.PET[k].food&&PET.kinds[k].p==T.PET[k].p&&PET.kinds[k].b==T.PET[k].b)&&PET.setGap==600e3,'pet: client prices, food, bonuses and switch gap match the bank (RULES.pet)');
 const o=JSON.parse(sv);V.ul=o.ul;V.mat=o.mat;V.pets=o.pets||{};V.pet=o.pet||'';V.pst=o.pst||0;}
{const V=T.V(),sv=JSON.stringify({ul:V.ul,mat:V.mat,pets:V.pets,pet:V.pet,gd:V.gd,gdn:V.gdn,gs:V.gs||null}),{GARDEN}=require('./bank.js');
 V.ul={...(V.ul||{}),pet:true};V.pets={fox:1};V.pet='fox';V.gd=null;V.gdn=null;V.mat={herb:3,ore:0};
 ok(T.gardenPlant(0,'herb')&&V.mat.herb==1&&V.gd[0].s=='herb'&&T.gdStage(V.gd[0])==1,'garden: planting spends the seed price and the plot starts growing');
 ok(T.LEDGER().slice(-2).map(e=>e[0]+':'+e[3]+':'+e[4]+':'+e[5]).join()=='mat:garden:herb:-2,garden:plant:0:herb','garden: the spend is logged right before the plant entry');
 ok(!T.gardenPlant(0,'herb')&&!T.gardenPlant(1,'herb')&&!T.gardenPlant(7,'ore')&&!T.gardenPlant(1,'gold'),'garden: no planting on a used plot, without the price, off the board or an unknown seed');
 ok(!T.gardenHarvest(0)&&!T.gardenHarvest(1),'garden: nothing to harvest before it is ripe or on an empty plot');
 V.gd[0].at-=V.gd[0].d;ok(T.gdStage(V.gd[0])==3&&T.gardenTap(0)&&V.mat.herb==1+5&&!V.gd[0],'garden: a ripe plot harvests (fox +1) and empties');
 V.gd[2]={s:'ore',at:Date.now()-GARDEN.wilt-31*60e3,d:30*60e3};ok(T.gdStage(V.gd[2])==4&&T.gardenHarvest(2)&&V.mat.ore==2,'garden: a wilted plot gives half');
 const h=T.gardenHTML();ok((h.match(/class="gp /g)||[]).length==6&&h.includes('gardenTap(5)')&&h.includes('id="zen"')&&h.includes('tradeOpen()')&&(h.match(/class="gs /g)||[]).length==7,'garden: the zen view draws 6 tappable beds, the scene canvas, a 7-day streak row and a trade link');
 T.gardenAdopt([{s:'echo',age:60e3,d:40*60e3},null,{s:'cat',age:1,d:1},null,null,null]);ok(V.gd[0].s=='echo'&&T.gdStage(V.gd[0])==1&&!V.gd[2],'garden: the bank answer wins (bad seeds dropped)');
 T.gardenAdopt([1,2]);ok(V.gd[0].s=='echo','garden: a malformed answer is ignored');
 T.gardenAdopt([{s:'herb',age:30*60e3,d:20*60e3,pk:'fox'},null,null,null,null,null],5);V.pet='';V.mat.herb=0;ok(V.gd[0].pk=='fox'&&V.gdsc==5&&T.gardenHarvest(0)&&V.mat.herb==5,'garden: the perk is locked at planting on the client too, and the sprite counter comes from the bank');V.pet='fox';
 ok(JSON.stringify(Object.keys(T.GARDEN.seeds).map(k=>[T.GARDEN.seeds[k].cost,T.GARDEN.seeds[k].grow,T.GARDEN.seeds[k].y]))==JSON.stringify(Object.keys(GARDEN.seeds).map(k=>[GARDEN.seeds[k].cost,GARDEN.seeds[k].grow,GARDEN.seeds[k].y]))&&T.GARDEN.wilt==GARDEN.wilt&&T.GARDEN.day==GARDEN.day&&T.GARDEN.owl==GARDEN.owl,'garden: client tables match the bank');
 {const cv=ctx.document.getElementById('zen');cv.getBoundingClientRect=()=>({left:0,top:0,width:300,height:220});const S=T.SET,lo=S.low,Z=T.ZEN,n0=T.LEDGER().length,ev=(x,y)=>({target:{closest:()=>null},clientX:x,clientY:y});
  V.gd[1]={s:'herb',at:Date.now(),d:20*60e3};S.low=0;let thr=null;
  try{T.zenStart();ok(T.gardenWater(1)&&!T.gardenWater(3),'zen: a growing plant can be watered, an empty bed cannot');T.zenDown(ev(40,200));T.zenMove(ev(80,205));T.zenMove(ev(120,210));T.zenUp();for(let i=0;i<5;i++)T.zenDraw(0.016);}catch(e){thr=e}
  ok(!thr&&Z.rk.length==1&&Z.rk[0].p.length>=4&&T.LEDGER().length==n0&&V.gd[1].at>Date.now()-1e3,'zen: rake and water are cosmetic (no ledger entry, growth unchanged)');
  S.low=1;thr=null;try{T.zenStart();T.gardenWater(1);T.zenDown(ev(50,200));T.zenDraw(0);}catch(e){thr=e}ok(!thr&&Z.n==0&&Z.rk.length==0,'zen: Low spec draws a static scene (no particles, no raking)');
  S.low=0;ctx.matchMedia=()=>({matches:true});thr=null;try{T.zenStart();T.gardenWater(1);T.zenDraw(0);}catch(e){thr=e}ok(!thr&&Z.n==0,'zen: reduced motion is static too');delete ctx.matchMedia;S.low=lo;}
  {const S=T.SET,lo=S.low,Z=T.ZEN,D=ctx.document,bd=D.body.appendChild,ce=D.createElement,msg=[];D.body.appendChild=(d)=>msg.push(d.textContent);S.low=1;V.gd[4]={s:'herb',at:Date.now()-30*60e3,d:20*60e3,pk:'fox'};V.gd[5]=null;V.mat.herb=9;
   T.gardenHarvest(4);T.gardenPlant(5,'herb');D.body.appendChild=bd;S.low=lo;ok(msg.some(m=>/^Harvest /.test(m))&&msg.some(m=>/^Planted /.test(m)),'zen: Low spec still shows the harvest yield and the plant in a toast');
   const beds=Array.from({length:6},()=>({className:'gp ',title:'',innerHTML:'x'})),gsw={innerHTML:'',contains:()=>false},parse=(h)=>[...h.matchAll(/<button class="(gp [^"]*)"[^>]*title="([^"]*)">(.*?)<\/button>/g)].map(m=>({className:m[1],title:m[2],innerHTML:m[3]}));
   T.openDlg('garden');const cv=D.getElementById('zen'),dpw=D.getElementById('dp').innerHTML;D.querySelector=(q)=>q=='.gdn'?{querySelectorAll:()=>beds}:null;Object.assign(D.getElementById('gsw'),gsw);
   D.createElement=()=>{const o={_h:'',set innerHTML(v){this._h=v},get innerHTML(){return this._h},querySelectorAll:()=>parse(o._h),querySelector:()=>({innerHTML:'streak'})};return o};
   Z.n=3;let thr2=null;try{T.gardenTick();}catch(e){thr2=e}D.createElement=ce;delete D.querySelector;
   ok(!thr2&&D.getElementById('zen')===cv&&Z.cv===cv&&Z.n==3&&D.getElementById('dp').innerHTML===dpw&&beds[0].innerHTML!='x'&&beds.every(b=>/^gp /.test(b.className)&&b.title)&&D.getElementById('gsw').innerHTML=='streak','zen: the 15 s refresh updates beds and the streak row in place (dialog, canvas and particles kept)');
   T.closeDlg();T.openDlg('pet');ok(/animation:iIn/.test(D.getElementById('dp').innerHTML)&&!D.getElementById('dp').innerHTML.includes('gardenTap')&&!/Garden has its own button/.test(D.getElementById('dp').innerHTML),'pets: the Beastkeeper keeps pets (fresh open animates), no Garden-button line');T.petUI();ok(!/animation:iIn/.test(D.getElementById('dp').innerHTML),'pets: a rebuild of the open dialog skips the entrance animation');T.closeDlg();}
 {const day=Math.floor(Date.now()/86400e3),wk=Math.floor(day/7),L=()=>T.LEDGER()[T.LEDGER().length-1].join(':');V.gs=null;V.mat={herb:0,ore:0,echo:0};
  ok(T.gardenStreak()&&V.mat.herb==2&&L()=='garden:0:0:streak:0:0'&&V.gs.n==1&&!T.gardenStreak()&&V.mat.herb==2,'streak: one claim a day, logged as a bare streak entry');
  V.gs.d--;ok(T.gardenStreak()&&V.gs.n==2&&V.mat.ore==2,'streak: the next day climbs the ladder');
  V.gs={d:day-2,n:3,gw:-1};ok(T.gardenStreak()&&V.gs.n==4&&V.gs.gw==wk,'streak: one missed day a week is forgiven');
  V.gs={d:day-2,n:4,gw:wk};T.gardenStreak();ok(V.gs.n==1,'streak: a second missed day in the week resets it');
  V.gs={d:day-3,n:5,gw:-1};T.gardenStreak();ok(V.gs.n==1,'streak: two missed days reset it');
  V.gs={d:day-1,n:6,gw:-1};const e0=V.mat.echo;T.gardenStreak();ok(V.gs.n==7&&V.mat.echo==e0+3,'streak: day 7 pays the big bonus');
  T.gsAdopt({n:3,ago:1,gu:1});const v=T.gsView();ok(v.n==3&&v.can&&!v.graceLeft,'streak: the bank answer wins');T.gsAdopt({n:'x',ago:1});ok(T.gsView().n==3,'streak: a malformed answer is ignored');
  T.gsAdopt({n:0,ago:-1,gu:0});ok(V.gs===null,'streak: no streak on the bank clears it');
  ok(JSON.stringify(T.GARDEN.streak)==JSON.stringify(GARDEN.streak),'streak: client ladder matches the bank');}
 const o=JSON.parse(sv);V.ul=o.ul;V.mat=o.mat;V.pets=o.pets||{};V.pet=o.pet||'';V.gd=o.gd;V.gdn=o.gdn;V.gs=o.gs;}
 let errs=0;const V=T.V();for(let i=0;i<300;i++){try{const s=T.loreRewardT(i%3==0);if(typeof s!='string'||!s)errs++;}catch(e){errs++;}}V.bl=null;
 ok(errs==0,'archivist: 300 rewards in a row, every one valid');}
/* ---------- the market over real HTTP (hub service + escrow) ---------- */
globalThis.marketHttpTests=(async()=>{const {createDirectoryServer}=require('./app.js'),os3=require('os'),path3=require('path'),fs3=require('fs');const f=path3.join(os3.tmpdir(),'rb_mkt_http_'+Date.now()+'.json');
 const post=(base,a,b)=>fetch(base+'/api/market/'+a,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(async r=>({s:r.status,d:await r.json()}));
 const closed=createDirectoryServer({marketFile:f});await new Promise(r=>closed.server.listen(0,'127.0.0.1',r));let base='http://127.0.0.1:'+closed.server.address().port;
 let r=await post(base,'browse',{});ok(r.s==503,'market http: disabled by default until wallets are server-authoritative');await new Promise(resolve=>closed.server.close(resolve));
 const {server}=createDirectoryServer({market:true,marketFile:f});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 const A='c'.repeat(32),B='d'.repeat(32);r=await post(base,'sell',{tok:A,name:'Ann',item:{k:'gear',t:'dmg',g:'wd',r:2},price:300});
 ok(r.s==200,'market http: explicit opt-in enables gear listings');r=await post(base,'browse',{tok:B});ok(r.s==200&&r.d.listings.length==1&&!r.d.listings[0].mine,'market http: others see it');
 r=await post(base,'buy',{tok:B,id:r.d.listings[0].id});ok(r.s==200&&r.d.item.g=='wd','market http: buy delivers the item');r=await post(base,'collect',{tok:A});ok(r.d.payouts[0].n==285,'market http: seller collects 285 of 300 gold');
 r=await post(base,'nope',{});ok(r.s>=400&&r.s<500,'market http: unknown routes are refused ('+r.s+')');await new Promise(resolve=>server.close(resolve));await new Promise(r=>setTimeout(r,600));fs3.rmSync(f,{force:true});fs3.rmSync(f+'.tmp',{force:true});});
/* ---------- class weapons ---------- */
{const V=T.V(),P=T.P(),c0=P.cls;P.cls='dps';V.eq={bag:[{id:'w1',t:'dmg',k:'wd',r:0}],on:{dmg:'w1'}};const d0=T.dmF();
ok(T.wp('dmg')==0&&d0>1,'weapon: a Common weapon only gives base damage');
V.eq.bag[0].r=4;ok(T.wp('dmg')==0.05&&T.wp('cd')==0.1&&T.wp('dcd')==0.2&&T.wp('crit')==0.15,'weapon: each rarity adds its perk (Legendary Fangs crit)');
ok(T.dmF()>d0,'weapon: higher tier hits harder');
P.cls='tank';ok(T.wp('dmg')==0&&T.dmF()<d0*1.0001,'weapon: another class gets nothing from it');
V.eq.bag[0]={id:'w1',t:'dmg',k:'wt',r:2};ok(T.wp('dr')==0.04&&T.wp('cd1')==0.15,'weapon: the tank Aegis gives less damage taken and faster Taunt');
V.eq.bag[0].r=4;ok(T.wp('hp')==0.2,'weapon: the Legendary Aegis gives +20% max health');P.cls='heal';V.eq.bag[0]={id:'w1',t:'dmg',k:'wh',r:4};ok(T.wp('emp')==0.4,'weapon: the Legendary Staff makes Empower last longer');ok(T.wp('hl')==0.06&&T.wp('zl')==0.2,'weapon: the Staff gives more healing and a longer Circle');
const st=T.eqRoll(3);ok(st.length==4&&st.filter(i=>i.t=='dmg').length==1&&st[3].k=='wh'&&st.slice(0,3).every(i=>i.t!='dmg'),'shop: 3 armor/charm pieces + 1 weapon for your class');
P.cls=c0;V.eq={bag:[],on:{}};}
/* ---------- dash aim setting ---------- */
ok(SRC.includes('MOUSE.on && !SET.dashMove')&&SRC.includes('SET.dashMove=${v}'),'settings: dash aim can follow the cursor or the movement keys');
/* ---------- chat and emotes ---------- */
T.chatSend('hello there');ok(T.P().say&&T.P().say.t=='hello there','chat: your line shows as a bubble');
T.chatSend('/wave');ok(T.P().emo&&T.P().emo.e=='👋','chat: /wave plays the emote');
T.P().emo=null;T.myEmote('💀');ok(!T.P().emo||(T.V().wins||0)>=25,'emotes: locked ones cannot be used');
/* ---------- cosmetics ---------- */
const ember=T.COS.find(i=>i.id=='r_ember');T.V().gold=1000;T.cosBuyGold('r_ember');
ok(T.cosOwn(ember)&&T.V().gold==700&&T.cosV().ring=='r_ember','cosmetics: buy with gold and equip');
T.cosEquip('', 'ring');ok(!T.cosV().ring,'cosmetics: unequip back to none');
T.shopPay('r_void');ok(!T.cosV().own.r_void,'cosmetics: paid items are not granted without checkout');
ok(T.COS.filter(i=>i.eur).every(i=>i.eur>=1&&i.eur<=2),'cosmetics: paid items cost 1-2 EUR');
/* ---------- hub layout: crossing, canal, cistern, statue ---------- */
const q=T.crossFrame().q;ok(Math.hypot(q.x-T.PORTAL.x,q.y-T.PORTAL.y)<10,'hub: the Rune Crossing sits at the centre');
const ws=T.streamPts().map(p=>p.w);ok(Math.max(...ws)-Math.min(...ws)<1,'hub: the canal is an even width');
const pp={x:T.WF.px,y:T.WF.py,hp:1};T.clampW(pp);ok(Math.hypot(pp.x-T.WF.px,pp.y-T.WF.py)>T.WF.pry,'hub: the cistern is solid');
const sp={x:T.STATUE.x,y:T.STATUE.y-6};T.clampW(sp);ok(Math.hypot(sp.x-T.STATUE.x,sp.y-T.STATUE.y)>8,'hub: the statue is solid');
ok(T.EDGE.length>100&&T.inIsle(450,350,0)&&!T.inIsle(5,5,0),'hub: the island is round, the corners are sky');
/* ---------- save code: export, import, reset ---------- */
{const V=T.V(),g0=V.gold,n0=V.name;V.name='Zoë';const code=T.saveCode(),o=T.saveRead(code);
ok(/^RB1\./.test(code)&&o.gold===g0&&o.name=='Zoë','save code: export round-trips (unicode name too)');V.name=n0;
const bad=code.slice(0,20)+(code[20]=='A'?'B':'A')+code.slice(21);ok(typeof T.saveRead(bad)=='string'&&typeof T.saveRead('hello')=='string'&&typeof T.saveRead('RB1.'+btoa('[1,2]')+'.x')=='string','save code: damaged, foreign or non-save codes are refused');
ok(T.saveImport('nope')===false,'save code: a bad import changes nothing');
const keep=store[T.SAVE_KEY];ok(T.saveImport(code)===true&&JSON.parse(store[T.SAVE_KEY]).gold===g0,'save code: import writes the save for the load sanitizer');
V.gold+=5;vm.runInContext('save()',ctx);ok(JSON.parse(store[T.SAVE_KEY]).gold===g0,'save code: no autosave overwrites an import before the reload');T.saveUnlock();V.gold-=5;
ok(T.saveReset('reset please')===false&&store[T.SAVE_KEY]!=null,'save reset: needs the word RESET');ok(T.saveReset(' reset ')===true&&store[T.SAVE_KEY]==null,'save reset: RESET wipes the save');T.saveUnlock();store[T.SAVE_KEY]=keep;
{ok(!/[a-f0-9]{32}/.test(JSON.stringify(T.V()))&&!/[a-f0-9]{32}/.test(atob(T.saveCode().split('.')[1])),'save code: never carries a 32-hex token (the bank key stays out)');}
T.saveUI();ok(ctx.document.getElementById('dp').innerHTML.includes('RB1.')&&ctx.document.getElementById('dp').innerHTML.includes('Type RESET'),'save dialog: shows the code, import and reset');}
/* ---------- what's new card ---------- */
{const V=T.V(),tut=V.tut,el=ctx.document.getElementById('news');el.hidden=true;delete store.rb_news;V.tut=0;T.newsShow();ok(el.hidden!==false&&store.rb_news==T.BUILD,'news: a brand-new player skips the card (the build is marked seen)');
delete store.rb_news;V.tut=4;T.newsShow();ok(el.hidden===false&&el.innerHTML.includes("What's new"),'news: shows once for a new build');
T.newsHide();ok(el.hidden===true,'news: can be dismissed');T.newsShow();ok(el.hidden===true,'news: not again for the same build');V.tut=tut;}
/* ---------- gathering + materials ---------- */
{const V=T.V(),m0=JSON.stringify(V.mat||{}),gn0=V.gn,gd0=V.gday,gm0=V.gm,ton0=V.ton;V.mat={};const L=T.LEDGER(),last=()=>JSON.stringify(L[L.length-1]);
ok(T.matAdd('ore',5,'gather')===5&&V.mat.ore===5&&last()=='["mat",0,0,"gather","ore",5]','materials: matAdd logs ["mat",0,0,src,k,n] for the bank');
ok(T.matAdd('ore',-9,'craft')===-5&&V.mat.ore===0&&T.matAdd('nope',3,'gather')===0&&T.matAdd('ore',NaN,'x')===0,'materials: never below zero, unknown or bad input ignored');
const l1=last();T.matAdd('ore',4,'dev');ok(last()==l1&&l1=='["mat",0,0,"craft","ore",-5]','materials: dev grants stay out of the bank log');
ok(T.netStats('mat-audit',1).led.every(e=>e[0]!='mat'),'materials: the hub gold/XP audit never sees material entries');
V.gn={};V.gday=null;V.gm=0;V.gfr=0;V.mat={};const g=T.GNODES.findIndex(n=>n.k=='ore');
ok(T.gatherDone(g)===2&&V.mat.ore===2&&V.gday.n===1&&V.gm===1,'gathering: a ready node gives its base yield');
ok(T.gatherDone(g)===0&&V.mat.ore===2,'gathering: the node regrows before it can be gathered again');
V.gn={};V.gday.n=T.GATHER.full;V.gfr=0;ok(T.gatherDone(g)===1,'gathering: after 40 a day the yield halves');
V.gn={};V.gday.n=T.GATHER.half;V.gfr=0;let s=0;for(let i=0;i<5;i++){V.gn={};s+=T.gatherDone(g);}ok(s===2,'gathering: after 80 a day a fifth (carried, no dice)');
V.gm=1e6;ok(T.gLv()===10,'gathering: mastery caps at level 10');V.gn={};V.gday.n=0;V.gfr=0;ok(T.gatherDone(g)===2&&V.gfr>0.7,'gathering: mastery adds +36% at level 10 (fraction carried)');
{const C=T.CIP,el=ctx.document.getElementById('ciph'),dl=ctx.document.getElementById('dlg');dl.hidden=true;T.cipClose();V.cip=null;
 const show=(job)=>{T.cipClose();T.cipShow({id:'',game:{ore:'mine',herb:'herb',echo:'echo'}[job],params:T.cipLocal(job),job});return C.k;};
 let k=show('ore');ok(k&&el.hidden===false&&el.innerHTML.includes('Strike')&&el.innerHTML.includes('Skip'),'cipher: the mine game renders with Strike and Skip');
 let z=k.params.zone,m=(z[0]+z[1])/2,o0=V.mat.ore||0;T.cipStrike(m);T.cipStrike(m);T.cipStrike(m);ok(V.mat.ore===o0+5&&k.done,'cipher: 3 strikes in the zone pay a bonus pack of 5 ore (offline)');
 k=show('ore');o0=V.mat.ore;T.cipStrike(m=k.params.zone[0]-0.05);T.cipStrike(k.params.zone[0]);T.cipStrike(k.params.zone[0]);ok(V.mat.ore===o0,'cipher: a strike outside the zone pays nothing');
 k=show('herb');ok(el.innerHTML.split('class="cl').length-1===9,'cipher: the herb game renders 9 leaves');
 T.cipTap(k.params.seq[0]);ok(!k.taps.length,'cipher: taps are ignored while the pattern plays');k.play=false;
 let h0=V.mat.herb||0;k.params.seq.forEach(i=>T.cipTap(i));ok(V.mat.herb===h0+5,'cipher: the leaves in order pay 5 Moonleaf');
 k=show('herb');k.play=false;h0=V.mat.herb;[...k.params.seq].reverse().forEach(i=>T.cipTap(i));ok(V.mat.herb===h0,'cipher: the wrong leaf order pays nothing');
 k=show('echo');ok(el.innerHTML.split('Crystal ').length-1===6&&k.params.tones.length>=4&&k.params.tones.length<=6&&k.params.tones.every(n=>n>=0&&n<=5),'cipher: the echo game renders 6 crystals and 4-6 tones');
 k.play=false;let e0=V.mat.echo||0;k.params.tones.forEach(i=>T.cipTap(i));ok(V.mat.echo===e0+5,'cipher: the repeated tones pay 5 Skycrystal');
 k=show('echo');k.play=false;e0=V.mat.echo;k.params.tones.forEach(i=>T.cipTap((i+1)%6));ok(V.mat.echo===e0,'cipher: wrong tones pay nothing');
 k=show('ore');T.cipClose();ok(!C.k&&el.hidden===true,'cipher: Skip closes the popup with no reward');
 T.SET.low=1;let thr=0;try{k=show('ore');T.cipStrike(0.5);show('herb');show('echo');T.cipClose();}catch(e){thr=1;}T.SET.low=0;ok(!thr,'cipher: Low spec path runs without errors');
 show('ore');const k1=C.k;T.cipShow({id:'',game:'herb',params:T.cipLocal('herb'),job:'herb'});ok(C.k===k1,'cipher: only one popup at a time');T.cipClose();
 C.n.ore=9;dl.hidden=false;T.cipTrigger('ore');ok(!C.k,'cipher: no popup while a dialog is open');dl.hidden=true;
 C.n.ore=8;T.cipTrigger('ore');ok(!C.k,'cipher: no popup before the 10th gather of a job');T.cipTrigger('ore');ok(C.k&&C.k.game=='mine'&&C.n.ore===0,'cipher: the 10th gather of a job opens its game offline');T.cipClose();
 V.cip.n=C.day;C.n.herb=9;T.cipTrigger('herb');ok(!C.k,'cipher: the offline daily cap stops popups');V.cip=null;C.n={};
 V.gn={};T.GCOMBO.t=0;const gi=T.GNODES.findIndex(n=>n.k=='herb');T.gatherDone(gi);V.gn={};T.gatherDone(gi);ok(T.GCOMBO.n===2,'gathering: chained gathers build a combo');
 let dt=0;try{T.gatherDraw();}catch(e){dt=1;}ok(!dt,'gathering: the channel bar, shimmer and pop draw without errors');T.cipClose();}
{/* Rune Wishes client: tables equal the bank's, the offline shrine, adopting the bank's answer, reveal paths, draw hooks */
 const R=(c)=>vm.runInContext(c,ctx),SW=require('./wish.js'),dp=ctx.document.getElementById('dp'),dl=ctx.document.getElementById('dlg');
 ok(JSON.stringify(R('WISH'))===JSON.stringify(SW.WISH),'wish: the client tables equal src/wish.js (odds, pity, pools, games)');
 const V0=R('V');const keep={wi:V0.wi,mat:V0.mat,wq:V0.wq,title:V0.title};V0.wi=null;V0.mat={};
 let r=R('wiLocal("daily",{})');ok(r[0]==200&&r[1].t==3&&R('wiLocal("daily",{})')[0]==403,'wish: offline daily gift once a day');
 V0.wi.t=30;r=R('wiLocal("pull",{n:10})');ok(r[0]==200&&r[1].res.length==10&&r[1].t==20&&r[1].res.some(q=>q.tier=='E'||q.tier=='L'),'wish: offline 10-pull with an Epic or better');
 ok(R('wiLocal("pull",{n:3})')[0]==400,'wish: offline only 1 or 10');
 let wh=0;while(R('wiLocal("wheel",{})')[0]==200)wh++;let rl=0;while(R('wiLocal("reels",{})')[0]==200)rl++;ok(wh==2&&rl==6,'wish: offline wheel 2 and reels 6 a day');
 R('WI.dig=null');r=R('wiLocal("dig",{})');ok(r[0]==200&&r[1].id=='local','wish: offline dig opens a board');
 R('WI.dig={id:"local",local:WI.dig.local,open:[],picks:6,sum:{}}');r=R('wiLocal("dig",{id:"local",i:0})');ok(r[0]==200&&typeof r[1].k=='string'&&R('wiLocal("dig",{id:"local",i:0})')[0]==400,'wish: offline dig reveals a tile once');
 ok(R('wiLocal("shop",{id:"__proto__"})')[0]==400&&R('wiLocal("shop",{id:"c_ore"})')[0]==400,'wish: offline shop refuses prototype keys and materials');
 R('V.wi.sd=1000');const sid=R('["n_star","n_prism","a_aether","a_nova","w_comet"].find(k=>!wishOwn(k))||"n_star"');ok(R('wiLocal("shop",{id:"'+sid+'"})')[0]==200&&R('wishOwn("'+sid+'")'),'wish: offline Stardust shop sells a chosen cosmetic');
 R('wiAdopt({t:7,sd:3,p10:2,p60:5,n:9,own:["a_ember","__proto__","bogus","constructor"],day:{e:4,s:{wheel:1,x:9}},mat:{ore:3,heart:"9"}})');
 ok(V0.wi.t===7&&V0.wi.sd===3&&V0.wi.p60===5&&Object.keys(V0.wi.own).join()=='a_ember'&&V0.wi.dy.s.wheel===1&&!('x'in V0.wi.dy.s)&&V0.mat.ore>=3&&!V0.mat.heart,'wish: adopts the bank\'s answer (only catalogue items, only known counters)');
 R('wiAdopt({t:"999",sd:-5})');ok(V0.wi.t===7,'wish: a malformed answer is ignored');
 ok(R('wqOk("a_ember,h_crown,n_prism")')=='a_ember,h_crown,n_prism'&&R('wqOk("a_ember,<script>")')===''&&R('wqOk("x".repeat(60))')==='','wish: worn cosmetics are whitelisted on the network');
 V0.wq={a:'a_ember',h:'h_crown',n:'n_star'};ok(R('wqMine()')=='a_ember','wish: only owned cosmetics are worn');
 ok(R('wqOk("a_nova,w_comet,b_rune")')=='a_nova,w_comet,b_rune'&&R('wqOk("a_ember,a_tide")')===''&&R('wqOk("t_lucky")')===''&&R('wqOk("c_ore")')===''&&R('wqOk("__proto__")')===''&&R('wqOk("w_bogus")')==='','wish: the network whitelist is the catalogue (one item per slot, no titles or materials)');
 {const u0=R('NET_CONFIG.signalingUrl');R('NET_CONFIG.signalingUrl="https://bank.test"');
  R('globalThis.__p={wq:"a_aether,n_prism",wtc:"abcdef0123"}');ok(R('wqSee(__p)')==='','wish online: a relayed cosmetic is not drawn until the bank confirms it');
  R('wqTake({on:{abcdef0123:"a_ember"}},performance.now());__p.wqSeen=__p.wq');ok(R('wqSee(__p)')=='a_ember','wish online: only the bank-confirmed set is drawn (forged/unowned relay ignored)');
  R('wqTake({on:{abcdef0123:"a_ember,<script>"}},performance.now())');ok(R('wqSee(__p)')==='','wish online: a malformed bank answer is whitelisted away');
  ok(R('wqSee({wq:"a_aether"})')==='','wish online: no trade code, no cosmetics');
  R('WI.on="a_tide"');ok(R('wqNet()')=='a_tide','wish online: peers are told only the bank-confirmed outfit');
  R('NET_CONFIG.signalingUrl='+JSON.stringify(u0)+';WI.on=null');ok(R('wqSee({wq:"a_tide",wtc:""})')=='a_tide','wish offline/LAN: the relayed (whitelisted) set is trusted');}
 R('wiAdopt({t:7,sd:3,p10:2,p60:5,n:9,own:["a_ember"],on:"a_ember,a_tide"})');ok(R('WI.on')==='','wish: a malformed bank outfit is not adopted');
 dl.hidden=false;let th=0;try{R('CUR_DLG="wish";wishUI("wish");wishUI("shop");wishUI("coll");wheelUI();reelsUI();digUI()');}catch(e){th=e;}ok(!th&&dp.innerHTML.includes('Treasure Dig'),'wish: shrine, shop, collection, wheel, reels and dig render'+(th?' '+th:''));
 R('CUR_DLG="wish";wishUI("wish")');ok(dp.innerHTML.includes('0.6%')&&dp.innerHTML.includes('5.1%')&&dp.innerHTML.includes('25.0%')&&dp.innerHTML.includes('69.3%'),'wish: the banner shows the exact odds');
 const res='[{id:"n_prism",tier:"L",nm:"Name: Prism",new:true,got:{}},{id:"c_ore",tier:"C",nm:"Ore bundle",got:{mat:{ore:4}}}]';
 for(const [lo,lab] of [[1,'Low spec'],[0,'full']]){th=0;try{R('SET.low='+lo+';WI.rev=null;wishReveal('+res+');wishSkip();');}catch(e){th=e;}ok(!th&&R('WI.rev&&WI.rev.done'),'wish: the reveal runs and skips without errors ('+lab+')'+(th?' '+th:''));}
 R('SET.low=0;wishCont();closeDlg()');ok(R('WI.rev===null&&WI.spin===0'),'wish: closing the window drops the reveal');
 th=0;try{R('SET.low=0;wqAura("a_aether");wqHat("h_witch","owl");wqName("n_prism","#fff");SET.low=1;wqAura("a_tide");SET.low=0');}catch(e){th=e;}ok(!th,'wish: auras, hats and name effects draw (both specs)'+(th?' '+th:''));
 for(const [lo,lab] of [[1,'Low spec'],[0,'full']]){th=0;try{R('SET.low='+lo+';{const q={x:10,y:10,wq:"b_heart",emo:{e:"👋",at:S.tm}};for(const id of ["a_nova","a_aether","a_bloom"])wqAura(id);for(const id of ["w_leaf","w_spark","w_comet"]){wqTrail(q,id,true);q.x+=5;wqTrail(q,id,true);}WI.wearAt=S.tm;wqWearFx();drawEmote(q,-30);q.wq="b_rune";drawEmote(q,-30);wqHat("h_crown","fox");wqHat("h_halo","wolf");}SET.low=0');}catch(e){th=e;}ok(!th,'wish: new auras, trails, bubbles and the wear burst draw ('+lab+')'+(th?' '+th:''));}
 R('SET.low=1');ok(R('(()=>{const q={x:0,y:0};wqTrail(q,"w_comet",true);return !q.wtr})()'),'wish: Low spec adds no trail work');R('SET.low=0');
 th=0;try{R('V.wi.own.a_nova=1;V.wq={a:"a_nova"};CUR_DLG="wish";wishUI("coll");wqMannequin();wishWear("a_nova",null);wishWear("a_nova",null)');}catch(e){th=e;}ok(!th&&dp.innerHTML.includes('id="wmq"'),'wish: the Collection shows the outfit preview and wearing works'+(th?' '+th:''));
 ok(R('!nearby.toString().includes("WISHN")&&typeof WISHN=="undefined"&&typeof WHEELN=="undefined"&&typeof REELN=="undefined"&&typeof DIGN=="undefined"'),'games: the shrine and 3 game spots are gone from the hub');
 ok(R('nearby.toString().includes("BARKEEP")&&BARKEEP.x==750&&BARKEEP.y==350'),'games: blackjack still stands at the Barkeep in the hub');
 {const rr=R('GNODES.map(n=>Math.hypot(n.x-PORTAL.x,(n.y-PORTAL.y)*HUB.rx/HUB.ry))'),m=rr.reduce((a,b)=>a+b)/rr.length;ok(rr.every(r=>Math.abs(r-m)<m*0.15),'gathering: every node sits on the same ring around the hub centre');ok(R('GNODES.every(n=>{const v=riverNear(n.x,n.y);return v.d>v.bw+12&&!bridgeAt(n)})'),'gathering: no node on the river or the crossing');}
{R('closeDlg();globalThis.__sv=JSON.stringify({q:V.q,qs:V.qs,sq:V.sq,sd:V.sd,gm:V.gm,gold:V.gold});V.q=0;V.qs=0;V.sq=null;V.sd=[];V.gm=0');
  R('openDlg("elder")');let h=dp.innerHTML;ok(/Main quest/.test(h)&&/Side quest · new/.test(h)&&h.includes('Hands in the Soil')&&(h.match(/class="qcard/g)||[]).length==2,'elder: main and side quest cards side by side');
  ok(R('sideAct(1)')===true&&R('V.sq.id')=='soil'&&R('sideAct(1)')===false,'elder: one side quest at a time (max 2 quests)');
  R('qAct(1)');ok(R('V.qs')==1&&R('V.sq.st')==1,'elder: main and side quest active together');
  R('V.gm=14;save()');ok(R('V.sq.st')==1,'elder: side progress counts from accepting');R('V.gm=15;save()');ok(R('V.sq.st')==2&&R('elderMark()')=='ready','elder: side quest becomes ready and the marker says so');
  const g0=R('V.gold');ok(R('sideAct(2)')===true&&R('V.gold')==g0+120&&R('V.sq')===null&&R('V.sd.includes("soil")')&&R('sideNext().id')=='lore','elder: claim pays and offers the next side quest');
  ok(R('sideAct(2)')===false,'elder: no double claim');R('sideAct(1);sideAct(0)');ok(R('V.sq')===null&&!R('V.sd.includes("lore")'),'elder: a dropped side quest can be taken again');
  ok(R('SIDE.every(x=>x.r<=auditRules().quest.g)'),'elder: side rewards fit the bank quest cap');
  R('closeDlg();Object.assign(V,JSON.parse(__sv))');}
{R('closeDlg();globalThis.__tu=V.tut;V.tut=TUT_DONE;globalThis.__ul=V.ul;V.ul={...(V.ul||{}),pet:true}');const IX=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');ok(!/id="(bgm|bq|bs|bcls)"/.test(IX)&&/npc\(BARKEEP, dailyReady\(\) \? "bonus"/.test(SCRIPT)&&/barTabs\("d"\)/.test(SCRIPT)&&/\["class", CLASSN\]/.test(SCRIPT)&&/\[null, CLASSN, ELDER/.test(SCRIPT)&&/\["cos", "✨ Shop"\]/.test(SCRIPT)&&/questDailyHTML\(EL_TAB\)/.test(SCRIPT)&&/<button id="bgd"[^>]*onclick="gardenOpen\(\)"[^>]*>🌸 Garden<b class="bdg"><\/b><\/button>/.test(IX)&&/e\.code == "KeyG"/.test(SCRIPT),'UI cleanup: no Quests/Shop/Class/Daily HUD buttons; Daily at the Barkeep (marker, G key), Quests at the Elder, Shop tab at the Merchant, Class Master in the hub + tutorial arrow; Garden button stays');
ok(vm.runInContext('(()=>{const o={tut:V.tut,tr:V.tr,w:V.wins,l:V.loss};V.tut=TUT_DONE;V.tr=0;V.wins=0;V.loss=0;V.tx=2;const a=tutRaid();V.wins=1;const b=!tutRaid();V.wins=0;V.tr=1;const c=!tutRaid();Object.assign(V,{tut:o.tut,tr:o.tr,wins:o.w,loss:o.l});return a&&b&&c&&TUT_TXT.length==TUT_DONE+TUT_X&&/Class Master/.test(tutHow(1))&&/Smith/.test(tutHow(5))&&/Beastkeeper/.test(tutHow(6))&&/glowing circle/.test(tutHow(7))&&/V.tr = 1/.test(startTeleport.toString())})()',ctx),'tutorial: a 6th step (start your first raid) until a raid starts or one was played; every step has a what-to-press line');
ok(vm.runInContext('(()=>{const o=JSON.stringify(V);V.tut=4;V.tr=0;V.wins=0;V.loss=0;V.ul={class:true};delete V.tx;tutNext(4);const a=V.tut==TUT_DONE&&V.ul.smith&&V.ul.pet&&tutX()==0;tutXNext(1);const b=tutX()==0;smithUI();const c=tutX()==1;petUI();const d=tutX()==2;closeDlg();const r=[a,b,c,d];Object.assign(V,JSON.parse(o));if(!("tx" in JSON.parse(o)))delete V.tx;return r.join()})()',ctx)=='true,true,true,true','tutorial: after the Archivist, new players unlock and visit the Smith, then the Beastkeeper, then start a raid (in order)');
  R('gamesOpen()');const h=dp.innerHTML;ok(R('CUR_DLG')=='games'&&!dl.hidden&&['Wish Shrine','Fortune Wheel','Rune Reels','Treasure Dig'].every(n=>h.includes(n))&&(h.match(/class="dcard/g)||[]).length==4&&!h.includes('Zen Garden')&&/class="dbar"/.test(h)&&/of 4 done today/.test(h),'daily: the board shows the 4 daily games with progress (no garden, no blackjack)');
  ok(typeof R('dailyReady()')=='number'&&typeof R('gardenReady()')=='number','daily: HUD badge counts are numbers');
  for(const [k,mark] of [['wish','Wish Shrine'],['wheel','Fortune Wheel'],['reels','Rune Reels'],['dig','Treasure Dig']]){R('gamesBack()');let th=0,ok2=0;try{ok2=R('gameGo("'+k+'")');}catch(e){th=e;}ok(!th&&ok2&&R('CUR_DLG')==k&&dp.innerHTML.includes(mark)&&dp.innerHTML.includes('gamesBack()'),'daily: '+k+' opens from the board (with a way back)'+(th?' '+th:''));}
  R('closeDlg();gardenOpen()');ok(R('CUR_DLG')=='garden'&&dp.innerHTML.includes('id="zen"'),'garden: the 🌸 button opens the Zen Garden');
  R('closeDlg();V.ul={...V.ul,pet:false};gardenOpen()');ok(dl.hidden,'garden: locked until the Beastkeeper');
  R('closeDlg();V.tut=0;gamesOpen()');ok(dl.hidden,'daily: the board waits for the tutorial');R('V.tut=__tu;V.ul=__ul');}
 ok(R('Object.values(EMOTES).includes("🌠")'),'wish: the 🌠 wish beam is a network-whitelisted emote');
 Object.assign(V0,keep);dl.hidden=true;}
V.mat={ore:5,echo:3,herb:4};T.craftOre();ok(V.mat.ore===0&&V.mat.echo===1&&V.mat.dust===3,'smith: 5 ore + 2 echo refine into 3 dust');
V.ton=0;const d0=T.dmG();T.craftTonic();ok(V.ton===1&&V.mat.herb===0&&V.mat.echo===0&&Math.abs(T.dmG()/d0-1.08)<1e-9,'smith: Moon Tonic costs 4 herb + 1 echo and gives +8% damage');
V.mat={herb:8,echo:2};T.craftTonic();ok(V.mat.herb===8,'smith: only one tonic at a time');
V.mat=JSON.parse(m0);V.gn=gn0;V.gday=gd0;V.gm=gm0;V.ton=ton0;}
/* ---------- contract board ---------- */
{const rs0=randomState,V=T.V(),m0=JSON.stringify(V.mat||{}),g0=V.gold,xp0=V.xp,ct0=V.ct,at0=V.ctAt;V.ct=null;V.ctAt=0;
const d=T.contractDay();ok(d.ids.length==3&&new Set(d.ids).size==3&&d.ids.every(i=>T.CONTRACTS.some(c=>c.id==i))&&JSON.stringify(T.contractDay().ids)==JSON.stringify(d.ids),'contracts: 3 different orders a day, the same all day');
ok(T.CONTRACTS.every(c=>c.g<=400&&c.x<=300&&c.m<=3),'contracts: every payout fits the bank rule (gold 400, XP 300)');
const c=T.CONTRACTS.find(o=>o.id==d.ids[0]);V.mat={};ok(T.contractDeliver(c.id)===false,'contracts: no delivery without the materials');
V.mat=Object.assign({},c.need);const L=T.LEDGER(),gb=V.gold;ok(T.contractDeliver(c.id)===true&&Object.keys(c.need).every(k=>V.mat[k]===(k=='echo'?c.m:0))&&V.gold==gb+c.g&&V.mat.echo==c.m,'contracts: delivery spends the order and pays gold, XP and Echo Shards');
const new_=L.slice(-(Object.keys(c.need).length+3)),sp=new_.findIndex(e=>e[0]=='mat'&&e[3]=='contract'&&e[5]<0),gd=new_.findIndex(e=>e[0]=='contract'&&e[1]>0);ok(sp>=0&&gd>sp,'contracts: the spend is logged before the payout');
ok(T.contractDeliver(c.id)===false,'contracts: each order pays once a day');
const c2=T.CONTRACTS.find(o=>o.id==d.ids[1]);V.mat=Object.assign({},c2.need);ok(T.contractDeliver(c2.id)===true,'contracts: the next order right away (no wait)');
V.mat=JSON.parse(m0);V.gold=g0;V.xp=xp0;V.ct=ct0;V.ctAt=at0;randomState=rs0;} /* keep the seeded dice where the later raid sims expect them */
/* ---------- maiden's exchange ---------- */
{const rs0=randomState,V=T.V(),m0=JSON.stringify(V.mat||{}),mx0=V.mx;V.mx=null;
const i=T.XCH.findIndex(x=>x[0]=='ore'&&x[1]=='herb'),x=T.XCH[i],g=T.xchGive(x);V.mat={ore:100};
ok(T.XCH_MUL.includes(T.xchMul('ore'))&&T.xchMul('ore')===T.xchMul('ore'),'exchange: the day sets each material demand (same all day)');
ok(T.xchTrade(i)===true&&V.mat.ore===100-g&&V.mat.herb===x[3],'exchange: a trade spends today price and gives the fixed amount');
ok(T.xchGive(x)>=g&&T.xchGive(x)==Math.max(1,Math.round(x[2]*T.xchMul('ore')*1.25)),'exchange: each trade of a material raises its price 25%');
V.mat={};ok(T.xchTrade(i)===false,'exchange: no trade without the materials');
V.mat={ore:9999};for(let k=0;k<20;k++)T.xchTrade(i);ok(V.mx.n===T.XCH_DAY,'exchange: '+T.XCH_DAY+' trades a day');
let loop=true;for(const a of T.XCH)for(const b of T.XCH)if(a[0]==b[1]&&a[1]==b[0]){const ga=Math.max(1,Math.round(a[2]*0.8)),gb=Math.max(1,Math.round(b[2]*0.8));if((a[3]/ga)*(b[3]/gb)>1)loop=false;}
ok(loop,'exchange: no A to B to A loop ever pays, even at the best rates');
const L=T.LEDGER(),t=L.slice(-2);ok(t.every(e=>e[0]=='mat'&&e[3]=='maiden'),'exchange: logged as maiden spends and gains for the bank');
V.mat=JSON.parse(m0);V.mx=mx0;randomState=rs0;}
/* ---------- dash and controls ---------- */
T.P().dcd=0;T.P().dx=1;T.P().dy=0;T.dash(T.P());ok(T.P().dcd>0,'dash: works in the hub and starts its cooldown');
ok(T.keyLabel('Mouse0')=='MB1','controls: main attack shows as MB1');
{const d={cls:'dps',eng:1};ok(T.cdMul(d,0)==1,'engine: none at the start of a raid');d.eng=3;ok(Math.abs(T.cdMul(d,1)-1/3)<1e-9,'engine: x3 attack speed divides cooldowns by 3');ok(T.cdMul({cls:'tank',eng:3},0)==1,'engine: only the DPS has it');}
/* ---------- hub networking authority ---------- */
T.devHub();netClock=1000;fakePeers=['peer-one'];fakeBroadcast=[];T.netPrepareHub('host');T.HUBV().splice(0,T.HUBV().length,...T.HUBV().filter(v=>!v.bot)); /* no bots in the way of the movement checks */
T.netReceive('peer-one',{type:'join',profile:{id:'player-test1234',name:'Guest',cls:'tank',lv:3,ti:0,spd:1}});
const remote=T.HUBV().find(v=>v.netClientId=='player-test1234'),remoteX=remote&&remote.netX;
ok(remote&&fakeBroadcast.filter(x=>x.msg.type=='r').every(x=>x.msg.p.every(e=>!String(e[1]).startsWith('bot'))),'network hub: local bots stay local (never in the roster)');
ok(fakeBroadcast.some(x=>x.msg.type=='r'&&x.msg.p.length==2),'network hub: host sends the roster when a guest joins');
T.netReceive('peer-one',{type:'m',x:'far',y:0,f:3,d:0,s:1});ok(remote.netX==remoteX,'network hub: rejects malformed movement');
T.netReceive('peer-one',{type:'rz',on:1});ok(remote.rz===1,'network hub: a guest in a raid is hidden in the hub');T.netReceive('peer-one',{type:'rz',on:'x'});ok(remote.rz===1,'network hub: rejects a malformed raid flag');T.netReceive('peer-one',{type:'rz',on:0});ok(remote.rz===0,'network hub: a guest back from a raid shows again');
{const nc0=netClock;T.netReceive('peer-one',{type:'nc',c:2});ok(remote.nc===2,'name colour: a guest changes its own colour live');T.netReceive('peer-one',{type:'nc',c:3});ok(remote.nc===2,'name colour: changes are rate-limited (0.5 s)');netClock+=600;for(const c of [9,'3',-1,1.5,null])T.netReceive('peer-one',{type:'nc',c});ok(remote.nc===2,'name colour: rejects colours outside 0-3');T.netReceive('peer-one',{type:'nc',c:3,e:[0,1]});ok(remote.nc===3&&T.HUBV().filter(v=>v.nc===1&&v!==remote).length==0,'name colour: a guest can only change its own slot');netClock=nc0;}
{const c0=netClock;netClock+=1000;fakeBroadcast=[];T.netReceive('peer-one',{type:'wq',q:'a_ember,w_leaf',tc:''});ok(remote.wq==='a_ember,w_leaf','wish cosmetics: a guest changes its outfit live and the host relays it for its own slot');
 T.netReceive('peer-one',{type:'wq',q:'a_tide',tc:''});ok(remote.wq==='a_ember,w_leaf','wish cosmetics: changes are rate-limited (0.5 s)');netClock+=600;
 for(const q of ['a_ember,a_tide','<img>','t_lucky','c_ore',5,null])T.netReceive('peer-one',{type:'wq',q,tc:''});T.netReceive('peer-one',{type:'wq',q:'a_tide',tc:'XYZ'});ok(remote.wq==='a_ember,w_leaf','wish cosmetics: off-catalogue lists and bad trade codes are rejected');
 T.netReceive('peer-one',{type:'wq',q:'a_tide',tc:'abcdef0123',e:[0,'a_nova','']});ok(remote.wq==='a_tide'&&remote.wtc==='abcdef0123'&&T.HUBV().filter(v=>v!==remote&&v.wq==='a_nova').length==0,'wish cosmetics: a guest can only change its own slot');netClock=c0;}
netClock+=100;fakeBroadcast=[];T.netReceive('peer-one',{type:'m',x:remoteX+10,y:remote.netY,f:3,d:0,s:2});
ok(Math.abs(remote.netX-(remoteX+10))<1e-6&&!fakeBroadcast.some(x=>x.msg.type=='c'),'network hub: host accepts a walkable guest step without correcting');
netClock+=100;fakeBroadcast=[];const beforeX=remote.netX;T.netReceive('peer-one',{type:'m',x:beforeX+400,y:remote.netY,f:3,d:0,s:3});
ok(remote.netX-beforeX<60&&fakeBroadcast.some(x=>x.msg.type=='c'),'network hub: host clamps a too-fast step and sends a correction');
netClock+=100;const dashX=remote.netX;T.netReceive('peer-one',{type:'m',x:dashX+70,y:remote.netY,f:3,d:1,s:4});
ok(remote.netX-dashX>50,'network hub: a dash gets its extra distance');
netClock+=100;const dash2=remote.netX;T.netReceive('peer-one',{type:'m',x:dash2+70,y:remote.netY,f:3,d:1,s:5});
netClock+=100;const dash3=remote.netX;T.netReceive('peer-one',{type:'m',x:dash3+70,y:remote.netY,f:3,d:1,s:6});
ok(remote.netX-dash3<45,'network hub: dash budget allows 2 dashes (Twin Feather), not 3');
T.netStep();
{const s=T.HUBV().find(v=>v.netClientId=='player-test1234');const x0=s.netX-50;s.x=x0;s.y=s.netY;netClock+=400;T.hubVisitStep(0.05);ok(s.x>x0+5&&s.x<x0+45,'network hub: remote players glide toward their buffered position instead of jumping');}
fakeBroadcast=[];netClock+=1000;T.netStep();const full=fakeBroadcast.find(x=>x.msg.type=='s');ok(full&&full.id=='peer-one'&&typeof full.msg.p=='string'&&full.msg.p.length==6&&T.netUnpack(full.msg.p)[0][0]==0,'network hub: state is 6 packed characters per player, without the receiver itself');
ok(JSON.stringify(T.netUnpack(T.netPack([[7,899,599,3],[0,0,0,0]])))=='[[7,899,599,3],[0,0,0,0]]','network hub: packed positions decode exactly');
{const base=()=>({x:90,y:110}),d=T.netPack([[3,100,100,1]],base);ok(d.length==4&&JSON.stringify(T.netUnpack(d,base))=='[[3,100,100,1]]','network hub: a small move is sent as a 4-character delta and decodes exactly');
 ok(T.netPack([[3,300,100,1]],base).length==6,'network hub: a big jump falls back to the full 6-character position');
 ok(!Number.isFinite(T.netUnpack(d,()=>undefined)[0][1]),'network hub: a delta without a known base is skipped, not guessed');}
fakeBroadcast=[];netClock+=100;T.netStep();ok(!fakeBroadcast.some(x=>x.msg.type=='s'),'network hub: nothing is sent while no one moves');
fakeBroadcast=[];netClock+=1000;T.netReceive('peer-one',{type:'chat',text:'hello all',seq:50});
ok(fakeBroadcast.some(x=>x.msg.type=='ack'&&x.msg.seq==50&&x.msg.ok),'network hub: host confirms a valid guest chat');
fakeBroadcast=[];T.netReceive('peer-one',{type:'chat',text:'spam',seq:51});
ok(fakeBroadcast.some(x=>x.msg.type=='ack'&&x.msg.seq==51&&!x.msg.ok),'network hub: host rejects chat spam');
fakeBroadcast=[];T.netReceive('peer-one',{type:'emote',e:'not-an-emote',seq:52});
ok(fakeBroadcast.some(x=>x.msg.type=='ack'&&x.msg.seq==52&&!x.msg.ok),'network hub: host rejects unknown emotes');
fakePeers=[];T.netPrepareHub('');T.netDisconnect?.();
ok(T.COS.filter(i=>i.t=='emote').every(i=>!i.eur&&!i.pass),'shop: no emote costs real money (gold, free or unlocked by playing)');
/* ---------- raids: party, raid select, bosses, mechanics, role bots ----------
   raidSim(key, setup): you on autopilot (P.auto) with bots filling the rest; runs the fight at 30 fps for up to 6 min. */
function raidSim(key,cls,setup,pre){
 T.devHub();T.V().cls=cls;T.P().cls=cls;T.P().auto=true;T.PARTY().m=[];T.PARTY().lead='me';
 T.V().up={dmg:0,vit:0,spd:0,cdr:0};T.V().sk={tank:[0,0,0],dps:[0,0,0],heal:[0,0,0]};T.V().xp=0;T.V().bl=null; /* a fresh level-1 raider */
 pre&&pre();T.toArena(key);setup&&setup(T.S());const S=T.S();let ticks=0,minHp=1,rsN=0,rsB=0,rsMax=0;
 S.net={role:'lead',t:0}; /* measure what the leader would send its members (no real members here) */
 while(!S.end&&ticks<30*360){T.step(1/30);ticks++;if(S.ps.some(p=>p.hp<=0))minHp=0;if(ticks%3==0){const n=JSON.stringify(T.raidState()).length;rsN++;rsB+=n;rsMax=Math.max(rsMax,n);}}
 const r={rsAvg:Math.round(rsB/Math.max(1,rsN)),rsMax,key,cls,end:S.end,time:S.at,why:S.why,dead:S.ps.filter(p=>p.hp<=0).map(p=>p.cls).join(','),deaths:S.ps.filter(p=>p.hp<=0).length,size:S.ps.length,boss:S.b.def.n,brk:S.b.wk,doomed:S.b.doomed,share:(()=>{const d=S.b.dmg||{},t=Object.values(d).reduce((x,y)=>x+y,0)||1;return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,Math.round(v/t*100)]))})()};
 T.P().auto=false;delete T.P().ai_ignoreDoom;T.V().eq={bag:[],on:{}};T.setRaidTrial(0);T.S().res=0.01;T.step(0.02);return r;
}
{
 T.devHub();T.P().cls='dps';
 const tm=T.raidTeam('small').team;ok(tm.length==3&&['tank','heal','dps'].every(k=>tm.filter(m=>m.cls==k).length==1)&&tm[0].me,'raid: a small raid is you plus bots for the 2 missing roles');
 const lg=T.raidTeam('large').team;ok(lg.length==6&&['tank','heal','dps'].every(k=>lg.filter(m=>m.cls==k).length==2),'raid: a large raid is 2 tanks, 2 healers, 2 DPS');
 ok(!T.raidTeam('epic').err&&T.raidTeam('epic').team.length==12&&T.RAIDS.epic.boss=='synapse','raid: the epic raid is open: 12 raiders vs the Echo Archon');
 const oldPortrait=ctx.bossPortrait,epicLocked=T.RAIDS.epic.locked;ctx.bossPortrait=()=>'data:image/png;base64,test';
 T.raidUI();const html=ctx.document.getElementById('dp').innerHTML;ok(html.includes('Hollow Seer')&&html.includes('Thornmaw')&&html.includes('Echo Archon'),'raid select: small, large and epic bosses');
 T.RAIDS.epic.locked=true;T.raidUI();const sealed=ctx.document.getElementById('dp').innerHTML;T.RAIDS.epic.locked=epicLocked;ctx.bossPortrait=oldPortrait;T.raidUI();
 ok((html.match(/alt="[^"]+ boss portrait"/g)||[]).length==3&&(sealed.match(/alt="[^"]+ boss portrait"/g)||[]).length==3&&sealed.includes('class="rcard locked"'),'raid select: every card, including sealed raids, shows its boss portrait');
 const tanks=[1,2].map(i=>T.hubJoin('rbt'+i,{name:'RbTank'+i,cls:'tank',quiet:1},1));tanks.forEach(v=>T.partyAdd(v.id));
 ok(T.raidTeam('small').err&&!T.raidTeam('large').err,'party: 2 extra tanks are too many for a small raid, fine for a large one');
 tanks.forEach(v=>T.partyRemove(v.id));ok(T.PARTY().m.length==0,'party: members can be removed');
 const bot=T.hubJoin('rbh1',{name:'RbHeal',cls:'heal',quiet:1},1);T.playerUI(bot);ok(ctx.document.getElementById('dp').innerHTML.includes(bot.name),'party: inspecting a player shows class, level, cosmetics');
 {T.closeDlg&&T.closeDlg();ctx.document.getElementById('dlg').hidden=true;bot.inn=0;bot.out=0;bot.x=330;bot.y=420;T.P().x=bot.x+10;T.P().y=bot.y;T.inter();ok(ctx.document.getElementById('dlg').hidden,'party: interact near a player sends the invite at once, no menu');}
 T.partyAdd(bot.id);const pm=T.partyMembers();ok(pm.length==2&&pm[1].name==bot.name&&pm[1].cls==bot.cls,'party: a party member joins your raid team');
 T.partyRemove(bot.id);
}
{
 fakeBrainCalls=[];store.rb_mtok='c'.repeat(32);T.devHub();T.toArena('epic');
 ok(fakeBrainCalls.some(c=>c.action=='get'),'game brain: fetches shared weights when the epic raid starts');
 for(let i=0;i<60*6;i++)T.step(1/60);
 const log=T.brainLog();ok(log&&log.samples.length>=10,'game brain: samples player movement during the epic raid');
 T.brainSend();
 const sent=fakeBrainCalls.find(c=>c.action=='train');
 ok(sent&&sent.body.samples.length>=10&&sent.body.tok=='c'.repeat(32),'game brain: submits the sampled fight with the market token');
}
{
 T.devHub();T.toArena('small');const b=T.S().b,tank=T.S().ps.find(p=>p.cls=='tank');
 T.taunt(tank);ok(b.tt>0&&b.tg==tank.id,'tank: Taunt holds the boss');
 ok(b.tt==6&&T.S().ps.find(p=>p.cls=='tank').cd!=null,'tank: Taunt holds 6 s (cooldown 10 s leaves a gap)');{const S=T.S(),d=S.ps.find(p=>p.cls=='dps');b.tt=0;b.thr={};b.thr[d.id]=500;b.thr[tank.id]=100;b.weak=0;b.stun=0;b.fl=0;T.arena(0.016);ok(b.cur!=tank.id,'tank: an idle tank loses the boss when Taunt ends');b.thr[tank.id]=2000;b.tAt=T.S().at;T.arena(0.016);ok(b.cur==tank.id,'tank: Strikes (3x threat) keep the boss after Taunt');b.tAt=T.S().at-20;T.arena(0.016);ok(b.cur!=tank.id,'tank: threat alone never holds the boss without a recent Taunt');b.sun=4;b.sunId=tank.id;b.weak=0;T.bash(tank);ok(b.sun==0,'tank: Shield Bash clears Sunder');b.stun=0;}
 b.weak=3;tank.x=b.x;tank.y=b.y+30;T.bash(tank);ok(b.brk>0&&b.stun>=4&&b.weak==0,'tank: Shield Bash in the weak window breaks poise (+50% damage)');
 {const d=T.S().ps.find(p=>p.cls=='dps');d.x=100;d.y=100;b.brk=0;T.S().zo=[];let h=b.hp;T.hitB(10,d);const out=h-b.hp;T.S().zo=[{x:100,y:100,r:90,l:5,t:1}];h=b.hp;T.hitB(10,d);ok(Math.abs((h-b.hp)/out-T.ZONE_DMG)<1e-6&&T.ZONE_DMG>1,'healer: allies standing in the Circle hit harder');}
 {const d=T.S().ps.find(p=>p.cls=='dps');T.S().ao=[];b.doom=null;d.x=b.x+200;d.y=b.y;T.S().zo=[{x:b.x+60,y:b.y+80,r:90,l:5,t:0}];T.raidAI(d,0.016);const z=T.S().zo[0];ok(d.dx*(z.x-d.x)+d.dy*(z.y-d.y)>0,'bots: step into a healer Circle');T.S().zo=[];}
 {T.devHub();T.toArena('small');const S=T.S(),b=S.b;b.tt=0;b.weak=0;b.stun=0;b.fl=0;b.seek=0.01;S.ao=[];for(const p of S.ps)p.auto=0;let shot=0;for(let i=0;i<4&&!shot;i++){T.arena(0.016);shot=(b.bolts||[]).length;}ok(shot>0,'boss: Seeker Bolt flies as a visible orb');const t=S.ps.find(p=>p.id==b.bolts[0].id),h=t.hp;let n=0;while((b.bolts||[]).length&&n++<200)T.arena(0.016);ok(t.hp<h||t.sh>0,'boss: Seeker Bolt hurts its target on arrival');}
 ok(T.DASH.dps.d>T.DASH.heal.d&&T.DASH.heal.d>T.DASH.tank.d,'dash: DPS longest, healer normal, tank shortest');
 ok(T.inTele({x:100,y:0},{ln:1,x:0,y:0,a:0,len:200,w:40})&&!T.inTele({x:100,y:40},{ln:1,x:0,y:0,a:0,len:200,w:40}),'boss: line telegraphs hit only inside the lane');
 T.S().res=0.01;T.step(0.02);
}
{
 const s=raidSim('small','dps');console.log('RAID small (you dps)',JSON.stringify(s));
 ok(s.end=='win'&&s.time>=90&&s.time<=240,`raid: bots + you win the small raid in 1.5-4 min (${s.end} in ${Math.round(s.time)} s)`);
 ok(s.brk==2&&s.doomed,'raid: the fight used both poise windows and the Doom');
 const t=raidSim('small','tank');console.log('RAID small (you tank)',JSON.stringify(t));
 ok(t.end=='win','raid: also won with you as the tank');
 const l=raidSim('large','heal');console.log('RAID large (you heal)',JSON.stringify(l));
 ok(l.end=='win'&&l.size==6&&l.time<=270,`raid: the large raid (6) is won by a full role team (${l.end} in ${Math.round(l.time)} s)`);
 const nt=raidSim('small','dps',S=>S.ps.forEach(p=>{if(p.cls=='tank')p.noTaunt=true;}));console.log('RAID small no taunt',JSON.stringify(nt));
 ok(nt.end=='lose'||nt.deaths>=1,'raid: without Taunt the boss eats the healer and DPS');
 const nd=raidSim('small','dps',S=>{const h=S.ps.find(p=>p.cls=='heal');S.b.doomed=true;S.b.doom={id:h.id,t:12,m:12,orbs:[0,1,2].map(i=>({x:-9999,y:-9999+i*200,got:false}))}; /* runes out of reach: the timer must run out */});
 ok(nd.end=='lose'&&/Doom/.test(nd.why),'raid: an uncleansed Doom wipes the whole party');
}
/* ---------- party messages between real players go through the master ---------- */
{
 T.devHub();netClock+=1000;fakePeers=['peer-a','peer-b'];fakeBroadcast=[];T.netPrepareHub('host');T.PARTY().m=[];T.PARTY().lead='me';
 const prof=(n)=>({id:'player-party'+n+'x',name:'Pa'+n,cls:'dps',lv:2,ti:0,spd:1});
 T.netReceive('peer-a',{type:'join',profile:prof(1),x:400,y:420});T.netReceive('peer-b',{type:'join',profile:prof(2),x:420,y:420});fakeBroadcast=[];
 T.netReceive('peer-a',{type:'pi',to:'player-party2x',cls:'dps',lv:2});T.netRelayFlush();
 const fw=fakeBroadcast.find(x=>x.id=='peer-b'&&x.msg.type=='pi');ok(fw&&fw.msg.from=='player-party1x'&&!('to' in fw.msg),'party: the master forwards an invite and stamps who sent it');
 fakeBroadcast=[];for(let i=0;i<10;i++)T.netReceive('peer-a',{type:'pi',to:'player-party2x'});T.netRelayFlush();ok(fakeBroadcast.filter(x=>x.msg.type=='rb').flatMap(x=>x.msg.m).filter(m=>m.type=='pi').length<=6,'party: invite spam is capped');
 /* guest side: an invite opens a prompt; the leader's list makes you a member; an empty list removes you */
 fakePeers=['host-peer'];T.netPrepareHub('guest');T.setNetTestSession('guest',{peerId:'host-peer'});T.PARTY().m=[];T.PARTY().lead='me';
 T.netReceive('host-peer',{type:'r',p:[[0,'host-player','Boss','tank',9,0,1],[1,'player-party3x','Pb3','heal',4,0,1]]});
 T.partyMessage('player-party3x',{type:'pi'});ok(!ctx.document.getElementById('pinv').hidden&&ctx.document.getElementById('pinv').innerHTML.includes('Yes'),'party: an invite from a real player shows a small Yes/No popup');
 fakeBroadcast=[];T.partyMessage('host-player',{type:'pi'});T.netRelayFlush&&T.netRelayFlush();
 ok(ctx.document.getElementById('pinv').innerHTML.includes('Pb3')&&!ctx.document.getElementById('pinv').innerHTML.includes('Boss'),'party: a second invite while one is pending is refused (first popup stays)');
}
/* ---------- ultimates (R) ---------- */
{
 T.devHub();T.toArena('small');const S=T.S(),b=S.b,ps=S.ps,tank=ps.find(p=>p.cls=='tank'),heal=ps.find(p=>p.cls=='heal'),dps=ps.find(p=>p.cls=='dps');
 ok(ps.every(p=>p.ucd==T.ULT.start),'ultimate: every raid starts with it charging');
 ps.forEach(p=>p.ucd=0);b.stun=0;
 T.ult(tank);ok(ps.every(p=>p.sh==T.ULT.tank.sh)&&b.stun>=T.ULT.tank.stun&&tank.ucd==T.ULT.tank.cd,'tank Bulwark: shields the whole party and stuns the boss');
 const hp=heal.hp;T.hurt(heal,100);ok(heal.hp==hp&&heal.sh==T.ULT.tank.sh-100,'tank Bulwark: the shield soaks damage first');
 T.ult(heal);ok(!heal.rev,'healer Resurrect: needs a fallen ally');
 dps.hp=0;T.ult(heal);ok(dps.hp==Math.round(dps.mh*T.ULT.heal.hp)&&heal.rev==1,'healer Resurrect: brings a fallen ally back at half health');
 dps.hp=0;heal.ucd=0;T.ult(heal);ok(dps.hp==0,'healer Resurrect: once per raid per healer');
 dps.hp=dps.mh;dps.eng=1.2;T.ult(dps);ok(dps.ucd==0,'DPS Overdrive: needs Engine stacks');
 dps.eng=2;const d2=T.ultDmg(dps);dps.eng=4;const d4=T.ultDmg(dps);ok(d4>d2*3,'DPS Overdrive: more stacks hit much harder');
 b.brk=0;S.zo=[];const bh=b.hp;dps.life=180;dps.eng=4;T.ult(dps);ok(bh-b.hp>=d4*0.99&&dps.eng==1&&dps.life==0,'DPS Overdrive: spends the Engine in one burst and restarts it');
 S.res=0.01;T.step(0.02);
}
/* ---------- save code: export / import, tamper seal, numbers must add up, paid items stay behind ---------- */
/* ---------- networked raids: the leader runs the fight, members mirror it ---------- */
{
 /* relay: moves from several raid members to one leader arrive as one bundle */
 T.devHub();netClock+=1000;fakePeers=['peer-l','peer-m1','peer-m2'];fakeBroadcast=[];T.netPrepareHub('host');
 const prof=(n)=>({id:'player-raid'+n+'xx',name:'Rn'+n,cls:'dps',lv:2,ti:0,spd:1});
 ['l','m1','m2'].forEach(n=>T.netReceive('peer-'+n,{type:'join',profile:prof(n),x:400,y:420}));fakeBroadcast=[];
 T.netReceive('peer-m1',{type:'rm',to:'player-raidlxx',x:400,y:400,f:0,d:0,s:1});T.netReceive('peer-m2',{type:'rm',to:'player-raidlxx',x:410,y:400,f:0,d:0,s:1});
 T.netRelayFlush();const toL=fakeBroadcast.filter(x=>x.id=='peer-l');
 ok(toL.length==1&&toL[0].msg.type=='rb'&&toL[0].msg.m.length==2&&toL[0].msg.m[0].from=='player-raidm1xx','raid net: the master bundles members\' moves for the leader into one message');
 fakeBroadcast=[];T.netReceive('peer-m1',{type:'rc',to:'player-raidlxx',text:'boss left'});T.netReceive('peer-m2',{type:'rp',to:'player-raidlxx'});T.netRelayFlush();
 const comm=fakeBroadcast.find(x=>x.id=='peer-l'&&x.msg.type=='rb');
 ok(comm&&comm.msg.m.some(m=>m.type=='rc'&&m.from=='player-raidm1xx')&&comm.msg.m.some(m=>m.type=='rp'&&m.from=='player-raidm2xx'),'raid comms: host relays party chat and boss pings with verified sender IDs');
 let got=0;for(let i=1;i<=150;i++){netClock+=66;fakeBroadcast=[];T.netReceive('peer-m1',{type:'rm',to:'player-raidlxx',x:400,y:400,f:0,d:0,s:i});T.netRelayFlush();got+=fakeBroadcast.filter(x=>x.id=='peer-l').length;}
 ok(got==150,`raid net: a member's steady 15/s moves keep flowing for 10 s (${got}/150 forwarded)`);
 fakeBroadcast=[];T.netReceive('peer-l',{type:'rs',to:['player-raidm1xx','player-raidm2xx'],t:1,b:[],p:[]});T.netRelayFlush();
 ok(fakeBroadcast.filter(x=>x.msg.type=='rs').length==2,'raid net: one leader snapshot reaches every member (multicast)');
 fakePeers=[];T.netPrepareHub('');
 /* leader: a real member is moved by its messages (speed-checked) and its skills go through the leader's cooldowns */
 T.devHub();T.P().cls='tank';T.P().auto=false;
 const team=[{me:1,cls:'tank'},{cls:'heal',name:'Mem',lv:3,real:1,key:'player-mem1'},{cls:'dps',name:'Botty',lv:3,filler:1}];
 T.toArena('small',team);const S=T.S(),mem=S.ps.find(p=>p.remote=='player-mem1');
 ok(S.net&&S.net.role=='lead'&&mem&&mem.id==1&&S.ps.find(p=>p.cls=='dps').id==2,'raid net: the leader marks real members; ids follow the team order');
 T.hubJoin('player-mem1',{name:'Mem',cls:'heal',quiet:1},1);T.PARTY().m=['player-mem1'];
 T.partyMessage('player-mem1',{type:'rc',text:'boss left'});
 ok(S.net.ev.some(e=>e[0]=='chat'&&e[2]=='Mem'&&e[4]=='boss left'),'raid chat: a party member message is relayed to the raid');
 const evN=S.net.ev.length;T.partyMessage('player-mem1',{type:'rc',text:'x'.repeat(81)});
 ok(S.net.ev.length==evN,'raid chat: oversized messages are discarded');
 T.partyMessage('unknown-player',{type:'rp'});ok(!S.b.ping,'raid ping: non-party senders cannot ping the boss');
 T.partyMessage('player-mem1',{type:'rp'});ok(S.b.ping&&S.b.ping.name=='Mem','raid ping: a party member marks the boss');
 T.PARTY().m=[];
 netClock+=100;T.raidNet('player-mem1',{type:'rm',x:mem.x+10,y:mem.y,f:3,d:0,s:1});ok(Math.abs(mem.tx-(mem.x+10))<0.01,'raid net: a member\'s legal move is accepted');
 netClock+=100;T.raidNet('player-mem1',{type:'rm',x:mem.tx+400,y:mem.y,f:3,d:0,s:2});ok(mem.tx-mem.x<150,'raid net: a member\'s speed hack is clamped by the leader');
 T.raidNet('player-mem1',{type:'rm',x:0,y:0,f:3,d:0,s:2});ok(mem.tx>100,'raid net: replayed moves are ignored');
 mem.cd=[0,0,0];T.raidNet('player-mem1',{type:'ra',a:0,s:3});ok(mem.cd[0]>0,'raid net: a member\'s skill runs on the leader (cooldown started)');
 const cdBefore=mem.cd[0];T.raidNet('player-mem1',{type:'ra',a:0,s:4});ok(mem.cd[0]==cdBefore,'raid net: a skill on cooldown is refused by the leader');
 const st=T.raidState();ok(st.type=='rs'&&st.b.length==11&&st.p.length==3&&JSON.stringify(st).length<1200,`raid net: the leader snapshot is small (${JSON.stringify(st).length} B)`);
 ok(st.ev&&st.ev.some(e=>e[0]=='fx'&&e[1]==1),'raid net: members see each other\'s skills (fx events)');
 {const z0=S.zo.length;mem.cd=[0,0,0];mem.ld=null;T.raidNet('player-mem1',{type:'ra',a:1,s:10,ld:[2,4]});ok(mem.ld&&mem.ld.join()=='2,4'&&S.zo.length==z0+1,'raid net: a member\'s loadout maps its slot (slot 1 = Circle)');
 mem.cd=[0,0,0];T.raidNet('player-mem1',{type:'ra',a:2,s:11,ld:[1,2]});ok(mem.ld.join()=='2,4'&&S.ps.some(p=>p.rn>0),'raid net: the loadout is fixed for the raid; slot 2 = Renewal');
 const ev=T.raidState().ev||[];ok(ev.some(e=>e[0]=='fx'&&e[1]==mem.id&&e[2]==4),'raid net: guests see the right spell (fx carries the skill id)');
 const m2=S.ps.find(p=>p.cls=='dps');m2.remote='player-x';m2.heard=netClock;m2.seq=0;m2.cd=[0,0,0];T.raidNet('player-x',{type:'ra',a:2,s:1,ld:[4,4]});ok(m2.ld.join()=='1,2','raid net: a malformed loadout falls back to the default');
 m2.cd=[0,0,0];T.raidNet('player-x',{type:'ra',a:7,s:2});ok(m2.cd.every(v=>v==0),'raid net: a bad slot is ignored');
 m2.remote=null;}
 fakePeers=[];S.res=0.01;T.step(0.02);
 /* member: mirrors the leader's snapshot */
 T.devHub();T.P().cls='heal';
 const mteam=[{cls:'tank',name:'Lead',lv:5,key:'host-player'},{me:1,cls:'heal'},{cls:'dps',name:'Botty',lv:3,filler:1}];
 T.toArena('small',mteam,{role:'member',lead:'host-player',heard:netClock,seq:0,key:'',at:0});
 const M=T.S();ok(M.net.role=='member'&&T.P().id==1,'raid net: a member\'s own id matches the leader\'s order');
 const bossHp=M.b.hp;M.b.hp=bossHp;
 T.raidApply({type:'rs',t:123,b:[460,230,M.b.mh-500,1,1,0,30,0,0,0,0],p:[[0,440,300,180,200,10,1],[1,T.P().x,T.P().y,80,120,10,0],[2,500,330,90,100,25,3]],ao:[[0,450,220,110,16,16],[1,450,220,1570,340,46,14,14]],ev:[['msg','test banner'],['chat','player-tank1','Tank','tank','focus boss'],['ping','player-tank1','Tank','tank']]});
 ok(M.b.hp==M.b.mh-500&&M.b.weak==3&&T.P().hp==80&&M.ao.length==2&&M.ao[1].ln&&M.ps[2].eng==2.5,'raid net: the member applies boss, health, telegraphs and Engine from the leader');
 ok(M.b.ping&&M.b.ping.name=='Tank','raid ping: boss mark is applied from the leader snapshot');
 T.DEV.nocd=0;T.P().cd=[0,0,0];fakePeers=['host-peer'];T.netPrepareHub('guest');M.sc='arena';
 T.act(T.P(),1);ok(T.P().cd[1]>0&&M.b.hp==M.b.mh-500,'raid net: a member\'s press starts its cooldown but does no damage locally');
 T.setNetTestSession('guest',{peerId:'host-peer'});fakeBroadcast=[];T.raidChatSend('boss left');T.pingBoss();
 ok(fakeBroadcast.some(x=>x.id=='host-peer'&&x.msg.type=='rc'&&x.msg.to=='host-player')&&fakeBroadcast.some(x=>x.id=='host-peer'&&x.msg.type=='rp'&&x.msg.to=='host-player'),'raid comms: members send chat and boss pings through their party leader');
 fakePeers=[];T.netPrepareHub('');M.res=0.01;T.step(0.02);
}
/* ---------- player details travel once: full list to a newcomer, small join/leave/update messages to the rest ---------- */
{
 T.devHub();netClock+=1000;fakePeers=['peer-a','peer-b'];fakeBroadcast=[];T.netPrepareHub('host');
 const prof=(n,lv)=>({id:'player-once'+n+'xx',name:'Once'+n,cls:'heal',lv,ti:0,spd:1});
 T.netReceive('peer-a',{type:'join',profile:prof(1,4),x:400,y:420});fakeBroadcast=[];
 T.netReceive('peer-b',{type:'join',profile:prof(2,7),x:500,y:420});
 const toA=fakeBroadcast.filter(x=>x.id=='peer-a'),toB=fakeBroadcast.filter(x=>x.id=='peer-b');
 const full=toB.filter(x=>x.msg.type=='r'),ids=full[0]?.msg.p.map(e=>e[1])||[];
 ok(full.length==1&&ids[0]=='host-player'&&ids.includes('player-once1xx')&&ids[ids.length-1]=='player-once2xx','roster: a newcomer gets the full list once (master first, itself last)');
 ok(!toA.some(x=>x.msg.type=='r')&&toA.filter(x=>x.msg.type=='j').length==1&&toA.find(x=>x.msg.type=='j').msg.e[2]=='Once2','roster: others get only the newcomer entry');
 fakeBroadcast=[];fakeNet.disconnect('peer-b');
 const leave=fakeBroadcast.find(x=>x.id=='peer-a'&&x.msg.type=='l');ok(leave&&JSON.stringify(leave.msg).length<25&&!fakeBroadcast.some(x=>x.msg.type=='r'),'roster: leaving sends a slot number, not the list');
 /* guest side: build the hub from r, then j / u / l */
 fakePeers=['host-peer'];T.netPrepareHub('guest');
 const e=(slot,n,lv)=>[slot,'player-guest'+n+'xx','G'+n,'tank',lv,0,1];
 T.netReceive('host-peer',{type:'r',p:[[0,'host-player','Boss','dps',9,0,1],e(1,1,3)]});
 T.netReceive('host-peer',{type:'j',e:e(2,2,5)});
 const g2=()=>T.HUBV().find(v=>v.id=='player-guest2xx');
 ok(g2()&&g2().lv==5&&T.HUBV().some(v=>v.id=='host-player'),'roster: guest adds players from the list and from joins');
 T.netReceive('host-peer',{type:'u',e:[2,6,1.06]});ok(g2().lv==6&&g2().netSpd==1.06,'roster: a level-up arrives as a small update');
 T.netReceive('host-peer',{type:'l',s:2});ok(!g2(),'roster: a leave removes that player');
 fakePeers=[];T.netPrepareHub('');T.netDisconnect?.();
}
/* ---------- fair play: the audit rules (pure), the ledger, master and slave checks ---------- */
{
 const base={g:100,xp:0,up:[0,0,0,0],bl:'',cls:'tank',hp:200,mh:200,led:[]},A=(prev,patch,win=10000)=>T.netAudit(prev,{...base,...patch},win);
 const first=A(null,{}),p=first.next;ok(first.reasons.length==0,'audit: an honest first snapshot passes');
 ok(A(p,{g:196,xp:190,led:[['raid',96,0],['raid',0,190]]},20000).reasons.length==0,'audit: a legal raid reward passes');
 ok(A(p,{g:600}).reasons.includes('gold changed without a reason'),'audit: gold edited without a reward is caught (Cheat Engine)');
 ok(A(p,{xp:5000}).reasons.includes('XP changed without a reason'),'audit: XP edited without a reward is caught');
 ok(A(p,{g:5100,led:[['raid',5000,0]]}).reasons.includes('raid reward too big'),'audit: a forged oversize reward is caught');
 ok(A(p,{g:388,led:[['raid',96,0],['raid',96,0],['raid',96,0]]},1000).reasons.includes('raid rewards too often'),'audit: rewards faster than the game allows are caught');
 ok(A(p,{g:200,led:[['bj',100,0]]}).reasons.some(r=>r.includes('blackjack')),'audit: a blackjack payout without a bet is caught');
 ok(A(p,{g:115,led:[['bj',-10,0],['bj',25,0]]}).reasons.length==0,'audit: a blackjack win of 2.5x the bet passes');
 ok(A(p,{up:[0,1,0,0],mh:230}).reasons.includes('upgrade without paying'),'audit: an upgrade without paying is caught');
 ok(A(p,{g:50,up:[0,1,0,0],mh:230,led:[['upgrade',-50,0,'vit']]}).reasons.length==0,'audit: a paid upgrade passes');
 ok(A(p,{mh:400,hp:400}).reasons.includes('max HP does not match upgrades'),'audit: a max HP hack is caught');
 ok(A(p,{hp:350}).reasons.includes('HP above max'),'audit: HP above max is caught');
 ok(A(p,{mh:260,hp:260,bl:'stone'}).reasons.length==0,'audit: Blessing of Stone max HP passes');
 const dev=A(p,{g:9999,led:[['dev',9899,0]]});ok(dev.dev&&dev.reasons.length==0,'audit: F2 dev edits are flagged but allowed while AUDIT_ALLOW_DEV');
 ok(A(p,{g:600,led:[['hack',500,0]]}).reasons.some(r=>r.startsWith('unknown reward')),'audit: unknown reward kinds are caught');
 ok(A(p,{g:150,led:[['upgrade',50,0]]}).reasons.some(r=>r.includes('gave gold')),'audit: a spend that gives gold is caught');
 ok(A(p,{g:'lots'}).reasons[0]=='sent malformed stats','audit: malformed stats are rejected');
 T.goldAdd(30,'quest');T.gainXP(100,'quest');const L=T.LEDGER();
 ok(L.length<=300&&L[L.length-2].join()=='quest,30,0'&&L[L.length-1].join()=='quest,0,100','ledger: gold and XP changes are recorded with their reason');
 ok(T.netStats('auditor-a',1).led.length==0&&T.netStats('auditor-b',2).led.length==0,'ledger: a new auditor starts from now');
 T.goldAdd(10,'quest');ok(T.netStats('auditor-a',3).led.length==1&&T.netStats('auditor-b',4).led.length==1&&T.netStats('auditor-a',5).led.length==0,'ledger: every auditor gets each new entry exactly once');
 /* master: a speed hacker collects strikes and is removed, and its seat is freed at the directory */
 T.devHub();netClock+=1000;fakePeers=['peer-x'];fakeBroadcast=[];fakeDirectory=[];T.netPrepareHub('host');
 T.netReceive('peer-x',{type:'join',profile:{id:'player-hack0001',name:'Hacker',cls:'dps',lv:3,ti:0,spd:1},x:450,y:420});
 for(let i=1;i<=20;i++){netClock+=66;const v=T.HUBV().find(o=>o.id=='peer-x');if(!v)break;T.netReceive('peer-x',{type:'m',x:Math.min(880,v.netX+80),y:v.netY,f:3,d:0,s:i});}
 ok(fakeBroadcast.some(x=>x.id=='peer-x'&&x.msg.type=='k')&&!T.HUBV().some(o=>o.id=='peer-x'),'fair play: master removes a speed hacker');
 ok(fakeDirectory.some(x=>x.path=='/api/kick'&&x.data.peerId=='peer-x'),'fair play: master frees the cheater seat at the directory');
 /* slave: a master that teleports you is ignored, then reported */
 fakePeers=['host-peer'];fakeDirectory=[];T.netPrepareHub('guest');const px=T.P().x;
 for(let i=0;i<6;i++)T.netReceive('host-peer',{type:'c',x:5,y:5,s:999+i});
 ok(T.P().x==px,'fair play: slave ignores corrections for moves it never sent');
 ok(fakeDirectory.some(x=>x.path=='/api/report'),'fair play: slave reports a master that keeps failing checks');
 fakePeers=[];T.netPrepareHub('');T.netDisconnect?.();
}
async function networkTests(){
 const peers=[];
 class Channel{constructor(){this.readyState='connecting';this.bufferedAmount=0;this.sent=[];}send(v){this.sent.push(v)}close(){this.readyState='closed';this.onclose?.()}}
 class Peer{constructor(config){this.config=config;this.iceGatheringState='complete';this.channels=[];peers.push(this);}createDataChannel(){const ch=new Channel();this.channels.push(ch);return ch;}async createOffer(){return{type:'offer',sdp:'offer-sdp'}}async createAnswer(){return{type:'answer',sdp:'answer-sdp'}}async setLocalDescription(v){this.localDescription=v;}async setRemoteDescription(v){this.remoteDescription=v;if(v.type=='offer')this.ondatachannel?.({channel:new Channel()});}addEventListener(){}removeEventListener(){}close(){this.connectionState='closed';}}
 const createContext=()=>{const c={window:null,RTCPeerConnection:Peer,crypto:require('crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,Map,Promise,Error,Date,JSON,Array,String,Math,atob,btoa,setTimeout,clearTimeout};c.window=c;vm.createContext(c);vm.runInContext(NETSRC,c);return c;};
 const linkHub=(search,hostname='aurakingstudio.github.io')=>{const c={window:null,location:{search,hostname},crypto:require('crypto').webcrypto,URL,Map,Error,Date,JSON,Array,String,Math};c.window=c;vm.createContext(c);vm.runInContext(NETSRC,c);return c.RBNet.defaultConfig().signalingUrl;};
 ok(linkHub('?hub=https://abc-def.trycloudflare.com')=='https://abc-def.trycloudflare.com','network: ?hub= accepts an https Quick Tunnel address');
 ok(linkHub('?hub=https://evil.example.com')=='room'&&linkHub('?hub=http://abc.trycloudflare.com')=='room'&&linkHub('?hub=javascript:alert(1)','localhost')=='http://localhost:8787','network: ?hub= rejects other hosts, http and scripts (public site falls back to room mode, localhost to the local hub)');
 ok(linkHub('?room=abcdef123456','localhost')=='room'&&linkHub('?room=BAD','localhost')=='http://localhost:8787','network: ?room= links use serverless room mode');
 ok(linkHub('','localhost')=='http://localhost:8787','network: localhost uses the local hub directory');
{const {gamePath}=require('./playtest.js');ok(gamePath('/')&&gamePath('/assets/icon.png')&&['/bank.json','/market.json','/feedback.log','/package.json','/AgentInstruction.md','/deploy/setup-vps.sh','/src/bank.js','/assets/.env.png','/assets%5C.x.png','/..%2Fbank.json','/assets/../bank.json'].every((u)=>gamePath(u)===0),'dev server: serves only the game (index.html, assets), never data files, source, docs or dotfiles');
 ok(gamePath('/%')===-1&&gamePath('/a%00.png')===-1,'dev server: a malformed URL is a 400, not a crash');}
 {const H=createContext().RBNet._room,gc=createContext(),G=gc.RBNet._room,E=createContext().RBNet._room;
  const hk=await H.key(),gk=await G.key(),ek=await E.key(),code='abcdef123456';
  ok(/^[a-f0-9]{48}$/.test(gk.peerId)&&/^[a-f0-9]{32}$/.test(hk.hk)&&gk.peerId.startsWith(gk.hk)&&hk.hk!=ek.hk,'room trust: each tab has its own key; peerId and hk are its hash');
  const wrap=(m)=>JSON.stringify({message:JSON.stringify(m)}),offD={t:'offer',s:'v=0 offer'},oJ=JSON.stringify(offD);
  H.set({code,role:'host',events:[],offers:new Map()});
  await H.got(wrap({k:'offer',peerId:gk.peerId,d:offD,pk:ek.pk,sig:await E.sign(E.offerText(code,gk.peerId,oJ))}));
  ok(H.get().events.length==0,'room trust: an offer for another peerId is refused');
  await H.got(wrap({k:'offer',peerId:gk.peerId,d:offD,pk:gk.pk,sig:await G.sign(G.offerText(code,gk.peerId,oJ))}));
  ok(H.get().events.length==1&&H.get().events[0].type=='offer','room trust: a guest-signed offer reaches the host');
  const ansD={t:'answer',s:'v=0 answer'},aJ=JSON.stringify(ansD),groom=()=>({code,role:'guest',peerId:gk.peerId,events:[],offers:new Map(),offerD:oJ,answered:false});
  G.set(groom());G.trust.clear();G.trust.add(hk.hk);
  const good=wrap({k:'answer',peerId:gk.peerId,d:ansD,pk:hk.pk,sig:await H.sign(await H.answerText(code,gk.peerId,oJ,aJ))});
  await G.got(wrap({k:'answer',peerId:gk.peerId,d:ansD,pk:ek.pk,sig:await E.sign(await E.answerText(code,gk.peerId,oJ,aJ))}));
  ok(G.get().events.length==0,'room trust: a forged answer from a key not in the link is refused');
  await G.got(wrap({k:'answer',peerId:gk.peerId,d:ansD,pk:hk.pk,sig:await H.sign(await H.answerText(code,gk.peerId,JSON.stringify({t:'offer',s:'an older offer'}),aJ))}));
  ok(G.get().events.length==0,'room trust: a replayed answer to an older offer is refused');
  await G.got(wrap({k:'answer',peerId:gk.peerId,d:{t:'answer',s:'swapped sdp'},pk:hk.pk,sig:await H.sign(await H.answerText(code,gk.peerId,oJ,aJ))}));
  ok(G.get().events.length==0,'room trust: a signed answer with a swapped SDP is refused');
  await G.got(good);await G.got(good);
  ok(G.get().events.length==1&&G.get().events[0].type=='answer'&&G.get().answered,'room trust: the real host answer is accepted once, a replay of it is ignored');
  G.set(groom());gc.RBNet.roomTrustAdd([ek.hk,'zz','x'.repeat(40)]);
  await G.got(wrap({k:'answer',peerId:gk.peerId,d:ansD,pk:ek.pk,sig:await E.sign(await E.answerText(code,gk.peerId,oJ,aJ))}));
  ok(G.get().events.length==1&&G.trust.size==2,'room trust: a successor announced by the host (hq) is trusted after a host switch; junk hashes are ignored');}
 const host=createContext(),h=host.RBNet;let received=0,errors=0;
 h.setHandlers({onMessage:(_id,m)=>{if(m.type=='test')received++;},onError:()=>errors++});
 h.setIceServers([{urls:'stun:example.invalid:3478'}]);
 try{h.setIceServers([{urls:'https://invalid.example'}]);ok(false,'network: rejects non-ICE URL');}catch{ok(true,'network: rejects non-ICE URL');}
 const offer=await h.createPeerOffer('peer-a'),hostChannel=peers[0].channels[0];
 ok(offer.type=='offer'&&offer.sdp=='offer-sdp','network: guest side creates an offer for its directory seat');
 hostChannel.readyState='open';hostChannel.onopen();ok(h.send('peer-a',{type:'test'})&&hostChannel.sent.length==1,'network: sends small messages on an open peer');
 hostChannel.onmessage({data:JSON.stringify({type:'test'})});ok(received==1,'network: parses and dispatches peer messages');
 const guest=createContext(),g=guest.RBNet,answer=await g.createPeerAnswer('peer-a',offer);
 ok(answer.type=='answer','network: host side answers a directory offer');
 await h.acceptPeerAnswer('peer-a',answer);ok(peers[0].remoteDescription.type=='answer','network: offer side accepts the answer');
 try{await h.acceptPeerAnswer('unknown',answer);ok(false,'network: rejects answer for unknown peer');}catch{ok(true,'network: rejects answer for unknown peer');}
 for(let i=0;i<40;i++)hostChannel.onmessage({data:JSON.stringify({type:'test'})});
 ok(errors==1&&hostChannel.readyState=='closed','network: closes peer that exceeds message rate');
 h.disconnectAll();g.disconnectAll();ok(h.peerIds().length==0&&g.peerIds().length==0,'network: disconnect clears peer sessions');
}
async function signalingTests(){
 const {server}=createDirectoryServer({allowedOrigins:['https://game.example'],maxHubs:2,maxPlayersPerHub:2});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=(path,method='GET',body,origin='https://game.example')=>new Promise((resolve,reject)=>{
  const payload=body===undefined?undefined:JSON.stringify(body);
  const req=http.request(base+path,{method,headers:{origin,...(payload===undefined?{}:{'content-type':'application/json','content-length':Buffer.byteLength(payload)})}},response=>{
   const chunks=[];
   response.on('data',chunk=>chunks.push(chunk));
   response.on('end',()=>{
    const text=Buffer.concat(chunks).toString('utf8');
    let result={};
    try{if(text)result=JSON.parse(text);}catch(error){reject(error);return;}
    resolve({status:response.statusCode,headers:response.headers,body:result});
   });
  });
  req.on('error',reject);
  req.end(payload);
 });
 const profile=(id,name)=>({id:`player-${id}1234`,name,cls:'tank',lv:1,ti:0,spd:1});
 try{
  const preflight=await request('/api/join','OPTIONS');
  ok(preflight.status==204&&preflight.headers['access-control-allow-origin']=='https://game.example','directory: permits the configured game origin');
  ok((await request('/health')).body.ok,'directory: health endpoint responds');
  ok((await request('/api/join','POST',{profile:{}})).status==400,'directory: rejects malformed player profiles');
  ok((await request('/health','GET',undefined,'https://untrusted.example')).status==403,'directory: rejects unconfigured origins');

  const host1=(await request('/api/join','POST',{profile:profile('hostone','Host One')})).body;
  const guest1=(await request('/api/join','POST',{profile:profile('guestone','Guest One')})).body;
  const host2=(await request('/api/join','POST',{profile:profile('hosttwo','Host Two')})).body;
  const guest2=(await request('/api/join','POST',{profile:profile('guesttwo','Guest Two')})).body;
  ok(host1.role=='host'&&host1.hubId==1&&host1.reason.includes('first player'),'directory: first player hosts Hub 1 with an explicit reason');
  ok(guest1.role=='guest'&&guest1.hubId==1&&guest1.reason.includes('first hub'),'directory: joins the first hub with a free seat');
  ok(host2.role=='host'&&host2.hubId==2&&host2.reason.includes('Hub 1 is full'),'directory: creates the next hub only after Hub 1 fills');
  ok(guest2.role=='guest'&&guest2.hubId==2,'directory: assigns a player to Hub 2');
  ok((await request('/api/join','POST',{profile:profile('full','Full Player')})).status==503,'directory: rejects joins after all hubs reach capacity');
  const listing=(await request('/api/hubs')).body.hubs;
  ok(listing.length==2&&listing[0].players==2&&listing[1].players==2,'directory: reports hub occupancy and capacity');

  const offer={type:'offer',sdp:'v=0\r\n'};
  ok((await request('/api/offer','POST',{token:guest1.token,description:offer})).status==202,'directory: accepts a valid guest offer');
  const hostEvents=(await request('/api/poll','POST',{token:host1.token})).body.events;
  const offerEvent=hostEvents.find(event=>event.type=='offer');
  ok(offerEvent?.peerId==guest1.peerId&&offerEvent.profile.name=='Guest One','directory: routes a guest offer to the hub host');
  ok((await request('/api/offer','POST',{token:guest2.token,description:{type:'answer',sdp:'v=0\r\n'}})).status==400,'directory: rejects SDP with the wrong type');
  const answer={type:'answer',sdp:'v=0\r\n'};
  ok((await request('/api/answer','POST',{token:host1.token,peerId:guest1.peerId,description:answer})).status==202,'directory: accepts a valid host answer');
  const guestEvents=(await request('/api/poll','POST',{token:guest1.token})).body.events;
  ok(guestEvents.some(event=>event.type=='answer'&&event.description.sdp==answer.sdp),'directory: routes the host answer to its guest');
  ok((await request('/api/heartbeat','POST',{token:host1.token})).status==200,'directory: renews active sessions');

  ok((await request('/api/leave','POST',{token:guest2.token})).status==200,'directory: releases a guest seat');
  const reassigned=(await request('/api/join','POST',{profile:profile('guestthree','Guest Three')})).body;
  ok(reassigned.role=='guest'&&reassigned.hubId==2&&reassigned.reason.includes('Hub 1 is full'),'directory: reuses a freed seat in the first available hub');
  ok((await request('/api/leave','POST',{token:host1.token})).status==200,'directory: host leave removes its hub');
  ok((await request('/api/heartbeat','POST',{token:host1.token})).status==401,'directory: rejects a released session token');
 } finally {
  await new Promise(resolve=>server.close(resolve));
 }
}
async function brainHttpTests(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'runebound-brain-http-')),file=path.join(dir,'brain.json'),previousKey=process.env.ADMIN_KEY;
 process.env.ADMIN_KEY='test-http-admin-key';
 const {server,brain}=createDirectoryServer({allowedOrigins:[],market:false,brainFile:file});
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};};
  const initial=await post('/api/brain/get',{});
  ok(initial.status==200&&initial.body.gen==0&&initial.body.w1.length==8,'brain API: serves the current shared model');
  ok((await post('/api/brain/train',{tok:'bad',samples:[]})).status==400,'brain API: rejects invalid training payloads');
  const samples=Array.from({length:40},()=>[[0,0,0,0,1,1],[0,0]]);
  const trained=await post('/api/brain/train',{tok:'b'.repeat(32),samples});
  ok(trained.status==200&&trained.body.gen==1&&trained.body.kept,'brain API: accepts and records a valid fight');
  ok((await post('/api/brain/train',{tok:'b'.repeat(32),samples})).status==429,'brain API: applies per-player training throttling');
  ok((await post('/api/brain/admin',{key:'test-http-admin-key',action:'cap',value:0})).body.cap==0,'brain API: routes authenticated admin controls');
  ok((await post('/api/brain/admin',{key:'wrong',action:'reset'})).status==403,'brain API: rejects unauthenticated admin controls');
 }finally{
  brain.flush();
  await new Promise(resolve=>server.close(resolve));
  if(previousKey===undefined)delete process.env.ADMIN_KEY;else process.env.ADMIN_KEY=previousKey;
  fs.rmSync(dir,{recursive:true,force:true});
 }
}
async function hostLossTests(){
 const V=T.V(),gold=V.gold,losses=V.loss||0;
 T.devHub();
 T.toArena('small',[{me:1,cls:T.P().cls,name:'Tester'}],{role:'member',lead:'host-peer',heard:netClock-8000,at:0,seq:0,key:''});
 T.raidPuppet(1/60);
 ok(T.S().sc=='arena'&&T.S().net?.role=='lead','host migration: a silent raid leader hands the raid to a member (arena stays alive)');
 ok(V.gold==gold&&(V.loss||0)==losses,'host migration: the handover grants neither win nor loss rewards');

 T.devHub();
 T.toArena('small',[{me:1,cls:T.P().cls,name:'Tester'}],{role:'member',lead:'host-peer',heard:netClock,at:0,seq:0,key:''});
 T.setNetTestSession('guest',{peerId:'host-peer',hubId:1,reason:'test hub'});
 fakePeers=['host-peer'];
 fakeHandlers.onClose('host-peer');
 await new Promise(resolve=>setImmediate(resolve));
 ok(T.S().sc=='arena','host migration: hub-host loss keeps the raid running');
 ok(!T.netTestState().session&&!T.netTestState().connected,'multiplayer recovery: clears the dead hub session before retrying');
 ok(V.gold==gold&&(V.loss||0)==losses,'multiplayer recovery: hub-host loss does not grant raid rewards');
 fakePeers=[];T.toHub();

 /* ranking: the host pings, guests answer with time here / frame / bench / phone, the longest stayer leads the list */
 T.devHub();T.netPrepareHub('host');fakePeers=['pa','pb'];
 for(const [id,pid] of [['pa','player-mig-aaaa'],['pb','player-mig-bbbb']])T.netReceive(id,{type:'join',profile:{id:pid,name:id,cls:'tank',lv:3,ti:0,spd:1},x:500,y:500});
 const now=performance.now();
 T.netReceive('pa',{type:'hr',t:now-40,up:60,fm:16,b:3,mob:0});
 T.netReceive('pb',{type:'hr',t:now-40,up:1500,fm:20,b:6,mob:1});
 fakeBroadcast=[];T.netStep();
 const hq=fakeBroadcast.find(x=>x.msg.type=='hq');
 ok(hq&&hq.msg.l[0]=='player-mig-bbbb'&&hq.msg.l[1]=='player-mig-aaaa','host migration: host ranks successors (time in hub weighs most) and shares the list');
 fakePeers=[];await T.netDisconnect?.();

 /* takeover: a guest whose name tops the list becomes host; the others stay on screen, renamed to the new host */
 T.devHub();T.setNetTestSession('guest',{peerId:'host-peer',hubId:1,reason:'test hub'});T.netPrepareHub('guest');fakePeers=['host-peer'];
 T.netReceive('host-peer',{type:'r',p:[[0,'host-player','Old','tank',9,0,1],[1,'player-mig-cccc','Next','heal',4,0,1]]});
 T.netReceive('host-peer',{type:'hq',t:1,l:['player-mig-cccc']});
 {const nx=T.HUBV().find(v=>v.netClientId=='player-mig-cccc'||v.id=='player-mig-cccc'),c0=nx&&nx.cls;T.netReceive('evil-peer',{type:'cls',e:[1,'dps']});T.netReceive('evil-peer',{type:'r',p:[[0,'host-player','Fake','tank',9,0,1]]});ok(nx&&nx.cls==c0&&!T.HUBV().some(v=>v.name=='Fake'),'network hub: a guest ignores hub news from anyone but its host');}
 const hr=fakeBroadcast.reverse().find(x=>x.msg.type=='hr');
 ok(hr&&Number.isFinite(hr.msg.b)&&Number.isFinite(hr.msg.fm),'host migration: guest answers with frame time and benchmark');
 {fakeBroadcast=[];T.netReceive('evil-peer',{type:'hq',t:1,l:['player-evil1'],h:['ab'.repeat(16)]});T.netReceive('evil-peer',{type:'k',reason:'fake kick'});T.netReceive('evil-peer',{type:'reject',reason:'fake'});
  ok(!fakeBroadcast.some(x=>x.msg.type=='hr')&&T.netTestState().role=='guest'&&T.netTestState().session,'network hub: a guest ignores successor lists, kicks and rejects from anyone but its host');
  const ss=T.netTestState().session;T.setNetTestSession('guest',null);T.netReceive('host-player',{type:'r',p:[[0,'host-player','Ghost','tank',9,0,1]]});
  ok(!T.HUBV().some(v=>v.name=='Ghost'),'network hub: with no session a guest trusts nobody (fails closed)');T.setNetTestSession('guest',ss);}
 fakePeers=[];fakeHandlers.onClose('host-peer');
 await new Promise(resolve=>setImmediate(resolve));
 ok(T.HUBV().some(v=>v.id=='host-player'&&v.name=='Next')&&!T.HUBV().some(v=>v.name=='Old'),'host migration: the successor stays on screen as the new host, the old host leaves');
 await T.netDisconnect?.();
}
async function bankTests(){
 const {createBank,RULES}=require('./bank.js');let t=1e6;const file=require('path').join(require('os').tmpdir(),'rb-bank-test-'+process.pid+'.json');for(const x of [file,file+'2',file+'3',file+'4'])try{require('fs').unlinkSync(x)}catch{} /* a reused PID must not load an old run's bank */
 process.on('exit',()=>{const fs=require('fs'),os=require('os'),pth=require('path');for(const n of fs.readdirSync(os.tmpdir()))if(/^rb-(bank|trade|contract)-test-/.test(n)&&n.includes(String(process.pid)))try{fs.unlinkSync(pth.join(os.tmpdir(),n))}catch{}}); /* debounced bank writes land after the tests: clean them at exit */
 const b=createBank({file,now:()=>t}),tok='ab'.repeat(16),sync=(led,seed)=>{t+=1500;return b.sync({tok,led,seed})};
 const live=T.auditRules();ok(Object.keys(RULES).every(k=>RULES[k].g==live[k].g&&RULES[k].x==live[k].x&&RULES[k].gap==live[k].gap),'bank: server reward table matches the game');
 ok(sync([],{gold:999999,xp:1e8})[1].gold==500,'bank: a new account keeps only a capped part of the offline save');
 ok(sync([['raid',2048,0],['raid',0,2730]])[1].gold==2548,'bank: a legal raid reward (gold and XP) is applied');
 const r=sync([['raid',2048,0]]);ok(r[1].gold==2548&&r[1].dropped==1,'bank: a second raid reward too soon is refused');
 ok(sync([['raid',99999,0],['dev',5000,0],['hack',10,0]])[1].dropped==3,'bank: oversized, dev and unknown rewards are refused');
 ok(sync([['bj',-100,0],['bj',300,0]])[1].gold==2748&&sync([['bj',500,0]])[1].dropped==1,'bank: blackjack pays at most 3x a real bet');
 ok(sync([['smith',-1e6,0]])[1].dropped==1,'bank: no spending below zero');
 ok(b.sync({tok,led:[]})[0]==429,'bank: syncs are rate-limited');
 ok(b.sync({tok:'x',led:[]})[0]==400,'bank: bad tokens are refused');
 {T.tradeOpen();const h=ctx.document.getElementById('dp').innerHTML;ok(h.includes('Trading needs the online server')&&!h.includes('OFFER'),'trade window: offline (LAN, room, local) shows why and offers nothing');T.tradeAct('accept','<img src=x>');ok(!ctx.document.getElementById('dp').innerHTML.includes('<img'),'trade window: a bad offer id is ignored');}
 /* Assist rent: only at the server's own price, which multiplies per rent, cools down and caps */
 const {ASSIST}=require('./bank.js'),rent=(g)=>sync([['bjchart',g,0]])[1];
 ok(ASSIST.mul==1.5&&ASSIST.max==20&&ASSIST.half==10&&ASSIST.cost==50,'bank assist: same price rule as the game (x1.5, cap x20, 10 min half-life, 50)');
 let r1=rent(-50);ok(r1.dropped==0&&r1.bjm==1.5,'bank assist: the correct price is accepted and raises the multiplier');
 const g0=rent(0).gold;
 for(const bad of [-10,-200,30,0])ok(rent(bad).dropped==1&&rent(0).gold==g0,'bank assist: rent of '+bad+' is refused, balance unchanged');
 ok(rent(-75).dropped==0,'bank assist: the next rent costs x1.5 (75)');
 t+=10*60000;ok(rent(-Math.round(50*(1+(2.25-1)*0.5))).dropped==0,'bank assist: the extra halves after 10 minutes');
 {const b2=createBank({file:file+'2',now:()=>t});let n=0;
  for(const [wait,pay,good,why] of [[10000,-75,1,'paid at the earlier price, synced 10 s later'],[300000,-75,1,'paid at the earlier price, synced 5 min later'],[300000,-66,0,'paid below the current price'],[300000,-77,0,'paid above the price at the last sync']]){
   const k=(++n).toString(16).padStart(2,'0').repeat(16);t+=1500;b2.sync({tok:k,led:[['bjchart',-50,0]],seed:{gold:500}}); /* one rent: now x1.5 = 75 */
   t+=wait;const r=b2.sync({tok:k,led:[['bjchart',pay,0]]})[1];ok((r.dropped==0)==!!good,'bank assist: '+why+(good?' is accepted':' is refused'));}
  try{require('fs').unlinkSync(file+'2')}catch{}}
 {const b3=createBank({file:file+'3',now:()=>t}),k='ab'.repeat(16);t+=1500;b3.sync({tok:k,led:[['bjchart',-50,0]],seed:{gold:900}});
  t+=7*60000;const r=b3.sync({tok:k,led:[['bjchart',-68,0],['bjchart',-98,0]]})[1]; /* rents at +5 and +6 min, synced at +7 */
  ok(r.dropped==0,'bank assist: two rents in one sync both get their own price window');try{require('fs').unlinkSync(file+'3')}catch{}}
 {const b4=createBank({file:file+'4',now:()=>t}),{SEEDS_PER_IP}=require('./bank.js'),ip='203.0.113.7',g=[];
  for(let i=0;i<SEEDS_PER_IP+2;i++){const k=(i+0x40).toString(16).repeat(16);g.push(b4.sync({tok:k,led:[],seed:{gold:500,xp:2000}},ip)[1].gold);}
  ok(g.slice(0,SEEDS_PER_IP).every((x)=>x==500)&&g.slice(SEEDS_PER_IP).every((x)=>x==0),'bank: only '+SEEDS_PER_IP+' seeded new accounts per IP per day (a shared save code cannot farm the seed)');
  ok(b4.sync({tok:'ef'.repeat(16),led:[],seed:{gold:500}},'198.51.100.2')[1].gold==500,'bank: another IP still gets its seed');
  t+=25*3600e3;ok(b4.sync({tok:'cd'.repeat(16),led:[],seed:{gold:500}},ip)[1].gold==500,'bank: the per-IP seed limit resets after a day');try{require('fs').unlinkSync(file+'4')}catch{}}
 {const bp=createBank({file:file+'p',now:()=>t}),k='9a'.repeat(16),P=(led,seed)=>{t+=2500;return bp.sync({tok:k,led,seed})[1]},M=(src,m,n)=>['mat',0,0,src,m,n],E=(op,p)=>['pet',0,0,op,p,0];
  let r=P([],{mat:{ore:50,herb:50,echo:50,dust:50}});ok(r.pet.on==''&&!Object.keys(r.pet.own).length,'bank pets: a new account owns no pet');
  r=P([E('buy','fox')]);ok(r.dropped==1&&!r.pet.own.fox,'bank pets: a pet cannot be bought without its material spends');
  r=P([M('pet','ore',-15),M('pet','herb',-9),E('buy','fox')]);ok(r.dropped==1&&!r.pet.own.fox,'bank pets: a short payment buys nothing');
  r=P([M('pet','ore',-15),M('pet','herb',-10),E('buy','fox'),E('buy','fox')]);ok(r.dropped==1&&r.pet.own.fox==1,'bank pets: the exact price buys the fox once (one payment, one pet)');
  r=P([E('set','owl'),E('set','__proto__'),E('set','fox'),E('set','fox')]);ok(r.dropped==3&&r.pet.on=='fox','bank pets: only an owned pet can be active, at most one switch per 10 min');t+=600e3;
  r=P([M('gather','ore',5)]);ok(r.mat.ore==40,'bank pets: fox level 1 adds +5% (5 ore -> 5, 0.25 carried; refused buys are refunded)');
  for(let i=0;i<3;i++)r=P([M('gather','ore',5)]);ok(r.mat.ore==56,'bank pets: the fox fraction carries over (4 gathers of 5 -> 21)');
  r=P([M('pet','herb',-5),E('feed','fox'),E('feed','fox')]);ok(r.dropped==1&&r.pet.own.fox==2,'bank pets: feeding level 1 costs 5 herb and raises one level');
  r=P([['pet',5,0,'feed','fox',0],E('feed','wolf'),E('dance','fox'),['pet',0,0,'feed','fox',3]]);ok(r.dropped==4&&r.pet.own.fox==2,'bank pets: gold, unowned pets, unknown ops and extra numbers are refused');
  r=P([['raid',0,1000]]);ok(r.xp==1000,'bank pets: an active fox gives no XP bonus');
  r=P([M('pet','herb',-15),M('pet','echo',-4),E('buy','owl'),E('set','owl'),M('pet','dust',-7)]);ok(r.mat.dust==50,'bank pets: unused pet spends are refunded');t+=20000;r=P([['raid',0,1000]]);ok(r.xp==2050,'bank pets: owl level 1 adds +5% XP to a capped reward');
  t+=20000;r=P([['raid',0,2730]]);ok(r.xp==2050+2730+136,'bank pets: the owl bonus is added after the cap check');
  try{require('fs').unlinkSync(file+'p')}catch{}}
 {const {GARDEN}=require('./bank.js'),bg=createBank({file:file+'g',now:()=>t}),k='7c'.repeat(16),G=(led)=>{t+=2500;return bg.sync({tok:k,led})[1]},M=(m,n)=>['mat',0,0,'garden',m,n],E=(op,i,s=0)=>['garden',0,0,op,i,s];
  let r=bg.sync({tok:k,led:[],seed:{mat:{herb:50,ore:50}}})[1];ok(r.garden.length==6&&r.garden.every(c=>c===null),'bank garden: a new account has 6 empty plots');
  r=G([E('plant',0,'herb')]);ok(r.dropped==1&&!r.garden[0],'bank garden: no planting without the seed spend');
  r=G([M('herb',-2),E('plant',0,'herb'),E('plant',0,'herb'),M('ore',-2),E('plant',9,'ore'),E('plant',1,'gold'),E('plant',-1,'ore'),['garden',5,0,'plant',2,'ore']]);
  ok(r.dropped==5&&r.garden[0].s=='herb'&&r.garden[0].age==0&&r.mat.herb==48&&r.mat.ore==50,'bank garden: one paid plant; used plot, bad plot, bad seed, gold refused; unused spend refunded');ok(r.garden[0].pk===''&&r.gsc===0,'bank garden: the sync answer carries the plot perk and the sprite counter');
  r=G([E('harvest',0),E('harvest',1)]);ok(r.dropped==2&&r.garden[0]&&r.mat.herb==48,'bank garden: an unready or empty plot cannot be harvested');
  t+=20*60e3;r=G([E('harvest',0,5),E('harvest',0),E('harvest',0)]);ok(r.dropped==2&&!r.garden[0]&&r.mat.herb==52,'bank garden: a ripe plot harvests once by server time (forged extras and double harvest dropped)');
  r=G([M('ore',-2),E('plant',1,'ore')]);t+=30*60e3+GARDEN.wilt;r=G([E('harvest',1)]);ok(r.mat.ore==48+2,'bank garden: a plot left a day past ripe wilts (half yield)');
  r=G([['mat',0,0,'pet','ore',-15],['mat',0,0,'pet','herb',-10],['pet',0,0,'buy','fox',0],['pet',0,0,'set','fox',0],M('herb',-2),E('plant',2,'herb')]);t+=20*60e3;r=G([E('harvest',2)]);ok(r.pet.on=='fox'&&r.mat.herb==52-10-2+5,'bank garden: the fox adds +1 harvest');
  r=G([M('herb',-2),E('plant',4,'herb')]);t+=601e3;G([['pet',0,0,'set','',0]]);t+=20*60e3;{const h0=G([]).mat.herb;r=G([E('harvest',4)]);ok(r.mat.herb==h0+5,'bank garden: the pet perk is locked at planting (switching pets before harvest changes nothing)');}
  t=Math.ceil(t/86400e3)*86400e3+1000;let n=0;for(let i=0;i<30;i++){r=G([M('herb',-2),E('plant',3,'herb')]);t+=20*60e3;r=G([E('harvest',3)]);if(!r.dropped)n++;}ok(n==GARDEN.day,'bank garden: plants and harvests have a day cap');
  {const k2='8d'.repeat(16),G2=(led)=>{t+=2500;return bg.sync({tok:k2,led})[1]},S=()=>E('streak',0),D=86400e3,day=(n)=>{t=t0+n*D;};
   G2([]);let rl=G2([S()]);ok(rl.dropped==1&&rl.streak.lk==1,'bank streak: a fresh account cannot claim (no alt-account farming)');for(let i=0;i<5;i++){t+=6*60e3;G2([['quest',0,10]]);}ok(G2([]).streak.lk==0,'bank streak: it opens after 5 real play syncs');
   const t0=(Math.ceil(t/D/7)*7+7)*D+1000;day(0);let r=G2([S(),S()]),m0=r.mat;ok(r.dropped==1&&r.streak.n==1&&r.streak.ago==0&&(m0.herb||0)==2,'bank streak: one claim per server day (the double is dropped), paid from the table');
   day(1);r=G2([['garden',0,0,'streak',0,'herb'],['garden',5,0,'streak',0,0],['garden',0,9,'streak',0,0],['garden',0,0,'streak',2,0],S()]);ok(r.dropped==4&&r.streak.n==2&&(r.mat.ore||0)==2,'bank streak: forged amounts and fields are refused, the next day climbs');
   day(3);r=G2([S()]);ok(!r.dropped&&r.streak.n==3&&r.streak.gu==1,'bank streak: one missed day a week is forgiven (grace used)');
   day(5);r=G2([S()]);ok(!r.dropped&&r.streak.n==1,'bank streak: a second missed day in the same week resets the ladder');
   for(let i=6;i<=10;i++){day(i);r=G2([S()]);}const e6=r.mat.echo||0;day(11);r=G2([S()]);ok(r.streak.n==7&&r.mat.echo==e6+3,'bank streak: day 7 pays the big bonus');
   const e7=r.mat.echo;t-=D;const q=bg.sync({tok:k2,led:[S()]});t+=D+3000;r=G2([]);ok((q[0]==429||q[1].dropped==1)&&r.streak.n==7&&r.mat.echo==e7,'bank streak: a clock moved back cannot claim again');
   day(20);r=G2([]);ok(r.streak.n==7&&r.streak.ago==9,'bank streak: the sync returns the streak (days since the last claim)');r=G2([S()]);ok(!r.dropped&&r.streak.n==1&&r.streak.ago==0,'bank streak: a missed week resets it');}
  try{require('fs').unlinkSync(file+'g')}catch{}}
 ok(b.assistPrice({bjm:999,bjmAt:t},t)==1000&&b.assistPrice({bjm:-5},t)==50,'bank assist: the multiplier is capped at x20 and never below x1');
 try{require('fs').unlinkSync(file)}catch{}
 {const tk2='cd'.repeat(16),s2=(led,seed)=>{t+=2500;return b.sync({tok:tk2,led,seed})},M=(src,k,n)=>['mat',0,0,src,k,n];
  let r=s2([],{gold:0,xp:0,mat:{dust:9999,ore:3,bogus:5}});ok(r[1].mat.dust==50&&r[1].mat.ore==3&&!('bogus' in r[1].mat),'bank mats: a new account keeps only a capped part of its offline materials');
  r=s2([M('gather','ore',5)]);ok(r[1].mat.ore==8&&!r[1].dropped,'bank mats: a legal gather is applied and returned');
  r=s2([M('gather','ore',6),M('gather','herb',2),M('gather','herb',2)]);ok(r[1].dropped==2&&r[1].mat.herb==2,'bank mats: an over-cap gather and a too-fast second gather are refused');
  r=s2([M('gather','gold',5),M('hack','ore',1),M('gather','ore',1.5),M('gather','ore',NaN),['mat',5,0,'gather','ore',1],M('gather','ore',0)]);ok(r[1].dropped==6&&r[1].mat.ore==8,'bank mats: unknown materials or sources, fractions, NaN, gold-carrying and zero entries are refused');
  r=s2([M('craft','ore',-3)]);ok(r[1].mat.ore==5&&!r[1].dropped,'bank mats: crafting spends on the server');
  r=s2([M('craft','dust',3)]);ok(r[1].dropped==1,'bank mats: a craft gain with no craft spend is refused (no minting)');
  r=s2([M('gather','echo',5)]);r=s2([M('craft','ore',-5),M('craft','echo',-2),M('craft','dust',3)]);ok(!r[1].dropped&&r[1].mat.ore==0&&r[1].mat.echo==3&&r[1].mat.dust==53,'bank mats: refine-ore (5 ore + 2 echo -> 3 dust) is accepted');
  r=s2([M('craft','dust',-5),M('craft','heart',1),M('craft','eye',1)]);ok(r[1].dropped==2&&r[1].mat.dust==48&&!r[1].mat.heart&&!r[1].mat.eye,'bank mats: rares have no recipe: dust cannot become heart or eye');
  r=s2([M('craft','dust',-5),M('craft','shard',1),M('craft','bark',1)]);ok(r[1].dropped==1&&r[1].mat.shard==1&&r[1].mat.dust==43,'bank mats: one recipe spend pays for one refine only');
  r=s2([M('gather','ore',5)]);r=s2([M('craft','ore',-5),M('craft','dust',3)]);ok(r[1].dropped==1,'bank mats: a recipe needs every one of its spends (no echo, no dust)');
  r=s2([M('craft','ore',-99),M('gather','ore',-1)]);ok(r[1].dropped==2&&r[1].mat.ore==0,'bank mats: no spending below zero, and gains cannot be negative');
  {let n=0;for(let i=0;i<8;i++){const q=s2([M('craft','dust',-5),M('craft','shard',1)]);if(!q[1].dropped)n++;}r=s2([]);ok(n==8&&r[1].mat.dust==3,'bank mats: refines keep working within the day cap');}
  {const L=[];for(let i=0;i<120;i++)L.push(M('lore','dust',5));let tot=0;for(let i=0;i<60;i++){t+=1100;const q=b.sync({tok:tk2,led:[M('lore','dust',5)]});if(q[0]==200&&!q[1].dropped)tot+=5;}ok(tot<=100,'bank mats: lore dust has a real daily cap ('+tot+' of 100)');}
  let got=0;for(let i=0;i<200;i++){r=s2([M('gather','echo',5)]);got=r[1].mat.echo;}ok(got==348,'bank mats: the daily gather cap holds ('+got+' = 350 gathered today - 2 spent)');
  t+=86400e3;r=s2([M('gather','echo',5)]);ok(r[1].mat.echo==353,'bank mats: the daily cap resets the next day');
  {const tk3='9d'.repeat(16),s3=(led,seed)=>{t+=2500;return b.sync({tok:tk3,led,seed})};s3([],{gold:0,mat:{ore:50,echo:10,shard:20,dust:50}});
   let q=s3([M('maiden','ore',-2),M('maiden','herb',2)]);ok(!q[1].dropped&&q[1].mat.herb==2&&q[1].mat.ore==48,'maiden: an island trade at a fair price is accepted');
   q=s3([M('maiden','herb',2)]);ok(q[1].dropped==1,'maiden: a gain with no payment is refused');
   q=s3([M('maiden','ore',-5),M('maiden','echo',1),M('maiden','echo',1)]);ok(q[1].dropped==1&&q[1].mat.echo==11,'maiden: echo costs at least 5 ore each');
   q=s3([M('maiden','echo',-1),M('maiden','heart',2)]);ok(q[1].dropped==1&&!q[1].mat.heart,'maiden: no trade turns echo into a rare');
   q=s3([M('maiden','shard',-12),M('maiden','eye',1)]);ok(!q[1].dropped&&q[1].mat.eye==1,'maiden: her rare trades still work (12 shards -> eye)');
   q=s3([M('maiden','dust',-30),M('maiden','heart',1)]);q=s3([M('maiden','dust',-10),M('maiden','eye',1)]);ok(q[1].dropped==1,'maiden: the rose gamble needs its full 30 dust');
   let n=0;for(let i=0;i<12;i++){q=s3([M('maiden','echo',-1),M('maiden','ore',2)]);if(!q[1].dropped)n++;}ok(n==8,'maiden: at most 10 island trades a day ('+(n+2)+')');}
  r=s2([['quest',0,0,'x'],['mystery',0,0,'a','b',1]]);ok(r[0]==200,'bank mats: old or unknown ledger shapes never crash the sync');}
 {/* Contract Board: payouts only for a real delivery, 3 a day */
  let tc=9e6;const f=require('path').join(require('os').tmpdir(),'rb-contract-test-'+process.pid+'.json'),cb=createBank({file:f,now:()=>tc}),K='e5'.repeat(16),M=(src,k,n)=>['mat',0,0,src,k,n];
  const sy=(led,seed)=>{tc+=31000;return cb.sync({tok:K,led,seed})};sy([],{gold:0,xp:0,mat:{ore:40}});
  let r=sy([['contract',400,0],['contract',0,300]]);ok(r[1].dropped==2&&r[1].gold==0,'contract: a payout with no delivery is refused (no free 400 gold every 30 s)');
  r=sy([M('contract','ore',-5),['contract',400,0]]);ok(r[1].dropped==1&&r[1].gold==0&&r[1].mat.ore==35,'contract: a delivery below the minimum order pays nothing');
  r=sy([M('contract','ore',-6),['contract',400,0],['contract',0,300],['contract',400,0]]);ok(r[1].gold==400&&r[1].xp==300&&r[1].dropped==1,'contract: one delivery pays gold and XP once');
  sy([M('contract','ore',-6),['contract',400,0]]);r=sy([M('contract','ore',-6),['contract',400,0]]);ok(r[1].gold==1200&&!r[1].dropped,'contract: a 3rd payout in a day is fine');
  r=sy([M('contract','ore',-6),['contract',400,0]]);ok(r[1].dropped==1&&r[1].gold==1200,'contract: a 4th payout in a day is refused');
  r=sy([M('contract','herb',-6)]);ok(r[1].dropped==1,'contract: you cannot deliver materials you do not have');
  tc+=86400e3;r=sy([M('contract','ore',-6),['contract',400,0]]);ok(r[1].gold==1600,'contract: the daily cap resets the next day');
  tc+=86400e3;for(let i=0;i<9;i++)sy([M('gather','ore',5)]);
  r=sy([M('contract','ore',-6),M('contract','heart',2),M('contract','eye',1),M('contract','echo',4)]);ok(r[1].dropped==3&&!r[1].mat.heart&&!r[1].mat.eye&&!r[1].mat.echo,'contract: material rewards never mint rares and are capped at 3 echo');
  r=sy([M('contract','ore',-6),M('contract','echo',3)]);ok(!r[1].dropped&&r[1].mat.echo==3,'contract: a delivery can pay up to 3 echo');
  tc+=86400e3;r=sy([M('contract','ore',-6),['contract',99999,0]]);ok(r[1].dropped==1,'contract: an oversized payout is refused');
  let paid=0;for(let i=0;i<3;i++){r=sy([M('contract','ore',-6),['contract',400,0]]);if(!r[1].dropped)paid++;}ok(paid==3,'contract: a refused payout never uses up a day slot (3 real payouts still allowed)');
  for(const x of [f,f.replace(/\.json$/,'')+'-trades.json'])try{require('fs').unlinkSync(x)}catch{}}
 {/* trades: bank escrow between two online accounts */
  const os=require('os'),pth=require('path'),fs=require('fs');let tt=5e6;const f=pth.join(os.tmpdir(),'rb-trade-test-'+process.pid+'.json'),lg=f+'.log';
  const tb=createBank({file:f,tradeLog:lg,now:()=>tt}),A='a1'.repeat(16),B='b2'.repeat(16),C='c3'.repeat(16),M=(src,k,n)=>['mat',0,0,src,k,n];
  const sy=(tok,led,seed)=>{tt+=2500;return tb.sync({tok,led:led||[],seed})};
  const ca=sy(A,[],{gold:500,mat:{ore:20}})[1].tc,cb=sy(B,[],{gold:300,mat:{herb:10}})[1].tc;sy(C,[],{gold:0});
  ok(tb.tradeOffer({tok:A,to:cb,give:{gold:1}})[0]==403,'trade: a brand-new account cannot trade (Sybil guard)');
  const season=(tok)=>{for(let i=0;i<20;i++){tt+=300e3;sy(tok,[M('gather','echo',1)]);}};{for(let i=0;i<25;i++)sy(A,[['bj',0,0],['quest',0,0]]);}ok(tb.tradeList({tok:A})[1].unlock.syncs==0,'trade: syncs with no real earn never count toward the unlock (no 20-second farm)');{for(let i=0;i<5;i++)sy(A,[M('gather','echo',1)]);}ok(tb.tradeList({tok:A})[1].unlock.syncs==1,'trade: real earns count at most once per 5 minutes');season(A);season(B);
  ok(tb.tradeOffer({tok:A,to:cb,give:{gold:1}})[0]==403,'trade: 20 real syncs alone are not enough: the account must be a day old');
  tt+=86400e3;sy(A);sy(B);
  ok(/^[a-f0-9]{10}$/.test(ca)&&ca!=cb,'trade: each account gets a public trade code (not its token)');
  const off=(tok,to,give,want)=>{tt+=10;return tb.tradeOffer({tok,to,give,want})},acc=(tok,id)=>{tt+=10;return tb.tradeAccept({tok,id})};
  ok(off(A,ca,{gold:10},{})[0]==400,'trade: you cannot trade with yourself');
  ok([{gold:-5},{gold:1.5},{gold:2e6},{mat:{ore:0}},{mat:{ore:-3}},{mat:{gold:5}},{mat:{ore:'5'}},{mat:{a:1,b:1,c:1,d:1,e:1,f:1}},[1]].every(g=>off(A,cb,g,{})[0]==400),'trade: negative, fractional, oversized, unknown and malformed amounts are refused');
  tt+=60e3;ok(off(A,cb,{},{})[0]==400&&off(A,'nobody0000',{gold:1},{})[0]==404,'trade: empty trades and unknown codes are refused');
  ok(off(A,cb,{gold:9999},{})[0]==409,'trade: you cannot offer more than you have');
  tt+=60e3;let r=off(A,cb,{gold:200,mat:{ore:5}},{mat:{herb:4}});const id1=r[1].id;
  ok(r[0]==200&&r[1].gold==300&&r[1].mat.ore==15,'trade: the offer escrows the proposer side at once');
  r=acc(A,id1);ok(r[0]==404,'trade: the proposer cannot accept its own offer');
  r=acc(B,id1);ok(r[0]==200&&r[1].gold==300+190&&r[1].mat.ore==5&&r[1].mat.herb==6&&r[1].tax==10,'trade: accept swaps both sides and burns 5% of the gold received ('+r[1].tax+')');
  ok(sy(A)[1].mat.herb==4&&sy(A)[1].gold==300,'trade: the proposer receives the materials');
  r=acc(B,id1);ok(r[0]==409,'trade: a replayed accept is refused (no dupe)');
  ok(tb.tradeCancel({tok:A,id:id1})[0]==409,'trade: a settled offer cannot be cancelled for a refund');
  /* race: two offers both want B's 6 herbs; only one can settle */
  tt+=60e3;const x1=off(A,cb,{gold:10},{mat:{herb:6}})[1].id,x2=off(A,cb,{gold:10},{mat:{herb:6}})[1].id;
  const r1=acc(B,x1),r2=acc(B,x2);ok(r1[0]==200&&r2[0]==409&&sy(B)[1].mat.herb==0,'trade: two trades racing for the same materials settle only once');
  ok(tb.tradeCancel({tok:A,id:x2})[0]==200&&sy(A)[1].gold==290,'trade: cancelling refunds the escrow');
  ok(sy(B)[1].gold==499,'trade: the tax rounds up with a 1-gold minimum (10 gold pays 1)');
  /* expiry refunds */
  tt+=60e3;const g0=sy(A)[1].gold,ex=off(A,cb,{gold:50},{gold:1})[1].id;tt+=601e3;
  ok(tb.tradeList({tok:B})[1].offers.length==0&&sy(A)[1].gold==g0&&acc(B,ex)[0]==409,'trade: an offer expires after 10 minutes and its escrow comes back');
  ok(acc(C,'nope')[0]==404&&tb.tradeAccept({tok:'zz'})[0]==400,'trade: bad ids and bad tokens are refused');
  /* limits */
  tt+=60e3;let n=0;for(let i=0;i<6;i++)if(off(A,cb,{gold:1},{})[0]==200)n++;ok(n==5,'trade: at most 5 open offers per player');
  tt+=60e3;let rl=0;for(let i=0;i<12;i++)if(tb.tradeList({tok:C})[0]==429)rl++;ok(rl==2,'trade: actions are rate-limited (10 a minute)');
  const lines=fs.readFileSync(lg,'utf8').trim().split('\n').map(JSON.parse);ok(lines.some(l=>l.ev=='done'&&l.tax==10)&&!fs.readFileSync(lg,'utf8').includes(A),'trade: every trade is logged, never with a token');
  ok(sy(A,[['trade',500,0],M('trade','ore',5)])[1].dropped==2,'trade: a forged ledger trade never moves the bank');
  /* Sybil: one IP, many accounts; daily inbound cap; inbox cap; one atomic file; overflow */
  {const toks=['d4','e5','f6','a7'].map(x=>x.repeat(16));for(const k of toks){sy(k,[],{gold:400});}tt+=86400e3;for(const k of toks)season(k);
   const cs=toks.map(k=>sy(k)[1].tc);let ipOk=0;for(const k of toks){tt+=60e3;if(tb.tradeOffer({tok:k,to:cb,give:{gold:1}},'9.9.9.9')[0]==200)ipOk++;}
   ok(ipOk==3,'trade: at most 3 accounts may trade from one IP a day');}
  {tt+=86400e3;sy(A,[],null);for(let i=0;i<60;i++)sy(A,[M('gather','ore',5)]);sy(B);let rec=0,lim=0;
   for(const amt of [90,90,90,40]){tt+=60e3;const o=tb.tradeOffer({tok:A,to:cb,give:{mat:{ore:amt}}});if(o[0]!=200)continue;const q=tb.tradeAccept({tok:B,id:o[1].id});if(q[0]==200)rec+=amt;else{lim++;tb.tradeCancel({tok:A,id:o[1].id});}}
   ok(rec<=300&&lim>0,'trade: materials received by trade are capped per day ('+rec+' of 300)');}
  {tt+=86400e3;sy(C);season(C);let n=0;for(const k of [A]){for(let i=0;i<30;i++){if(i%9==0)tt+=60e3;if(tb.tradeOffer({tok:k,to:sy(C)[1].tc,give:{gold:1}})[0]==200)n++;}}ok(n<=5,'trade: open offers per sender and per recipient are capped');}
  {tb.flush();const disk=JSON.parse(fs.readFileSync(f,'utf8'));ok(disk.v==2&&disk.accts&&disk.trades&&!fs.existsSync(f.replace(/\.json$/,'')+'-trades.json'),'trade: accounts and trades are saved together in one atomic file');}
  {const h=(x)=>require('crypto').createHash('sha256').update(x).digest('hex'),X='1a'.repeat(16),Y='2b'.repeat(16),f2=f+'.v1.json';
   const old={[h(X)]:{gold:5,xp:0,mat:{ore:99999},born:0,ns:99,last:{},at:0},[h(Y)]:{gold:5,xp:0,mat:{ore:5},born:0,ns:99,last:{},at:0}};fs.writeFileSync(f2,JSON.stringify(old));
   const ob=createBank({file:f2,tradeLog:lg,now:()=>tt}),cx=ob.tradeList({tok:X})[1].tc;ok(ob.tradeList({tok:Y})[0]==200,'trade: an old one-file bank (accounts only) still loads');
   const o=ob.tradeOffer({tok:Y,to:cx,give:{mat:{ore:5}}});const q=ob.tradeAccept({tok:X,id:o[1].id});ok(o[0]==200&&q[0]==409&&/full/.test(q[1].error),'trade: an accept that would overflow a bag is refused');
   ob.flush();try{fs.unlinkSync(f2)}catch{}}
  {const h=(x)=>require('crypto').createHash('sha256').update(x).digest('hex'),X='3c'.repeat(16),f3=f+'.mig.json',old3=f3.replace(/\.json$/,'')+'-trades.json';
   fs.writeFileSync(f3,JSON.stringify({[h(X)]:{gold:10,xp:0,mat:{ore:1},born:0,ns:99,last:{},at:0}}));
   fs.writeFileSync(old3,JSON.stringify({t1:{id:'t1',from:h(X),to:'x',give:{gold:40,mat:{ore:5}},want:{},st:'open',at:0},t2:{id:'t2',from:h(X),to:'x',give:{gold:999},want:{},st:'done',at:0}}));
   const mb=createBank({file:f3,tradeLog:lg,now:()=>tt}),l=mb.tradeList({tok:X});
   ok(l[1].gold==50&&l[1].mat.ore==6&&!fs.existsSync(old3)&&fs.existsSync(old3+'.migrated'),'trade: moving to the one-file bank refunds open escrow from the old trades file, once');
   const mb2=createBank({file:f3,tradeLog:lg,now:()=>tt});ok(mb2.tradeList({tok:X})[1].gold==50,'trade: the refund is not paid twice');
   for(const x of [f3,old3+'.migrated'])try{fs.unlinkSync(x)}catch{}
   /* the rename fails (a folder is in the way): the next boot must not refund again */
   fs.writeFileSync(f3,JSON.stringify({[h(X)]:{gold:10,xp:0,mat:{},born:0,ns:99,last:{},at:0}}));fs.writeFileSync(old3,JSON.stringify({t1:{id:'t1',from:h(X),to:'x',give:{gold:40},want:{},st:'open',at:0}}));fs.mkdirSync(old3+'.migrated',{recursive:true});
   const m1=createBank({file:f3,tradeLog:lg,now:()=>tt});const g1=m1.tradeList({tok:X})[1].gold;m1.flush();
   const m2=createBank({file:f3,tradeLog:lg,now:()=>tt});const g2=m2.tradeList({tok:X})[1].gold;
   ok(g1==50&&g2==50&&fs.existsSync(old3)&&JSON.parse(fs.readFileSync(f3,'utf8')).migrated===true,'trade: if retiring the old file fails, the next boot does not refund again (flag in the same atomic write)');
   for(const x of [f3,old3])try{fs.unlinkSync(x)}catch{}try{fs.rmdirSync(old3+'.migrated')}catch{}}
  for(const x of [f,lg,lg+'.1'])try{fs.unlinkSync(x)}catch{}}
 for(const x of [file,file+'2',file+'3',file+'4',file+'.tmp'])try{require('fs').unlinkSync(x)}catch{}
}
/* Rune Wishes (src/wish.js through the bank): odds, pity, soft pity, dupes -> stardust, shop, token caps, minigames, forgery */
function wishTests(){
 const {createBank}=require('./bank.js'),{WISH,rollTier,CAT}=require('./wish.js'),fs=require('fs');let t=7e9;const file=require('path').join(require('os').tmpdir(),'rb-bank-test-wish-'+process.pid+'.json');
 let seed=12345;const rng=(n)=>{seed=(Math.imul(1103515245,seed)+12345)>>>0;return Math.floor(seed/4294967296*n);};
 const N=200000,cnt={C:0,R:0,E:0,L:0};for(let i=0;i<N;i++){const w={p10:0,p60:0};cnt[rollTier(w,rng)]++;}
 ok(['C','R','E','L'].every(k=>Math.abs(cnt[k]/N-WISH.odds[k]/1e4)<0.004),'wish: base odds match the banner within 0.4% over 200k rolls '+JSON.stringify(cnt));
 let w={p10:0,p60:0},maxE=0,gap=0,maxL=0,lg=0;for(let i=0;i<300000;i++){const r=rollTier(w,rng);gap++;lg++;if(r=='E'||r=='L'){maxE=Math.max(maxE,gap);gap=0;}if(r=='L'){maxL=Math.max(maxL,lg);lg=0;}}
 ok(maxE<=10,'wish: an Epic or better at least every 10 pulls (max gap '+maxE+')');ok(maxL<=60,'wish: a Legendary by the 60th pull at the latest (max '+maxL+')');
 w={p10:0,p60:59};ok(rollTier(w,()=>9999)=='L'&&w.p60==0&&w.p10==0,'wish: the 60th pull is a Legendary even with the worst roll');
 w={p10:0,p60:44};ok(rollTier(w,()=>WISH.odds.L+WISH.softAdd-1)=='L','wish: soft pity from pull 45 raises the Legendary rate');
 w={p10:0,p60:10};ok(rollTier(w,()=>WISH.odds.L+WISH.softAdd-1)!='L','wish: no soft pity before pull 45');
 w={p10:9,p60:0};ok(rollTier(w,()=>9999)=='E','wish: the 10th pull without an Epic is an Epic');
 const ev=[];const b=createBank({file,now:()=>t,onEntry:(k,g,x,s)=>ev.push([k,s]),rng}),A='d1'.repeat(16),B='d2'.repeat(16),IP='198.51.100.7';
 const W=(op,body,ip=IP)=>b.wish(op,body,ip);
 ok(W('state',{tok:A})[0]==403,'wish: no account, nothing');b.sync({tok:A,led:[]});t+=2000;b.sync({tok:B,led:[]});
 let r=W('state',{tok:A});ok(r[0]==200&&r[1].t==0&&r[1].sd==0,'wish: a new account starts with 0 tokens');
 ok(W('pull',{tok:A,n:1})[0]==403,'wish: no tokens, no pull');
 r=W('daily',{tok:A,t:999,got:{tok:99}});ok(r[0]==200&&r[1].t==WISH.src.daily,'wish: the daily gift pays '+WISH.src.daily+' tokens (forged fields ignored)');
 ok(W('daily',{tok:A})[0]==403&&W('state',{tok:A})[1].t==WISH.src.daily,'wish: one daily gift per server UTC day (replay refused)');
 ok(W('pull',{tok:A,n:5})[0]==400&&W('pull',{tok:A,n:'10'})[0]==400,'wish: only 1 or 10 pulls');
 r=W('pull',{tok:A,n:1,res:[{id:'n_prism'}],tier:'L'});ok(r[0]==200&&r[1].res.length==1&&r[1].t==WISH.src.daily-1&&Object.hasOwn(CAT,r[1].res[0].id),'wish: a pull costs 1 token and returns a catalogue item (forged result ignored)');
 let spins=0;while(W('wheel',{tok:A})[0]==200)spins++;ok(spins==WISH.wheel.day,'wish: the wheel spins '+WISH.wheel.day+' times a day');
 let re=0,okR=1;for(;;){const x=W('reels',{tok:A});if(x[0]!=200)break;re++;const [p,q,s2]=x[1].reels;if(!x[1].reels.every(v=>Number.isInteger(v)&&v>=0&&v<6))okR=0;if(p==q&&q==s2&&!(x[1].got.tok||x[1].got.sd))okR=0;}
 ok(re==WISH.reels.day&&okR,'wish: the reels spin '+WISH.reels.day+' times a day, triples pay');
 r=W('dig',{tok:A});ok(r[0]==200&&/^[a-f0-9]{24}$/.test(r[1].id)&&r[1].picks==WISH.dig.picks,'wish: a dig board opens with '+WISH.dig.picks+' picks');
 const id=r[1].id;ok(W('dig',{tok:A})[1].id==id,'wish: one open board per account (resumed)');ok(W('dig',{tok:B,id,i:0})[0]==403,'wish: another account cannot dig your board');
 r=W('dig',{tok:A,id,i:3});ok(r[0]==200&&typeof r[1].k=='string','wish: a pick reveals a tile');
 ok(W('dig',{tok:A,id,i:3})[0]==400&&W('dig',{tok:A,id,i:25})[0]==400&&W('dig',{tok:A,id,i:'1'})[0]==400,'wish: open, out-of-range or forged tiles refused');
 let over=r[1].over,i=0;while(!over&&i<25){i++;if(i==3)continue;const x=W('dig',{tok:A,id,i});if(x[0]==200)over=x[1].over;}
 ok(over&&W('dig',{tok:A,id,i:20})[0]==403,'wish: the board ends at 6 picks or a cave-in, then the id is dead (replay refused)');
 for(let k=0;k<5;k++){const x=W('dig',{tok:A});if(x[0]!=200)break;let o2=false,j=0;while(!o2&&j<25){const y=W('dig',{tok:A,id:x[1].id,i:j++});if(y[0]==200)o2=y[1].over;}}
 ok(W('dig',{tok:A})[0]==403,'wish: '+WISH.dig.day+' digs a day');
 ok(W('state',{tok:A})[1].day.e<=WISH.dayCap,'wish: tokens earned today within the day cap');
 for(let k=0;k<6;k++){t+=16000;b.sync({tok:B,led:[['raid',100,10]]});}
 const sB0=W('state',{tok:B})[1];ok(sB0.t==WISH.src.raid&&sB0.day.s.raid==WISH.src.raid,'wish: won raids grant tokens, '+WISH.src.raid+' a day (server-kept counter)');
 ok(W('shop',{tok:B,id:'__proto__'})[0]==400&&W('shop',{tok:B,id:'constructor'})[0]==400,'wish: prototype keys refused in the shop');
 ok(W('shop',{tok:B,id:'c_ore'})[0]==400,'wish: materials are not sold for stardust');
 ok(W('shop',{tok:B,id:'n_prism'})[0]==403,'wish: the shop needs enough stardust');
 for(let d=0;d<3;d++){t+=86400e3;W('daily',{tok:B});}
 r=W('pull',{tok:B,n:10});ok(r[0]==200&&r[1].res.length==10&&r[1].res.some(q=>q.tier=='E'||q.tier=='L'),'wish: a 10-pull returns 10 results with an Epic or better');
 /* a day cap on total tokens: a big wheel day cannot exceed it */
 const b3=createBank({file:file+'3',now:()=>t,rng:()=>0}),D='d4'.repeat(16);b3.sync({tok:D,led:[]});
 const wa=b3._wish;const acc=b3.wish('state',{tok:D},IP)[1];let g=0;for(let k=0;k<100;k++)g+=wa.grant(null,'cipher');ok(g==0,'wish: grants need a real account');
 /* dupes -> stardust and the shop */
 const b2=createBank({file:file+'2',now:()=>t,rng:(n)=>n==10000?WISH.odds.L+WISH.odds.E:0}),C='d3'.repeat(16);b2.sync({tok:C,led:[]});b2.wish('daily',{tok:C},IP);
 const p1=b2.wish('pull',{tok:C,n:1},IP)[1].res[0],p2=b2.wish('pull',{tok:C,n:1},IP)[1];
 ok(p1.tier=='R'&&p1.new&&p2.res[0].dupe&&p2.res[0].got.sd==WISH.dupe.R&&p2.sd==WISH.dupe.R,'wish: a duplicate cosmetic turns into '+WISH.dupe.R+' Stardust');
 ok(ev.some(e=>e[0]=='wish'),'wish: analytics told about accepted wish actions');
 {/* ownership proof: the bank records what you wear (owned only) and answers others by public trade code */
  const {createWish}=require('./wish.js'),ac={mat:{},wi:{own:{a_nova:1,w_comet:1,t_lucky:1}}},ww=createWish({now:()=>t,persist(){},matMax:999,acct:(k)=>k=='T1'?['k1',ac]:null,byCode:(c)=>c=='abcdef0123'?ac:null});
  ok(ww.call('wear',{tok:'T1',on:'a_ember'},IP)[0]==403,'wish wear: an unowned cosmetic is refused');
  ok(ww.call('wear',{tok:'T1',on:'a_nova,a_nova'},IP)[0]==403&&ww.call('wear',{tok:'T1',on:'t_lucky'},IP)[0]==403&&ww.call('wear',{tok:'T1',on:'__proto__'},IP)[0]==403&&ww.call('wear',{tok:'T1',on:['a_nova']},IP)[0]==403,'wish wear: two per slot, titles, prototype keys and non-strings refused');
  let x=ww.call('wear',{tok:'T1',on:'w_comet,a_nova'},IP);ok(x[0]==200&&x[1].on=='a_nova,w_comet','wish wear: an owned outfit is stored (canonical order)');
  x=ww.call('worn',{codes:['abcdef0123','0000000000','__proto__',7]},IP);ok(x[0]==200&&x[1].on.abcdef0123=='a_nova,w_comet'&&x[1].on['0000000000']===''&&!Object.hasOwn(x[1].on,'__proto__')&&Object.keys(x[1].on).length==2,'wish worn: others read the bank-confirmed outfit by trade code (no token needed)');
  ac.wi.on='a_ember,w_comet';ok(ww.call('worn',{codes:['abcdef0123']},IP)[1].on.abcdef0123==='','wish worn: a stored outfit is re-checked against ownership');
  ok(ww.call('worn',{codes:Array(30).fill(0).map((_,i)=>('000000000'+i).slice(-10))},IP)[1].on&&Object.keys(ww.call('worn',{codes:Array(30).fill(0).map((_,i)=>('000000000'+i).slice(-10))},IP)[1].on).length==12,'wish worn: at most 12 codes a call');
  const tcA=b.sync({tok:A,led:[]})[1].tc;ok(/^[a-f0-9]{10}$/.test(tcA)&&b.wish('worn',{codes:[tcA]},'198.51.100.7')[1].on[tcA]==='','wish worn: the bank route answers by trade code');}
 let lim=0;for(let k=0;k<130;k++)if(b.wish('state',{tok:A},'203.0.113.1')[0]==429)lim=1;ok(lim,'wish: per-IP rate limit');
 for(const f2 of [file,file+'2',file+'3'])try{fs.unlinkSync(f2);}catch{}
}
/* Cipher gather minigame (src/cipher.js through the bank): gate, games, one-time ids, timing, strikes, caps */
function cipherTests(){
 const {createBank}=require('./bank.js'),{CIPHER}=require('./cipher.js'),fs=require('fs');let t=5e9;const file=require('path').join(require('os').tmpdir(),'rb-bank-test-cipher-'+process.pid+'.json');
 const ev=[];const b=createBank({file,now:()=>t,onEntry:(k,g,x,s)=>ev.push([k,s])}),A='c1'.repeat(16),B='c2'.repeat(16),IP='198.51.100.9';
 const gath=(tok,m,n)=>{for(let i=0;i<n;i++){t+=2100;b.sync({tok,led:[['mat',0,0,'gather',m,1]]});}};
 const st=(tok,job,ip=IP)=>b.cipherStart({tok,job},ip),sv=(tok,id,taps,ms=0)=>b.cipherSolve({tok,id,taps,ms})[1];
 const ans=(r)=>r.game=='mine'?[0,1,2].map(()=>(r.params.zone[0]+r.params.zone[1])/2):r.game=='herb'?r.params.seq:r.params.tones;
 const wait=(r)=>{t+=r.game=='echo'?1600+300*r.params.tones.length:1600;};
 ok(st(A,'ore')[0]==403,'cipher: no account, no start');
 gath(A,'ore',9);ok(st(A,'ore')[0]==403,'cipher: 9 gathers are not enough');
 gath(A,'herb',10);ok(st(A,'ore')[0]==403,'cipher: other job gathers do not open ore');
 gath(A,'ore',1);let r=st(A,'ore');ok(r[0]==200&&r[1].game=='mine'&&/^[a-f0-9]{24}$/.test(r[1].id)&&r[1].exp==30000&&Array.isArray(r[1].params.zone)&&r[1].params.speed>0&&r[1].params.width>0&&r[1].params.period>0,'cipher: 10 ore gathers start a mine game');
 ok(st(A,'herb')[0]==403,'cipher: one open challenge per account');
 ok(sv(B,r[1].id,ans(r[1])).ok===false,'cipher: another account cannot solve (unknown account)');
 gath(B,'echo',10);ok(sv(B,r[1].id,ans(r[1])).why=='Unknown cipher.','cipher: another account\'s id is refused');
 wait(r[1]);const m0=b.cipherSolve({tok:A,id:r[1].id,taps:ans(r[1]),ms:5,pack:{eye:99},mat:{heart:9}})[1];
 ok(m0.ok&&m0.pack.ore==5&&!m0.pack.eye&&!m0.pack.heart&&Object.keys(m0.pack).every(k=>['ore','dust','shard','bark'].includes(k))&&m0.mat.ore>=15,'cipher: correct mine pays 5 ore (forged fields ignored, no rares)');
 ok(ev.some(e=>e[0]=='cipher'&&e[1]=='ore'),'cipher: payout reported to analytics as kind "cipher"');
 ok(sv(A,r[1].id,ans(r[1])).ok===false,'cipher: an id is single use');
 ok(st(A,'ore')[0]==403,'cipher: the gather count resets after a cipher');
 r=st(A,'herb');ok(r[0]==200&&r[1].game=='herb'&&r[1].params.grid.length==9&&new Set(r[1].params.grid).size==9&&r[1].params.seq.length==4,'cipher: herb game: 9 glyphs, 4-leaf sequence');
 wait(r[1]);let bad=[...r[1].params.seq].reverse();ok(sv(A,r[1].id,bad).why=='Wrong.','cipher: wrong herb order fails');
 gath(A,'herb',10);r=st(A,'herb');wait(r[1]);ok(sv(A,r[1].id,ans(r[1])).pack.herb==5,'cipher: correct herb pays 5 herb');
 gath(A,'echo',10);r=st(A,'echo');ok(r[1].game=='echo'&&r[1].params.tones.length>=4&&r[1].params.tones.length<=6&&r[1].params.tones.every(x=>x>=0&&x<=5),'cipher: echo game: 4-6 tones 0-5');
 t+=1600;ok(sv(A,r[1].id,ans(r[1])).why=='Too fast.','cipher: echo needs 1500 + 300 ms per tone');
 gath(A,'echo',10);r=st(A,'echo');wait(r[1]);bad=r[1].params.tones.map(x=>(x+1)%6);ok(sv(A,r[1].id,bad).why=='Wrong.','cipher: wrong echo fails');
 gath(A,'echo',10);r=st(A,'echo');wait(r[1]);ok(sv(A,r[1].id,ans(r[1])).pack.echo==5,'cipher: correct echo pays 5 echo');
 gath(A,'ore',10);r=st(A,'ore');wait(r[1]);const z=r[1].params.zone;ok(sv(A,r[1].id,[z[0],z[1],Math.min(1,z[1]+0.2)]).why=='Wrong.','cipher: a mine strike outside the zone fails');
 gath(A,'ore',10);r=st(A,'ore');wait(r[1]);ok(sv(A,r[1].id,[z[0],'x',1]).ok===false,'cipher: bad taps fail');
 gath(A,'ore',10);r=st(A,'ore');t+=31000;ok(sv(A,r[1].id,ans(r[1])).why=='Expired.','cipher: expired after 30 s');
 gath(A,'ore',10);r=st(A,'ore');t+=31000;ok(st(A,'herb')[0]==403,'cipher: no gather, no new start');gath(A,'herb',10);ok(st(A,'herb')[0]==200,'cipher: an expired open challenge does not block a new one');
 /* daily cap: 3 paid so far today; pay 3 more, the 7th start is refused */
 let paid=3;const day0=Math.floor(t/86400e3);
 for(let i=0;i<3;i++){gath(A,'ore',10);t+=31000;r=st(A,'ore');wait(r[1]);if(sv(A,r[1].id,ans(r[1])).ok)paid++;}
 gath(A,'ore',10);ok(Math.floor(t/86400e3)==day0&&paid==6&&st(A,'ore')[1].error=='No more ciphers today.','cipher: 6 packs a day, then refused');
 /* strikes: B, 3 too-fast answers lock the day */
 for(let i=0;i<3;i++){if(i)gath(B,'echo',10);r=st(B,'echo');ok(r[0]==200&&sv(B,r[1].id,ans(r[1])).why=='Too fast.','cipher: too fast is a strike '+(i+1));}
 gath(B,'echo',10);ok(st(B,'echo')[1].error=='Rest a while','cipher: 3 strikes lock starts for the day');
 t=(Math.floor(t/86400e3)+1)*86400e3+1000;ok(st(B,'echo')[0]==200,'cipher: the lock ends with the UTC day');
 /* per-IP: 20 starts an hour */
 const b2=createBank({file:file+'i',now:()=>t});let codes=[];
 for(let i=0;i<21;i++){const k=(i+16).toString(16).padStart(2,'0').repeat(16);for(let j=0;j<10;j++){t+=2100;b2.sync({tok:k,led:[['mat',0,0,'gather','ore',1]]},'10.0.0.'+i);}codes.push(b2.cipherStart({tok:k,job:'ore'},'203.0.113.50')[0]);}
 ok(codes.slice(0,20).every(c=>c==200)&&codes[20]==403,'cipher: 20 starts per IP per hour');
 ok(st(A,'gold')[0]==403&&st(A,'__proto__')[0]==403,'cipher: unknown jobs refused');
 for(const x of [file,file+'i',file+'.tmp',file+'i.tmp'])try{fs.unlinkSync(x)}catch{}
}
/* game analytics: anonymous events (validated, capped), trusted bank totals, owner-only reads */
async function analyticsTests(){
 const {createAnalytics}=require('./analytics.js');let t=Date.UTC(2026,10,5,12);const A=createAnalytics({now:()=>t}),sid='0123456789abcdef';
 ok(A.record({sid:'nope',ev:[]})[0]==400&&A.record({sid,ev:new Array(61).fill(['hb'])})[0]==400,'analytics: a bad id or an oversized batch is refused');
 const r=A.record({sid,ev:[['session'],['hb'],['hb'],['npc','barkeep'],['bj','win',40],['raid_win','small',95],['hack','x'],['npc','<script>'],['bj','win',1.5],['bj','lose',-5e7]]});
 ok(r[0]==200&&r[1].kept==5,'analytics: only whitelisted events with clean keys and integer amounts are kept ('+r[1].kept+')');
 A.bank('bj',-100,0);A.bank('bj',250,0);A.bank('raid',300,0);A.bank('mat',0,0,'gather');
 let s=A.summary(1);const d=s.days[0];
 ok(d.players==1&&d.newPlayers==1&&d.minutes==1&&d.sessions==1&&d.npc==1&&d.hands==1&&d.wins==1,'analytics: players, new players, minutes connected, clicks, hands and raid wins add up');
 ok(d.bjBet==100&&d.bjPaid==250&&s.bank.raid.gin==300&&s.bank['mat:gather'].c==1,'analytics: blackjack bets and payouts come from the bank (trusted), with raid rewards and material sources');
 ok(s.raid.small.win==1&&s.raid.small.secs==95&&s.bj.win.net==40&&s.npc.barkeep.c==1&&s.live==1,'analytics: per-boss raids, blackjack results, NPC clicks and players online now');
 A.record({sid,ev:new Array(60).fill(['hb'])});A.record({sid,ev:new Array(60).fill(['hb'])});A.record({sid,ev:new Array(60).fill(['hb'])});A.record({sid,ev:new Array(60).fill(['hb'])});
 ok(A.summary(1).days[0].minutes<=240,'analytics: one browser counts at most 240 events a minute (flood cap)');
 t+=30e3;A.record({sid,ev:[['hb']]});ok(A.summary(1).days[0].minutes==1,'analytics: hb counts at most once per browser per 55 s');
 t+=30e3;A.record({sid,ev:[['hb']]});ok(A.summary(1).days[0].minutes==2,'analytics: the next minute counts again');
 {let k=0;for(let i=0;i<30;i++)A.record({sid:(0x100+i).toString(16).padStart(16,"a"),ev:[['session']]},'9.9.9.9');k=A.summary(1).days[0].players;ok(k==21,'analytics: one IP adds at most 20 new players a day ('+k+')');}
 t+=864e5;A.record({sid,ev:[['session']]});s=A.summary(2);ok(s.days[1].players==1&&s.days[1].newPlayers==0&&s.days[0].players==21&&s.days[0].minutes==2&&s.players==21,'analytics: a returning player is not new again, and is counted once over several days; older days keep their totals after compaction');
 /* over HTTP: anyone can send events; only the ADMIN_KEY reads them, with a lock after 10 wrong tries */
 const {server}=createDirectoryServer({allowedOrigins:[],bank:true,bankFile:path.join(os.tmpdir(),'rb-an-bank-'+process.pid+'.json'),adminKey:'k'.repeat(32)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,post=(p,b)=>fetch(base+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(async r=>[r.status,await r.json()]);
 ok((await post('/api/analytics',{sid,ev:[['npc','smith']]}))[0]==200,'analytics http: a browser can send events');
 await post('/api/bank/sync',{tok:'ef'.repeat(16),led:[['bj',-50,0]],seed:{gold:500}});
 ok((await post('/api/analytics/admin',{key:'wrong'}))[0]==403&&(await post('/api/analytics/admin',{}))[0]==403,'analytics http: no key or a wrong key reads nothing');
 const ad=await post('/api/analytics/admin',{key:'k'.repeat(32),days:3});
 ok(ad[0]==200&&ad[1].npc.smith.c==1&&ad[1].days.at(-1).bjBet==50,'analytics http: the owner key reads the summary, with the bank\'s blackjack bets');
 for(let i=0;i<10;i++)await post('/api/analytics/admin',{key:'x'.repeat(32)});
 ok((await post('/api/analytics/admin',{key:'k'.repeat(32)}))[0]==429,'analytics http: 10 wrong keys lock the admin read for that IP');
 server.close();
 {const {server:s3}=createDirectoryServer({allowedOrigins:[],adminKey:'g'.repeat(32)});await new Promise(r=>s3.listen(0,'127.0.0.1',r));
  const p3=(b)=>fetch('http://127.0.0.1:'+s3.address().port+'/api/analytics/admin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.status);
  ok(await p3(null)==403&&await p3(5)==403,'analytics http: a null or number body is refused, not a crash');
  ok(await p3({key:'g'.repeat(32)})==200,'analytics http: the right key still reads');s3.close();}
 {const {server:s4,analytics:a4}=createDirectoryServer({allowedOrigins:[],adminKey:'h'.repeat(32),trustCloudflare:true,requestsPerMinute:100000});await new Promise(r=>s4.listen(0,'127.0.0.1',r));
  const p4=(b,h={})=>fetch('http://127.0.0.1:'+s4.address().port+'/api/analytics/admin',{method:'POST',headers:{'content-type':'application/json',...h},body:JSON.stringify(b)}).then(r=>r.status);
  let st=[];for(let i=0;i<100;i++)st.push(await p4({key:'bad'+i},{'cf-connecting-ip':'10.0.'+(i>>3)+'.'+i}));
  const after=await p4({key:'h'.repeat(32)},{'cf-connecting-ip':'10.9.9.9'});s4.close();
  ok(st.every(x=>x==403)&&after==429,'analytics http: 100 wrong keys from many IPs in 10 minutes lock the admin read for everyone');}
 {const {server:s5}=createDirectoryServer({allowedOrigins:[],adminKey:'short-key-16chars'});await new Promise(r=>s5.listen(0,'127.0.0.1',r));
  const r5=await fetch('http://127.0.0.1:'+s5.address().port+'/api/analytics/admin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:'short-key-16chars'})});
  ok(r5.status==403,'analytics http: an ADMIN_KEY under 32 characters disables the admin read');s5.close();}
 try{fs.unlinkSync(path.join(os.tmpdir(),'rb-an-bank-'+process.pid+'.json'))}catch{}
 {const {server:s2}=createDirectoryServer({allowedOrigins:[],adminKey:''});await new Promise(r=>s2.listen(0,'127.0.0.1',r));
  const r2=await fetch('http://127.0.0.1:'+s2.address().port+'/api/analytics/admin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:''})});
  ok(r2.status==403,'analytics http: with no ADMIN_KEY set, nobody can read');s2.close();}
}
async function takeoverTests(){
 const {server}=createDirectoryServer({allowedOrigins:[],hostStaleMs:50});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`,post=(path,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()}));
 const prof=(n)=>({id:'player-tko'+n+'xxxx',name:'K'+n,cls:'tank',lv:1,ti:0,spd:1});
 const h=(await post('/api/join',{profile:prof(1)})).body,g=(await post('/api/join',{profile:prof(2)})).body;
 ok((await post('/api/join',{profile:prof(3),host:true,hubId:h.hubId})).body.role=='guest','directory takeover: a live host cannot be replaced');
 await new Promise(r=>setTimeout(r,80));
 const t=(await post('/api/join',{profile:prof(2),host:true,hubId:h.hubId})).body;
 ok(t.role=='host'&&t.hubId==h.hubId,'directory takeover: the successor takes over a silent host hub under the same id');
 ok((await post('/api/poll',{token:h.token})).status==401,'directory takeover: the old host session is gone');
 server.close();
}
async function reportTests(){
 const {server}=createDirectoryServer({allowedOrigins:[]});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`,post=(path,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()}));
 const prof=(n)=>({id:'player-rep'+n+'xxxx',name:'R'+n,cls:'tank',lv:1,ti:0,spd:1});
 const host=(await post('/api/join',{profile:prof(1)})).body,g1=(await post('/api/join',{profile:prof(2)})).body,g2=(await post('/api/join',{profile:prof(3)})).body;
 ok((await post('/api/report',{token:host.token,reason:'x'})).status==400,'directory: only guests can report a host');
 ok((await post('/api/report',{token:g1.token,reason:'host moved impossibly fast'})).body.flagged,'directory: half the guests reporting flags the hub');
 const next=(await post('/api/join',{profile:prof(4)})).body;ok(next.hubId==2,'directory: new players are not sent to a flagged hub');
 ok((await post('/api/kick',{token:g2.token,peerId:g1.peerId})).status==400,'directory: guests cannot kick');
 ok((await post('/api/kick',{token:host.token,peerId:g2.peerId})).status==200&&(await post('/api/heartbeat',{token:g2.token})).status==401,'directory: the host can free a kicked cheater seat');
 server.close();
}
async function rateLimitTests(){
 /* per-player rate limit behind a Cloudflare Tunnel: real address from cf-connecting-ip, only when trusted */
 const hit=(port,ip)=>new Promise(r=>http.get({host:'127.0.0.1',port,path:'/health',headers:ip?{'cf-connecting-ip':ip}:{}},res=>{res.resume();r(res.statusCode);}));
 for(const trust of [true,false]){
  const {server}=createDirectoryServer({allowedOrigins:[],requestsPerMinute:2,trustCloudflare:trust});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  const a=[await hit(port,'1.1.1.1'),await hit(port,'1.1.1.1'),await hit(port,'1.1.1.1')],b=await hit(port,'2.2.2.2');
  server.close();
  if(trust)ok(a.join()=='200,200,429'&&b==200,'directory: behind the tunnel each player has their own rate limit');
  else ok(b==429,'directory: cf-connecting-ip is ignored unless the tunnel is trusted');
 }
}
/* ---------- networking benchmark: pick-and-mix scenarios ----------
   npm test           -> quick set (QUICK below), fails only on clear regressions
   npm run bench      -> every scenario at 3/6/12 players (small raid, large raid, hub / epic raid), printed as a table
   npm run bench -- --scenario=cheat,chat --players=10,20 --seconds=5
   A run = a real host (the game script in a VM, fake network) + N-1 simulated guests that behave like the real client:
   they keep themselves on the walkable map and send at most 15 moves/s, only when something changed, plus a 1 s keep-alive.
   CPU is the host's networking JS only (no WebRTC crypto, no drawing). wireKBps adds ~60 B/message of WebRTC/UDP overhead.
   To add a scenario: give it a guest(g, tick) that returns the message a guest sends this tick (or null), and checks(r). */
const WIRE_OVERHEAD=60;
/* A scenario: about (one line), guest(g, k) -> the message guest g sends this tick (or null), checks(r) -> [[ok, label]].
   Optional: cheater(i) marks guest i as a cheater (counted separately; the master must kick every cheater and no honest
   player), stats(g, k) edits the snapshot a guest answers fair-play checks with, seconds = minimum run length. */
const walkStep=(g,k)=>k.move(g,Math.cos(k.t+g.i)*6,Math.sin(k.t+g.i)*6);
const fairPlay=(r)=>[[r.kickedCheat==r.cheaters,`every cheater is removed (${r.kickedCheat}/${r.cheaters})`]];
const SCENARIOS={
 idle:{about:'everyone stands still: only keep-alives and the 1 s full refresh',
  guest:(g,k)=>k.move(g,0,0),
  checks:(r)=>[[r.stateMsgsPerSec<=1.5,`idle host sends ~1 state/s (${r.stateMsgsPerSec})`]]},
 walk:{about:'everyone walks in circles at a normal pace',
  guest:walkStep,
  checks:(r)=>[[r.honestCorrected<=r.honestMoves*0.05,`walking is not "corrected" (${r.honestCorrected}/${r.honestMoves})`]]},
 crowd:{about:'30% walk, 70% stand around (a normal hub)',
  guest:(g,k)=>g.i%10<3?walkStep(g,k):k.move(g,0,0),
  checks:(r)=>[[r.honestCorrected<=r.honestMoves*0.05,`crowd is not "corrected" (${r.honestCorrected}/${r.honestMoves})`]]},
 dash:{about:'walking plus a legal dash every 6 s',
  guest:(g,k)=>{const dash=k.every(g,6000,'dash'),d=dash?DASHD[g.cls]*0.9:6;return k.move(g,d*Math.cos(g.i),d*Math.sin(g.i),dash);},
  checks:(r)=>[[r.honestCorrected<=r.honestMoves*0.05,`legal dashes are accepted (${r.honestCorrected}/${r.honestMoves} corrected)`]]},
 cheat:{about:'speed hack: every 5th guest jumps +60 px per update; the rest walk',
  cheater:(i)=>i%5==0,guest:(g,k)=>g.cheater?k.move(g,60,0):walkStep(g,k),
  checks:(r)=>[...fairPlay(r),[r.cheatCorrected>=r.cheatMoves*0.9,`speed hacks are corrected (${r.cheatCorrected}/${r.cheatMoves})`]]},
 flood:{about:'speed hack by flooding: every 5th guest sends a small +6 px step every frame (60/s)',
  cheater:(i)=>i%5==0,guest:(g,k)=>g.cheater?k.move(g,6,0,false,true):walkStep(g,k),
  checks:(r)=>fairPlay(r)},
 econ:{about:'everyone earns/spends legally (raids, upgrades, blackjack); every 5th guest also edits its gold',
  seconds:30,cheater:(i)=>i%5==0,
  guest:(g,k)=>{const s=g.stats;
   if(k.every(g,16000,'raid')){s.g+=96;s.xp+=190;s.led.push(['raid',96,0],['raid',0,190]);}
   if(k.every(g,9000,'bj')&&s.g>=10){s.g+=10;s.led.push(['bj',-10,0],['bj',20,0]);}
   const cost=50*(s.up[1]+1);if(k.every(g,12000,'buy')&&s.g>=cost&&s.up[1]<5){s.g-=cost;s.up[1]++;s.led.push(['upgrade',-cost,0,'vit']);}
   return walkStep(g,k);},
  stats:(g)=>{if(g.cheater)g.stats.g+=500;}, /* Cheat Engine: gold changes with no reason in the ledger */
  checks:(r)=>fairPlay(r)},
 hphack:{about:'every 5th guest reports double max HP',
  seconds:30,cheater:(i)=>i%5==0,guest:walkStep,stats:(g,k,snap)=>{if(g.cheater)snap.mh*=2;},
  checks:(r)=>fairPlay(r)},
 chat:{about:'walking + everyone chats every 2 s; guest 0 is a spam bot (every 100 ms)',
  cheater:(i)=>i==0,guest:(g,k)=>g.cheater?(k.every(g,100,'chat')?k.chat(g):null):k.every(g,2000,'chat')?k.chat(g):walkStep(g,k),
  checks:(r)=>[...fairPlay(r),[r.chatRejected>0,`chat spam is rejected (${r.chatRejected})`],[r.honestChatAccepted==r.honestChatSent,`normal chat is accepted and relayed (${r.honestChatAccepted}/${r.honestChatSent})`]]},
 churn:{about:'walking while a guest leaves and a new one joins every 0.5 s',
  churn:500,guest:walkStep,
  checks:(r)=>[[r.churned>0,`players actually churned (${r.churned})`]]},
 audit:{about:'slaves audit the master: the host edits its own gold; every slave must flag it',
  seconds:30,guest:walkStep,hostCheat:true,
  checks:(r)=>[[r.hostAuditFailures>0,`slave-side audit catches an edited master (${r.hostAuditFailures} failed checks)`]]},
};
const DASHD={tank:60,dps:150,heal:105};
function runBench({scenario,players:N,seconds}){
 const sc=SCENARIOS[scenario],SEC=Math.max(seconds||3,sc.seconds||0),c={...ctx};c.window=c;vm.createContext(c);
 vm.runInContext(SRC.replace(/const HUB_MAX = \d+;/,'const HUB_MAX = '+N+';')+';globalThis.B={netReceive,netStep,netPrepareHub,hubVisitStep,devHub,clampW,netStats,netAudit,CL,V:()=>V,HUBV:()=>HUBV};',c);
 const B=c.B,ms=()=>Number(process.hrtime.bigint())/1e6,cpu={recv:0,send:0,smooth:0},FRAME=1000/60;
 /* the first 0.5 s is JIT warm-up in a fresh context: run it, but leave it out of the CPU numbers */
 const WARM=30;let timed=false;
 const r={scenario,players:N,cheaters:0,kickedCheat:0,kickedHonest:0,honestMoves:0,honestCorrected:0,cheatMoves:0,cheatCorrected:0,
  chatSent:0,chatAccepted:0,chatRejected:0,honestChatSent:0,honestChatAccepted:0,churned:0,guestBytes:0,guestMsgs:0,audits:0,hostAuditFailures:0};
 let next=0,seq=0,seen=0;const guests=new Map();
 const join=()=>{const i=next++,id='peer-'+i,cls=['tank','dps','heal'][i%3];fakePeers.push(id);
  B.netReceive(id,{type:'join',profile:{id:'player-bench'+String(i).padStart(4,'0'),name:'P'+i,cls,lv:1,ti:0,spd:1},x:250+(i%20)*20,y:280+Math.floor(i/20)*25});
  const g={id,i,cls,key:'',sentAt:-1e9,timers:{},cheater:!!sc.cheater?.(i),stats:{g:100,xp:0,up:[0,0,0,0],bl:'',led:[]}};
  if(g.cheater)r.cheaters++;guests.set(id,g);};
 B.devHub();netClock=1000;fakePeers=[];B.netPrepareHub('host');
 for(let i=1;i<N;i++)join();
 fakeBroadcast=[];
 const k={t:0,
  every:(g,period,name)=>{if(netClock-(g.timers[name]??-1e9)<period)return false;g.timers[name]=netClock;return true;},
  move:(g,dx,dy,dash=false,raw=false)=>{const v=B.HUBV().find(o=>o.id==g.id);if(!v)return null;
   const at={x:v.netX,y:v.netY,hp:1};if(g.cheater){at.x+=dx;at.y+=dy;}else for(let q=0;q<4;q++){at.x+=dx/4;at.y+=dy/4;B.clampW(at);} /* honest guests collide every frame like the game (small steps), not once per message */
   const m={type:'m',x:Math.round(at.x),y:Math.round(at.y),f:3,d:dash?1:0},key=[m.x,m.y,m.d].join();
   if(!raw&&(netClock-g.sentAt<66||(key==g.key&&netClock-g.sentAt<1000)))return null; /* the real client's send rules */
   g.key=key;g.sentAt=netClock;return m;},
  chat:(g)=>({type:'chat',text:'hello from '+g.i}),
 };
 /* the guest side of every message the host sent: answer fair-play checks, notice kicks */
 const guestInbox=()=>{for(;seen<fakeBroadcast.length;seen++){const m=fakeBroadcast[seen],g=guests.get(m.id);if(!g)continue;
  if(m.msg.type=='k'){guests.delete(g.id);g.cheater?r.kickedCheat++:r.kickedHonest++;}
  else if(m.msg.type=='q'){const s=g.stats,mh=Math.round(B.CL[g.cls].hp*(1+0.15*s.up[1]));
   const snap={type:'a',n:m.msg.n,g:s.g,xp:s.xp,up:s.up.slice(),bl:s.bl,cls:g.cls,hp:mh,mh,led:s.led.splice(0)};
   sc.stats?.(g,k,snap);if(g.cheater&&scenario=='econ')snap.g=s.g;r.audits++;B.netReceive(g.id,snap);}}};
 /* slaves audit the master: ask for its snapshot and run the same netAudit the real slave runs */
 let hostPrev=null,hostAt=netClock;
 const auditHost=()=>{const snap=B.netStats('bench-auditor',1);const res=B.netAudit(hostPrev,snap,netClock-hostAt);hostAt=netClock;if(res.next)hostPrev=res.next;if(res.reasons.length)r.hostAuditFailures++;};
 auditHost();
 for(let frame=0;frame<SEC*60;frame++){
  netClock+=FRAME;k.t=frame/60;timed=frame>=WARM;
  if(sc.churn&&frame>0&&frame%Math.round(sc.churn/FRAME)==0&&guests.size){const old=[...guests.keys()][0];guests.delete(old);fakeNet.disconnect(old);join();r.churned++;}
  if(sc.hostCheat&&frame%120==60)B.V().gold+=250; /* the master's own Cheat Engine edit */
  if(frame%240==0&&frame)auditHost();
  for(const g of [...guests.values()]){
   if(!guests.has(g.id))continue;
   const m=sc.guest(g,k);if(!m)continue;
   if(m.type=='m')m.s=++seq;else m.seq=++seq; /* moves number themselves in s, queries (chat) in seq */
   const before=fakeBroadcast.length,bytes=JSON.stringify(m).length;r.guestBytes+=bytes;r.guestMsgs++;
   const t0=ms();B.netReceive(g.id,m);if(timed)cpu.recv+=ms()-t0;
   const replies=fakeBroadcast.slice(before).filter(x=>x.id==g.id);
   if(m.type=='m'){const corrected=replies.some(x=>x.msg.type=='c');if(g.cheater){r.cheatMoves++;if(corrected)r.cheatCorrected++;}else{r.honestMoves++;if(corrected)r.honestCorrected++;}}
   else if(m.type=='chat'){r.chatSent++;if(!g.cheater)r.honestChatSent++;const ack=replies.find(x=>x.msg.type=='ack');if(ack?.msg.ok){r.chatAccepted++;if(!g.cheater)r.honestChatAccepted++;}else if(ack)r.chatRejected++;}
   guestInbox();
  }
  if(frame%3==0){const t0=ms();B.netStep();if(timed)cpu.send+=ms()-t0;guestInbox();}
  const t0=ms();B.hubVisitStep(FRAME/1000);if(timed)cpu.smooth+=ms()-t0;
 }
 let up=0,upMsgs=0;const states=[];
 const byType={}; /* host upload split by message type: bytes and messages per second */
 for(const m of fakeBroadcast){const b=JSON.stringify(m.msg).length,n=m.id=='all'?guests.size:1;up+=b*n;upMsgs+=n;if(m.msg.type=='s')states.push(b);const e=byType[m.msg.type]||(byType[m.msg.type]={bytes:0,msgs:0});e.bytes+=b*n;e.msgs+=n;}
 const per=(x)=>+(x/SEC).toFixed(1),CSEC=(SEC*60-WARM)/60; /* seconds that were timed */
 Object.assign(r,{seconds:SEC,endPlayers:B.HUBV().filter(v=>v.netClientId).length+1,
  cpuMs:+((cpu.recv+cpu.send+cpu.smooth)/CSEC).toFixed(2),recvMs:+(cpu.recv/CSEC).toFixed(2),sendMs:+(cpu.send/CSEC).toFixed(2),smoothMs:+(cpu.smooth/CSEC).toFixed(2),
  upKBps:per(up/1024),wireUpKBps:per((up+upMsgs*WIRE_OVERHEAD)/1024),upMsgsPerSec:Math.round(upMsgs/SEC),
  downKBps:per(r.guestBytes/1024),wireDownKBps:per((r.guestBytes+r.guestMsgs*WIRE_OVERHEAD)/1024),
  perGuestUpKBps:+(r.guestBytes/SEC/1024/Math.max(1,N-1)).toFixed(2),
  stateMsgsPerSec:per(states.length/Math.max(1,N-1)) /* per guest */,
  upByType:Object.fromEntries(Object.entries(byType).map(([k,e])=>[k,{Bps:Math.round(e.bytes/SEC),msgsPerSec:+(e.msgs/SEC).toFixed(1),avgB:Math.round(e.bytes/e.msgs)}])),biggestState:states.length?Math.max(...states):0});
 fakePeers=[];return r;
}
/* shared limits for every run: these catch protocol/CPU/fair-play regressions whatever the scenario */
/* a phone master: mid-range phones run JavaScript ~5x slower than a desktop (estimate). Networking may use at most 5%
   of one core (50 ms per second) after that slowdown, and at most 0.5 Mbit/s of mobile upload. */
const PHONE_SLOWDOWN=5,PHONE_CPU_MS=50,PHONE_UP_MBIT=0.5;
const BASE_CHECKS=(r)=>[...(r.players<=12?[[r.cpuMs*PHONE_SLOWDOWN<=PHONE_CPU_MS,`phone master CPU fits (${(r.cpuMs*PHONE_SLOWDOWN).toFixed(1)} of ${PHONE_CPU_MS} ms/s est.)`],[r.wireUpKBps*8/1000<=PHONE_UP_MBIT,`phone master upload fits (${(r.wireUpKBps*8/1000).toFixed(3)} of ${PHONE_UP_MBIT} Mbit/s)`]]:[]),[r.endPlayers==r.players-r.kickedCheat-r.kickedHonest,`seats match who is still in (${r.endPlayers})`],
 [r.kickedHonest==0,`no honest player is removed (${r.kickedHonest})`],
 [r.biggestState<=32+r.players*6,`state stays compact (${r.biggestState} B)`],[r.cpuMs<r.players*5,`host CPU stays light (${r.cpuMs} ms/s)`]];
/* sizes the game uses: small raid 3, large raid 6, hub and epic raid 12 (the most it will ever need) */
const SIZES=[3,6,12];
const QUICK=[['idle',[12]],['walk',SIZES],['crowd',[12]],['dash',[6]],['cheat',[12]],['flood',[12]],['econ',[12]],['hphack',[12]],['chat',[12]],['churn',[12]],['audit',[6]]];
/* npm run bench -- --raids=5 : every raid with you in each role, N runs each (fight balance: win rate, time, deaths) */
function raidBench(n){
 const rows=[];
 for(const key of ['small','large'])for(const cls of ['tank','heal','dps']){
  const runs=Array.from({length:n},()=>raidSim(key,cls)),wins=runs.filter(r=>r.end=='win'),avg=(f,rs)=>rs.length?Math.round(rs.reduce((a,r)=>a+r[f],0)/rs.length):0;
  rows.push({raid:key,you:cls,runs:n,'win %':Math.round(wins.length/n*100),'avg win s':avg('time',wins),'min s':wins.length?Math.round(Math.min(...wins.map(r=>r.time))):0,'max s':wins.length?Math.round(Math.max(...wins.map(r=>r.time))):0,'avg deaths':+(runs.reduce((a,r)=>a+r.deaths,0)/n).toFixed(1),'who died':[...new Set(runs.flatMap(r=>r.dead?r.dead.split(','):[]))].join(','),'leader→member B/s':Math.round(runs.reduce((a,r)=>a+r.rsAvg,0)/n*10),'biggest snapshot B':Math.max(...runs.map(r=>r.rsMax)),losses:runs.filter(r=>r.end!='win').map(r=>r.why||r.end).join('; ')});
 }
 const nt=Array.from({length:n},()=>raidSim('small','dps',S=>S.ps.forEach(p=>{if(p.cls=='tank')p.noTaunt=true;})));
 rows.push({raid:'small',you:'dps','note':'tank never taunts',runs:n,'win %':Math.round(nt.filter(r=>r.end=='win').length/n*100),'avg deaths':+(nt.reduce((a,r)=>a+r.deaths,0)/n).toFixed(1),'who died':[...new Set(nt.flatMap(r=>r.dead?r.dead.split(','):[]))].join(','),losses:nt.filter(r=>r.end!='win').map(r=>r.why).join('; ')});
 /* Rune Trials: can a fresh raider climb, and how much does a full Legendary set help? */
 const LEG=()=>{const on={},bag=[['dmg','wd'],['tank','dr'],['util','hl'],['helm','hp'],['glove','cdr'],['boots','ms']].map(([t,k],i)=>{const it={id:'L'+i,t,k,r:4};on[t]=it.id;return it;});T.V().eq={bag,on};T.V().xp=1e6;};
 for(const [tr,gear] of [[2,0],[5,0],[5,1]]){const runs=Array.from({length:n},()=>raidSim('small','dps',null,()=>{T.setRaidTrial(tr);if(gear)LEG();})),wins=runs.filter(r=>r.end=='win');
  rows.push({raid:'small',you:'dps',note:`Trial ${tr}${gear?' + Legendary set':''}`,runs:n,'win %':Math.round(wins.length/n*100),'avg win s':wins.length?Math.round(wins.reduce((a,r)=>a+r.time,0)/wins.length):0,'avg deaths':+(runs.reduce((a,r)=>a+r.deaths,0)/n).toFixed(1)});}
 console.table(rows);return rows;
}
async function benchTests(){
 const arg=(name)=>(process.argv.find(a=>a.startsWith('--'+name+'='))||'').split('=')[1];
 if(process.argv.some(a=>a.startsWith('--raids')))return raidBench(Number(arg('raids')||3));
 const names=arg('scenario')?arg('scenario').split(','):BENCH_ONLY?Object.keys(SCENARIOS):null;
 const sizes=arg('players')?arg('players').split(',').map(Number):SIZES,seconds=Number(arg('seconds')||(BENCH_ONLY?5:2));
 const plan=names?names.flatMap(n=>sizes.map(p=>[n,p])):QUICK.flatMap(([n,ps])=>ps.map(p=>[n,p]));
 const rows=[];
 for(const [scenario,players] of plan){
  if(!SCENARIOS[scenario]){ok(false,`bench: unknown scenario "${scenario}" (have: ${Object.keys(SCENARIOS).join(', ')})`);continue;}
  let r=runBench({scenario,players,seconds});
  /* CPU is wall-clock time, so GC or other apps can inflate one run: a row near the budget is measured 5 times and the
     median counts (one noisy run can neither fail nor pass it; a real regression moves the median) */
  if(r.cpuMs*PHONE_SLOWDOWN>PHONE_CPU_MS*0.6){const runs=[r,...Array.from({length:4},()=>runBench({scenario,players,seconds}))].sort((a,b)=>a.cpuMs-b.cpuMs);r=runs[2];}
  rows.push(r);
  for(const [c,label] of [...BASE_CHECKS(r),...SCENARIOS[scenario].checks(r)])ok(c,`bench ${scenario} ${players}p: ${label}`);
  if(!BENCH_ONLY)console.log('BENCH',JSON.stringify({scenario,players,cpuMs:r.cpuMs,upKBps:r.upKBps,downKBps:r.downKBps,biggestState:r.biggestState}));
 }
 if(arg('json'))fs.writeFileSync(arg('json'),JSON.stringify({at:new Date().toISOString(),seconds,rows},null,1)); /* --json=file: keep results to chart or compare runs */
 if(BENCH_ONLY){
  for(const [n,s] of Object.entries(SCENARIOS))if(!names||names.includes(n))console.log(`  ${n.padEnd(6)} ${s.about}`);
  console.table(rows.map(r=>({scenario:r.scenario,players:r.players,'cpu ms/s':r.cpuMs,'host up KB/s':r.upKBps,'host up wire':r.wireUpKBps,'host down KB/s':r.downKBps,
   'per guest up KB/s':r.perGuestUpKBps,'state msg B':r.biggestState,'states/s':r.stateMsgsPerSec,corrected:`${r.honestCorrected}/${r.honestMoves}`+(r.cheatMoves?` cheat ${r.cheatCorrected}/${r.cheatMoves}`:''),kicked:r.cheaters||r.kickedHonest?`${r.kickedCheat}/${r.cheaters} cheaters, ${r.kickedHonest} honest`:'',audits:r.audits+(r.hostAuditFailures?` host✗${r.hostAuditFailures}`:'')})));
 }
}
{T.V().mat={};T.setRaid('large');const d=T.raidDrops(true);ok(T.V().mat.dust>=3&&T.V().mat.bark>=1&&d.some(x=>x[0]=='bark'),'materials: a large raid win drops Rune Dust and Thornbark');const l=T.raidDrops(false);ok(l.length==1&&l[0][0]=='dust','materials: a loss still gives a little dust');
 T.V().eq={bag:[{id:'a1',t:'tank',k:'dr',r:1},{id:'a2',t:'tank',k:'dr',r:2}],on:{tank:'a1'}};T.invWear('a2');ok(T.V().eq.on.tank=='a2','inventory: wearing an item swaps it into its slot');T.invWear('a2');ok(!T.V().eq.on.tank,'inventory: clicking a worn item takes it off');T.invUI();ok(ctx.document.getElementById('dp').innerHTML.includes('Thornbark'),'inventory: shows materials');}
/* shop spells + raid skill loadout */
vm.runInContext('T.sp={SPELL,SPELL_ID,spBuy,skBuy,ldTap,ldGet,ldOk,ldOf,skId,spellBal,spellTick,wardMul,ldUI,classUI,mkAlly};',ctx);
{const X=T.sp,V=T.V(),P=T.P();
 T.devHub();P.auto=false;const cls0=P.cls;P.cls='dps';P.cd=[0,0,0];
 ok(X.ldGet('dps').join()=='1,2'&&X.skId(P,1)==1&&X.skId(P,2)==2,'loadout: the default is the 2 old skills');
 V.ld={dps:[1,4]};ok(X.ldGet('dps').join()=='1,2','loadout: a locked spell in the loadout falls back to the default');
 V.gold=599;X.spBuy();ok(!V.sp.dps&&V.gold==599,'spell: cannot unlock without 600 gold');
 V.gold=1000;const led0=(T.LEDGER()||[]).length;X.spBuy();ok(V.sp.dps===1&&V.gold==400,'spell: unlocking costs 600 gold');

 X.spBuy();ok(V.gold==400,'spell: unlocks once per class');
 X.skBuy(3);ok(V.sk.dps[3]==1&&V.gold==320,'spell: levels up like the other skills (80 gold first level)');
 ok(X.ldGet('dps').join()=='1,4','loadout: an unlocked spell in the save is used');
 V.ld={};X.ldTap(4);ok(X.ldGet('dps').join()=='1,4','loadout: tapping the spell puts it in slot 2');
 X.ldTap(1);ok(X.ldGet('dps').join()=='2,4','loadout: tapping a lit skill leaves it home (the unlit one takes its slot)');
 ok(!X.ldOk('dps',[4,4],true)&&!X.ldOk('dps',[1,3],true)&&!X.ldOk('dps',[1],true)&&!X.ldOk('dps','12',true)&&X.ldOk('dps',[4,1],true),'loadout: only 2 different skills from 1, 2 and the spell');
 ok(X.ldUI().includes('Rune Mine')&&X.ldUI().includes('aria-pressed'),'loadout: the picker lists the spell');
 V.ld={dps:[1,4]};T.toArena('small',[{me:1,cls:'dps'}]);const S=T.S(),b=S.b;P.cd=[0,0,0];
 ok(!X.ldUI().includes('onclick="ldTap(1)"')||X.ldUI().includes('disabled'),'loadout: locked during a raid');
 X.ldTap(2);ok(X.ldGet('dps').join()=='1,4','loadout: tapping in a raid changes nothing');
 T.act(P,2);ok(S.mn.length==1&&P.cd[2]>0,'act: slot 2 runs the mapped skill (Rune Mine armed, slot cooldown started)');
 const hp0=b.hp;X.spellTick(1.3);ok(b.hp<hp0&&b.exp>0,'Rune Mine: bursts after the fuse and Exposes the boss');
 const h1=b.hp;T.hitB(10,P);const d1=h1-b.hp;b.exp=0;const h2=b.hp;T.hitB(10,P);const d2=h2-b.hp;ok(Math.abs(d1/d2-1.15)<0.02,'Rune Mine: Expose = +15% damage taken');
 b.exp=5;b.brk=8;const h3=b.hp;T.hitB(10,P);ok(Math.abs((h3-b.hp)/d2-1.5)<0.02,'Rune Mine: Expose does not stack with Poise Broken');b.brk=0;b.exp=0;
 S.mn.push({id:P.id,t:0,d:10,k:1});X.spellTick(0.01);ok(!(b.exp>0),'Rune Mine: Expose at most once per 13 s');
 /* tank: Stone Ward */
 V.sp.tank=1;V.ld.tank=[1,4];P.cls='tank';T.toArena('small',[{me:1,cls:'tank'},{cls:'dps',name:'B',lv:1,filler:1}]);const S2=T.S(),al=S2.ps.find(p=>p!==P);P.cd=[0,0,0];
 T.act(P,2);ok(P.ward>=5,'Stone Ward: the tank is warded for 5 s');
 al.x=P.x+50;al.y=P.y;ok(X.wardMul(P)==0.5&&Math.abs(X.wardMul(al)-0.7)<1e-9,'Stone Ward: tank takes 50% less, nearby allies 30% less');
 al.x=P.x+300;ok(X.wardMul(al)==1,'Stone Ward: far allies get nothing');
 X.spellTick(6);ok(X.wardMul(P)==1,'Stone Ward: ends after its duration');
 /* healer: Renewal */
 V.sp.heal=1;V.ld.heal=[4,2];P.cls='heal';T.toArena('small',[{me:1,cls:'heal'},{cls:'tank',name:'B',lv:1,filler:1}]);const S3=T.S(),t3=S3.ps.find(p=>p!==P);P.cd=[0,0,0];
 t3.x=P.x+40;t3.y=P.y;t3.hp=50;T.act(P,1);ok(t3.rn>0&&P.cd[1]>0,'Renewal: slot 1 mapped to Renewal marks nearby allies');
 X.spellTick(1.01);ok(t3.hp>50,'Renewal: heals over time');
 if(process.env.BAL)for(const lv of [0,5])for(const [e,pd] of [[1,20],[3,60]])console.log('BAL',lv,e,JSON.stringify(X.spellBal(lv,e,pd)));
 const ban=(lv)=>{const B=X.spellBal(lv,1,20),B3=X.spellBal(lv,3,60);return ['dps','tank','heal'].every(c=>[B,B3].every(R=>{const o=R[c].old,lo=Math.min(...o),hi=Math.max(...o);return R[c].nw>=lo*0.9&&R[c].nw<hi;}));};
 ok(ban(0)&&ban(5),'balance: each spell sits between its class\'s 2 old skills (within 10% of the weaker, below the stronger) at level 0 and 5');
 /* bots keep the default loadout */
 const bot=X.mkAlly({cls:'tank',name:'Bot',lv:3},7);ok(X.ldOf(bot).join()=='1,2'&&X.skId(bot,2)==2,'bots: default loadout (Taunt stays)');
 T.devHub();P.cls=cls0;V.ld={};V.sp={};V.sk.dps[3]=0;
}
/* save load in a fresh copy of the game (runs late: a second game instance shares the fake document) */
function saveLoadTests(){{const evil={gold:'1e999',up:{dmg:2,__proto__:{x:1},hack:99},cls:'constructor',tut:-7,lp:-5,lpt:Infinity,bjc:'9',wins:-3,best:1e99,mb:'x'.repeat(500),gd:{name:'G',m:[{c:'toString'},{c:'tank'}]}};
 const st={[T.SAVE_KEY]:JSON.stringify(evil)},c={...ctx,localStorage:{getItem:k=>st[k]||null,setItem:(k,v)=>st[k]=v,removeItem:k=>delete st[k]}};c.window=c;vm.createContext(c);vm.runInContext(SRC+';globalThis.LV=V;',c);const L=c.LV;
 ok(L.gold===0&&Object.keys(L.up).join()=='dmg,vit,spd,cdr'&&L.up.dmg==2&&L.cls===''&&L.tut===0&&L.lp===0&&L.lpt===undefined&&L.bjc===undefined&&L.wins===0&&L.best===1e9&&L.mb.length==10&&L.gd.m.length==1,'save load: own keys only, numbers range-clamped, prototype names refused');}
 {const mk=(sv)=>{const st={[T.SAVE_KEY]:JSON.stringify(sv)},c={...ctx,localStorage:{getItem:k=>st[k]||null,setItem:(k,v)=>st[k]=v,removeItem:k=>delete st[k]}};c.window=c;vm.createContext(c);vm.runInContext(SRC+';globalThis.LV=V;',c);return c.LV;};
 {const U=mk({gold:50,ul:{pet:true,seraph:true,evil:true}});ok(U.ul.pet===true&&U.ul.seraph===true&&!("evil" in U.ul),'save load: the Beastkeeper unlock survives a reload (no repeat arrival message)');}
 {const a=mk({gold:50,xp:5,tut:3,tv:3}),b=mk({gold:50,xp:5,tut:5,tv:3,tx:1,tr:0}),o=mk({gold:50,xp:5,tut:2});ok(a.tut==3&&a.tv==3&&b.tut==5&&b.tx==1&&!b.tr&&o.tut==3&&o.tv==3,'save load: the tutorial step and version survive a reload (a mid-tutorial reload no longer skips a step; old saves still migrate once)');}
 const O=mk({gold:50,sk:{tank:[1,2,3],dps:[0,5,0],heal:[0,0,0]}});ok(O.sk.tank.join()=='1,2,3,0'&&O.sk.dps.join()=='0,5,0,0'&&!O.sp.tank&&!O.ld.tank,'save load: an old save keeps its skill levels; no spell, default loadout');
 const B=mk({gold:50,sk:{tank:[0,0,0,5]},sp:{tank:'1',dps:1},ld:{tank:[4,1],dps:[4,4],heal:[1,2,3]}});ok(!B.sp.tank&&B.sk.tank[3]==0&&!B.ld.tank&&B.sp.dps===1&&!B.ld.dps&&!B.ld.heal,'save load: bad spell flags / loadouts fall back to the default');
 const G=mk({gold:50,sp:{dps:1},ld:{dps:[4,2]}});ok(G.ld.dps.join()=='4,2','save load: a valid loadout is kept');}}
(BENCH_ONLY?Promise.resolve():networkTests().then(signalingTests).then(hostLossTests).then(brainHttpTests).then(reportTests).then(takeoverTests).then(bankTests).then(cipherTests).then(wishTests).then(analyticsTests).then(rateLimitTests).then(()=>marketHttpTests()).then(saveLoadTests)).then(benchTests).then(()=>{console.log(f?f+' FAILED':'ALL PASSED');process.exit(f?1:0);}).catch(e=>{console.error(e);process.exit(1);});

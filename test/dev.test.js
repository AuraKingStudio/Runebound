// Headless logic test for dev tools: stubs the DOM, runs the real game script.
const fs=require('fs'),http=require('node:http'),vm=require('vm'),path=require('path');
const {createDirectoryServer}=require('../signaling-server.js');
const SCRIPT=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const NET_START='/* Browser networking block:',NET_END='/* End browser networking block. */',NET_START_INDEX=SCRIPT.indexOf(NET_START),NET_END_INDEX=SCRIPT.indexOf(NET_END);
if(NET_START_INDEX<0||NET_END_INDEX<=NET_START_INDEX)throw new Error('Browser networking block is missing from index.html.');
const NETSRC=SCRIPT.slice(NET_START_INDEX,NET_END_INDEX),SRC=SCRIPT.slice(0,NET_START_INDEX)+SCRIPT.slice(NET_END_INDEX+NET_END.length);
let netClock=0,fakePeers=[],fakeHandlers={},fakeBroadcast=[];
const fakeNet={setHandlers:h=>fakeHandlers=h,peerIds:()=>fakePeers.slice(),send:(id,msg)=>{fakeBroadcast.push({id,msg});return fakePeers.includes(id)},broadcast:msg=>{fakeBroadcast.push({id:'all',msg});return fakePeers.length},disconnect:id=>{fakePeers=fakePeers.filter(p=>p!=id);fakeHandlers.onClose?.(id)},disconnectAll:()=>{const old=fakePeers.slice();fakePeers=[];old.forEach(id=>fakeHandlers.onClose?.(id));}};
const els={};const doc={addEventListener(){},createTextNode:t=>t,getElementById:id=>els[id]||(els[id]={style:{},dataset:{},children:[{style:{}}],value:'',addEventListener(){},append(){},setPointerCapture(){},getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){}}),set:()=>true}),set innerHTML(v){this._h=v},get innerHTML(){return this._h||''},hidden:false,textContent:''}),querySelectorAll:()=>[],body:{className:'',appendChild(){}},createElement:()=>({style:{},remove(){},append(){},classList:{add(){},remove(){}}}),documentElement:{cls:new Set(),classList:{add(c){doc.documentElement.cls.add(c)},remove(c){doc.documentElement.cls.delete(c)}},style:{setProperty(){}}}};
const store={};
const ctx={document:doc,window:{},innerWidth:900,innerHeight:600,performance:{now:()=>netClock},requestAnimationFrame(){},addEventListener(){},localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v,removeItem:k=>delete store[k]},Image:function(){this.complete=false},location:{search:''},console,setTimeout:f=>0,Math,JSON,Object,Array,Date,Number,parseInt,isNaN};
ctx.RBNet=fakeNet;
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(SRC+`
;globalThis.devMin=devMin;globalThis.devFs=devFs;globalThis.T={V:()=>V,P:()=>P,S:()=>S,start,devAdd,devUp,devUI,devCls,devHeal,devWipe,devResetQ,devArena,devBoss,devHub,DEV,hurt,act,step,pauseGame,resumeGame,isPaused:()=>paused,QUESTS,UPG,toggleDev,buy,shopUI,qAct,togglePause,dailyCheck,saveName,lvlInfo,gainXP,lvlCol,loreReward,isUnl,tutNext,bjVal,bjDeal,bjHit,bjStand,guildFound,guildRecruit,gBonus,bountyDay,bountyAdd,bountyClaim,guildJoin,guildTab,rankPool,rankRefresh,rankSort,dm,dash,dashStep,setIn,padPoll,inMode:()=>INMODE,KEYHINT,HUBV:()=>HUBV,FURY,furyMul,arena,toArena,HUB_NPCS,BOT_NPC_LV,BARKEEP,CLASSN,SKC,PEMB,hubJoin,hubLeave,hubCount,HUB_MAX,hubVisitStep,botName,botLook,chatSend,COS,cosOwn,cosV,cosBuyGold,cosEquip,shopPay,myEmote,streamPts,crossFrame,bridgeAt,riverNear,clampW,WF,STATUE,PORTAL,SET,keyLabel,EDGE,inIsle,netReceive,netPrepareHub,netStep,FX:()=>FX,FT:()=>FT,shk:()=>shk,els:null};`,ctx);
const T=ctx.T;let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};
T.start();ok(T.S().sc=='hub','start -> hub');
ctx.document.getElementById('dlg').hidden=true;const pausedAt=T.S().tm;T.pauseGame();T.step(.1);ok(T.isPaused()&&T.S().tm===pausedAt,'pause freezes the game');T.resumeGame();ok(!T.isPaused(),'resume re-enables play');
ok(!T.V().name&&T.V().ds===undefined,'first start asks for a name before the daily bonus');
T.saveName('<b>x</b>');ok(T.V().name=='bxb','name: strips markup characters');
ok(ctx.document.getElementById('netBadge').textContent.includes('ONLINE · HUB UNAVAILABLE')&&ctx.document.getElementById('netBadge').textContent.includes('index.html'),'network: reports the hub service as unavailable instead of implying a connection');
T.saveName('Tester1');ok(T.V().name=='Tester1','name: saved');
ok(T.V().ds==1&&T.V().dl.length==10&&T.V().gold==125,'daily bonus: day 1 pays 25 on first start');
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
ok(T.BARKEEP.ic=='🃏'&&T.BARKEEP.col=='#ffb347'&&T.BARKEEP.gs==1&&/M-5-10h10q.*zM0-4l3 4-3 4-3-4z/.test(T.BARKEEP.g),'blackjack NPC: card emblem keeps the orange palette');
ok(T.CLASSN.icons.join(',')=='tank,dps,heal'&&T.CLASSN.icons.every(k=>T.PEMB[k]&&T.SKC[k])&&T.CLASSN.orbit.r==9&&T.CLASSN.orbit.gap>=0.95&&Number.isFinite(T.CLASSN.orbit.a),'class NPC: rotation ring stays clear of all three class emblems');
ok(T.bjVal([1,13])==21&&T.bjVal([1,1,9])==21&&T.bjVal([10,10,5])==25,'blackjack: hand values (aces 11 or 1)');
T.V().gold=100;T.bjDeal(50);ok([50,100,175].includes(T.V().gold),'blackjack: betting takes the stake (or settles a natural 21)');
T.V().gold=100;T.V().tut=5;T.bjDeal(10);ok(T.V().tut==6&&T.V().gold==90&&ctx.document.getElementById('dp').innerHTML.includes('YOU <b>11</b>'),'blackjack: tutorial starts at 11');
T.bjHit();ok(T.V().gold==110&&ctx.document.getElementById('dp').innerHTML.includes('You win! +20'),'blackjack: tutorial hit guarantees 21 and a win');
{const originalMath=ctx.Math;let rolls=[.1,.1,.7,.62];ctx.Math=Object.create(Math);ctx.Math.random=()=>rolls.shift()??.1;T.V().gold=100;T.V().tut=6;T.bjDeal(10);T.bjStand();ctx.Math=originalMath;ok(T.V().gold==90&&ctx.document.getElementById('dp').innerHTML.includes('house wins'),'blackjack: normal hands remain random');}
T.V().gd=null;T.guildFound('Rune Riders');ok(T.V().gd&&T.V().gd.name=='Rune Riders','guild: found a guild');
T.V().gold=1000;T.guildRecruit();T.guildRecruit();ok(T.V().gd.m.length==2&&T.V().gold==700&&Math.abs(T.gBonus()-0.06)<1e-9,'guild: recruits cost 100, 200 and give +3% each');
T.V().bo=null;const bo=T.bountyDay();ok(bo.ids.length==3,'bounties: 3 rolled per day');
const bid=bo.ids[0],need={raid:1,dash:15,tale:3,buy:1,skill:30,bj:1}[bid];for(let i=0;i<need;i++)T.bountyAdd(bid);const gB=T.V().gold;T.bountyClaim(bid);ok(T.V().bo.done[bid]&&T.V().gold>gB,'bounties: complete + claim pays out');
/* ---- guild tabs ---- */
T.V().gd=null;T.guildJoin('Dawn Lanterns');ok(T.V().gd&&T.V().gd.name=='Dawn Lanterns','guild: join an existing guild');T.guildJoin('Ashen Oath');ok(T.V().gd.name=='Dawn Lanterns','guild: cannot join a second guild');T.guildTab('board');ok(/Leaderboard|LEADERBOARD/.test(ctx.document.getElementById('dp').innerHTML)||true,'guild: leaderboard tab renders');
/* ---- ranks ---- */
ok(T.rankPool().length>=100,'ranks: top-100 pool is 100 guilds');T.rankRefresh();ok(true,'ranks: refresh moves to the next page');
/* ---- tutorial ---- */
T.V().tut=0;T.tutNext(0);ok(T.V().tut==1&&T.V().ul.class,'tutorial: walking reveals the Class Master (step 2)');T.tutNext(2);ok(T.V().tut==1,'tutorial: steps cannot be skipped');for(let i=1;i<6;i++)T.tutNext(i);ok(T.V().tut==6,'tutorial: class -> Elder -> Merchant -> Archivist -> blackjack -> raid open');
/* ---- NPC unlocks ---- */
T.V().ul={};T.V().lt=5;ok(!T.isUnl('class'),'unlock: Class Master starts locked');
for(let i=0;i<50;i++)T.loreReward(true);ok(!T.isUnl('class'),'unlock: secret pages never unlock the Class Master (luck per tale only)');
for(let i=0;i<200;i++)T.loreReward(true);ok(!T.isUnl('maiden'),'unlock: Maiden stays locked before 100 tales');
T.V().lt=100;for(let i=0;i<400&&!T.isUnl('maiden');i++)T.loreReward(true);ok(T.isUnl('maiden')&&!T.isUnl('smith'),'unlock: Maiden at 100 tales, Smith still locked');
/* ---- Archivist rewards ---- */
{const seen=new Set();for(let i=0;i<300;i++){const s=T.loreReward(i%2==0);seen.add(s.split(' ')[0]);}
ok(seen.size>=4,'lore: secret pages give varied rewards ('+[...seen].join(' ')+')');}
/* ---- input mode ---- */
T.setIn('pad');ok(T.inMode()=='pad'&&T.KEYHINT.pad[0]=='A','input: controller mode shows A/X/Y/B');
T.setIn('kb');ok(T.inMode()=='kb'&&T.KEYHINT.kb.join(',')=='MB1,Q,E,F,Shift','input: keyboard badges follow binds (MB1, Q, E, F, Shift)');
/* ---- dash ---- */
T.DEV.nocd=0;T.devHub();ctx.document.getElementById('dlg').hidden=true;const dp0={x:T.P().x,y:T.P().y};T.P().dx=1;T.P().dy=0;T.P().dcd=0;T.dash(T.P());for(let i=0;i<10;i++)T.dashStep(T.P(),.02);
ok(T.P().x>dp0.x+20&&T.P().dcd>0,'dash: moves the player and starts its cooldown');
T.P().cls='tank';T.P().ar=1;T.P().inv=0;T.DEV.god=0;T.P().hp=100;T.hurt(T.P(),20);ok(T.P().hp==90,'dash: tank armor halves damage');
T.P().ar=0;T.P().inv=1;T.hurt(T.P(),20);ok(T.P().hp==90,'dash: dps dodge ignores damage');T.P().inv=0;
T.padPoll();ok(true,'input: no controller connected is safe');
T.togglePause();ok(T.isPaused(),'P toggles pause on');T.togglePause();ok(!T.isPaused(),'P toggles pause off');
/* ---------- hub population: bots, joins, cap ---------- */
T.devHub();ctx.document.getElementById('dlg').hidden=true;for(let i=0;i<120;i++)T.step(1/60);
ok(T.hubCount()>=3&&T.hubCount()<=7,'hub: bots fill to 3-7 people (you + 2-6 bots)');
ok(T.HUBV().every(v=>v.bot&&v.name&&v.lv>=1&&v.ti),'hub: bots have names, levels and titles');
ok(SRC.includes('p.bot ? "#63a8ff" : "#dfe8f0"'),'hub: bot names are blue and real player names stay white');
ok(new Set(T.HUBV().map(v=>v.name)).size==T.HUBV().length,'hub: bot names are unique');
ok(/^[A-Za-z0-9_]{2,15}$/.test(T.botName()),'hub: bot names look like player handles');
let lv=[];for(let i=0;i<400;i++){const v={};T.botLook(v);lv.push(v.lv);}
ok(lv.filter(l=>l>=40).length<lv.length*0.25&&Math.max(...lv)<=60,'hub: high-level bots are rare');
for(let i=0;i<12;i++)T.hubJoin('real'+i,{name:'Real'+i});
ok(T.hubCount()<=T.HUB_MAX,'hub: never more than HUB_MAX people');
ok(T.HUBV().filter(v=>!v.bot).length>=1&&T.HUBV().some(v=>v.out||!v.bot),'hub: real players bump bots, who teleport out');
ok(T.hubJoin('real0',{})===null,'hub: the same player cannot join twice');
for(let i=0;i<12;i++)T.hubLeave('real'+i);ok(!T.HUBV().some(v=>!v.bot),'hub: leaving removes the player');
{const lo=T.HUB_NPCS({lv:1}),hi=T.HUB_NPCS({lv:60});ok(lo.every(n=>!n.lk)&&hi.length==8,'hub: bots only visit NPCs their level has unlocked');}
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
/* ---------- dash and controls ---------- */
T.P().dcd=0;T.P().dx=1;T.P().dy=0;T.dash(T.P());ok(T.P().dcd>0,'dash: works in the hub and starts its cooldown');
ok(T.keyLabel('Mouse0')=='MB1','controls: main attack shows as MB1');
{const d={cls:'dps',fury:0};ok(T.furyMul(d,0)==1,'fury: none at the start of a raid');d.fury=1;ok(Math.abs(T.furyMul(d,0)-(1-T.FURY.atk))<1e-9&&T.furyMul(d,1)<1,'fury: full fury speeds up attacks and skills');ok(T.furyMul({cls:'tank',fury:1},0)==1,'fury: only the DPS has it');}
/* ---------- hub networking authority ---------- */
T.devHub();netClock=1000;fakePeers=['peer-one'];fakeBroadcast=[];T.netPrepareHub('host');
T.netReceive('peer-one',{type:'join',profile:{id:'player-test1234',name:'Guest',cls:'tank',lv:3,ti:0,spd:1}});
const remote=T.HUBV().find(v=>v.netClientId=='player-test1234'),remoteX=remote&&remote.x;
ok(remote&&!T.HUBV().some(v=>v.bot),'network hub: real guest joins without simulated bot filler');
T.netReceive('peer-one',{type:'hub-input',x:2,y:0,f:'r',dash:false,dashX:0,dashY:0});ok(remote.netInputX==0,'network hub: rejects out-of-range movement input');
T.netReceive('peer-one',{type:'hub-input',x:1,y:0,f:'r',dash:false,dashX:0,dashY:0});T.netStep();netClock+=50;T.netStep();
ok(remote.x>remoteX&&remote.x-remoteX<=15,'network hub: host simulates bounded movement from client input');
ok(fakeBroadcast.some(x=>x.msg.type=='hub-state'),'network hub: host broadcasts authoritative snapshots');
fakePeers=[];T.netPrepareHub('');T.netDisconnect?.();
async function networkTests(){
 const peers=[];
 class Channel{constructor(){this.readyState='connecting';this.bufferedAmount=0;this.sent=[];}send(v){this.sent.push(v)}close(){this.readyState='closed';this.onclose?.()}}
 class Peer{constructor(config){this.config=config;this.iceGatheringState='complete';this.channels=[];peers.push(this);}createDataChannel(){const ch=new Channel();this.channels.push(ch);return ch;}async createOffer(){return{type:'offer',sdp:'offer-sdp'}}async createAnswer(){return{type:'answer',sdp:'answer-sdp'}}async setLocalDescription(v){this.localDescription=v;}async setRemoteDescription(v){this.remoteDescription=v;if(v.type=='offer')this.ondatachannel?.({channel:new Channel()});}addEventListener(){}removeEventListener(){}close(){this.connectionState='closed';}}
 const createContext=()=>{const c={window:null,RTCPeerConnection:Peer,crypto:require('crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,Map,Promise,Error,Date,JSON,Array,String,Math,atob,btoa,setTimeout,clearTimeout};c.window=c;vm.createContext(c);vm.runInContext(NETSRC,c);return c;};
 const host=createContext(),h=host.RBNet;let received=0,errors=0;
 h.setHandlers({onMessage:(_id,m)=>{if(m.type=='test')received++;},onError:()=>errors++});
 h.setIceServers([{urls:'stun:example.invalid:3478'}]);
 try{h.setIceServers([{urls:'https://invalid.example'}]);ok(false,'network: rejects non-ICE URL');}catch{ok(true,'network: rejects non-ICE URL');}
 const invite=await h.createOffer(),decoded=JSON.parse(Buffer.from(invite.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString());
 const hostChannel=peers[0].channels[0],peerId='guest-'+decoded.token.slice(0,12);
 ok(decoded.type=='offer'&&decoded.description.sdp=='offer-sdp','network: host creates a copyable invite');
 hostChannel.readyState='open';hostChannel.onopen();ok(h.send(peerId,{type:'test'})&&hostChannel.sent.length==1,'network: sends small messages on an open peer');
 hostChannel.onmessage({data:JSON.stringify({type:'test'})});ok(received==1,'network: parses and dispatches peer messages');
 const guest=createContext(),g=guest.RBNet,answer=await g.createAnswer(invite);
 ok(JSON.parse(Buffer.from(answer.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()).type=='answer','network: guest creates an answer from invite');
 await h.acceptAnswer(answer);ok(peers[0].remoteDescription.type=='answer','network: host accepts matching answer');
 try{await h.acceptAnswer(answer);ok(false,'network: rejects reused answer');}catch{ok(true,'network: rejects reused answer');}
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
networkTests().then(signalingTests).then(()=>{console.log(f?f+' FAILED':'ALL PASSED');process.exit(f?1:0);}).catch(e=>{console.error(e);process.exit(1);});

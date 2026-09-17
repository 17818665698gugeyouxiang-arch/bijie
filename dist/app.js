'use strict';
const KEY='piggy-island-v1';
const $=id=>document.getElementById(id);
const canonical=name=>name.normalize('NFKC').trim().toLocaleLowerCase();
let state={pigs:[{id:crypto.randomUUID(),name:'小粉',count:0}],selected:null};
let storageOK=true;
try{const raw=localStorage.getItem(KEY);if(raw){const parsed=JSON.parse(raw);if(!Array.isArray(parsed.pigs))throw Error('invalid');const names=new Set(),ids=new Set();for(const p of parsed.pigs){if(typeof p.name!=='string'||!canonical(p.name)||p.name.length>20||typeof p.id!=='string'||!Number.isSafeInteger(p.count)||p.count<0||names.has(canonical(p.name))||ids.has(p.id))throw Error('invalid');names.add(canonical(p.name));ids.add(p.id)}state=parsed}}catch(e){storageOK=false}
if(!state.pigs.some(p=>p.id===state.selected))state.selected=state.pigs[0]?.id??null;
let mode='add',pendingDelete=null,animationTimer,toastTimer,hitInProgress=false,armAnimation=null,switching=false,queuedPig=null,transitionRun=null,hitSpeed='slow';
const current=()=>state.pigs.find(p=>p.id===state.selected);
function notify(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2700)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));storageOK=true;$('save-label').textContent=cloud?.player?'云存档待同步':'本机缓存';queueCloudSync?.()}catch(e){storageOK=false;$('save-label').textContent='记录暂未保存';notify('浏览器无法保存记录，请检查存储权限。')}}
function stopAnimation(){cancelTransition();cancelAnimationFrame(animationTimer);armAnimation?.cancel();armAnimation=null;$('world').classList.remove('striking','dizzy','impacted','fast-hit');$('effects').replaceChildren();hitInProgress=false;$('hit').disabled=!current()}
function render(){const p=current();$('count').textContent=(p?.count??0).toLocaleString();$('total').textContent=state.pigs.reduce((n,p)=>n+p.count,0).toLocaleString();$('pig-name').textContent=p?.name??'';$('pig-number').textContent=state.pigs.length;$('world').classList.toggle('empty',!p);$('empty-world').hidden=!!p;$('hit').disabled=!p||switching;$('pig-list').replaceChildren();for(const pig of state.pigs){const row=document.createElement('div');row.className='pig-row'+(pig.id===state.selected?' active':'');const button=document.createElement('button');button.className='select-pig';button.setAttribute('aria-pressed',String(pig.id===state.selected));const img=document.createElement('img');img.src='assets/pig.png';img.alt='';img.className='mini-pig';const text=document.createElement('span');text.className='row-copy';const name=document.createElement('span');name.className='row-name';name.textContent=pig.name;const count=document.createElement('span');count.className='row-count';count.textContent=pig.count.toLocaleString()+' 次肘击';text.append(name,count);button.append(img,text);button.onclick=()=>switchPig(pig.id);const remove=document.createElement('button');remove.className='remove-pig';remove.textContent='×';remove.setAttribute('aria-label','删除 '+pig.name);remove.title='删除这只猪';remove.onclick=()=>{pendingDelete=pig.id;$('delete-dialog').returnValue='cancel';$('delete-description').textContent='删除「'+pig.name+'」后，它的 '+pig.count+' 次肘击记录也会一起删除。';$('delete-dialog').showModal()};row.append(button,remove);$('pig-list').append(row)}}
function addEffect(icon,x,y,size,delay=0){const effect=document.createElement('span');effect.className='spark';effect.textContent=icon;effect.style.left=x+'%';effect.style.top=y+'%';effect.style.fontSize=size+'px';effect.style.animationDelay=delay+'ms';const angle=Math.random()*Math.PI*2;effect.style.setProperty('--x',Math.cos(angle)*(65+Math.random()*65)+'px');effect.style.setProperty('--y',Math.sin(angle)*(45+Math.random()*65)-16+'px');effect.style.setProperty('--r',(Math.random()*220-110)+'deg');$('effects').append(effect)}
function finishHit(){const p=current();if(p&&p.count<Number.MAX_SAFE_INTEGER){p.count++;save();render()}stopAnimation()}
function hit(){
  const p=current();
  if(!p||switching||hitInProgress||$('editor').open||$('delete-dialog').open||p.count>=Number.MAX_SAFE_INTEGER)return;
  hitInProgress=true;$('hit').disabled=true;
  const world=$('world'),pig=$('pig'),arm=$('arm');
  world.classList.add('striking');
  // Use the same contact point for the elbow tip and the particle burst.
  const x=pig.offsetLeft+pig.offsetWidth*.64,y=pig.offsetTop+pig.offsetHeight*.38;
  const size=world.clientWidth*.30,lift=size*.85;
  Object.assign(arm.style,{width:size+'px',height:size+'px',left:(x-size*.50)+'px',top:(y-size*.82)+'px'});
  const fast=hitSpeed==='fast',duration=fast?1000/3:1000,contact=duration*.32,particles=Math.random()<(fast ? .8 : .5);
  world.classList.toggle('fast-hit',fast);
  armAnimation=arm.animate([
    {offset:0,opacity:0,transform:`translateY(${-lift}px)`},
    {offset:.10,opacity:1,transform:`translateY(${-lift*.9}px)`},
    {offset:.32,opacity:1,transform:'translateY(0)'},
    {offset:.40,opacity:1,transform:'translateY(0)'},
    {offset:1,opacity:0,transform:`translateY(${-lift}px)`}
  ],{duration,easing:'linear',fill:'both'});
  const step=()=>{
    if(!hitInProgress||!armAnimation)return;
    const time=Number(armAnimation.currentTime)||0;
    if(time>=contact-.1&&!world.classList.contains('impacted')){
      world.classList.add('impacted','dizzy');
      if(particles){
        for(let i=0;i<16;i++){
          const star=document.createElement('span');star.className='impact-particle';star.textContent=i%3?'✦':'●';
          const angle=i*Math.PI*2/16,distance=world.clientWidth*(.10+Math.random()*.09);
          Object.assign(star.style,{left:x+'px',top:y+'px',fontSize:(24+Math.random()*16)+'px',color:['#fff2a0','#ffbb43','#fff','#ff83ac'][i%4]});
          star.style.setProperty('--dx',Math.cos(angle)*distance+'px');star.style.setProperty('--dy',Math.sin(angle)*distance+'px');
          $('effects').append(star);
        }
      }
    }
    if(time>=duration){finishHit();return}
    animationTimer=requestAnimationFrame(step);
  };
  animationTimer=requestAnimationFrame(step);
}
function edit(action){mode=action;const p=current();if(action==='rename'&&!p)return;$('dialog-title').textContent=action==='add'?'认识一只新猪':'给猪猪改个名字';$('submit-name').textContent=action==='add'?'创建猪猪':'保存名字';$('name-input').value=action==='add'?'':p.name;$('name-error').textContent='';$('editor').showModal();$('name-input').focus();$('name-input').select()}
$('hit').onclick=hit;$('rename').onclick=()=>edit('rename');$('add').onclick=()=>edit('add');$('empty-add').onclick=()=>edit('add');$('close-editor').onclick=()=>$('editor').close();$('name-input').oninput=()=>$('name-error').textContent='';
$('name-form').onsubmit=e=>{e.preventDefault();const name=$('name-input').value.normalize('NFKC').trim();if(!name||name.length>20){$('name-error').textContent='请输入 1–20 个字的名字。';return}if(state.pigs.some(p=>canonical(p.name)===canonical(name)&&(mode==='add'||p.id!==state.selected))){$('name-error').textContent='这个名字已经有猪用啦，换一个吧。';return}if(mode==='add'){const pig={id:crypto.randomUUID(),name,count:0};state.pigs.push(pig);state.selected=pig.id}else current().name=name;stopAnimation();save();render();$('editor').close();notify(mode==='add'?'新猪猪已经来到小岛':'名字已保存')};
$('delete-dialog').addEventListener('close',()=>{if($('delete-dialog').returnValue!=='delete')return;state.pigs=state.pigs.filter(p=>p.id!==pendingDelete);if(state.selected===pendingDelete)state.selected=state.pigs[0]?.id??null;stopAnimation();save();render();notify('猪猪和它的记录已删除')});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!['INPUT','TEXTAREA','BUTTON','SELECT'].includes(document.activeElement.tagName)&&!$('editor').open&&!$('delete-dialog').open){e.preventDefault();hit()}});
function setSky(night){document.body.classList.toggle('night',night);$('sky-toggle').setAttribute('aria-pressed',String(night));$('sky-toggle').title=night?'切换为白天':'切换为黑夜';$('sky-toggle').querySelector('.sun-icon').textContent=night?'☾':'☀';$('sky-toggle').querySelector('.toggle-label').textContent=night?'黑夜':'白天';$('night-sky').replaceChildren();if(night){for(let i=0;i<28;i++){const star=document.createElement('i');star.className='sky-star';star.style.left=(Math.random()*100)+'%';star.style.top=(Math.random()*80)+'%';star.style.animationDelay=(Math.random()*1.8)+'s';star.style.setProperty('--size',(1+Math.random()*3)+'px');$('night-sky').append(star)}if(Math.random()<.3){const moon=document.createElement('i');moon.className='moon';moon.setAttribute('aria-label','月亮');$('night-sky').append(moon)}try{localStorage.setItem(KEY+'-sky','night')}catch{}}else{try{localStorage.setItem(KEY+'-sky','day')}catch{}}queueCloudSync?.()}
$('sky-toggle').onclick=()=>setSky(!document.body.classList.contains('night'));
function setHitSpeed(speed){hitSpeed=speed==='fast'?'fast':'slow';const fast=hitSpeed==='fast',toggle=$('speed-toggle');toggle.setAttribute('aria-pressed',String(fast));toggle.title=fast?'切换为缓慢肘击':'切换为快速肘击';toggle.querySelector('.speed-label').textContent=fast?'快速肘击 ×3':'缓慢肘击';try{localStorage.setItem(KEY+'-hit-speed',hitSpeed)}catch{}queueCloudSync?.()}
$('speed-toggle').onclick=()=>setHitSpeed(hitSpeed==='fast'?'slow':'fast');
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{const next=JSON.parse(e.newValue);if(Array.isArray(next.pigs)){state=next;stopAnimation();render()}}catch{}}});
render();try{setSky(localStorage.getItem(KEY+'-sky')==='night');setHitSpeed(localStorage.getItem(KEY+'-hit-speed'))}catch{setSky(false);setHitSpeed('slow')}if(storageOK)save();else{$('save-label').textContent='记录读取失败';notify('之前的记录无法读取；新操作会尝试重新保存。')}
function lockSceneControls(locked){
  for(const el of document.querySelectorAll('#add,#rename,.remove-pig'))el.disabled=locked;
  $('hit').disabled=locked||hitInProgress||!current();
  $('world').setAttribute('aria-busy',String(locked));
}
function cancelTransition(){
  if(transitionRun){for(const a of transitionRun.animations)a.cancel();transitionRun.ghost.remove();transitionRun=null}
  switching=false;queuedPig=null;lockSceneControls(false);
}
async function switchPig(id){
  if(!state.pigs.some(p=>p.id===id))return;
  if(switching){queuedPig=id;return}
  if(id===state.selected)return;
  stopAnimation();
  const scene=$('island-scene'),ghost=scene.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  ghost.querySelectorAll('button').forEach(el=>{el.disabled=true;el.tabIndex=-1});
  ghost.classList.add('departing-scene');ghost.setAttribute('aria-hidden','true');
  scene.before(ghost);
  switching=true;state.selected=id;save();render();lockSceneControls(true);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration=reduced?120:800;
  const outgoing=ghost.animate(reduced?[{opacity:1},{opacity:0}]:[
    {transform:'translate(0,0) scale(1)',opacity:1},
    {transform:'translate(-112%,-4%) scale(.76)',opacity:0}
  ],{duration,easing:'cubic-bezier(.4,0,.6,1)',fill:'both'});
  const incoming=scene.animate(reduced?[{opacity:0},{opacity:1}]:[
    {transform:'translate(112%,-4%) scale(.76)',opacity:0},
    {transform:'translate(0,0) scale(1)',opacity:1}
  ],{duration,easing:'cubic-bezier(.22,.7,.25,1)',fill:'both'});
  const run={ghost,animations:[outgoing,incoming]};transitionRun=run;
  await Promise.allSettled(run.animations.map(a=>a.finished));
  if(transitionRun!==run)return;
  const nextId=queuedPig;cancelTransition();
  if(nextId&&nextId!==state.selected)switchPig(nextId);
}

// Cloud save: localStorage remains an offline cache; a signed-in account owns the authoritative save.
var cloud = {
  client: window.supabase?.createClient(window.PIGGY_SUPABASE_CONFIG?.url, window.PIGGY_SUPABASE_CONFIG?.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } }),
  player: null,
  syncTimer: null,
  syncing: false,
  mode: 'login'
};
function validUsername(value){return /^[A-Za-z]{1,10}$/.test(value)}
function validPassword(value){return /^\d{8,}$/.test(value)}
function cloudPayload(){
  const pigs=state.pigs.map(p=>({id:p.id,name:p.name,count:p.count}));
  return {piggies:pigs,selected_pig_id:state.selected||'',hits:pigs.reduce((sum,p)=>sum+p.count,0),coins:0,level:1,xp:0,upgrades:[],unlocked_content:[],achievements:[],inventory:[],purchased_items:[],settings:{sky:document.body.classList.contains('night')?'night':'day',hit_speed:hitSpeed},statistics:{total_hits:pigs.reduce((sum,p)=>sum+p.count,0)}}
}
function queueCloudSync(){
  if(!cloud||!cloud.player||cloud.syncing)return;
  clearTimeout(cloud.syncTimer);
  cloud.syncTimer=setTimeout(syncCloud,550);
}
async function syncCloud(){
  if(!cloud||!cloud.player||cloud.syncing)return;
  cloud.syncing=true;$('save-label').textContent='正在同步云存档';
  const {error}=await cloud.client.from('game_progress').update(cloudPayload()).eq('player_id',cloud.player.id);
  cloud.syncing=false;
  if(error){$('save-label').textContent='云同步稍后重试';clearTimeout(cloud.syncTimer);cloud.syncTimer=setTimeout(syncCloud,2500);return}
  $('save-label').textContent='云存档已保存';
}
async function loadCloudProgress(){
  const {data,error}=await cloud.client.from('game_progress').select('*').eq('player_id',cloud.player.id).single();
  if(error)throw error;
  const pigs=Array.isArray(data.piggies)?data.piggies.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&Number.isSafeInteger(p.count)&&p.count>=0):[];
  state={pigs:pigs.length?pigs:[{id:crypto.randomUUID(),name:'小粉',count:0}],selected:pigs.some(p=>p.id===data.selected_pig_id)?data.selected_pig_id:pigs[0]?.id||null};
  try{localStorage.setItem(KEY,JSON.stringify(state));localStorage.setItem(KEY+'-sky',data.settings?.sky==='night'?'night':'day');localStorage.setItem(KEY+'-hit-speed',data.settings?.hit_speed==='fast'?'fast':'slow')}catch{}
  setSky(data.settings?.sky==='night');setHitSpeed(data.settings?.hit_speed);render();
}
async function invokeAuth(name,body){
  const response=await fetch(`${window.PIGGY_SUPABASE_CONFIG.url}/functions/v1/${name}`,{method:'POST',headers:{apikey:window.PIGGY_SUPABASE_CONFIG.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({code:'network_error'}));
  if(!response.ok)throw Object.assign(new Error(payload.code||'request_failed'),{code:payload.code});
  return payload;
}
function setAuthMode(mode){
  cloud.mode=mode;$('auth-title').textContent=mode==='signup'?'创建云存档账号':'登录云存档';$('login-tab').classList.toggle('active',mode==='login');$('signup-tab').classList.toggle('active',mode==='signup');$('confirm-wrap').hidden=mode==='login';$('auth-confirm').required=mode==='signup';$('auth-password').autocomplete=mode==='signup'?'new-password':'current-password';$('auth-submit').textContent=mode==='signup'?'创建账号并进入游戏':'登录并读取云存档';$('auth-error').textContent='';
}
function authError(code){return ({invalid_username:'用户名只能是 1–10 位英文字母。',invalid_password:'密码只能是至少 8 位数字。',username_taken:'这个用户名已被使用。',account_not_found:'Account not found.',incorrect_password:'Incorrect password.',rate_limited:'尝试次数过多，请 10 分钟后再试。',signup_failed:'账号创建失败，请稍后重试。',network_error:'无法连接云存档，请检查网络。'})[code]||'操作失败，请稍后重试。'}
async function openAccount(){
  if(cloud.player){$('auth-title').textContent=`已登录：${cloud.player.user_metadata.username}`;$('auth-form').querySelectorAll('label,input,.auth-tabs,.auth-help,#auth-submit').forEach(el=>el.hidden=true);$('signout').hidden=false}else{$('auth-form').querySelectorAll('label,input,.auth-tabs,.auth-help,#auth-submit').forEach(el=>el.hidden=false);$('signout').hidden=true;setAuthMode(cloud.mode);$('auth-username').focus()}$('auth-dialog').showModal();
}
$('account-button').onclick=openAccount;$('close-auth').onclick=()=>$('auth-dialog').close();$('login-tab').onclick=()=>setAuthMode('login');$('signup-tab').onclick=()=>setAuthMode('signup');
$('auth-form').onsubmit=async event=>{event.preventDefault();const username=$('auth-username').value.trim(),password=$('auth-password').value,confirm=$('auth-confirm').value;$('auth-error').textContent='';if(!validUsername(username))return void($('auth-error').textContent='用户名只能是 1–10 位英文字母。');if(!validPassword(password))return void($('auth-error').textContent='密码只能是至少 8 位数字。');if(cloud.mode==='signup'&&password!==confirm)return void($('auth-error').textContent='两次输入的密码不一致。');$('auth-submit').disabled=true;try{const result=await invokeAuth(cloud.mode==='signup'?'auth-signup':'auth-login',{username,password});const {error}=await cloud.client.auth.setSession({access_token:result.session.access_token,refresh_token:result.session.refresh_token});if(error)throw error;cloud.player=(await cloud.client.auth.getUser()).data.user;if(cloud.mode==='signup'){await cloud.client.from('game_progress').update(cloudPayload()).eq('player_id',cloud.player.id)}await loadCloudProgress();$('auth-dialog').close();notify('已读取云存档')}catch(error){$('auth-error').textContent=authError(error.code||error.message)}finally{$('auth-submit').disabled=false}};
$('signout').onclick=async()=>{await cloud.client.auth.signOut();cloud.player=null;$('account-button').textContent='登录云存档';$('save-label').textContent='本机缓存';$('auth-dialog').close();notify('已退出账号')};
if(cloud.client){cloud.client.auth.getUser().then(async({data})=>{if(data.user){cloud.player=data.user;$('account-button').textContent=`${data.user.user_metadata.username} · 云存档`;try{await loadCloudProgress()}catch{$('save-label').textContent='云存档读取失败'}}});cloud.client.auth.onAuthStateChange((_event,session)=>{if(!session){cloud.player=null;$('account-button').textContent='登录云存档'}})}

'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const pageSize = 20;
  const messagePageSize = 50;
  const state = { active:false, profile:null, target:null, tab:'users', panel:'tabs', offset:0, search:'', pendingOnline:false, transition:false, pendingTarget:null, refreshTimer:null, savedSidebar:null, savedScore:null, returnTab:'users' };
  const client = () => window.PiggyCloud?.client;
  const user = () => window.PiggyCloud?.player;
  const game = () => window.PiggyGame;
  const sidebar = () => document.querySelector('.sidebar');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format = value => Number(value || 0).toLocaleString();
  const bytes = text => new TextEncoder().encode(text).length;
  const skyKey = target => `piggy-online-sky:${user()?.id || 'guest'}:${target.user_id}`;
  const isMine = () => !!state.target && state.target.user_id === user()?.id;

  function setModeVisual(){ $('single-mode').classList.toggle('active',!state.active);$('online-mode').classList.toggle('active',state.active);document.body.classList.toggle('online-mode',state.active); }
  function setViewerSky(night){ if(!state.target)return; try{localStorage.setItem(skyKey(state.target),night?'night':'day')}catch{} game().applySky(night,false); }
  function applyTargetSky(){ if(!state.target)return; let night=false;try{night=localStorage.getItem(skyKey(state.target))==='night'}catch{}game().applySky(night,false); }
  function status(message,retry){ const target=document.querySelector('.online-status');if(!target)return;target.replaceChildren(document.createTextNode(message));if(retry){const b=document.createElement('button');b.textContent='重试';b.onclick=retry;target.append(' ',b)} }
  function updateScene(){
    const target=state.target;if(!target)return;
    $('pig-name').textContent=target.username;$('count').textContent=format(target.total_hits_received);
    const score=document.querySelector('.score');score.querySelector('span').textContent=`${target.username} · 被肘`;
    score.querySelector('small').replaceChildren(document.createTextNode('肘人 '),Object.assign(document.createElement('b'),{id:'total',textContent:format(target.total_hits_given)}));
    const old=document.querySelectorAll('.online-board,.online-ledger');old.forEach(node=>node.remove());
    const board=document.createElement('button');board.className='online-board';board.type='button';board.innerHTML='<span>MESSAGE BOARD</span><b>留言板 ↗</b>';board.onclick=openBoard;$('world').append(board);
    if(isMine()){const ledger=document.createElement('button');ledger.className='online-ledger';ledger.type='button';ledger.innerHTML='<span>被肘记录</span><b>点我查看 →</b>';ledger.onclick=openHistory;$('world').append(ledger)}
    $('hit').disabled=isMine();document.querySelector('.action p').textContent=isMine()?'这是你的猪，不能肘自己。':'ONE ELBOW AT A TIME · SPACE ALSO WORKS';
    applyTargetSky();
  }
  async function getProfile(id){ const {data,error}=await client().from('online_profiles').select('*').eq('user_id',id).single();if(error)throw error;return data; }
  async function enter(){
    if(!user()){state.pendingOnline=true;$('account-button').click();return}
    try{
      const {data,error}=await client().rpc('create_online_profile');if(error)throw error;state.profile=data;state.active=true;state.tab='users';state.panel='tabs';state.offset=0;
      if(!state.savedSidebar)state.savedSidebar=[...sidebar().childNodes];
      setModeVisual();renderShell();
      const {data:others,error:otherError}=await client().from('online_profiles').select('*').neq('user_id',user().id).order('username_normalized',{ascending:true}).limit(pageSize);
      if(otherError)throw otherError;
      if(others.length){await openTarget(others[Math.floor(Math.random()*others.length)]);await loadUsers()}
      else{await openTarget(state.profile);state.tab='mine';renderMine();status('这里暂时还没有其他猪猪。')}
      clearInterval(state.refreshTimer);state.refreshTimer=setInterval(refreshTarget,15000);
    }catch(error){state.active=false;setModeVisual();game().notify('联机数据暂时没有更新');}
  }
  function leave(){
    if(!state.active)return;state.active=false;clearInterval(state.refreshTimer);document.querySelectorAll('.online-board,.online-ledger').forEach(n=>n.remove());
    if(state.savedSidebar){sidebar().replaceChildren(...state.savedSidebar);state.savedSidebar=null}
    state.target=null;setModeVisual();document.querySelector('.score > span').textContent='当前猪 · ELBOWS';document.querySelector('.score small').innerHTML='TOTAL ELBOWS <b id="total">0</b>';game().renderSingle();$('hit').onclick=game().singleHit;document.querySelector('.action p').innerHTML='ONE ELBOW AT A TIME <span>·</span> SPACE ALSO WORKS';
    try{game().applySky(localStorage.getItem('piggy-island-v1-sky')==='night',false)}catch{game().applySky(false,false)}
  }
  function renderShell(){
    sidebar().replaceChildren();
    const shell=document.createElement('section');shell.className='online-shell';shell.innerHTML='<div class="online-head"><span>猪猪广场</span><small>ASYNC ISLANDS</small></div><div class="online-tabs" role="tablist"><button data-tab="users">用户列表</button><button data-tab="received">被肘榜</button><button data-tab="given">肘击榜</button><button data-tab="mine">我的</button></div><div class="online-content" aria-live="polite"></div>';
    shell.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>selectTab(button.dataset.tab));sidebar().append(shell);selectTab(state.tab);
  }
  function content(){return document.querySelector('.online-content')}
  function tabVisual(){document.querySelectorAll('.online-tabs button').forEach(button=>button.classList.toggle('active',button.dataset.tab===state.tab));}
  async function selectTab(tab){state.tab=tab;state.panel='tabs';tabVisual();if(tab==='users')return loadUsers(true);if(tab==='received')return loadBoard('total_hits_received','被肘榜');if(tab==='given')return loadBoard('total_hits_given','肘击榜');return renderMine();}
  async function loadUsers(reset=false){if(reset)state.offset=0;content().innerHTML='<div class="online-skeleton">正在翻阅猪猪档案…</div>';try{
      let query=client().from('online_profiles').select('*').neq('user_id',user().id).order('username_normalized',{ascending:true});
      if(state.search)query=query.ilike('username_normalized',`%${state.search.toLowerCase()}%`);
      const {data,error}=await query.range(state.offset,state.offset+pageSize-1);if(error)throw error;renderUsers(data);
    }catch{content().innerHTML='<div class="online-empty">联机数据暂时没有更新<br><button id="online-retry">重试</button></div>';$('online-retry').onclick=()=>loadUsers(true)}}
  function renderUsers(rows){const root=content();root.replaceChildren();const search=document.createElement('div');search.className='online-search';search.innerHTML='<input aria-label="搜索用户名" placeholder="搜索 Username"><button>搜索</button>';const input=search.querySelector('input');input.value=state.search;search.querySelector('button').onclick=()=>{state.search=input.value.trim();loadUsers(true)};input.onkeydown=e=>{if(e.key==='Enter'){state.search=input.value.trim();loadUsers(true)}};root.append(search);
    if(!rows.length){const empty=document.createElement('p');empty.className='online-empty';empty.textContent=state.search?'没找到这个猪猪。':'这里暂时还没有其他猪猪。';root.append(empty);return}
    const list=document.createElement('div');list.className='online-list';rows.forEach(profile=>{const row=document.createElement('button');row.className='online-user';row.innerHTML=`<b>${escape(profile.username)}</b><small>被肘 ${format(profile.total_hits_received)} · 肘人 ${format(profile.total_hits_given)}</small>`;row.onclick=()=>openTarget(profile);list.append(row)});root.append(list);
    if(rows.length===pageSize){const more=document.createElement('button');more.className='online-more';more.textContent='加载更多';more.onclick=()=>{state.offset+=pageSize;loadUsers(false)};root.append(more)}
  }
  async function loadBoard(field,title){content().innerHTML='<div class="online-skeleton">正在整理榜单…</div>';try{const {data,error}=await client().from('online_profiles').select('*').order(field,{ascending:false}).order('username_normalized',{ascending:true}).limit(5);if(error)throw error;const root=content();root.replaceChildren();const h=document.createElement('h2');h.textContent=title;root.append(h);if(!data.length){root.insertAdjacentHTML('beforeend','<p class="online-empty">排行榜还空着，去肘几下吧。</p>');return}const list=document.createElement('ol');list.className='online-ranking';data.forEach(profile=>{const row=document.createElement('button');row.innerHTML=`<span>${escape(profile.username)}${profile.user_id===user().id?'（你）':''}</span><b>${format(profile[field])}</b>`;row.onclick=()=>profile.user_id===user().id?selectTab('mine'):openTarget(profile);const li=document.createElement('li');li.append(row);list.append(li)});root.append(list)}catch{status('联机数据暂时没有更新',()=>loadBoard(field,title))}}
  function renderMine(){const root=content();root.innerHTML=`<h2>我的</h2><div class="online-mine"><b>${escape(state.profile.username)}</b><span>被肘：${format(state.profile.total_hits_received)}</span><span>肘人：${format(state.profile.total_hits_given)}</span></div><p class="online-note">左侧的记录册会保存每一分钟的被肘记录。</p>`;if(!isMine())openTarget(state.profile)}
  async function openTarget(profile){
    const serial=(state.serial||0)+1;state.serial=serial;state.pendingTarget=profile;
    try{const fresh=await getProfile(profile.user_id);if(serial!==state.serial)return;if(state.transition)return;state.transition=true;state.pendingTarget=null;
      await game().transitionOnlineScene(()=>{state.target=fresh;updateScene()});state.transition=false;updateScene();
      if(state.pendingTarget&&state.pendingTarget.user_id!==state.target.user_id)openTarget(state.pendingTarget);
    }catch{status('联机数据暂时没有更新',()=>openTarget(profile));state.transition=false}
  }
  async function refreshTarget(){if(!state.active||!state.target)return;try{const fresh=await getProfile(state.target.user_id);state.target=fresh;if(fresh.user_id===state.profile.user_id)state.profile=fresh;updateScene();if(state.tab==='mine')renderMine()}catch{}}
  function hit(){if(!state.active||!state.target||isMine())return;const targetId=state.target.user_id;const started=game().playOnlineHit(async()=>{if(!state.active||state.target?.user_id!==targetId)return;state.target.total_hits_received++;updateScene();const {data,error}=await client().rpc('online_elbow',{target_user_id:targetId});if(error||!data?.[0]?.accepted){await refreshTarget();return}state.target.total_hits_received=data[0].target_total;if(state.profile.user_id===targetId)state.profile=state.target;updateScene()});if(!started)return}
  function boardHeader(back,title){const root=content();root.replaceChildren();const button=document.createElement('button');button.className='online-back';button.textContent='← 返回';button.onclick=()=>selectTab(back);const h=document.createElement('h2');h.textContent=title;root.append(button,h);return root}
  async function openBoard(){if(!state.target)return;state.panel='board';const target=state.target;const root=boardHeader(state.tab,`${target.username} 的留言板`);const list=document.createElement('div');list.className='message-list';root.append(list);const form=document.createElement('form');form.className='message-form';form.innerHTML='<textarea aria-label="留言内容" placeholder="留一句话（最多 150 UTF-8 bytes）"></textarea><small>0 / 150 bytes</small><button type="submit">发送</button><p class="message-error"></p>';root.append(form);const textarea=form.querySelector('textarea'),counter=form.querySelector('small'),error=form.querySelector('.message-error');textarea.oninput=()=>counter.textContent=`${bytes(textarea.value)} / 150 bytes`;form.onsubmit=async event=>{event.preventDefault();error.textContent='';if(bytes(textarea.value)>150){error.textContent='内容超过 150 UTF-8 bytes。';return}const {error:sendError}=await client().rpc('online_post_message',{target_user_id:target.user_id,message_body:textarea.value});if(sendError){error.textContent='发送失败，请重试';return}textarea.value='';counter.textContent='0 / 150 bytes';loadMessages(target,list)};loadMessages(target,list)}
  async function loadMessages(target,list,offset=0){list.innerHTML='<div class="online-skeleton">正在读取留言…</div>';const {data,error}=await client().from('online_messages').select('*').eq('target_id',target.user_id).order('created_at',{ascending:false}).range(offset,offset+messagePageSize-1);if(error){list.innerHTML='<p class="online-empty">留言暂时没有更新。</p>';return}list.replaceChildren();if(!data.length){list.innerHTML='<p class="online-empty">还没有留言，留第一句吧。</p>';return}data.forEach(message=>{const row=document.createElement('article');row.className='online-message';const when=new Date(message.created_at).toLocaleString();row.innerHTML=`<b>${escape(message.author_username)}</b><time>${escape(when)}</time><p>${escape(message.body)}</p>`;if(message.author_id===user().id||message.target_id===user().id){const remove=document.createElement('button');remove.textContent='删除';remove.onclick=async()=>{const {error}=await client().from('online_messages').delete().eq('id',message.id);if(!error)loadMessages(target,list,offset)};row.append(remove)}list.append(row)});if(data.length===messagePageSize){const more=document.createElement('button');more.className='online-more';more.textContent='加载更多';more.onclick=()=>loadMessages(target,list,offset+messagePageSize);list.append(more)}}
  async function openHistory(){if(!isMine())return;const root=boardHeader('mine','MY ELBOW HISTORY');const list=document.createElement('div');list.className='history-list';root.append(list);const load=async(offset=0)=>{list.innerHTML='<div class="online-skeleton">正在翻记录册…</div>';const {data,error}=await client().from('online_elbow_records').select('*').order('created_at',{ascending:false}).range(offset,offset+49);if(error){list.innerHTML='<p class="online-empty">记录暂时没有更新。</p>';return}list.replaceChildren();if(!data.length){list.innerHTML='<p class="online-empty">还没有被肘记录。</p>';return}data.forEach(record=>{const row=document.createElement('article');row.className='history-row';row.innerHTML=`<b>${escape(record.attacker_username)}</b><time>${new Date(record.minute_bucket).toLocaleString()}</time><strong>×${format(record.hit_count)}</strong>`;list.append(row)});if(data.length===50){const more=document.createElement('button');more.className='online-more';more.textContent='加载更多';more.onclick=()=>load(offset+50);list.append(more)}};load()}
  $('online-mode').onclick=enter;$('single-mode').onclick=leave;
  window.addEventListener('piggy-authenticated',()=>{if(state.pendingOnline){state.pendingOnline=false;enter()}});
  window.addEventListener('focus',refreshTarget);
  window.PiggyOnline={isActive:()=>state.active,setViewerSky,hit,enter,leave};
})();

'use strict';
const KEY='piggy-island-v1';
const $=id=>document.getElementById(id);
const canonical=name=>name.normalize('NFKC').trim().toLocaleLowerCase();
let state={pigs:[{id:crypto.randomUUID(),name:'小粉',count:0}],selected:null};
let storageOK=true;
try{const raw=localStorage.getItem(KEY);if(raw){const parsed=JSON.parse(raw);if(!Array.isArray(parsed.pigs))throw Error('invalid');const names=new Set(),ids=new Set();for(const p of parsed.pigs){if(typeof p.name!=='string'||!canonical(p.name)||p.name.length>20||typeof p.id!=='string'||!Number.isSafeInteger(p.count)||p.count<0||names.has(canonical(p.name))||ids.has(p.id))throw Error('invalid');names.add(canonical(p.name));ids.add(p.id)}state=parsed}}catch(e){storageOK=false}
if(!state.pigs.some(p=>p.id===state.selected))state.selected=state.pigs[0]?.id??null;
let mode='add',pendingDelete=null,animationTimer,toastTimer,hitInProgress=false,armAnimation=null;
const current=()=>state.pigs.find(p=>p.id===state.selected);
function notify(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2700)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));storageOK=true;$('save-label').textContent='记录自动保存'}catch(e){storageOK=false;$('save-label').textContent='记录暂未保存';notify('浏览器无法保存记录，请检查存储权限。')}}
function stopAnimation(){cancelAnimationFrame(animationTimer);armAnimation?.cancel();armAnimation=null;$('world').classList.remove('striking','dizzy','impacted');$('effects').replaceChildren();hitInProgress=false;$('hit').disabled=!current()}
function render(){const p=current();$('count').textContent=(p?.count??0).toLocaleString();$('total').textContent=state.pigs.reduce((n,p)=>n+p.count,0).toLocaleString();$('pig-name').textContent=p?.name??'';$('pig-number').textContent=state.pigs.length;$('world').classList.toggle('empty',!p);$('empty-world').hidden=!!p;$('hit').disabled=!p;$('pig-list').replaceChildren();for(const pig of state.pigs){const row=document.createElement('div');row.className='pig-row'+(pig.id===state.selected?' active':'');const button=document.createElement('button');button.className='select-pig';button.setAttribute('aria-pressed',String(pig.id===state.selected));const img=document.createElement('img');img.src='assets/pig.png';img.alt='';img.className='mini-pig';const text=document.createElement('span');text.className='row-copy';const name=document.createElement('span');name.className='row-name';name.textContent=pig.name;const count=document.createElement('span');count.className='row-count';count.textContent=pig.count.toLocaleString()+' 次肘击';text.append(name,count);button.append(img,text);button.onclick=()=>{stopAnimation();state.selected=pig.id;save();render()};const remove=document.createElement('button');remove.className='remove-pig';remove.textContent='×';remove.setAttribute('aria-label','删除 '+pig.name);remove.title='删除这只猪';remove.onclick=()=>{pendingDelete=pig.id;$('delete-dialog').returnValue='cancel';$('delete-description').textContent='删除「'+pig.name+'」后，它的 '+pig.count+' 次肘击记录也会一起删除。';$('delete-dialog').showModal()};row.append(button,remove);$('pig-list').append(row)}}
function addEffect(icon,x,y,size,delay=0){const effect=document.createElement('span');effect.className='spark';effect.textContent=icon;effect.style.left=x+'%';effect.style.top=y+'%';effect.style.fontSize=size+'px';effect.style.animationDelay=delay+'ms';const angle=Math.random()*Math.PI*2;effect.style.setProperty('--x',Math.cos(angle)*(65+Math.random()*65)+'px');effect.style.setProperty('--y',Math.sin(angle)*(45+Math.random()*65)-16+'px');effect.style.setProperty('--r',(Math.random()*220-110)+'deg');$('effects').append(effect)}
function finishHit(){const p=current();if(p&&p.count<Number.MAX_SAFE_INTEGER){p.count++;save();render()}stopAnimation()}
function hit(){
  const p=current();
  if(!p||hitInProgress||$('editor').open||$('delete-dialog').open||p.count>=Number.MAX_SAFE_INTEGER)return;
  hitInProgress=true;$('hit').disabled=true;
  const world=$('world'),pig=$('pig'),arm=$('arm');
  world.classList.add('striking');
  // Use the same contact point for the elbow tip and the particle burst.
  const x=pig.offsetLeft+pig.offsetWidth*.64,y=pig.offsetTop+pig.offsetHeight*.38;
  const size=world.clientWidth*.30,lift=size*.85;
  Object.assign(arm.style,{width:size+'px',height:size+'px',left:(x-size*.50)+'px',top:(y-size*.82)+'px'});
  const duration=1000,contact=duration*.32,particles=Math.random()<.5;
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
function setSky(night){document.body.classList.toggle('night',night);$('sky-toggle').setAttribute('aria-pressed',String(night));$('sky-toggle').title=night?'切换为白天':'切换为黑夜';$('sky-toggle').querySelector('.sun-icon').textContent=night?'☾':'☀';$('sky-toggle').querySelector('.toggle-label').textContent=night?'黑夜':'白天';$('night-sky').replaceChildren();if(night){for(let i=0;i<28;i++){const star=document.createElement('i');star.className='sky-star';star.style.left=(Math.random()*100)+'%';star.style.top=(Math.random()*80)+'%';star.style.animationDelay=(Math.random()*1.8)+'s';star.style.setProperty('--size',(1+Math.random()*3)+'px');$('night-sky').append(star)}if(Math.random()<.3){const moon=document.createElement('i');moon.className='moon';moon.setAttribute('aria-label','月亮');$('night-sky').append(moon)}try{localStorage.setItem(KEY+'-sky','night')}catch{}}else{try{localStorage.setItem(KEY+'-sky','day')}catch{}}}
$('sky-toggle').onclick=()=>setSky(!document.body.classList.contains('night'));
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{const next=JSON.parse(e.newValue);if(Array.isArray(next.pigs)){state=next;stopAnimation();render()}}catch{}}});
render();try{setSky(localStorage.getItem(KEY+'-sky')==='night')}catch{setSky(false)}if(storageOK)save();else{$('save-label').textContent='记录读取失败';notify('之前的记录无法读取；新操作会尝试重新保存。')}

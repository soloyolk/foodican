(async function(){
  const $ = (s)=>document.querySelector(s);
  $('#year').textContent = new Date().getFullYear();
  const menu = $('.menu-btn'), nav = $('.nav');
  menu?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});
  nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
  let data;
  try{ const r=await fetch('data/content.json',{cache:'no-store'}); data=await r.json(); }catch(e){ data={items:[]}; }
  const items=(data.items||[]).filter(x=>x.title).sort((a,b)=>new Date(b.publishedAt||0)-new Date(a.publishedAt||0));
  const card=(item)=>{
    const date=item.publishedAt?new Date(item.publishedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'';
    const emoji={food:'🍜',tech:'📱',life:'✨'}[item.category]||'✦';
    return `<article class="content-card"><a class="thumb" href="${esc(item.url||'#')}" target="_blank" rel="noreferrer">${item.thumbnail?`<img src="${esc(item.thumbnail)}" alt="" loading="lazy">`:`<span class="placeholder">${emoji}</span>`}</a><div class="card-body"><div class="card-meta">${emoji} ${esc(cap(item.category||'find'))}${date?' · '+esc(date):''}</div><h3>${esc(item.title)}</h3><p>${esc(shorten(item.description||'',120))}</p><a class="card-link" href="${esc(item.url||'#')}" target="_blank" rel="noreferrer">Watch / explore ↗</a></div></article>`;
  };
  const render=(id,list)=>{const el=document.getElementById(id);if(!el)return;el.innerHTML=list.length?list.slice(0,6).map(card).join(''):`<div class="content-card"><div class="thumb"><span class="placeholder">✦</span></div><div class="card-body"><div class="card-meta">Coming soon</div><h3>New Foodican adventures are on the way.</h3><p>Publish a video to YouTube and the site can automatically pick it up.</p></div></div>`;};
  render('latest-grid',items); render('food-grid',items.filter(x=>x.category==='food')); render('tech-grid',items.filter(x=>x.category==='tech')); render('life-grid',items.filter(x=>x.category==='life'));
  function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function cap(v){return v.charAt(0).toUpperCase()+v.slice(1);}
  function shorten(v,n){return v.length>n?v.slice(0,n-1).trim()+'…':v;}
})();

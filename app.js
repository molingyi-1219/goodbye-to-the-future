// This file runs as a local demonstration until a Supabase project is configured.
// The matching production schema is in supabase-schema.sql.
const STORE = 'gtf-memorials-v1';
const USER_STORE = 'gtf-current-user-v1';
let filter = 'all';
let imageData = '';
let user = JSON.parse(localStorage.getItem(USER_STORE) || 'null');
const examples = [
  { id:'example-guitar', title:'一把旧吉他', kind:'物', epitaph:'它教会我，把不擅长的事也弹下去。', story:'琴弦已经断了一根，却总让人想起那个夏天。', style:'cross', public:true, flowers:26, comments:[{name:'路过的人', text:'愿这段旋律一直在。'}] },
  { id:'example-stars', title:'成为天文学家', kind:'理想', epitaph:'没有抵达星星，却一直抬头看。', story:'献给那个曾经在草稿纸上画满星图的自己。', style:'arch', public:true, flowers:18, comments:[] },
  { id:'example-evening', title:'雨后操场的傍晚', kind:'记忆', epitaph:'风很轻，时间刚好。', story:'一些瞬间没有名字，却永远记得。', style:'weathered', public:true, flowers:11, comments:[{name:'匿名访客', text:'读到这里，也想起了我的傍晚。'}] }
];
const escapeHTML = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const saved = () => { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } };
const save = list => localStorage.setItem(STORE, JSON.stringify(list));
const allMemorials = () => [...saved(), ...examples];
const close = id => document.getElementById(id).close();

function updateUserUI() {
  document.getElementById('userLabel').textContent = user ? user.name : '访客';
  document.getElementById('loginBtn').textContent = user ? '已登录' : '登录';
}
function showGate(message) {
  document.getElementById('gate').hidden = false;
  document.getElementById('authNotice').textContent = message || '登录后才能立碑、献花或留言。';
}
function requireLogin() { if (!user) { showGate('请先登录，才能进行这项操作。'); return false; } return true; }

function render() {
  const list = allMemorials().filter(item => item.public && (filter === 'all' || item.kind === filter));
  const grid = document.getElementById('grid');
  grid.innerHTML = list.length ? list.map(item => {
    const image = item.image ? ` style="background-image:url('${item.image}')" class="stone has-image"` : ' class="stone"';
    return `<article${image}><span class="badge">${escapeHTML(item.kind)}</span><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.epitaph || '尚未留下墓志铭。')}</p><div class="meta"><span>✿ ${item.flowers || 0} 束花</span><span>查看碑文 →</span></div><button class="card-open" data-id="${item.id}" aria-label="查看 ${escapeHTML(item.title)}"></button></article>`;
  }).join('') : '<div class="empty">还没有公开的碑。</div>';
  grid.querySelectorAll('.card-open').forEach(button => button.onclick = () => openDetail(button.dataset.id));
}

function mutateOwn(id, change) {
  const list = saved();
  const localIndex = list.findIndex(item => item.id === id);
  if (localIndex >= 0) { change(list[localIndex]); save(list); }
  else { const demo = examples.find(item => item.id === id); if (demo) change(demo); }
  render(); openDetail(id);
}
function openDetail(id) {
  const item = allMemorials().find(row => row.id === id); if (!item) return;
  const isOwner = item.owner === user?.id;
  const article = document.getElementById('detail');
  const image = item.image ? `<img class="detail-img" src="${item.image}" alt="">` : '';
  const interaction = item.public ? `<div class="tribute"><span>已有 ${item.flowers || 0} 束花</span><button class="flower" id="flower">✿ 献一束花</button></div><h3>留言</h3><div>${(item.comments || []).map(c => `<div class="comment">${escapeHTML(c.text)}<small>— ${escapeHTML(c.name)}</small></div>`).join('') || '<p class="private-note">还没有留言。</p>'}</div><form class="comment-form" id="commentForm"><input required maxlength="180" name="text" placeholder="留下一句话…"><button>发表</button><label class="anonymous"><input type="checkbox" name="anonymous" checked>匿名留言</label></form>` : `<p class="private-note">这是私密碑，只有创建者可以查看。</p>`;
  article.innerHTML = `<div class="modal-top"><div><div class="detail-type">${escapeHTML(item.kind)} · ${item.public ? '公开碑' : '私密碑'}</div><h2>${escapeHTML(item.title)}</h2></div><button class="close" id="closeDetail">×</button></div>${image}<p><b>${escapeHTML(item.epitaph)}</b></p><p>${escapeHTML(item.story || '尚未留下更多文字。')}</p>${interaction}`;
  document.getElementById('detailDialog').showModal();
  document.getElementById('closeDetail').onclick = () => close('detailDialog');
  if (!item.public) return;
  document.getElementById('flower').onclick = () => { if (requireLogin()) mutateOwn(id, row => row.flowers = (row.flowers || 0) + 1); };
  document.getElementById('commentForm').onsubmit = event => {
    event.preventDefault(); if (!requireLogin()) return;
    const data = new FormData(event.currentTarget); const text = data.get('text').trim(); if (!text) return;
    const anonymous = data.get('anonymous') === 'on';
    mutateOwn(id, row => (row.comments || (row.comments = [])).push({ name: anonymous ? '匿名访客' : user.name, text }));
  };
}

function enterDemo(email) {
  const normalized = email.trim().toLowerCase();
  user = { id: `local-${normalized}`, name: normalized.split('@')[0] };
  localStorage.setItem(USER_STORE, JSON.stringify(user));
  document.getElementById('gate').hidden = true;
  updateUserUI();
}
document.getElementById('guest').onclick = () => { document.getElementById('gate').hidden = true; };
document.getElementById('emailLogin').onclick = () => {
  const email = document.getElementById('email').value.trim();
  if (!email || !email.includes('@')) { document.getElementById('authNotice').textContent = '请输入有效的邮箱地址。'; return; }
  enterDemo(email);
};
const quickLogin = document.createElement('button');
quickLogin.type = 'button'; quickLogin.className = 'auth-github'; quickLogin.textContent = '进入本机演示';
quickLogin.onclick = () => enterDemo('visitor@demo.local');
document.getElementById('guest').before(quickLogin);
document.getElementById('githubLogin').onclick = () => { document.getElementById('authNotice').textContent = 'GitHub 登录将在连接 Supabase 后启用；当前演示可用邮箱进入。'; };
document.getElementById('loginBtn').onclick = () => { if (!user) showGate(); };
document.querySelectorAll('#createBtn,#heroCreate').forEach(button => button.onclick = () => { if (requireLogin()) document.getElementById('createDialog').showModal(); });
document.querySelectorAll('[data-close="createDialog"]').forEach(button => button.onclick = () => close('createDialog'));
document.getElementById('filters').onclick = event => { const button = event.target.closest('[data-kind]'); if (!button) return; filter = button.dataset.kind; document.querySelectorAll('.filter').forEach(x => x.classList.toggle('active', x === button)); render(); };
document.getElementById('styles').onclick = event => { const button = event.target.closest('[data-style]'); if (!button) return; document.querySelectorAll('.style').forEach(x => x.classList.toggle('sel', x === button)); document.querySelector('[name="style"]').value = button.dataset.style; };
document.getElementById('image').onchange = event => { const file = event.target.files[0]; if (!file) return; if (file.size > 1024 * 1024) { alert('演示版图片请小于 1MB。'); event.target.value = ''; return; } const reader = new FileReader(); reader.onload = () => imageData = reader.result; reader.readAsDataURL(file); };
document.getElementById('createForm').onsubmit = event => {
  event.preventDefault(); if (!requireLogin()) return;
  const data = new FormData(event.currentTarget);
  const item = { id:String(Date.now()), owner:user.id, title:data.get('title').trim(), kind:data.get('kind'), epitaph:data.get('epitaph').trim(), story:data.get('story').trim(), style:data.get('style'), public:data.has('public'), image:imageData, flowers:0, comments:[], visits:[] };
  const list = saved(); list.unshift(item); try { save(list); } catch { alert('图片或内容过大，请换一张更小的图片。'); return; }
  imageData = ''; event.currentTarget.reset(); close('createDialog'); render(); if (item.public) openDetail(item.id);
};
document.body.insertAdjacentHTML('beforeend', `<dialog id="tendDialog"><form class="modal form" id="tendForm"><div class="modal-top wide"><h2>回来扫墓</h2><button type="button" class="close" id="closeTend">×</button></div><p class="private-note wide">留下一段回访记录：可以是近况、思念，或一句新的话。</p><label class="wide">今天想留下什么？<textarea required name="body" maxlength="800" placeholder="我又来看你了。"></textarea></label><label class="check wide"><input type="checkbox" name="public" checked>让访客看见这段回访</label><div class="actions wide"><button type="button" class="outline" id="cancelTend">取消</button><button class="primary">留下回访记录</button></div></form></dialog>`);

function formatVisitDate(value) { return new Date(value).toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' }); }
function openTend(id) {
  const item = allMemorials().find(row => row.id === id);
  if (!item || item.owner !== user?.id || !requireLogin()) return;
  const dialog = document.getElementById('tendDialog');
  dialog.showModal();
  document.getElementById('closeTend').onclick = document.getElementById('cancelTend').onclick = () => dialog.close();
  document.getElementById('tendForm').onsubmit = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget); const body = data.get('body').trim(); if (!body) return;
    mutateOwn(id, row => (row.visits || (row.visits = [])).unshift({ body, public:data.get('public') === 'on', createdAt:new Date().toISOString() }));
    event.currentTarget.reset(); dialog.close();
  };
}

function openDetail(id) {
  const item = allMemorials().find(row => row.id === id); if (!item) return;
  const isOwner = item.owner === user?.id;
  const article = document.getElementById('detail');
  const image = item.image ? `<img class="detail-img" src="${item.image}" alt="">` : '';
  const visits = (item.visits || []).filter(visit => isOwner || visit.public);
  const tending = `<section><div class="tribute"><span>扫墓回访</span>${isOwner ? '<button class="flower" id="tend">回来扫墓</button>' : ''}</div>${visits.length ? visits.map(visit => `<div class="comment"><small>${formatVisitDate(visit.createdAt)}</small><br>${escapeHTML(visit.body)}</div>`).join('') : '<p class="private-note">还没有留下回访记录。</p>'}</section>`;
  const interaction = item.public ? `<div class="tribute"><span>已有 ${item.flowers || 0} 束花</span><button class="flower" id="flower">✿ 献一束花</button></div><h3>留言</h3><div>${(item.comments || []).map(c => `<div class="comment">${escapeHTML(c.text)}<small>— ${escapeHTML(c.name)}</small></div>`).join('') || '<p class="private-note">还没有留言。</p>'}</div><form class="comment-form" id="commentForm"><input required maxlength="180" name="text" placeholder="留下一句话…"><button>发表</button><label class="anonymous"><input type="checkbox" name="anonymous" checked>匿名留言</label></form>` : `<p class="private-note">这是私密碑，只有创建者可以查看。</p>`;
  article.innerHTML = `<div class="modal-top"><div><div class="detail-type">${escapeHTML(item.kind)} · ${item.public ? '公开碑' : '私密碑'}</div><h2>${escapeHTML(item.title)}</h2></div><button class="close" id="closeDetail">×</button></div>${image}<p><b>${escapeHTML(item.epitaph)}</b></p><p>${escapeHTML(item.story || '尚未留下更多文字。')}</p>${tending}${interaction}`;
  document.getElementById('detailDialog').showModal();
  document.getElementById('closeDetail').onclick = () => close('detailDialog');
  if (isOwner) document.getElementById('tend').onclick = () => openTend(id);
  if (!item.public) return;
  document.getElementById('flower').onclick = () => { if (requireLogin()) mutateOwn(id, row => row.flowers = (row.flowers || 0) + 1); };
  document.getElementById('commentForm').onsubmit = event => { event.preventDefault(); if (!requireLogin()) return; const data = new FormData(event.currentTarget); const text = data.get('text').trim(); if (!text) return; mutateOwn(id, row => (row.comments || (row.comments = [])).push({ name:data.get('anonymous') === 'on' ? '匿名访客' : user.name, text })); };
}

if (user) document.getElementById('gate').hidden = true;
updateUserUI(); render();


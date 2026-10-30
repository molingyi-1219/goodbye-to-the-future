
/* goodbye to the future — Supabase browser client */
const config = window.GTF_SUPABASE;
const db = window.supabase?.createClient(config.url, config.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const STYLES = {
  cross: 'cross-gravestone-black.png', arch: 'arched-gravestone-black.png', weathered: 'broken-column-black.png',
  obelisk: 'gothic-obelisk-black.png', abstract: 'abstract-monolith-black.png', deco: 'art-deco-fan-black.png'
};
let user = null, filter = 'all', memorials = [], imageFile = null, albumFiles = [];
const TRIBUTES = { flower:['✿','献一束花'], candle:['♢','点一盏灯'], stone:['●','留一块石'], leaf:['❦','放一片叶'] };
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateText = value => new Date(value).toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' });
const close = id => $(id).close();
const siteURL = () => `${location.origin}${location.pathname}`;

function notice(message) { $('authNotice').textContent = message; }
function updateUserUI() {
  $('userLabel').textContent = user?.user_metadata?.username || (user ? '已登录' : '访客');
  $('loginBtn').textContent = user ? '退出登录' : '登录';
  $('myBtn').hidden = !user;
}
function showGate(message) { $('gate').hidden = false; notice(message || '登录后才能立碑、献花或留言。'); }
function requireLogin() { if (!user) { showGate('请先登录，才能进行这项操作。'); return false; } return true; }
function styleURL(item) { return item.image_url || STYLES[item.style] || STYLES.cross; }

async function attachImageURLs(rows) {
  return Promise.all(rows.map(async row => {
    if (!row.image_path) return row;
    const { data } = await db.storage.from('memorial-media').createSignedUrl(row.image_path, 60 * 30);
    return { ...row, image_url: data?.signedUrl || null };
  }));
}
async function loadMemorials() {
  const { data: records, error } = await db.from('memorials').select('*').order('created_at', { ascending:false });
  if (error) { console.error(error); return; }
  const ids = (records || []).map(row => row.id);
  if (!ids.length) { memorials = []; render(); return; }
  const [flowers, comments, visits, capsules, albumItems] = await Promise.all([
    db.from('flowers').select('memorial_id,user_id,tribute_type').in('memorial_id', ids),
    db.from('comments').select('*').in('memorial_id', ids).order('created_at', { ascending:false }),
    db.from('memorial_visits').select('*').in('memorial_id', ids).order('created_at', { ascending:false }),
    db.from('memorial_capsules').select('*').in('memorial_id', ids).order('reveal_at', { ascending:true }),
    db.from('memorial_album_items').select('*').in('memorial_id', ids).order('created_at', { ascending:false })
  ]);
  const commentIds = (comments.data || []).map(comment => comment.id);
  const { data: reports } = commentIds.length ? await db.from('comment_reports').select('comment_id,reason,status').in('comment_id', commentIds) : { data:[] };
  const decorated = await attachImageURLs(records || []);
  const decoratedAlbums = await Promise.all((albumItems.data || []).map(async item => {
    const { data } = await db.storage.from('memorial-media').createSignedUrl(item.image_path, 60 * 30);
    return { ...item, image_url: data?.signedUrl || null };
  }));
  memorials = decorated.map(row => ({ ...row,
    public: row.visibility === 'public', owner: row.owner_id,
    flowers: (flowers.data || []).filter(f => f.memorial_id === row.id),
    comments: (comments.data || []).filter(c => c.memorial_id === row.id).map(comment => ({ ...comment, reports:(reports || []).filter(report => report.comment_id === comment.id) })),
    visits: (visits.data || []).filter(v => v.memorial_id === row.id),
    capsules: (capsules.data || []).filter(c => c.memorial_id === row.id),
    album: decoratedAlbums.filter(a => a.memorial_id === row.id)
  }));
  render();
  showReminders();
}
function render() {
  const list = memorials.filter(item => item.public && (filter === 'all' || item.kind === filter));
  $('grid').innerHTML = list.length ? list.map(item => `<article class="stone" style="background-color:#000;background-image:linear-gradient(#000b,#000c),linear-gradient(180deg,transparent 25%,#000 74%),url('${styleURL(item)}')"><span class="badge">${escapeHTML(item.kind)}</span><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.epitaph || '尚未留下墓志铭。')}</p><div class="meta"><span>✿ ${item.flowers.length} 份献礼</span><span>查看碑文 →</span></div><button class="card-open" data-id="${item.id}" aria-label="查看 ${escapeHTML(item.title)}"></button></article>`).join('') : '<div class="empty">还没有公开的碑。成为第一个留下纪念的人。</div>';
  document.querySelectorAll('.card-open').forEach(button => button.onclick = () => openDetail(button.dataset.id));
}
function itemFor(id) { return memorials.find(item => item.id === id); }
function renderMyMemorials() {
  const mine = memorials.filter(item => item.owner === user?.id);
  $('myList').innerHTML = mine.length ? mine.map(item => `<article class="comment"><b>${escapeHTML(item.title)}</b><small>· ${item.public ? '公开展示' : '已隐藏'}</small><br><span class="private-note">${escapeHTML(item.kind)} · ${dateText(item.created_at)}</span><div class="actions"><button class="outline" data-toggle="${item.id}">${item.public ? '设为隐藏' : '公开展示'}</button><button class="outline" data-delete="${item.id}">删除</button></div></article>`).join('') : '<p class="private-note">你还没有立下任何碑。</p>';
  document.querySelectorAll('[data-toggle]').forEach(button => button.onclick = () => toggleVisibility(button.dataset.toggle));
  document.querySelectorAll('[data-delete]').forEach(button => button.onclick = () => deleteMemorial(button.dataset.delete));
}
function openMyMemorials() { if (!requireLogin()) return; renderMyMemorials(); $('myDialog').showModal(); }
async function toggleVisibility(id) {
  const item = itemFor(id); if (!item || item.owner !== user?.id) return;
  const { error } = await db.from('memorials').update({ visibility:item.public ? 'private' : 'public' }).eq('id', id).eq('owner_id', user.id);
  if (error) return alert(`状态未更新：${error.message}`);
  await loadMemorials(); renderMyMemorials();
}
async function deleteMemorial(id) {
  const item = itemFor(id); if (!item || item.owner !== user?.id) return;
  if (!confirm(`确定删除“${item.title}”吗？这会同时删除它的花、留言和回访记录。`)) return;
  const { error } = await db.from('memorials').delete().eq('id', id).eq('owner_id', user.id);
  if (error) return alert(`删除失败：${error.message}`);
  await loadMemorials(); renderMyMemorials();
}

function isOpened(capsule) { return new Date(capsule.reveal_at).getTime() <= Date.now(); }
function capsuleContent(item, isOwner) {
  if (!item.capsules.length) return '';
  return `<section class="memory-section"><div class="tribute"><span>时间胶囊</span>${isOwner ? '<button class="flower" id="addCapsule">封存一段话</button>' : ''}</div>${item.capsules.map(capsule => isOpened(capsule) ? `<div class="comment capsule-open"><small>已于 ${dateText(capsule.reveal_at)} 开启</small><br>${escapeHTML(capsule.body)}</div>` : `<div class="comment capsule-locked"><small>◈ 封存至 ${dateText(capsule.reveal_at)}</small>${isOwner ? '<br><span class="private-note">只有你现在可以读到：' + escapeHTML(capsule.body) + '</span>' : ''}</div>`).join('')}</section>`;
}
function albumContent(item, isOwner) {
  const photos = item.album.map(photo => `<figure class="album-item"><img src="${photo.image_url || ''}" alt="${escapeHTML(photo.caption || '纪念册照片')}"><figcaption>${escapeHTML(photo.caption || '')}</figcaption></figure>`).join('');
  return `<section class="memory-section"><div class="tribute"><span>纪念册${item.album.length ? ` · ${item.album.length} 张` : ''}</span>${isOwner ? '<button class="flower" id="addAlbum">添加照片</button>' : ''}</div>${photos ? `<div class="album">${photos}</div>` : '<p class="private-note">这里还没有照片。</p>'}</section>`;
}
function openDetail(id) {
  const item = itemFor(id); if (!item) return;
  const isOwner = item.owner === user?.id;
  const mine = item.flowers.find(f => f.user_id === user?.id);
  const visibleVisits = item.visits.filter(visit => isOwner || visit.is_public);
  const comments = item.comments.map(comment => `<div class="comment ${comment.status === 'hidden' ? 'comment-hidden' : ''}">${escapeHTML(comment.body)}<small>— ${comment.is_anonymous ? '匿名访客' : escapeHTML(comment.author_id === user?.id ? (user.user_metadata?.username || '我') : '访客')}</small>${isOwner ? `<button class="text-button" data-hide-comment="${comment.id}">${comment.status === 'hidden' ? '恢复显示' : '隐藏留言'}</button>${comment.reports?.length ? `<span class="report-count">${comment.reports.length} 个举报</span>` : ''}` : (comment.status === 'published' ? `<button class="text-button" data-report-comment="${comment.id}">举报</button>` : '')}</div>`).join('') || '<p class="private-note">还没有留言。</p>';
  const tributeButtons = Object.entries(TRIBUTES).map(([type,[symbol,label]]) => `<button class="tribute-choice ${mine?.tribute_type === type ? 'chosen' : ''}" data-tribute="${type}">${symbol} ${mine?.tribute_type === type ? '已' + label : label}</button>`).join('');
  const interaction = item.public ? `<section class="memory-section"><div class="tribute"><span>已有 ${item.flowers.length} 份献礼</span>${mine ? '<button class="flower" id="removeTribute">收回献礼</button>' : ''}</div><div class="tribute-choices">${tributeButtons}</div></section><section class="memory-section"><h3>留言</h3><div>${comments}</div><form class="comment-form" id="commentForm"><input required maxlength="180" name="text" placeholder="留下一句话…"><button>发表</button><label class="anonymous"><input type="checkbox" name="anonymous" checked>匿名留言</label></form></section>` : '<p class="private-note">这是私密碑，只有创建者可以查看。</p>';
  const tending = `<section class="memory-section"><div class="tribute"><span>扫墓回访</span>${isOwner ? '<button class="flower" id="tend">回来扫墓</button>' : ''}</div>${visibleVisits.length ? visibleVisits.map(visit => `<div class="comment"><small>${dateText(visit.created_at)}</small><br>${escapeHTML(visit.body)}</div>`).join('') : '<p class="private-note">还没有留下回访记录。</p>'}</section>`;
  $('detail').innerHTML = `<div class="modal-top"><div><div class="detail-type">${escapeHTML(item.kind)} · ${item.public ? '公开碑' : '私密碑'}</div><h2>${escapeHTML(item.title)}</h2></div><button class="close" id="closeDetail">×</button></div><img class="detail-img" src="${styleURL(item)}" alt=""><p><b>${escapeHTML(item.epitaph)}</b></p><p>${escapeHTML(item.story || '尚未留下更多文字。')}</p>${albumContent(item, isOwner)}${capsuleContent(item, isOwner)}${tending}${interaction}`;
  $('detailDialog').showModal();
  $('closeDetail').onclick = () => close('detailDialog');
  if (isOwner) { $('tend').onclick = () => openTend(id); $('addCapsule')?.addEventListener('click', () => openCapsule(id)); $('addAlbum')?.addEventListener('click', () => openAlbum(id)); }
  if (!item.public) return;
  document.querySelectorAll('[data-tribute]').forEach(button => button.onclick = () => setTribute(item, button.dataset.tribute));
  $('removeTribute')?.addEventListener('click', () => removeTribute(item));
  document.querySelectorAll('[data-hide-comment]').forEach(button => button.onclick = () => moderateComment(item.id, button.dataset.hideComment));
  document.querySelectorAll('[data-report-comment]').forEach(button => button.onclick = () => reportComment(button.dataset.reportComment));
  $('commentForm').onsubmit = async event => {
    event.preventDefault(); if (!requireLogin()) return;
    const form = new FormData(event.currentTarget); const body = form.get('text').trim(); if (!body) return;
    const { error } = await db.from('comments').insert({ memorial_id:item.id, author_id:user.id, body, is_anonymous:form.get('anonymous') === 'on', status:'published' });
    if (error) return alert(`留言未保存：${error.message}`);
    await loadMemorials(); openDetail(item.id);
  };
}
async function setTribute(item, type) {
  if (!requireLogin()) return;
  const { error } = await db.from('flowers').upsert({ memorial_id:item.id, user_id:user.id, tribute_type:type }, { onConflict:'memorial_id,user_id' });
  if (error) return alert(`献礼未保存：${error.message}`);
  await loadMemorials(); openDetail(item.id);
}
async function removeTribute(item) {
  if (!requireLogin()) return;
  const { error } = await db.from('flowers').delete().eq('memorial_id', item.id).eq('user_id', user.id);
  if (error) return alert(`操作未保存：${error.message}`);
  await loadMemorials(); openDetail(item.id);
}
async function moderateComment(memorialId, commentId) {
  const comment = itemFor(memorialId)?.comments.find(c => c.id === commentId); if (!comment) return;
  const { error } = await db.from('comments').update({ status:comment.status === 'hidden' ? 'published' : 'hidden' }).eq('id', commentId);
  if (error) return alert(`留言状态未更新：${error.message}`);
  await loadMemorials(); openDetail(memorialId);
}
async function reportComment(commentId) {
  if (!requireLogin()) return;
  const reason = prompt('请简短说明举报原因（例如：骚扰、仇恨、广告）：'); if (!reason?.trim()) return;
  const { error } = await db.from('comment_reports').insert({ comment_id:commentId, reporter_id:user.id, reason:reason.trim() });
  alert(error ? `举报未提交：${error.message}` : '已收到举报，碑主可以管理这条留言。');
}
function openTend(id) {
  const item = itemFor(id); if (!item || item.owner !== user?.id) return;
  $('tendDialog').showModal();
  $('closeTend').onclick = $('cancelTend').onclick = () => close('tendDialog');
  $('tendForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const body = data.get('body').trim(); if (!body) return;
    const { error } = await db.from('memorial_visits').insert({ memorial_id:id, author_id:user.id, body, is_public:data.get('public') === 'on' });
    if (error) return alert(`回访未保存：${error.message}`);
    form.reset(); close('tendDialog'); await loadMemorials(); openDetail(id);
  };
}
function openCapsule(id) {
  const item = itemFor(id); if (!item || item.owner !== user?.id) return;
  $('capsuleForm').dataset.memorialId = id;
  $('capsuleDialog').showModal();
}
async function saveCapsule(event) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const body = data.get('body').trim();
  if (!body) return; const revealAt = new Date(data.get('revealAt')); if (Number.isNaN(revealAt.getTime()) || revealAt <= new Date()) return alert('请选择未来的开启时间。');
  const { error } = await db.from('memorial_capsules').insert({ memorial_id:form.dataset.memorialId, author_id:user.id, body, reveal_at:revealAt.toISOString(), is_public:data.get('public') === 'on' });
  if (error) return alert(`时间胶囊未保存：${error.message}`);
  const id = form.dataset.memorialId; form.reset(); close('capsuleDialog'); await loadMemorials(); openDetail(id);
}
function openAlbum(id) {
  const item = itemFor(id); if (!item || item.owner !== user?.id) return;
  albumFiles = []; $('albumForm').dataset.memorialId = id; $('albumDialog').showModal();
}
async function saveAlbum(event) {
  event.preventDefault(); const form = event.currentTarget;
  if (!albumFiles.length) return alert('请至少选择一张照片。');
  const button = form.querySelector('.primary'); button.disabled = true;
  try {
    const paths = await Promise.all(albumFiles.map(uploadImage));
    const caption = new FormData(form).get('caption').trim();
    const rows = paths.map(image_path => ({ memorial_id:form.dataset.memorialId, author_id:user.id, image_path, caption }));
    const { error } = await db.from('memorial_album_items').insert(rows); if (error) throw error;
    const id = form.dataset.memorialId; form.reset(); albumFiles = []; close('albumDialog'); await loadMemorials(); openDetail(id);
  } catch (error) { alert(`纪念册未保存：${error.message}`); }
  finally { button.disabled = false; }
}
function showReminders() {
  if (!user) return;
  const today = new Date(); const month = today.getMonth() + 1, day = today.getDate();
  const due = memorials.filter(item => item.owner === user.id && item.reminder_enabled && item.anniversary_date && (() => { const date = new Date(`${item.anniversary_date}T00:00:00`); return date.getMonth() + 1 === month && date.getDate() === day; })());
  $('reminderBar').innerHTML = due.length ? `今天是 <b>${due.map(item => escapeHTML(item.title)).join('、')}</b> 的纪念日。<button id="openReminder">去看看</button>` : '';
  $('openReminder')?.addEventListener('click', () => openDetail(due[0].id));
}
async function uploadImage(file) {
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error('图片请小于 5MB。');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await db.storage.from('memorial-media').upload(path, file, { contentType:file.type, upsert:false });
  if (error) throw error;
  return path;
}
async function createMemorial(event) {
  event.preventDefault(); if (!requireLogin()) return;
  const form = event.currentTarget; const data = new FormData(form); const button = form.querySelector('.primary'); button.disabled = true;
  try {
    const image_path = await uploadImage(imageFile);
    const anniversary = data.get('anniversary');
    const { error } = await db.from('memorials').insert({ owner_id:user.id, title:data.get('title').trim(), kind:data.get('kind'), epitaph:data.get('epitaph').trim(), story:data.get('story').trim(), style:data.get('style'), visibility:data.has('public') ? 'public' : 'private', image_path, anniversary_date:anniversary || null, reminder_enabled:!!anniversary && data.has('reminder') });
    if (error) throw error;
    imageFile = null; form.reset(); close('createDialog'); await loadMemorials();
  } catch (error) { alert(`这块碑没有保存：${error.message}`); }
  finally { button.disabled = false; }
}
function credentials() {
  const username = $('username').value.trim();
  const password = $('password').value;
  if (username.length < 3 || username.length > 24) { notice('账号需要是 3–24 个字符。'); return null; }
  if (password.length < 6) { notice('密码至少需要 6 位。'); return null; }
  // Supabase stores its password accounts as email identities. This deterministic internal address
  // lets visitors use an account name without ever entering or receiving an email address.
  const token = Array.from(new TextEncoder().encode(username.toLowerCase())).map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { email: `user-${token}@goodbyetothefuture.app`, password, username };
}
async function signInWithPassword() {
  const input = credentials(); if (!input) return;
  const { error } = await db.auth.signInWithPassword({ email: input.email, password: input.password });
  notice(error ? `登录失败：${error.message}` : '登录成功。');
}
async function registerWithPassword() {
  const input = credentials(); if (!input) return;
  const { data, error } = await db.auth.signUp({ email: input.email, password: input.password, options:{ data:{ username:input.username } } });
  if (error) return notice(`注册失败：${error.message}`);
  notice(data.session ? '账号已创建并登录。' : '账号已创建，请直接用账号和密码登录。');
}
async function signInGuest() {
  const { error } = await db.auth.signInAnonymously();
  notice(error ? `访客登录失败：${error.message}` : '已作为访客进入。请不要清除浏览器数据，否则无法找回这块碑。');
}
async function initAuth() {
  const { data } = await db.auth.getSession(); user = data.session?.user || null;
  if (user) $('gate').hidden = true;
  updateUserUI();
  db.auth.onAuthStateChange((_event, session) => { user = session?.user || null; if (user) $('gate').hidden = true; updateUserUI(); loadMemorials(); });
}
function addStyleOptions() {
  [['obelisk','哥特方尖碑'],['abstract','抽象纪念碑'],['deco','装饰艺术碑']].forEach(([value,label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'style'; b.dataset.style = value; b.textContent = label; $('styles').append(b);
  });
}
function wireUI() {
  $('guest').onclick = signInGuest;
  $('emailLogin').onclick = signInWithPassword; $('emailRegister').onclick = registerWithPassword;
  $('myBtn').onclick = openMyMemorials; $('closeMy').onclick = () => close('myDialog');
  $('loginBtn').onclick = async () => { if (user) await db.auth.signOut(); else showGate(); };
  document.querySelectorAll('#createBtn,#heroCreate').forEach(button => button.onclick = () => { if (requireLogin()) $('createDialog').showModal(); });
  document.querySelectorAll('[data-close="createDialog"]').forEach(button => button.onclick = () => close('createDialog'));
  $('filters').onclick = event => { const button = event.target.closest('[data-kind]'); if (!button) return; filter = button.dataset.kind; document.querySelectorAll('.filter').forEach(x => x.classList.toggle('active', x === button)); render(); };
  $('styles').onclick = event => { const button = event.target.closest('[data-style]'); if (!button) return; document.querySelectorAll('.style').forEach(x => x.classList.toggle('sel', x === button)); document.querySelector('[name="style"]').value = button.dataset.style; };
  $('image').onchange = event => { imageFile = event.target.files[0] || null; };
  $('createForm').onsubmit = createMemorial;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="tendDialog"><form class="modal form" id="tendForm"><div class="modal-top wide"><h2>回来扫墓</h2><button type="button" class="close" id="closeTend">×</button></div><p class="private-note wide">留下一段回访记录：可以是近况、思念，或一句新的话。</p><label class="wide">今天想留下什么？<textarea required name="body" maxlength="800" placeholder="我又来看你了。"></textarea></label><label class="check wide"><input type="checkbox" name="public" checked>让访客看见这段回访</label><div class="actions wide"><button type="button" class="outline" id="cancelTend">取消</button><button class="primary">留下回访记录</button></div></form></dialog><dialog id="capsuleDialog"><form class="modal form" id="capsuleForm"><div class="modal-top wide"><h2>封存时间胶囊</h2><button type="button" class="close" data-close-capsule>×</button></div><p class="private-note wide">在指定日期前，只有创建者能读到它。</p><label class="wide">想留给未来的一段话<textarea required name="body" maxlength="1600" placeholder="写给未来的自己，或写给此刻。"></textarea></label><label>开启时间<input required type="datetime-local" name="revealAt"></label><label class="check"><input type="checkbox" name="public" checked>开启后向访客公开</label><div class="actions wide"><button type="button" class="outline" data-close-capsule>取消</button><button class="primary">封存</button></div></form></dialog><dialog id="albumDialog"><form class="modal form" id="albumForm"><div class="modal-top wide"><h2>添加到纪念册</h2><button type="button" class="close" data-close-album>×</button></div><label class="wide">照片（一次最多 6 张）<input required type="file" id="albumImages" accept="image/png,image/jpeg,image/webp" multiple></label><label class="wide">照片说明（可选，应用于本次照片）<input name="caption" maxlength="240" placeholder="这一刻，我想记住。"></label><div class="actions wide"><button type="button" class="outline" data-close-album>取消</button><button class="primary">保存到纪念册</button></div></form></dialog>`);
  $('tendForm').onsubmit = event => event.preventDefault();
  $('capsuleForm').onsubmit = saveCapsule; $('albumForm').onsubmit = saveAlbum;
  document.querySelectorAll('[data-close-capsule]').forEach(button => button.onclick = () => close('capsuleDialog'));
  document.querySelectorAll('[data-close-album]').forEach(button => button.onclick = () => close('albumDialog'));
  $('albumImages').onchange = event => { albumFiles = Array.from(event.target.files || []).slice(0, 6); if (event.target.files.length > 6) alert('一次最多上传 6 张照片。'); };
}
addStyleOptions(); wireUI(); initAuth().then(loadMemorials);


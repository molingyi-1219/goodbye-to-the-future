/* goodbye to the future — Supabase browser client */
const config = window.GTF_SUPABASE;
const db = window.supabase?.createClient(config.url, config.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const STYLES = {
  cross: 'cross-gravestone.png', arch: 'arched-gravestone.png', weathered: 'broken-column.png',
  obelisk: 'gothic-obelisk.png', abstract: 'abstract-monolith.png', deco: 'art-deco-fan.png'
};
let user = null, filter = 'all', memorials = [], imageFile = null;
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateText = value => new Date(value).toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' });
const close = id => $(id).close();
const siteURL = () => `${location.origin}${location.pathname}`;

function notice(message) { $('authNotice').textContent = message; }
function updateUserUI() {
  $('userLabel').textContent = user?.user_metadata?.username || (user ? '已登录' : '访客');
  $('loginBtn').textContent = user ? '退出登录' : '登录';
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
  const [flowers, comments, visits] = await Promise.all([
    db.from('flowers').select('memorial_id,user_id').in('memorial_id', ids),
    db.from('comments').select('*').in('memorial_id', ids).order('created_at', { ascending:false }),
    db.from('memorial_visits').select('*').in('memorial_id', ids).order('created_at', { ascending:false })
  ]);
  const decorated = await attachImageURLs(records || []);
  memorials = decorated.map(row => ({ ...row,
    public: row.visibility === 'public', owner: row.owner_id,
    flowers: (flowers.data || []).filter(f => f.memorial_id === row.id),
    comments: (comments.data || []).filter(c => c.memorial_id === row.id),
    visits: (visits.data || []).filter(v => v.memorial_id === row.id)
  }));
  render();
}
function render() {
  const list = memorials.filter(item => item.public && (filter === 'all' || item.kind === filter));
  $('grid').innerHTML = list.length ? list.map(item => `<article class="stone" style="background-image:linear-gradient(180deg,transparent 25%,#050505e8 74%),url('${styleURL(item)}')"><span class="badge">${escapeHTML(item.kind)}</span><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.epitaph || '尚未留下墓志铭。')}</p><div class="meta"><span>✿ ${item.flowers.length} 束花</span><span>查看碑文 →</span></div><button class="card-open" data-id="${item.id}" aria-label="查看 ${escapeHTML(item.title)}"></button></article>`).join('') : '<div class="empty">还没有公开的碑。成为第一个留下纪念的人。</div>';
  document.querySelectorAll('.card-open').forEach(button => button.onclick = () => openDetail(button.dataset.id));
}
function itemFor(id) { return memorials.find(item => item.id === id); }

function openDetail(id) {
  const item = itemFor(id); if (!item) return;
  const isOwner = item.owner === user?.id;
  const mine = item.flowers.some(f => f.user_id === user?.id);
  const visibleVisits = item.visits.filter(visit => isOwner || visit.is_public);
  const comments = item.comments.map(comment => `<div class="comment">${escapeHTML(comment.body)}<small>— ${comment.is_anonymous ? '匿名访客' : escapeHTML(comment.author_id === user?.id ? (user.email || '我') : '访客')}</small></div>`).join('') || '<p class="private-note">还没有留言。</p>';
  const interaction = item.public ? `<div class="tribute"><span>已有 ${item.flowers.length} 束花</span><button class="flower" id="flower">${mine ? '收回这束花' : '✿ 献一束花'}</button></div><h3>留言</h3><div>${comments}</div><form class="comment-form" id="commentForm"><input required maxlength="180" name="text" placeholder="留下一句话…"><button>发表</button><label class="anonymous"><input type="checkbox" name="anonymous" checked>匿名留言</label></form>` : '<p class="private-note">这是私密碑，只有创建者可以查看。</p>';
  const tending = `<section><div class="tribute"><span>扫墓回访</span>${isOwner ? '<button class="flower" id="tend">回来扫墓</button>' : ''}</div>${visibleVisits.length ? visibleVisits.map(visit => `<div class="comment"><small>${dateText(visit.created_at)}</small><br>${escapeHTML(visit.body)}</div>`).join('') : '<p class="private-note">还没有留下回访记录。</p>'}</section>`;
  $('detail').innerHTML = `<div class="modal-top"><div><div class="detail-type">${escapeHTML(item.kind)} · ${item.public ? '公开碑' : '私密碑'}</div><h2>${escapeHTML(item.title)}</h2></div><button class="close" id="closeDetail">×</button></div><img class="detail-img" src="${styleURL(item)}" alt=""><p><b>${escapeHTML(item.epitaph)}</b></p><p>${escapeHTML(item.story || '尚未留下更多文字。')}</p>${tending}${interaction}`;
  $('detailDialog').showModal();
  $('closeDetail').onclick = () => close('detailDialog');
  if (isOwner) $('tend').onclick = () => openTend(id);
  if (!item.public) return;
  $('flower').onclick = () => toggleFlower(item, mine);
  $('commentForm').onsubmit = async event => {
    event.preventDefault(); if (!requireLogin()) return;
    const form = new FormData(event.currentTarget); const body = form.get('text').trim(); if (!body) return;
    const { error } = await db.from('comments').insert({ memorial_id:item.id, author_id:user.id, body, is_anonymous:form.get('anonymous') === 'on', status:'published' });
    if (error) return alert(`留言未保存：${error.message}`);
    await loadMemorials(); openDetail(item.id);
  };
}
async function toggleFlower(item, mine) {
  if (!requireLogin()) return;
  const result = mine ? await db.from('flowers').delete().eq('memorial_id', item.id).eq('user_id', user.id) : await db.from('flowers').insert({ memorial_id:item.id, user_id:user.id });
  if (result.error) return alert(`操作未保存：${result.error.message}`);
  await loadMemorials(); openDetail(item.id);
}
function openTend(id) {
  const item = itemFor(id); if (!item || item.owner !== user?.id) return;
  $('tendDialog').showModal();
  $('closeTend').onclick = $('cancelTend').onclick = () => close('tendDialog');
  $('tendForm').onsubmit = async event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const body = data.get('body').trim(); if (!body) return;
    const { error } = await db.from('memorial_visits').insert({ memorial_id:id, author_id:user.id, body, is_public:data.get('public') === 'on' });
    if (error) return alert(`回访未保存：${error.message}`);
    event.currentTarget.reset(); close('tendDialog'); await loadMemorials(); openDetail(id);
  };
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
  const data = new FormData(event.currentTarget); const button = event.currentTarget.querySelector('.primary'); button.disabled = true;
  try {
    const image_path = await uploadImage(imageFile);
    const { error } = await db.from('memorials').insert({ owner_id:user.id, title:data.get('title').trim(), kind:data.get('kind'), epitaph:data.get('epitaph').trim(), story:data.get('story').trim(), style:data.get('style'), visibility:data.has('public') ? 'public' : 'private', image_path });
    if (error) throw error;
    imageFile = null; event.currentTarget.reset(); close('createDialog'); await loadMemorials();
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
  $('loginBtn').onclick = async () => { if (user) await db.auth.signOut(); else showGate(); };
  document.querySelectorAll('#createBtn,#heroCreate').forEach(button => button.onclick = () => { if (requireLogin()) $('createDialog').showModal(); });
  document.querySelectorAll('[data-close="createDialog"]').forEach(button => button.onclick = () => close('createDialog'));
  $('filters').onclick = event => { const button = event.target.closest('[data-kind]'); if (!button) return; filter = button.dataset.kind; document.querySelectorAll('.filter').forEach(x => x.classList.toggle('active', x === button)); render(); };
  $('styles').onclick = event => { const button = event.target.closest('[data-style]'); if (!button) return; document.querySelectorAll('.style').forEach(x => x.classList.toggle('sel', x === button)); document.querySelector('[name="style"]').value = button.dataset.style; };
  $('image').onchange = event => { imageFile = event.target.files[0] || null; };
  $('createForm').onsubmit = createMemorial;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="tendDialog"><form class="modal form" id="tendForm"><div class="modal-top wide"><h2>回来扫墓</h2><button type="button" class="close" id="closeTend">×</button></div><p class="private-note wide">留下一段回访记录：可以是近况、思念，或一句新的话。</p><label class="wide">今天想留下什么？<textarea required name="body" maxlength="800" placeholder="我又来看你了。"></textarea></label><label class="check wide"><input type="checkbox" name="public" checked>让访客看见这段回访</label><div class="actions wide"><button type="button" class="outline" id="cancelTend">取消</button><button class="primary">留下回访记录</button></div></form></dialog>`);
}
addStyleOptions(); wireUI(); initAuth().then(loadMemorials);


/* ======================================================================
   Giriş noktası — modülleri birbirine bağlar, DOM olaylarını dinler,
   uygulamayı başlatır. `guard`/`openEntry`/`newEntry`/`deleteEntry`/`save`/
   `cancel` gibi "eylem" fonksiyonları bilerek burada: her biri birden
   fazla modülü (state + api + ui-*) bir araya getiren orkestrasyon kodu.
   ====================================================================== */
import { $, esc, state, COLLECTIONS, SITE, clearDirty, markDirty, slugify } from './state.js';
import { toast, confirmBox, guard } from './ui-toast.js';
import { fetchEntry, deleteEntryApi, publishEntry } from './api.js';
import { renderTabs, renderEntries, loadEntries, bindOpenEntry } from './ui-sidebar.js';
import { renderForm, refreshHeader, validateForm } from './ui-form.js';

function showEditor(){ document.body.dataset.view = 'editor'; }
function showList(){ document.body.dataset.view = 'list'; }

async function openEntry(slug){
  if (slug === state.editingSlug){ showEditor(); return; }
  if (!(await guard())) return;
  try{
    const data = await fetchEntry(state.collection, slug);
    state.editingSlug = slug;
    renderForm({ ...data.data, gallery: data.gallery || [], content: data.body });
    renderEntries();
    showEditor();
    window.scrollTo({ top:0, behavior:'smooth' });
  }catch(err){
    toast(esc(err.message), 'err');
  }
}
bindOpenEntry(openEntry);

async function newEntry(prefill){
  if (!(await guard())) return;
  state.editingSlug = null;
  renderForm(prefill);
  renderEntries();
  showEditor();
  const t = $('f_title');
  if (t) t.focus();
}

async function deleteEntry(){
  const slug = state.editingSlug;
  if (!slug) return;
  const ok = await confirmBox(
    'Kaydı sil',
    `“${slug}” kaydı depodan silinecek ve site yeniden yayınlandığında adresi 404 verecek. Bu işlem geri alınamaz.`,
    'Kalıcı olarak sil'
  );
  if (!ok) return;
  await runDelete(state.collection, slug, { returnToEditorValues: collectFormValues() });
}

/**
 * Toplu silme: sidebar'da seçilen kayıtları sırayla siler (mevcut tekli
 * DELETE endpoint'i N kez çağrılır — API şekli değişmez). Sıralı çalışır
 * ki GitHub Contents API'ye ani bir istek patlaması göndermeyelim.
 */
async function bulkDelete(){
  const slugs = [...state.selected];
  if (!slugs.length) return;
  const ok = await confirmBox(
    'Seçili kayıtları sil',
    `${slugs.length} kayıt depodan kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
    'Hepsini sil'
  );
  if (!ok) return;

  let okCount = 0, failCount = 0;
  for (const slug of slugs){
    try{ await deleteEntryApi(state.collection, slug); okCount++; }
    catch{ failCount++; }
  }
  state.selected.clear();
  toast(
    failCount
      ? `${okCount} kayıt silindi, ${failCount} kayıt silinemedi.`
      : `${okCount} kayıt silindi. Site birkaç dakika içinde güncellenecek.`,
    failCount ? 'err' : 'ok'
  );
  if (state.editingSlug && slugs.includes(state.editingSlug)){
    state.editingSlug = null;
    clearDirty();
    renderForm();
    showList();
  }
  await loadEntries();
}

/** deleteEntry ve bulkDelete'in paylaştığı tekil-silme akışı + "yeniden oluştur" için son değerleri saklama. */
async function runDelete(collection, slug, { returnToEditorValues } = {}){
  try{
    await deleteEntryApi(collection, slug);
    state.lastDeleted = { collection, values: returnToEditorValues, deletedAt: Date.now() };
    const toastEl = toast(
      `Kayıt silindi. Site birkaç dakika içinde güncellenecek.
       ${returnToEditorValues ? '<br><a href="#" class="js-restore-last-deleted">↺ Yeniden oluştur</a>' : ''}`,
      'ok', 10000
    );
    const restoreLink = toastEl.querySelector('.js-restore-last-deleted');
    if (restoreLink) restoreLink.addEventListener('click', (e) => {
      e.preventDefault();
      restoreLastDeleted();
    });
    state.editingSlug = null;
    clearDirty();
    renderForm();
    await loadEntries();
    showList();
  }catch(err){
    toast(esc(err.message), 'err');
  }
}

/**
 * Gerçek bir "geri alma" DEĞİLDİR — GitHub'a yeni bir commit atmadan eski
 * hâli geri getiremeyiz (galeri görselleri zaten silinmiş olabilir). Bunun
 * yerine son bilinen alan değerleriyle YENİ bir taslak açar; toast/etiket
 * metni bunu dürüstçe belirtir, kullanıcı yeniden "Yayınla"maması gerektiğini
 * bilir.
 */
function restoreLastDeleted(){
  const last = state.lastDeleted;
  if (!last || last.collection !== state.collection) return;
  newEntry(last.values);
  toast('Silinen kaydın alanları yeni bir taslağa dolduruldu — galeri görselleri hariç. Kontrol edip yeniden yayınlayabilirsiniz.', 'ok', 9000);
}

function collectFormValues(){
  const cfg = COLLECTIONS[state.collection];
  const values = {};
  for (const f of cfg.fields){
    if (f.type === 'gallery' || f.type === 'image') continue;
    const el = $(`f_${f.name}`);
    if (el) values[f.name] = el.value;
  }
  return values;
}

async function save(){
  const btn = $('saveBtn');
  const cfg = COLLECTIONS[state.collection];

  const missing = validateForm(cfg);
  if (missing.length){
    toast(`<strong>${missing.length} alan eksik:</strong> ${esc(missing.join(', '))}`, 'err');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Yayınlanıyor…';

  try{
    const payload = { collection: state.collection };

    if (state.editingSlug) {
      payload.slug = state.editingSlug;
    } else {
      const manual = $('f_slug');
      if (manual && manual.value.trim()) payload.slug = slugify(manual.value);
    }

    for (const f of cfg.fields){
      if (f.type === 'gallery') continue;
      const el = $(`f_${f.name}`);
      if (el) payload[f.name] = el.value;
    }

    if (state.pendingImage){
      payload.imageBase64 = state.pendingImage.base64;
      payload.imageName   = state.pendingImage.name;
    }
    if (cfg.fields.some(f => f.type === 'gallery')){
      payload.existingGallery = state.gallery.existing;
      payload.galleryImages   = state.gallery.newFiles;
    }

    const data = await publishEntry(payload);

    const url = SITE + cfg.urlBase + data.slug;
    toast(
      `<strong>Yayınlandı.</strong><br>Testler geçtikten sonra site güncellenecek (1–2 dk).<br>
       <a href="${esc(url)}" target="_blank" rel="noopener">Sayfayı aç ↗</a>`,
      'ok', 12000
    );

    // Yeni kayıt artık mevcut bir kayıt: adres alanını kilitle ki kullanıcı
    // ikinci bir yayında farklı bir adrese ikinci bir kopya oluşturmasın.
    state.editingSlug = data.slug;
    const slugEl = $('f_slug');
    if (slugEl){ slugEl.value = data.slug; slugEl.readOnly = true; }

    clearDirty();
    await loadEntries();
    refreshHeader();
  }catch(err){
    // Kayıt BAŞARISIZ olduysa değişiklikler hâlâ kaydedilmemiş durumda;
    // dirty bayrağı bilerek temizlenmez, aksi hâlde kullanıcı sayfadan
    // ayrılırken uyarı almaz ve yazdıklarını kaybeder.
    toast(esc(err.message), 'err', 12000);
  }finally{
    btn.disabled = false;
    btn.textContent = state.dirty ? 'Yayınla •' : 'Yayınla';
  }
}

async function cancel(){
  if (!(await guard())) return;
  state.editingSlug = null;
  renderForm();
  renderEntries();
  showList();
}

/* ======================================================================
   Bağlantılar
   ====================================================================== */
// Form alanları her renderForm'da yeniden üretilir ama konteyner sabittir;
// bu yüzden dinleyiciler burada BİR KEZ bağlanır ve olay yükselmesiyle
// (event bubbling) yeni alanlara da uygulanır.
$('fields').addEventListener('input', markDirty);
$('fields').addEventListener('change', markDirty);

$('newBtn').onclick = () => newEntry();
$('backBtn').onclick = async () => { if (await guard()) showList(); };
$('cancelBtn').onclick = cancel;
$('deleteBtn').onclick = deleteEntry;
$('saveBtn').onclick = save;
$('form').addEventListener('submit', (e) => { e.preventDefault(); save(); });

$('search').addEventListener('input', (e) => {
  state.filter = e.target.value;
  renderEntries();
});

const bulkDeleteBtn = $('bulkDeleteBtn');
if (bulkDeleteBtn) bulkDeleteBtn.onclick = bulkDelete;
const bulkClearBtn = $('bulkClearBtn');
if (bulkClearBtn) bulkClearBtn.onclick = () => { state.selected.clear(); renderEntries(); };

// Ctrl/⌘ + S ile kaydet
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
    e.preventDefault();
    save();
  }
});

// Cloudflare Access kimliği (bu uç noktayı Cloudflare otomatik sağlar)
fetch('/cdn-cgi/access/get-identity')
  .then(r => r.ok ? r.json() : null)
  .then(id => { if (id && id.email) $('who').textContent = id.email; })
  .catch(() => {});

renderTabs();
renderForm();
loadEntries();

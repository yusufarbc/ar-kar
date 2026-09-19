import { $, esc, state, COLLECTIONS } from './state.js';
import { guard } from './ui-toast.js';
import { fetchEntries } from './api.js';
// NOT: renderForm/openEntry ile bu modül arasında döngüsel bir bağımlılık
// var (renderTabs sekme değişince renderForm çağırır; entry satırına
// tıklamak app.js'teki openEntry'yi çağırır, o da renderEntries'i çağırır).
// ES modüllerinde canlı bağlamalar sayesinde bu güvenlidir çünkü hiçbiri
// modül YÜKLENİRKEN değil, yalnızca olay işleyicileri İÇİNDE (daha sonra)
// çağrılıyor — tüm modül grafiği o ana kadar zaten değerlendirilmiş olur.
import { renderForm } from './ui-form.js';

let openEntryRef = null;
/** app.js, kendi tanımladığı openEntry'yi buraya kaydeder (döngüsel importu bu şekilde çözüyoruz). */
export function bindOpenEntry(fn){ openEntryRef = fn; }

export function renderTabs(){
  $('tabs').innerHTML = Object.keys(COLLECTIONS).map(k =>
    `<button class="tab" role="tab" type="button" data-key="${k}" aria-selected="${k===state.collection}">${esc(COLLECTIONS[k].label)}</button>`
  ).join('');
  $('tabs').querySelectorAll('.tab').forEach(b => {
    b.onclick = async () => {
      if (b.dataset.key === state.collection) return;
      if (!(await guard())) return;
      state.collection = b.dataset.key;
      state.editingSlug = null;
      state.filter = '';
      state.selected.clear();
      $('search').value = '';
      renderTabs();
      renderForm();
      loadEntries();
    };
  });
}

export function visibleEntries(){
  const q = state.filter.trim().toLocaleLowerCase('tr');
  if (!q) return state.entries;
  return state.entries.filter(e =>
    String(e.title).toLocaleLowerCase('tr').includes(q) ||
    String(e.slug).toLocaleLowerCase('tr').includes(q)
  );
}

function renderBulkBar(){
  const bar = $('bulkBar');
  if (!bar) return;
  const n = state.selected.size;
  bar.classList.toggle('is-on', n > 0);
  $('bulkCount').textContent = n ? `${n} kayıt seçildi` : '';
}

export function renderEntries(){
  const list = visibleEntries();
  const total = state.entries.length;

  // Artık listede olmayan bir slug seçili kalmasın (koleksiyon değişimi vb.)
  const validSlugs = new Set(state.entries.map(e => e.slug));
  for (const s of [...state.selected]) if (!validSlugs.has(s)) state.selected.delete(s);

  $('count').textContent = state.filter
    ? `${list.length} / ${total} kayıt`
    : `${total} kayıt`;

  if (!list.length){
    $('entries').innerHTML = '';
    $('sideEmpty').hidden = false;
    $('sideEmpty').textContent = total
      ? 'Aramanızla eşleşen kayıt yok.'
      : 'Bu koleksiyonda henüz kayıt yok. “Yeni kayıt” ile başlayın.';
    renderBulkBar();
    return;
  }

  $('sideEmpty').hidden = true;
  $('entries').innerHTML = list.map(e => `
    <li class="entries__row">
      <input type="checkbox" class="entry__check" data-check="${esc(e.slug)}" aria-label="${esc(e.title)} kaydını seç" ${state.selected.has(e.slug) ? 'checked' : ''} />
      <button type="button" class="entry" data-slug="${esc(e.slug)}" aria-current="${e.slug === state.editingSlug}">
        <span class="entry__body">
          <span class="entry__title">${esc(e.title)}</span>
          <span class="entry__meta">${esc(e.date || 'tarihsiz')} · ${esc(e.slug)}</span>
        </span>
        <span class="entry__chev" aria-hidden="true">›</span>
      </button>
    </li>`).join('');

  $('entries').querySelectorAll('[data-check]').forEach(cb => {
    cb.addEventListener('change', () => {
      const slug = cb.dataset.check;
      if (cb.checked) state.selected.add(slug); else state.selected.delete(slug);
      renderBulkBar();
    });
  });
  $('entries').querySelectorAll('.entry').forEach(b => {
    b.onclick = () => openEntryRef && openEntryRef(b.dataset.slug);
  });

  renderBulkBar();
}

export async function loadEntries(){
  $('sideEmpty').hidden = true;
  $('count').textContent = 'Yükleniyor…';
  $('entries').innerHTML = Array.from({length:4}, () =>
    '<li style="padding:10px"><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:45%"></div></li>'
  ).join('');

  try{
    state.entries = await fetchEntries(state.collection);
    renderEntries();
  }catch(err){
    state.entries = [];
    $('entries').innerHTML = '';
    $('count').textContent = '';
    $('sideEmpty').hidden = false;
    $('sideEmpty').textContent = 'Liste yüklenemedi: ' + err.message;
  }
}

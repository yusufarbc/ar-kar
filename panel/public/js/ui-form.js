import { $, esc, state, COLLECTIONS, SITE, MAX_GALLERY, today, slugify, clearDirty } from './state.js';
import { setupMarkdown } from './markdown.js';
import { setupCover, setupGallery, renderThumbs } from './images.js';

/* ======================================================================
   Düzenleyici
   ====================================================================== */
export function currentSlugPreview(){
  if (state.editingSlug) return state.editingSlug;
  const manual = $('f_slug');
  if (manual && manual.value.trim()) return slugify(manual.value);
  const titleEl = $('f_title');
  return slugify(titleEl ? titleEl.value : '') || '…';
}

export function refreshHeader(){
  const isEdit = Boolean(state.editingSlug);
  const badge = $('modeBadge');
  badge.className = 'badge ' + (isEdit ? 'badge--edit' : 'badge--new');
  badge.textContent = isEdit ? 'Düzenleniyor' : 'Yeni kayıt';

  const titleEl = $('f_title');
  const name = (titleEl && titleEl.value.trim()) || (isEdit ? state.editingSlug : 'Yeni kayıt');
  $('editorName').textContent = name;

  const slug = currentSlugPreview();
  const url = SITE + COLLECTIONS[state.collection].urlBase + slug;
  $('editorUrl').innerHTML = isEdit
    ? `Yayın adresi: <a href="${esc(url)}" target="_blank" rel="noopener"><code>${esc(url)}</code></a>`
    : `Yayınlanacak adres: <code>${esc(url)}</code>`;

  $('deleteBtn').hidden = !isEdit;
}

function pillSelectHtml(f, v){
  const opts = f.options.map(o => `
    <button type="button" class="pill-select__option" role="radio" aria-checked="${o.value===v}" data-pill-value="${esc(o.value)}">
      <i class="fa ${esc(o.icon || 'fa-circle')}" aria-hidden="true"></i>${esc(o.label)}
    </button>`).join('');
  return `
    <input type="hidden" id="f_${f.name}" value="${esc(v)}" />
    <div class="pill-select" id="f_${f.name}_pills" role="radiogroup">${opts}</div>`;
}

function bindPillSelect(f){
  const wrap = $(`f_${f.name}_pills`);
  const hidden = $(`f_${f.name}`);
  if (!wrap || !hidden) return;
  wrap.querySelectorAll('[data-pill-value]').forEach(btn => {
    btn.addEventListener('click', () => {
      hidden.value = btn.dataset.pillValue;
      wrap.querySelectorAll('[data-pill-value]').forEach(b => b.setAttribute('aria-checked', String(b === btn)));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

export function fieldHtml(f, values){
  const v = values[f.name] != null ? String(values[f.name]) : (f.type === 'date' ? today() : (f.type === 'pillselect' ? f.options[0]?.value ?? '' : ''));
  const req = f.required ? 'required' : '';
  const star = f.required ? ' <span class="req">*</span>' : '';
  const hint = f.hint ? `<div class="hint">${esc(f.hint)}</div>` : '';
  let input;

  if (f.type === 'textarea'){
    input = `<textarea id="f_${f.name}" rows="3" ${req}>${esc(v)}</textarea>`;

  } else if (f.type === 'markdown'){
    input = `
      <div class="md-toolbar" id="f_${f.name}_toolbar">
        <button type="button" data-cmd="h2" title="Başlık 2">H2</button>
        <button type="button" data-cmd="h3" title="Başlık 3">H3</button>
        <span class="sep"></span>
        <button type="button" data-cmd="bold" title="Kalın (Ctrl+B)"><strong>K</strong></button>
        <button type="button" data-cmd="italic" title="İtalik (Ctrl+I)"><em>İ</em></button>
        <span class="sep"></span>
        <button type="button" data-cmd="ul" title="Madde listesi">• Liste</button>
        <button type="button" data-cmd="ol" title="Numaralı liste">1. Liste</button>
        <button type="button" data-cmd="link" title="Bağlantı ekle">🔗 Bağlantı</button>
        <button type="button" data-cmd="preview" class="push" title="Önizleme">👁 Önizleme</button>
      </div>
      <div class="md-area" id="f_${f.name}_area">
        <textarea id="f_${f.name}" rows="16" ${req}>${esc(v)}</textarea>
      </div>
      <div class="md-preview" id="f_${f.name}_preview"></div>`;

  } else if (f.type === 'pillselect'){
    input = pillSelectHtml(f, v);

  } else if (f.type === 'select'){
    input = `<select id="f_${f.name}" ${req}>` +
      f.options.map(o => `<option value="${esc(o.value)}"${o.value===v?' selected':''}>${esc(o.label)}</option>`).join('') +
      `</select>`;

  } else if (f.type === 'image'){
    input = `
      <label class="drop" id="f_${f.name}_drop">
        <span class="drop__title">Görsel seçin veya buraya sürükleyin</span>
        <span>JPG / PNG / WebP — otomatik olarak 4:5 orana ortadan kırpılır, WebP'ye çevrilir ve 1600px'e küçültülür</span>
        <input type="file" id="f_${f.name}_file" accept="image/*" />
      </label>
      <input type="hidden" id="f_${f.name}" value="${esc(v)}" />
      <div class="cover" id="f_${f.name}_cover"${v ? '' : ' hidden'}>
        <img id="f_${f.name}_img" src="${v ? esc(SITE + v) : ''}" alt="" />
        <div class="cover__info" id="f_${f.name}_info">Mevcut görsel. Yeni bir dosya seçmezseniz korunur.</div>
      </div>`;

  } else if (f.type === 'gallery'){
    input = `
      <label class="drop" id="f_${f.name}_drop">
        <span class="drop__title">Görselleri seçin veya buraya sürükleyin</span>
        <span>En fazla ${MAX_GALLERY} görsel — hepsi otomatik 4:5 orana kırpılıp WebP'ye çevrilir</span>
      </label>
      <div class="thumbs" id="f_${f.name}_thumbs"></div>
      <div class="hint" id="f_${f.name}_info"></div>`;

  } else if (f.type === 'date'){
    input = `<input type="date" id="f_${f.name}" value="${esc(v)}" ${req} />`;

  } else {
    input = `<input type="text" id="f_${f.name}" value="${esc(v)}" placeholder="${esc(f.placeholder||'')}" ${req} />`;
  }

  return `<div class="field" data-field="${f.name}"><label for="f_${f.name}">${esc(f.label)}${star}</label>${input}${hint}<div class="field__error"></div></div>`;
}

export function renderForm(values){
  values = values || {};
  state.pendingImage = null;
  state.gallery = {
    existing: Array.isArray(values.gallery) ? [...values.gallery] : [],
    newFiles: [],
  };

  const isEdit = Boolean(state.editingSlug);
  const cfg = COLLECTIONS[state.collection];

  // Adres alanı: YENİ kayıtta düzenlenebilir, DÜZENLEMEDE salt okunur.
  // Düzenlemede adresi değiştirmek eski dosyayı silmez, ikinci bir kayıt
  // oluşturur — bu yüzden bilinçli olarak kilitli.
  const slugField = `
    <div class="field">
      <label for="f_slug">Adres (slug)</label>
      <div class="slug-row">
        <span class="slug-prefix">${esc(cfg.urlBase)}</span>
        <input type="text" id="f_slug" value="${esc(isEdit ? state.editingSlug : '')}"
               placeholder="basliktan-otomatik-uretilir" ${isEdit ? 'readonly' : ''} />
      </div>
      <div class="hint">${isEdit
        ? 'Yayınlanmış bir kaydın adresi değiştirilemez — eski adres kırılır ve arama motorlarındaki bağlantı kaybolur.'
        : 'Boş bırakırsanız başlıktan otomatik üretilir.'}</div>
    </div>`;

  const parts = cfg.fields.map(f => {
    const html = fieldHtml(f, values);
    // Adres alanını başlığın hemen ardına yerleştir.
    return f.name === 'title' ? html + slugField : html;
  });

  $('fields').innerHTML = parts.join('');

  // --- alan davranışlarını bağla ---
  for (const f of cfg.fields){
    if (f.type === 'markdown')   setupMarkdown(f.name);
    if (f.type === 'image')      setupCover(f.name);
    if (f.type === 'pillselect') bindPillSelect(f);
    if (f.type === 'gallery')    { setupGallery(f.name); renderThumbs(f.name); }
  }

  const titleEl = $('f_title');
  if (titleEl) titleEl.addEventListener('input', refreshHeader);

  const slugEl = $('f_slug');
  if (slugEl && !isEdit) slugEl.addEventListener('input', refreshHeader);

  // NOT: "kaydedilmemiş değişiklik" dinleyicileri #fields konteynerine
  // BİR KEZ, açılışta bağlanır (bkz. app.js "Bağlantılar" bölümü).
  // Burada bağlansaydı her renderForm çağrısında bir yenisi eklenir ve
  // dinleyiciler birikirdi — innerHTML değişse de konteyner aynı öğedir.
  clearDirty();
  refreshHeader();
}

/**
 * Tüm zorunlu alanları kontrol eder, eksik olanları `.field--error` ile
 * işaretler ve ilkine odaklanır. Eskiden yalnızca ilk eksik alanda tek bir
 * toast gösteriliyordu; artık tüm eksikler aynı anda görünür.
 * @returns {string[]} eksik alan etiketleri
 */
export function validateForm(cfg){
  const missing = [];
  let firstInvalid = null;
  for (const f of cfg.fields){
    const wrap = document.querySelector(`.field[data-field="${f.name}"]`);
    if (!wrap) continue;
    wrap.classList.remove('field--error');
    if (!f.required || f.type === 'gallery' || f.type === 'image') continue;
    const el = $(`f_${f.name}`);
    if (el && !String(el.value).trim()){
      wrap.classList.add('field--error');
      const errEl = wrap.querySelector('.field__error');
      if (errEl) errEl.textContent = `${f.label} alanı zorunlu.`;
      missing.push(f.label);
      if (!firstInvalid) firstInvalid = el;
    }
  }
  if (firstInvalid) firstInvalid.focus();
  return missing;
}

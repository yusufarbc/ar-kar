import { $, esc, state, MAX_GALLERY, SITE, IMAGE_ASPECT_RATIO, markDirty } from './state.js';
import { toast } from './ui-toast.js';

/* ======================================================================
   Görsel işleme — tarayıcıda ortadan sabit orana kırp, WebP'ye çevir ve
   küçült. Kırpma sayesinde panelden yüklenen her kapak/galeri görseli
   aynı orana (IMAGE_ASPECT_RATIO) sahip olur; sitede kart görselleri
   birbirinden farklı boy/en oranlarıyla gelip tutarsız durmaz.
   ====================================================================== */
export async function toWebp(file, { maxWidth = 1600, quality = 0.82, aspectRatio = null } = {}){
  const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!supportedTypes.has(file.type)) {
    throw new Error('Yalnızca JPG, PNG veya WebP görselleri desteklenir.');
  }
  const bitmap = await createImageBitmap(file);

  // Kaynak görselden, istenen orana uyan en büyük dikdörtgeni ortadan seç.
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
  if (aspectRatio) {
    const sourceRatio = bitmap.width / bitmap.height;
    if (sourceRatio > aspectRatio) {
      // Kaynak hedeften daha geniş (yatık) — sağ/soldan kırp.
      sw = Math.round(bitmap.height * aspectRatio);
      sx = Math.round((bitmap.width - sw) / 2);
    } else if (sourceRatio < aspectRatio) {
      // Kaynak hedeften daha uzun (dikey) — üst/alttan kırp.
      sh = Math.round(bitmap.width / aspectRatio);
      sy = Math.round((bitmap.height - sh) / 2);
    }
  }

  const scale = Math.min(1, maxWidth / sw);
  const scaledWidth = Math.max(1, Math.round(sw * scale));
  // Panel standardı tam 4:3'tür. Genişliği 4'ün katına indirerek yüksekliğin
  // tam sayı olmasını ve API'nin piksel bazlı kontrolüyle birebir eşleşmesini
  // garanti ederiz (ör. 1599px yerine 1596×1197px).
  const isFourThree = aspectRatio && Math.abs(aspectRatio - (4 / 3)) < Number.EPSILON;
  const w = isFourThree ? Math.max(4, Math.floor(scaledWidth / 4) * 4) : scaledWidth;
  // Sabit oranlı çıktıda yüksekliği doğrudan hedeften türetmek, kaynak
  // boyutları tek sayı olduğunda oluşabilen 1px'lik oran sapmasını engeller.
  const h = Math.max(1, isFourThree ? (w / 4) * 3 : (aspectRatio ? Math.round(w / aspectRatio) : Math.round(sh * scale)));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', quality));
  if (!blob) throw new Error('Görsel WebP formatına çevrilemedi.');

  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
  return { dataUrl, width:w, height:h, size:blob.size };
}

export const kb = (bytes) => (bytes/1024).toFixed(0) + ' KB';

/* ---------- Kapak görseli ---------- */
export function setupCover(name){
  const fileEl = $(`f_${name}_file`);
  const drop = $(`f_${name}_drop`);
  const box = $(`f_${name}_cover`);
  const img = $(`f_${name}_img`);
  const info = $(`f_${name}_info`);
  const rmBtn = $(`f_${name}_remove`);
  if (!fileEl) return;

  function evaluateExistingImage(){
    if (state.pendingImage) {
      state.coverValid = true;
      return;
    }
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w && h) {
      const is43 = w * 3 === h * 4;
      if (is43) {
        state.coverValid = true;
        info.innerHTML = `
          <span class="cover__badge cover__badge--ok">✓ 4:3 Standart Kapak</span>
          <div class="cover__meta">Mevcut görsel (${w}×${h}px). Yeni bir dosya seçmezseniz korunur.</div>`;
        box.classList.remove('cover--warn');
        box.classList.add('cover--ok');
      } else {
        state.coverValid = false;
        info.innerHTML = `
          <span class="cover__badge cover__badge--warn">⚠️ 4:3 Standart Dışı (${w}×${h}px)</span>
          <div class="cover__warn-text">Mevcut görsel 4:3 standart oranına uymuyor. Kart düzeni için lütfen yeni bir görsel yükleyin.</div>`;
        box.classList.remove('cover--ok');
        box.classList.add('cover--warn');
      }
    }
  }

  img.onload = evaluateExistingImage;
  img.onerror = () => {
    if (!state.pendingImage) {
      state.coverValid = false;
      info.innerHTML = `
        <span class="cover__badge cover__badge--warn">❌ Görsel yüklenemedi</span>
        <div class="cover__warn-text">Kapak görseli yüklenemedi. Lütfen geçerli bir 4:3 görsel seçin.</div>`;
      box.classList.remove('cover--ok');
      box.classList.add('cover--warn');
    }
  };

  // Resim zaten yüklenmişse (önbellekten) onload hemen tetiklenmeyebilir
  if (img.complete && img.naturalWidth) {
    evaluateExistingImage();
  }

  async function accept(file){
    if (!file) return;
    state.pendingImage = null;
    state.coverValid = null;
    state.processingImages++;
    info.textContent = '4:3 WebP formatına çevriliyor…';
    box.hidden = false;
    try{
      const out = await toWebp(file, { aspectRatio: IMAGE_ASPECT_RATIO });
      state.pendingImage = { base64: out.dataUrl, name: file.name, width: out.width, height: out.height };
      state.coverValid = true;
      img.src = out.dataUrl;
      info.innerHTML = `
        <span class="cover__badge cover__badge--ok">✓ 4:3 WebP Görsel Hazır</span>
        <div class="cover__meta">${out.width}×${out.height}px · ${kb(out.size)} · WebP</div>`;
      box.classList.remove('cover--warn');
      box.classList.add('cover--ok');

      const fieldWrap = box.closest('.field');
      if (fieldWrap) fieldWrap.classList.remove('field--error');
      markDirty();
    }catch(err){
      state.pendingImage = null;
      state.coverValid = false;
      info.innerHTML = `<span class="cover__badge cover__badge--warn">Hata: ${esc(err.message)}</span>`;
      box.classList.remove('cover--ok');
      box.classList.add('cover--warn');
    }finally{
      state.processingImages = Math.max(0, state.processingImages - 1);
    }
  }

  if (rmBtn){
    rmBtn.onclick = () => {
      state.pendingImage = null;
      state.coverValid = false;
      const hidden = $(`f_${name}`);
      if (hidden) hidden.value = '';
      if (fileEl) fileEl.value = '';
      img.src = '';
      box.hidden = true;
      box.classList.remove('cover--ok', 'cover--warn');
      info.textContent = '';
      markDirty();
    };
  }

  fileEl.onchange = () => accept(fileEl.files && fileEl.files[0]);
  bindDrop(drop, (files) => accept(files[0]));
}

/* ---------- Galeri ---------- */
export function setupGallery(name){
  const fileEl = $(`f_${name}_file`);
  const drop = $(`f_${name}_drop`);
  const info = $(`f_${name}_info`);
  if (!fileEl) return;

  async function accept(files){
    const free = MAX_GALLERY - state.gallery.existing.length - state.gallery.newFiles.length;
    if (files.length > free){
      toast(`En fazla ${free} görsel daha ekleyebilirsiniz (toplam sınır ${MAX_GALLERY}).`, 'err');
    }
    const acceptedFiles = files.slice(0, Math.max(0, free));
    if (!acceptedFiles.length) return;
    state.processingImages++;
    try{
      for (const file of acceptedFiles){
        info.textContent = `${file.name} çevriliyor…`;
        try{
          const out = await toWebp(file, { aspectRatio: IMAGE_ASPECT_RATIO });
          state.gallery.newFiles.push({ base64: out.dataUrl, name: file.name, width: out.width, height: out.height });
          markDirty();
        }catch(err){
          toast(`${esc(file.name)}: ${esc(err.message)}`, 'err');
        }
      }
    }finally{
      state.processingImages = Math.max(0, state.processingImages - 1);
      renderThumbs(name);
    }
  }

  fileEl.onchange = () => { const f = Array.from(fileEl.files || []); fileEl.value = ''; accept(f); };
  bindDrop(drop, accept);
}

/**
 * Bir grup (existing ya da newFiles) içinde sürükle-bırakla yeniden
 * sıralama. Yalnızca AYNI grup içinde sıralama destekleniyor — iki grup
 * farklı veri şekillerine sahip (string yol vs. {base64,name}) ve
 * publish.ts nihai galeriyi `[...existingGallery, ...yeniYüklenenler]`
 * şeklinde birleştiriyor; gruplar arası taşıma bu sözleşmeyi karmaşıklaştırır.
 */
function bindThumbReorder(thumbs, list, onReordered){
  let dragIndex = null;
  thumbs.forEach((thumb) => {
    thumb.addEventListener('dragstart', () => {
      dragIndex = Number(thumb.dataset.index);
      thumb.classList.add('is-dragging');
    });
    thumb.addEventListener('dragend', () => thumb.classList.remove('is-dragging'));
    thumb.addEventListener('dragover', (e) => e.preventDefault());
    thumb.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropIndex = Number(thumb.dataset.index);
      if (dragIndex === null || dragIndex === dropIndex) return;
      const [moved] = list.splice(dragIndex, 1);
      list.splice(dropIndex, 0, moved);
      dragIndex = null;
      onReordered();
    });
  });
}

export function renderThumbs(name){
  const box = $(`f_${name}_thumbs`);
  const info = $(`f_${name}_info`);
  if (!box) return;

  const used = state.gallery.existing.length + state.gallery.newFiles.length;
  info.textContent = `${used} / ${MAX_GALLERY} görsel · sürükleyerek sıralayabilirsiniz`;

  box.innerHTML =
    state.gallery.existing.map((path, i) => `
      <div class="thumb" draggable="true" data-index="${i}">
        <img src="${esc(SITE + path)}" alt="" loading="lazy" />
        <button type="button" class="thumb__x" data-rm-old="${i}" title="Kaldır" aria-label="Görseli kaldır">✕</button>
      </div>`).join('') +
    state.gallery.newFiles.map((f, i) => `
      <div class="thumb thumb--new" draggable="true" data-index="${i}">
        <img src="${f.base64}" alt="" />
        <button type="button" class="thumb__x" data-rm-new="${i}" title="Kaldır" aria-label="Görseli kaldır">✕</button>
      </div>`).join('');

  box.querySelectorAll('[data-rm-old]').forEach(b => b.onclick = () => {
    state.gallery.existing.splice(Number(b.dataset.rmOld), 1);
    markDirty(); renderThumbs(name);
  });
  box.querySelectorAll('[data-rm-new]').forEach(b => b.onclick = () => {
    state.gallery.newFiles.splice(Number(b.dataset.rmNew), 1);
    markDirty(); renderThumbs(name);
  });

  const existingThumbs = box.querySelectorAll('.thumb:not(.thumb--new)');
  bindThumbReorder(existingThumbs, state.gallery.existing, () => { markDirty(); renderThumbs(name); });
  const newThumbs = box.querySelectorAll('.thumb--new');
  bindThumbReorder(newThumbs, state.gallery.newFiles, () => { markDirty(); renderThumbs(name); });
}

/** Bir öğeye sürükle-bırak davranışı ekler (dosya yükleme alanı için). */
export function bindDrop(el, onFiles){
  if (!el) return;
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    el.querySelector('input[type="file"]')?.click();
  });
  ['dragenter','dragover'].forEach(ev =>
    el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add('is-over'); }));
  ['dragleave','drop'].forEach(ev =>
    el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.remove('is-over'); }));
  el.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files || [])
      .filter(f => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type));
    if (files.length) onFiles(files);
  });
}

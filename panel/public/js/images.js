import { $, esc, state, MAX_GALLERY, SITE, IMAGE_ASPECT_RATIO, markDirty } from './state.js';
import { toast } from './ui-toast.js';

/* ======================================================================
   Görsel işleme — tarayıcıda ortadan sabit orana kırp, WebP'ye çevir ve
   küçült. Kırpma sayesinde panelden yüklenen her kapak/galeri görseli
   aynı orana (IMAGE_ASPECT_RATIO) sahip olur; sitede kart görselleri
   birbirinden farklı boy/en oranlarıyla gelip tutarsız durmaz.
   ====================================================================== */
export async function toWebp(file, { maxWidth = 1600, quality = 0.82, aspectRatio = null } = {}){
  if (!file.type.startsWith('image/')) throw new Error('Bu bir görsel dosyası değil.');
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
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);

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
  if (!fileEl) return;

  async function accept(file){
    if (!file) return;
    info.textContent = 'WebP formatına çevriliyor…';
    box.hidden = false;
    try{
      const out = await toWebp(file, { aspectRatio: IMAGE_ASPECT_RATIO });
      state.pendingImage = { base64: out.dataUrl, name: file.name };
      img.src = out.dataUrl;
      info.innerHTML = `<strong>Yeni görsel hazır.</strong><br>${out.width}×${out.height}px · ${kb(out.size)} · WebP`;
      markDirty();
    }catch(err){
      state.pendingImage = null;
      info.textContent = 'Hata: ' + err.message;
    }
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
    for (const file of files.slice(0, Math.max(0, free))){
      info.textContent = `${file.name} çevriliyor…`;
      try{
        const out = await toWebp(file, { aspectRatio: IMAGE_ASPECT_RATIO });
        state.gallery.newFiles.push({ base64: out.dataUrl, name: file.name });
        markDirty();
      }catch(err){
        toast(`${esc(file.name)}: ${esc(err.message)}`, 'err');
      }
    }
    renderThumbs(name);
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
  ['dragenter','dragover'].forEach(ev =>
    el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add('is-over'); }));
  ['dragleave','drop'].forEach(ev =>
    el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.remove('is-over'); }));
  el.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length) onFiles(files);
  });
}

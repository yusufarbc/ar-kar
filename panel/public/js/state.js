/* ======================================================================
   Koleksiyon tanımları — ana sitedeki Zod şeması ve publish.ts ile
   birebir uyumlu olmalıdır. Buradaki alan adları doğrudan API gövdesine
   yazılır. Bu dosya bilerek izole tutulur: bu sözleşmeyi elle senkron
   tutması gereken tek yer burasıdır.
   ====================================================================== */
export const COLLECTIONS = {
  blog: {
    label: 'Haberler',
    urlBase: '/haberler/',
    fields: [
      {name:'title',       label:'Başlık',                type:'text',     required:true},
      {name:'date',        label:'Tarih',                 type:'date',     required:true},
      {name:'description', label:'Özet açıklama',         type:'textarea', required:true, hint:'Liste sayfasında ve arama sonuçlarında görünür. 1–2 cümle yeterli.'},
      {name:'coverImage',  label:'Kapak görseli (4:3)',   type:'image', required:true, hint:'Yayın için zorunludur. Görsel otomatik olarak 4:3 WebP standardına getirilir.'},
      {name:'gallery',     label:'Ek görseller (galeri)', type:'gallery'},
      {name:'content',     label:'İçerik',                type:'markdown', required:true},
    ],
  },
  projects: {
    label: 'Projeler',
    urlBase: '/projeler/',
    fields: [
      {name:'title',    label:'Proje adı', type:'text', required:true},
      {name:'category', label:'Kategori',  type:'pillselect', required:true, options:[
        {value:'insaat', label:'İnşaat',          icon:'fa-building'},
        {value:'pvc',    label:'PVC & Alüminyum', icon:'fa-th-large'},
        {value:'mimar',  label:'Mimarlık',        icon:'fa-drafting-compass'},
      ]},
      {name:'status',   label:'Proje Durumu', type:'pillselect', required:true, options:[
        {value:'tamamlandi', label:'Tamamlanan Proje', icon:'fa-check-circle'},
        {value:'guncel',     label:'Güncel Proje',     icon:'fa-clock'},
      ]},
      {name:'location', label:'Konum', type:'text', placeholder:'Çarşamba, Samsun'},
      {name:'specs',    label:'Daire / teknik bilgi', type:'text', placeholder:'18 daire (8× 2+1, 10× 1+1)'},
      {name:'date',     label:'Tarih', type:'date', required:true},
      {name:'description', label:'Kısa açıklama',      type:'textarea', required:true, hint:'Proje listesinde ve arama sonuçlarında görünür.'},
      {name:'coverImage',  label:'Proje görseli (4:3)', type:'image', required:true, hint:'Yayın için zorunludur. Görsel otomatik olarak 4:3 WebP standardına getirilir.'},
      {name:'gallery',     label:'Ek görseller (galeri)', type:'gallery'},
      {name:'content',     label:'Detaylı bilgi',      type:'markdown', required:true},
    ],
  },
};

export const SITE = 'https://ar-kar.com';
export const MAX_GALLERY = 8;
/** Kapak ve galeri görselleri için standart kadraj (genişlik/yükseklik).
 * Sitede kart görselleri artık bu orana göre 'cover' ile gösteriliyor
 * (bkz. CardMedia.astro) — her gönderi farklı boyutta gelmesin diye
 * yükleme anında bu orana göre ortadan kırpılır. */
export const IMAGE_ASPECT_RATIO = 4 / 3;

/* ======================================================================
   Durum — tek paylaşımlı nesne. Diğer modüller `import { state } from
   './state.js'` ile alır; nesne referansı paylaşıldığı için `state.x = y`
   şeklindeki mutasyonlar her yerde görünür (eski tek dosyalı sürümdeki
   kapanış/closure davranışının modül eşleniği).
   ====================================================================== */
export const state = {
  collection: Object.keys(COLLECTIONS)[0],
  entries: [],
  filter: '',
  editingSlug: null,   // null => yeni kayıt
  dirty: false,        // kaydedilmemiş değişiklik var mı
  pendingImage: null,  // {base64, name, width, height}
  coverValid: true,    // kapak görseli 4:3 standardına uygun mu
  processingImages: 0, // asenkron kırpma/dönüştürme işlemi sayısı
  gallery: { existing: [], newFiles: [] },
  selected: new Set(), // toplu silme için seçili slug'lar
};

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export const today = () => new Date().toISOString().slice(0,10);

/**
 * publish.ts içindeki slugify ile BİREBİR aynı olmalıdır; aksi hâlde
 * kullanıcıya gösterdiğimiz adres önizlemesi gerçekte oluşacak adresten
 * farklı çıkar.
 */
export function slugify(input){
  const map = {'ç':'c','Ç':'c','ğ':'g','Ğ':'g','ı':'i','İ':'i','ö':'o','Ö':'o','ş':'s','Ş':'s','ü':'u','Ü':'u'};
  return String(input ?? '')
    .split('').map(c => map[c] ?? c).join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,80);
}

export function markDirty(){
  state.dirty = true;
  $('saveBtn').textContent = 'Yayınla •';
}
export function clearDirty(){
  state.dirty = false;
  $('saveBtn').textContent = 'Yayınla';
}

window.addEventListener('beforeunload', (e) => {
  if (!state.dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

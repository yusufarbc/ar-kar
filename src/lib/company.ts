/**
 * Firma sabitleri — tek kaynak.
 *
 * Tecrübe yılı daha önce 12 dosyada elle "36" olarak yazılıydı ve güncel
 * değildi: firma 1987'de kurulduğu için 2026'da 36 değil 39 yıl olmuştu.
 * Artık derleme anında hesaplanır; site her içerik yayınında yeniden
 * derlendiği için değer kendiliğinden güncel kalır.
 */

export const FOUNDING_YEAR = 1987;

/** Limited şirkete dönüşüm yılı (ana sayfadaki "Hakkımızda" metninde geçer). */
export const INCORPORATION_YEAR = 1996;

/** Kuruluştan bu yana geçen tam yıl sayısı. */
export const EXPERIENCE_YEARS = new Date().getFullYear() - FOUNDING_YEAR;

/** İletişim bilgileri — Footer, iletişim sayfası ve JSON-LD aynı kaynağı kullanır. */
export const COMPANY = {
  /** Ticaret sicilindeki resmî ünvan — yapısal veride (JSON-LD) bu kullanılır. */
  legalName: 'AR-KAR GIDA TARIM ÜRÜNLERİ VE TAŞIMACILIK TİCARET LİMİTED ŞİRKETİ',
  /** Düz metin içinde okunabilir biçim; tamamı büyük harf paragrafta bağırır. */
  displayName: 'AR-KAR Gıda Tarım Ürünleri ve Taşımacılık Ticaret Ltd. Şti.',
  shortName: 'AR-KAR İnşaat',
  email: 'arkargida@gmail.com',
  whatsapp: '905421826855',
  instagram: 'https://www.instagram.com/arkarltd',
  facebook: 'https://www.facebook.com/arkarltd/',
  // Numaralar ana sayfadaki iletişim bölümünden birebir alınmıştır.
  // Şube ve Merkez'in sabit/cep numaraları FARKLIDIR; karıştırılmamalı.
  branches: [
    {
      id: 'sube',
      name: 'Şube',
      street: 'Orta Mah. Dr. Orhan Atılgan Cad. No:24/A',
      district: 'Çarşamba',
      city: 'Samsun',
      postalCode: '55500',
      phone: '+90 362 834 18 48',
      phoneHref: 'tel:+903628341848',
      mobile: '+90 542 182 68 55',
      mobileHref: 'tel:+905421826855',
      whatsapp: '905421826855',
    },
    {
      id: 'merkez',
      name: 'Merkez',
      street: 'Aşağı Kavacık Mah. No:46/A',
      district: 'Çarşamba',
      city: 'Samsun',
      postalCode: '55500',
      phone: '+90 362 846 03 93',
      phoneHref: 'tel:+903628460393',
      mobile: '+90 542 152 67 55',
      mobileHref: 'tel:+905421526755',
      whatsapp: '905421526755',
    },
  ],
  openingHours: { days: 'Pazartesi – Cumartesi', opens: '08:00', closes: '18:00' },
} as const;

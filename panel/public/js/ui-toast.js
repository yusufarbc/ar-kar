import { $, state } from './state.js';

/* ======================================================================
   Bildirimler ve onay kutusu
   ====================================================================== */
export function toast(html, kind='ok', ms=7000){
  const el = document.createElement('div');
  el.className = 'toast toast--' + kind;
  el.innerHTML = html;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

/** confirm() yerine; başlık + açıklama gösterir, Promise<boolean> döner. */
export function confirmBox(title, text, okLabel='Evet'){
  return new Promise((resolve) => {
    const dlg = $('confirmDlg');
    $('dlgTitle').textContent = title;
    $('dlgText').textContent = text;
    $('dlgOk').textContent = okLabel;
    const done = (v) => { dlg.close(); cleanup(); resolve(v); };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    function cleanup(){
      $('dlgOk').removeEventListener('click', onOk);
      $('dlgCancel').removeEventListener('click', onCancel);
      dlg.removeEventListener('cancel', onCancel);
    }
    $('dlgOk').addEventListener('click', onOk);
    $('dlgCancel').addEventListener('click', onCancel);
    dlg.addEventListener('cancel', onCancel);
    dlg.showModal();
  });
}

/**
 * Kaydedilmemiş değişiklik varken yön değiştirmeye çalışan her eylem
 * buradan geçer. Panelin en sık yaşanan veri kaybı senaryosu buydu:
 * yazı yazarken listeden başka bir kayda tıklayınca her şey siliniyordu.
 */
export async function guard(){
  if (!state.dirty) return true;
  return confirmBox(
    'Kaydedilmemiş değişiklikler var',
    'Bu kayıtta yayınlanmamış değişiklikleriniz var. Devam ederseniz bu değişiklikler kaybolur.',
    'Değişiklikleri at'
  );
}

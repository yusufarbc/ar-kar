import { $ } from './state.js';
import { markDirty } from './state.js';

/* ======================================================================
   Küçük Markdown -> HTML (yalnızca panel önizlemesi için).
   Sitedeki gerçek render Astro üzerinden yapılır; bu yalnızca hızlı bir
   fikir vermek içindir, tam uyum garanti etmez. Gerçek bir markdown
   parser'a geçiş bu dosyanın izole olması sayesinde tek noktadan yapılır.
   ====================================================================== */
export function mdToHtml(src){
  const escHtml = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lines = escHtml(src).split(/\r?\n/);
  let html = '';
  let inList = null;
  const closeList = () => { if (inList) { html += `</${inList}>`; inList = null; } };

  const inline = (t) => t
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  for (const line of lines){
    if (/^\s*$/.test(line)) { closeList(); continue; }
    let m;
    if ((m = line.match(/^###\s+(.*)$/))) { closeList(); html += `<h4>${inline(m[1])}</h4>`; continue; }
    if ((m = line.match(/^##\s+(.*)$/)))  { closeList(); html += `<h3>${inline(m[1])}</h3>`; continue; }
    if ((m = line.match(/^#\s+(.*)$/)))   { closeList(); html += `<h2>${inline(m[1])}</h2>`; continue; }
    if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (inList !== 'ul') { closeList(); html += '<ul>'; inList = 'ul'; }
      html += `<li>${inline(m[1])}</li>`; continue;
    }
    if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      if (inList !== 'ol') { closeList(); html += '<ol>'; inList = 'ol'; }
      html += `<li>${inline(m[1])}</li>`; continue;
    }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html || '<p style="color:var(--muted)">Önizlenecek içerik yok…</p>';
}

/* ---------- Markdown alanı ---------- */
export function setupMarkdown(name){
  const ta = $(`f_${name}`);
  const toolbar = $(`f_${name}_toolbar`);
  const preview = $(`f_${name}_preview`);
  const area = $(`f_${name}_area`);
  if (!ta || !toolbar) return;

  function wrap(before, after = before){
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || 'metin';
    ta.value = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
    ta.focus();
    ta.selectionStart = s + before.length;
    ta.selectionEnd = s + before.length + sel.length;
    markDirty();
  }

  function linePrefix(prefix){
    const s = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
    ta.value = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + prefix.length;
    markDirty();
  }

  toolbar.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      if (cmd === 'bold') wrap('**');
      else if (cmd === 'italic') wrap('*');
      else if (cmd === 'h2') linePrefix('## ');
      else if (cmd === 'h3') linePrefix('### ');
      else if (cmd === 'ul') linePrefix('- ');
      else if (cmd === 'ol') linePrefix('1. ');
      else if (cmd === 'link'){
        const url = prompt('Bağlantı adresi (https://…):');
        if (url) wrap('[', `](${url})`);
      } else if (cmd === 'preview'){
        const on = preview.classList.toggle('is-on');
        area.hidden = on;
        btn.classList.toggle('is-on', on);
        btn.textContent = on ? '✏️ Düzenle' : '👁 Önizleme';
        if (on) preview.innerHTML = mdToHtml(ta.value);
      }
    });
  });

  // Ctrl+B / Ctrl+I
  ta.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b'){ e.preventDefault(); wrap('**'); }
    else if (k === 'i'){ e.preventDefault(); wrap('*'); }
  });
}

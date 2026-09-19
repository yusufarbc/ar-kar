/* ======================================================================
   API istemcisi — GET/DELETE /api/entries ve POST /api/publish için ince
   fetch sarmalayıcıları. Bilerek DOM'a dokunmaz; sadece ağ + hata şekli.
   Bu dosya tek başına incelenerek Functions sözleşmesine (panel/functions/
   api/*.ts) hiç dokunulmadığı doğrulanabilir.
   ====================================================================== */

export async function fetchEntries(collection){
  const res = await fetch(`/api/entries?collection=${collection}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Liste alınamadı.');
  return data.entries || [];
}

export async function fetchEntry(collection, slug){
  const res = await fetch(`/api/entries?collection=${collection}&slug=${encodeURIComponent(slug)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Kayıt alınamadı.');
  return data;
}

export async function deleteEntryApi(collection, slug){
  const res = await fetch(`/api/entries?collection=${collection}&slug=${encodeURIComponent(slug)}`, { method:'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Silinemedi.');
  return data;
}

export async function publishEntry(payload){
  const res = await fetch('/api/publish', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Kaydedilemedi.');
  return data;
}

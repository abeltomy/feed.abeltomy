const API = '/api';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let events = [];
let editingId = null;
let mediaItems = []; // { file?, url, type, caption, key? }
let linkItems  = []; // { label, url }

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadEvents() {
  try {
    const res = await fetch(`${API}/events`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    events = (data.events || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    renderList();
  } catch (e) {
    setStatus('Failed to load events: ' + e.message, 'err');
  }
}

// ── Render list ───────────────────────────────────────────────────────────────

function renderList() {
  const container = document.getElementById('admin-timeline');
  document.getElementById('event-count').textContent = `(${events.length})`;

  if (!events.length) {
    container.innerHTML = '<p class="empty">No events yet.</p>';
    return;
  }

  container.innerHTML = events
    .map(ev => {
      const d = new Date(ev.date + 'T00:00:00');
      const dateStr = `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      const archived = ev.archived ? ' admin-event--archived' : '';
      const archiveLabel = ev.archived ? 'Unarchive' : 'Archive';
      return `
        <div class="admin-event${archived}">
          <div>
            <div class="admin-event-meta">${dateStr} &middot; ${h(ev.category)}${ev.archived ? ' &middot; archived' : ''}</div>
            <div class="admin-event-title">${h(ev.title)}</div>
          </div>
          <div class="admin-event-actions">
            <button class="btn-edit"    onclick="startEdit('${h(ev.id)}')">Edit</button>
            <button class="btn-archive" onclick="toggleArchive('${h(ev.id)}')">${archiveLabel}</button>
            <button class="btn-delete"  onclick="confirmDelete('${h(ev.id)}')">Delete</button>
          </div>
        </div>`;
    })
    .join('');
}

// ── Edit ──────────────────────────────────────────────────────────────────────

function startEdit(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;

  editingId = id;
  document.getElementById('form-heading').textContent = 'Edit Event';
  document.getElementById('submit-btn').textContent   = 'Save Changes';
  document.getElementById('cancel-btn').style.display = '';

  document.getElementById('ev-id').value           = ev.id;
  document.getElementById('ev-date').value         = ev.date;
  document.getElementById('ev-end-date').value     = ev.endDate || '';
  document.getElementById('ev-title').value        = ev.title;
  document.getElementById('ev-location').value     = ev.location || '';
  document.getElementById('ev-description').value  = ev.description || '';

  mediaItems = (ev.media  || []).map(m => ({ ...m }));
  linkItems  = (ev.links  || []).map(l => ({ ...l }));
  renderPreviews();
  renderLinks();
  setStatus('');

  document.getElementById('event-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEdit() {
  editingId = null;
  document.getElementById('form-heading').textContent = 'New Event';
  document.getElementById('submit-btn').textContent   = 'Add Event';
  document.getElementById('cancel-btn').style.display = 'none';
  document.getElementById('event-form').reset();
  document.getElementById('ev-end-date').value = '';
  mediaItems = [];
  linkItems  = [];
  renderPreviews();
  renderLinks();
  setStatus('');
  setProgress(null);
}

document.getElementById('cancel-btn').addEventListener('click', cancelEdit);

// ── Delete ────────────────────────────────────────────────────────────────────

async function confirmDelete(id) {
  if (!confirm('Delete this event? This cannot be undone.')) return;

  const ev = events.find(e => e.id === id);
  if (!ev) return;

  // Remove associated R2 media
  for (const m of ev.media || []) {
    if (m.key) {
      await fetch(`/media/${encodeURIComponent(m.key)}`, { method: 'DELETE' }).catch(() => {});
    }
  }

  events = events.filter(e => e.id !== id);

  try {
    await saveEvents();
    renderList();
    if (editingId === id) cancelEdit();
  } catch (e) {
    setStatus('Delete failed: ' + e.message, 'err');
    await loadEvents(); // resync
  }
}

// ── Archive ───────────────────────────────────────────────────────────────────

async function toggleArchive(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  ev.archived = !ev.archived;
  try {
    await saveEvents();
    renderList();
  } catch (e) {
    setStatus('Archive failed: ' + e.message, 'err');
    await loadEvents();
  }
}

// ── Form submit ───────────────────────────────────────────────────────────────

document.getElementById('event-form').addEventListener('submit', async e => {
  e.preventDefault();

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  setStatus('Saving…');

  try {
    // Upload any pending local files
    const total = mediaItems.filter(i => i.file).length;
    let done = 0;

    for (const item of mediaItems) {
      if (item.file) {
        const isVideo = item.file.type.startsWith('video/') || /\.(mp4|mov|webm|avi)$/i.test(item.file.name);
        let fileToUpload = item.file;
        if (!isVideo) {
          setStatus(`Compressing ${done + 1} of ${total}…`);
          try { fileToUpload = await processImage(item.file); } catch { /* use original */ }
        }
        setProgress(done / total, `Uploading ${done + 1} of ${total}…`);
        setStatus('Saving…');
        const { url, key } = await uploadFile(fileToUpload, p => {
          setProgress((done + p) / total, `Uploading ${done + 1} of ${total}…`);
        });
        item.url = url;
        item.key = key;
        delete item.file;
        if (item._blobUrl) { URL.revokeObjectURL(item._blobUrl); delete item._blobUrl; }
        done++;
      }
    }
    setProgress(null);

    const endDate = document.getElementById('ev-end-date').value;
    const ev = {
      id:          editingId || crypto.randomUUID(),
      date:        document.getElementById('ev-date').value,
      ...(endDate ? { endDate } : {}),
      title:       document.getElementById('ev-title').value.trim(),
      location:    document.getElementById('ev-location').value.trim(),
      description: document.getElementById('ev-description').value.trim(),
      media:       mediaItems.map(({ file, _blobUrl, ...rest }) => rest),
      links:       linkItems.filter(l => l.url.trim()),
    };

    if (editingId) {
      const idx = events.findIndex(e => e.id === editingId);
      if (idx !== -1) events[idx] = ev;
    } else {
      events.unshift(ev);
    }

    await saveEvents();
    setStatus('Saved!', 'ok');
    cancelEdit();
    renderList();
  } catch (err) {
    setStatus('Error: ' + err.message, 'err');
  } finally {
    submitBtn.disabled = false;
  }
});

// ── API helpers ───────────────────────────────────────────────────────────────

function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/upload`);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid response')); }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(form);
  });
}

async function saveEvents() {
  const sorted = [...events].sort((a, b) => new Date(b.date) - new Date(a.date));
  const res = await fetch(`${API}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: sorted }),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
}

// ── File upload UI ────────────────────────────────────────────────────────────

const fileInput  = document.getElementById('file-input');
const uploadZone = document.getElementById('upload-zone');

document.getElementById('browse-btn').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  for (const file of fileInput.files) await addMediaItem(file);
  fileInput.value = '';
});

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', async e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  for (const file of e.dataTransfer.files) await addMediaItem(file);
});

async function addMediaItem(file) {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|avi)$/i.test(file.name);
  const isHeic  = !isVideo && (file.type === 'image/heic' || file.type === 'image/heif'
    || /\.(heic|heif)$/i.test(file.name));

  if (isHeic) {
    setStatus('Converting HEIC…');
    try {
      file = await convertHeic(file);
      setStatus('');
    } catch (e) {
      setStatus('Could not convert HEIC: ' + e.message, 'err');
      return;
    }
  }

  const type    = isVideo ? 'video' : 'photo';
  const blobUrl = URL.createObjectURL(file);
  mediaItems.push({ file, url: blobUrl, _blobUrl: blobUrl, type, caption: '' });
  renderPreviews();
}

async function processImage(file) {
  // HEIC already converted to JPEG in addMediaItem — just compress
  return await compressImage(file);
}

async function convertHeic(file) {
  // Try native browser decoding first (Safari has built-in HEIC codec)
  const native = await tryNativeDecode(file);
  if (native) return native;
  // Fallback: heic2any (libheif-based, fails on some HEIC variants)
  if (typeof heic2any !== 'function') throw new Error('conversion library not loaded');
  let result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.82 });
  const blob = Array.isArray(result) ? result[0] : result;
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
}

function tryNativeDecode(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1920;
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
        else        { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        resolve(blob
          ? new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
          : null);
      }, 'image/jpeg', 0.82);
    };
    img.src = url;
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('img load failed')); };
    img.onload = () => {
      URL.revokeObjectURL(src);
      const MAX = 1920;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('canvas toBlob failed'));
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.82);
    };
    img.src = src;
  });
}

function renderPreviews() {
  document.getElementById('upload-previews').innerHTML = mediaItems
    .map((item, i) => `
      <div class="upload-preview-item">
        ${item.type === 'video'
          ? `<video src="${item.url}" muted></video>`
          : `<img src="${item.url}" alt="">`}
        <button type="button" class="preview-remove" onclick="removeMedia(${i})" title="Remove">&times;</button>
        <input class="preview-caption" type="text" placeholder="Caption…"
               value="${h(item.caption)}"
               oninput="mediaItems[${i}].caption = this.value">
      </div>`)
    .join('');
}

function removeMedia(i) {
  const item = mediaItems[i];
  if (item._blobUrl) URL.revokeObjectURL(item._blobUrl);
  mediaItems.splice(i, 1);
  renderPreviews();
}

// ── Links UI ──────────────────────────────────────────────────────────────────

document.getElementById('add-link-btn').addEventListener('click', () => {
  linkItems.push({ label: '', url: '' });
  renderLinks();
});

function renderLinks() {
  document.getElementById('links-list').innerHTML = linkItems
    .map((l, i) => `
      <div class="link-row">
        <input type="text" placeholder="Label"
               value="${h(l.label)}"
               oninput="linkItems[${i}].label = this.value">
        <input type="url" placeholder="https://…"
               value="${h(l.url)}"
               oninput="linkItems[${i}].url = this.value">
        <button type="button" class="link-row-remove" onclick="removeLink(${i})" title="Remove">&times;</button>
      </div>`)
    .join('');
}

function removeLink(i) {
  linkItems.splice(i, 1);
  renderLinks();
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function setStatus(msg, type) {
  const el = document.getElementById('form-status');
  el.textContent = msg;
  el.className   = type === 'ok' ? 'status-ok' : type === 'err' ? 'status-err' : '';
}

function setProgress(pct, label) {
  const wrap = document.getElementById('progress-wrap');
  if (pct == null) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  document.getElementById('progress-fill').style.width = `${Math.round(pct * 100)}%`;
  document.getElementById('progress-label').textContent = label || '';
}

function h(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

loadEvents();

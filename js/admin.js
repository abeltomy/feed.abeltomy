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
    for (const item of mediaItems) {
      if (item.file) {
        const { url, key } = await uploadFile(item.file);
        item.url = url;
        item.key = key;
        delete item.file;
        // revoke blob URL
        if (item._blobUrl) { URL.revokeObjectURL(item._blobUrl); delete item._blobUrl; }
      }
    }

    const endDate = document.getElementById('ev-end-date').value;
    const ev = {
      id:          editingId || crypto.randomUUID(),
      date:        document.getElementById('ev-date').value,
      ...(endDate ? { endDate } : {}),
      title:       document.getElementById('ev-title').value.trim(),
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

async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return res.json(); // { url, key }
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

fileInput.addEventListener('change', () => {
  Array.from(fileInput.files).forEach(addMediaItem);
  fileInput.value = '';
});

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  Array.from(e.dataTransfer.files).forEach(addMediaItem);
});

function addMediaItem(file) {
  const type     = file.type.startsWith('video/') ? 'video' : 'photo';
  const blobUrl  = URL.createObjectURL(file);
  mediaItems.push({ file, url: blobUrl, _blobUrl: blobUrl, type, caption: '' });
  renderPreviews();
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

function h(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

loadEvents();

const EVENTS_URL = '/api/events';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let allEvents = [];

async function loadEvents() {
  try {
    const res = await fetch(EVENTS_URL);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    allEvents = (data.events || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    render();
  } catch {
    document.getElementById('timeline').innerHTML =
      '<p class="empty">Could not load events.</p>';
  }
}

function render() {
  const timeline = document.getElementById('timeline');

  if (!allEvents.length) {
    timeline.innerHTML = '<p class="empty">No events yet.</p>';
    return;
  }

  const byYear = {};
  for (const ev of allEvents) {
    const year = new Date(ev.date + 'T00:00:00').getFullYear();
    (byYear[year] = byYear[year] || []).push(ev);
  }

  const years = Object.keys(byYear).sort((a, b) => b - a);

  timeline.innerHTML = years
    .map(
      year => `
      <div class="year-group">
        <div class="year-label">${year}</div>
        ${byYear[year].map(renderEvent).join('')}
      </div>`
    )
    .join('');
}

function renderEvent(ev) {
  const d = new Date(ev.date + 'T00:00:00');
  const month = MONTHS[d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');

  const mediaHtml = (ev.media || [])
    .map(m => {
      if (m.type === 'video') {
        return `<video src="${h(m.url)}" muted playsinline title="${h(m.caption || '')}" onclick="openLightbox('video','${h(m.url)}')"></video>`;
      }
      return `<img src="${h(m.url)}" alt="${h(m.caption || ev.title)}" loading="lazy" onclick="openLightbox('image','${h(m.url)}')">`;
    })
    .join('');

  const linksHtml = (ev.links || [])
    .filter(l => l.url)
    .map(l => `<a class="event-link" href="${h(l.url)}" target="_blank" rel="noopener noreferrer">${h(l.label || l.url)}</a>`)
    .join('');

  return `
    <div class="event">
      <div class="event-date">
        <span class="event-month">${month}</span>
        <span class="event-day">${day}</span>
      </div>
      <div class="event-body">
        <span class="event-category cat-${h(ev.category)}">${h(ev.category)}</span>
        <div class="event-title">${h(ev.title)}</div>
        ${ev.description ? `<div class="event-description">${h(ev.description)}</div>` : ''}
        ${mediaHtml ? `<div class="event-media">${mediaHtml}</div>` : ''}
        ${linksHtml ? `<div class="event-links">${linksHtml}</div>` : ''}
      </div>
    </div>`;
}

function h(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function openLightbox(type, url) {
  const content = document.getElementById('lightbox-content');
  if (type === 'video') {
    content.innerHTML = `<video src="${url}" controls autoplay style="max-width:90vw;max-height:85vh;"></video>`;
  } else {
    content.innerHTML = `<img src="${url}" alt="" style="max-width:90vw;max-height:90vh;object-fit:contain;">`;
  }
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lightbox-content').innerHTML = '';
}

document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', function (e) {
  if (e.target === this) closeLightbox();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
});

loadEvents();

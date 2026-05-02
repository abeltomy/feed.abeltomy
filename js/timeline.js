const EVENTS_URL = '/api/events';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let allEvents = [];
let activeYear = 'all';

async function loadEvents() {
  try {
    const res = await fetch(EVENTS_URL);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    allEvents = (data.events || []).filter(e => !e.archived).sort((a, b) => new Date(b.date) - new Date(a.date));
    populateYearFilter();
    render();
  } catch {
    document.getElementById('timeline').innerHTML =
      '<p class="empty">Could not load events.</p>';
  }
}

function populateYearFilter() {
  const years = [...new Set(allEvents.map(e => new Date(e.date + 'T00:00:00').getFullYear()))].sort((a, b) => b - a);
  const sel = document.getElementById('year-filter');
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  });
}

function render() {
  const timeline = document.getElementById('timeline');
  const filtered = activeYear === 'all' ? allEvents : allEvents.filter(e => new Date(e.date + 'T00:00:00').getFullYear() === Number(activeYear));

  if (!filtered.length) {
    timeline.innerHTML = '<p class="empty">No events yet.</p>';
    return;
  }

  const byYear = {};
  for (const ev of filtered) {
    const year = new Date(ev.date + 'T00:00:00').getFullYear();
    (byYear[year] = byYear[year] || []).push(ev);
  }

  const years = Object.keys(byYear).sort((a, b) => b - a);

  const cards = years.flatMap(year => [
    `<div class="year-divider"><span>${year}</span></div>`,
    ...byYear[year].map(renderEvent)
  ]);

  timeline.innerHTML = `<div class="timeline-scroll">${cards.join('')}</div>`;
}

document.getElementById('year-filter').addEventListener('change', function () {
  activeYear = this.value;
  render();
});

function renderEvent(ev) {
  const start = new Date(ev.date + 'T00:00:00');
  const month = MONTHS[start.getMonth()];
  const day   = String(start.getDate()).padStart(2, '0');

  let dateRangeHtml = '';
  if (ev.endDate) {
    const end = new Date(ev.endDate + 'T00:00:00');
    const endMonth = MONTHS[end.getMonth()];
    const endDay   = String(end.getDate()).padStart(2, '0');
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    dateRangeHtml = `<span class="event-range">${sameMonth ? `${day}–${endDay} ${month}` : `${day} ${month} – ${endDay} ${endMonth}`}</span>`;
  }

  const mediaHtml = (ev.media || [])
    .map(m => {
      if (m.type === 'video') {
        return `<video src="${h(m.url)}" muted playsinline preload="metadata" title="${h(m.caption || '')}" onloadedmetadata="this.currentTime=0.1" onclick="openLightbox('video','${h(m.url)}')"></video>`;
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
      ${mediaHtml ? `<div class="event-media">${mediaHtml}</div>` : ''}
      <div class="event-info">
        <div class="event-dateline"><span class="event-month">${month}</span> <span class="event-day">${day}</span></div>
        ${dateRangeHtml}
        <div class="event-title">${h(ev.title)}</div>
        ${ev.location ? `<div class="event-location">📍 ${h(ev.location)}</div>` : ''}
        ${ev.description ? `<div class="event-description">${h(ev.description)}</div>` : ''}
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

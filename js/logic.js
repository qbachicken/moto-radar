const MONTHS_PL = {
  "stycznia": 0, "lutego": 1, "marca": 2, "kwietnia": 3, "maja": 4, "czerwca": 5,
  "lipca": 6, "sierpnia": 7, "września": 8, "października": 9, "listopada": 10, "grudnia": 11
};

export function foldPl(text) {
  if (!text) return '';
  let s = text.replace(/ł/g, 'l').replace(/Ł/g, 'L');
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function normalizeTitle(title) {
  return (title || '').toLowerCase().replace(/[\W_]+/g, '');
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseEventDate(dateStr, now = new Date()) {
  if (!dateStr) return null;
  let s = dateStr.trim().toLowerCase();
  let m = s.match(/(\d{1,2})(?:-\d{1,2})?\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)/i);
  if (m) {
    let day = parseInt(m[1], 10);
    let month = MONTHS_PL[m[2].toLowerCase()];
    if (month !== undefined) {
      let yr = now.getFullYear();
      let dt = new Date(yr, month, day);
      if (dt < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30) && now.getMonth() === 0) {
        dt.setFullYear(yr + 1);
      }
      return dt;
    }
  }
  let m2 = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m2) {
    let day = parseInt(m2[1], 10);
    let month = parseInt(m2[2], 10) - 1;
    let yr = m2[3];
    let year = yr.length === 2 ? 2000 + parseInt(yr, 10) : parseInt(yr, 10);
    return new Date(year, month, day);
  }
  return null;
}

export function dateKey(dateStr, now = new Date()) {
  let dt = parseEventDate(dateStr, now);
  if (!dt) return null;
  let y = dt.getFullYear();
  let m = String(dt.getMonth() + 1).padStart(2, '0');
  let d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateLabel(dateStr, now = new Date()) {
  let dt = parseEventDate(dateStr, now);
  if (!dt) return { text: dateStr || 'Wkrótce', days: null, isSoon: false };
  let n = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  let diffDays = Math.round((target - n) / (1000 * 60 * 60 * 24));
  let isSoon = diffDays >= 0 && diffDays <= 3;
  let text = '';
  if (diffDays === 0) text = 'Dziś';
  else if (diffDays === 1) text = 'Jutro';
  else if (diffDays > 1 && diffDays <= 7) text = `Za ${diffDays} dni`;
  else if (diffDays > 7) text = dateStr;
  else if (diffDays === -1) text = 'Wczoraj';
  else if (diffDays < -1) text = `${Math.abs(diffDays)} dni temu`;
  return { text: text || dateStr, days: diffDays, isSoon };
}

export function starKey(ev) {
  return normalizeTitle(ev.title) + '|' + (ev.date || '').trim().toLowerCase();
}

export function loadJson(raw, fallback) {
  try {
    if (!raw) return fallback;
    let parsed = JSON.parse(raw);
    return parsed !== null ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

export function starSetFromEvents(events, alreadySeeded) {
  if (alreadySeeded) return new Set();
  let set = new Set();
  for (let ev of events) {
    if (ev.starred) {
      set.add(starKey(ev));
    }
  }
  return set;
}

export function toggleStar(set, key) {
  let next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function isStarred(ev, starredSet) {
  return starredSet.has(starKey(ev));
}

const STOP_WORDS = new Set([
  "wyprawa", "przejazd", "zawody", "spotkanie", "szkolenie", "zlot", "rajd", "puchar",
  "tor", "z", "ekipa", "i", "oraz", "na", "w", "do", "o", "the", "and", "or", "of", "to",
  "a", "termin", "zapraszamy", "nadchodzace", "oficjalna", "edycja", "finalowa", "runde",
  "konska", "dolina", "poligon", "poligon4x4", "nowa", "nowo", "dodana", "impreza"
]);

const INSTALLMENT_RE = /\b(\d{1,2}|i{1,3}|iv|v)\s*(tura|runda|edycja|etap)\b/i;
const ROMAN = { i: "1", ii: "2", iii: "3", iv: "4", v: "5" };

function installmentSig(title) {
  let m = INSTALLMENT_RE.exec(foldPl(title));
  if (!m) return null;
  let num = m[1].toLowerCase();
  return [ROMAN[num] || num, m[2].toLowerCase()];
}

export function normalizeEvents(events) {
  let approxRegions = new Set([
    "jura", "jurajskie", "wal pomorski", "slask", "zaglebie", "gorce",
    "spisz", "kotlina jeleniogorska", "sudeckie", "pomorski", "lubuski",
    "swietokrzyskie", "pustynia siedlecka", "pustynia bledowska"
  ]);

  let unique = [];
  for (let ev of events) {
    let sub = ev.subCategory || "";
    if (sub === "Rajd / Offroad" || sub === "Rajd") sub = "Rajd Przeprawowy / Trophy";
    else if (sub === "Zlot / Spot" || sub === "Zlot") sub = "Zlot / Spot / Spotkanie";
    ev.subCategory = sub;

    if ((!ev.location || ev.location === "Nieznana") && ev.distanceKm === 0) {
      ev.distanceKm = null;
      ev.locationType = "unknown";
    }
    if (!ev.locationType) {
      let lLow = foldPl(ev.location);
      if (!ev.location || ev.location === "Nieznana") {
        ev.locationType = "unknown";
        ev.distanceKm = null;
      } else if (approxRegions.has(lLow)) {
        ev.locationType = "approximate";
      } else {
        ev.locationType = "exact";
      }
    }

    let normT = normalizeTitle(ev.title);
    let d = (ev.date || '').trim().toLowerCase();

    let dup = unique.find(existing => {
      let exNormT = normalizeTitle(existing.title);
      let exD = (existing.date || '').trim().toLowerCase();
      if (d !== exD) return false;
      let sig1 = installmentSig(ev.title);
      let sig2 = installmentSig(existing.title);
      if (sig1 && sig2 && (sig1[0] !== sig2[0] || sig1[1] !== sig2[1])) return false;
      return normT === exNormT || normT.includes(exNormT) || exNormT.includes(normT);
    });

    if (!dup) {
      unique.push({ ...ev });
    } else {
      if ((ev.fullDescription || '').length > (dup.fullDescription || '').length) {
        dup.fullDescription = ev.fullDescription;
      }
      if (ev.source && !dup.source) {
        dup.source = ev.source;
      }
    }
  }
  return unique;
}

export function eventCategoryKey(ev) {
  let sub = ev.subCategory || "";
  let low = foldPl(sub);
  if (low.includes('rajd') || low.includes('trophy')) return 'rajd';
  if (low.includes('wyprawa') || low.includes('4x4')) return 'wyprawa';
  if (low.includes('szkolenie') || low.includes('trening')) return 'szkolenie';
  if (low.includes('tor') || low.includes('wyscig') || low.includes('time')) return 'tor';
  return 'zlot';
}

export const CATEGORY_LABELS = {
  all: 'Wszystkie',
  starred: '⭐ Ważne',
  rajd: '🚜 Rajdy',
  wyprawa: '🧭 Wyprawy',
  szkolenie: '🎓 Szkolenia',
  tor: '🏁 Tory',
  zlot: '🚗 Zloty'
};

export function matchesQuery(ev, query) {
  if (!query || !query.trim()) return true;
  let q = foldPl(query.trim());
  let target = foldPl(`${ev.title || ''} ${ev.location || ''} ${ev.subCategory || ''} ${ev.fullDescription || ''}`);
  return target.includes(q);
}

export function filterEvents(events, opts = {}) {
  let { query = '', category = 'all', starredOnly = false, maxDist = 150, starredKeys = new Set() } = opts;
  return events.filter(e => {
    if (e.distanceKm !== null && e.distanceKm > maxDist) return false;
    if (category === 'starred' && !isStarred(e, starredKeys)) return false;
    if (category !== 'all' && category !== 'starred' && eventCategoryKey(e) !== category) return false;
    if (starredOnly && !isStarred(e, starredKeys)) return false;
    if (!matchesQuery(e, query)) return false;
    return true;
  });
}

export function sortEvents(events, now = new Date()) {
  let copy = [...events];
  copy.sort((a, b) => {
    let la = formatDateLabel(a.date, now);
    let lb = formatDateLabel(b.date, now);
    let da = la.days;
    let db = lb.days;
    if (da === null && db !== null) return 1;
    if (da !== null && db === null) return -1;
    if (da !== null && db !== null && da !== db) return da - db;

    let distA = a.distanceKm ?? 9999;
    let distB = b.distanceKm ?? 9999;
    if (distA !== distB) return distA - distB;

    return (a.title || '').localeCompare(b.title || '', 'pl');
  });
  return copy;
}

export function formatDistance(ev) {
  if (ev.distanceKm === null || ev.locationType === 'unknown' || ev.location === 'Nieznana') {
    return 'Lokalizacja nieznana';
  }
  if (ev.distanceKm !== undefined && ev.distanceKm !== null) {
    if (ev.locationType === 'approximate') {
      return `~${ev.distanceKm} km`;
    }
    return `${ev.distanceKm} km`;
  }
  return 'Lokalizacja nieznana';
}

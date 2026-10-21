import {
  normalizeEvents,
  filterEvents,
  sortEvents,
  formatDateLabel,
  formatDistance,
  eventCategoryKey,
  starKey,
  starSetFromEvents,
  loadJson,
  toggleStar,
  isStarred,
  escapeHtml
} from './logic.js';
import { store, toISODate, parseEventDate } from '../reminders.js';

let state = {
  events: [],
  starred: loadJson(typeof localStorage !== 'undefined' ? localStorage.getItem('motoradar_starred') : null, []),
  settings: loadJson(typeof localStorage !== 'undefined' ? localStorage.getItem('motoradar_settings') : null, { maxDist: 150 }),
  groqKey: (typeof localStorage !== 'undefined' ? localStorage.getItem('motoradar_groq_key') : '') || '',
  query: '',
  category: 'all',
  openKeys: new Set()
};

let starredSet = new Set(state.starred);

export function toast(msg) {
  let host = document.getElementById('toastHost');
  if (!host) return;
  let el = document.createElement('div');
  el.className = 'toast';
  el.innerText = msg;
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px) scale(0.95)';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function playAlertSound() {
  try {
    let ctx = new (window.AudioContext || window.webkitAudioContext)();
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {}
}

export function renderEventCard(ev, { starred, open }) {
  let cat = eventCategoryKey(ev);
  let dateInfo = formatDateLabel(ev.date);
  let distStr = formatDistance(ev);
  let sKey = starKey(ev);
  let desc = ev.fullDescription || ev.title || 'Brak dodatkowego opisu.';
  let safeTitle = escapeHtml(ev.title);
  let safeDesc = escapeHtml(desc);
  let safeSub = escapeHtml(ev.subCategory || 'Zlot');
  let safeLoc = escapeHtml(ev.location === 'Nieznana' ? 'Lokalizacja nieznana' : `${ev.location || 'Okolica'} / ${distStr}`);
  let safeSource = escapeHtml(ev.source || 'https://klasyki24.pl');

  return `
    <article class="event-card ${open ? 'is-open' : ''}" data-cat="${cat}" data-key="${sKey}" tabindex="0" aria-expanded="${open}">
        <div class="event-header">
            <div class="badges">
                <span class="badge subcat">${safeSub}</span>
                ${starred ? '<span class="badge star-badge">⭐ Priorytet</span>' : ''}
                ${ev.aiOptimized ? '<span class="badge ai-badge">✨ AI</span>' : ''}
            </div>
            <button class="star-btn" data-action="star" aria-pressed="${starred}" aria-label="Oznacz jako ważne">⭐</button>
        </div>
        <div class="event-title">${safeTitle}</div>
        <div class="event-footer">
            <span class="date-chip ${dateInfo.isSoon ? 'is-soon' : ''}">📅 ${escapeHtml(dateInfo.text)}</span>
            <span class="loc">📍 ${safeLoc}</span>
        </div>
        <div class="event-details">
            <div class="event-details-inner">
                <p style="margin: 0 0 10px 0; color: var(--text-dim); font-size: 0.85rem;">Szczegóły wydarzenia:</p>
                <p style="margin: 0;">${safeDesc}</p>
                <a class="btn-source" href="${safeSource}" target="_blank" rel="noopener noreferrer">🔗 Otwórz stronę źródłową</a>
            </div>
        </div>
    </article>
  `;
}

function render() {
  let list = document.getElementById('eventsList');
  let countEl = document.getElementById('statCount');
  let emptyEl = document.getElementById('emptyState');
  if (!list) return;

  let filtered = filterEvents(state.events, {
    query: state.query,
    category: state.category,
    maxDist: state.settings.maxDist,
    starredKeys: starredSet
  });
  let sorted = sortEvents(filtered);

  if (countEl) {
    countEl.innerText = `${sorted.length} wydarzeń`;
  }

  if (sorted.length === 0) {
    list.innerHTML = '';
    if (emptyEl) emptyEl.hidden = false;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  list.innerHTML = sorted.map(ev => {
    let sKey = starKey(ev);
    let starred = isStarred(ev, starredSet);
    let open = state.openKeys.has(sKey);
    return renderEventCard(ev, { starred, open });
  }).join('');
}

function checkEventNotifications() {
  let starredEvents = state.events.filter(e => isStarred(e, starredSet) || e.autoStarred);
  if (starredEvents.length === 0) return;

  let now = new Date();
  let todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let notifiedKey = 'motoradar_notified_' + todayMidnight.toDateString();
  let notifiedSet = loadJson(localStorage.getItem(notifiedKey), []);

  starredEvents.forEach(ev => {
    let dt = formatDateLabel(ev.date).days;
    if (dt !== null && dt >= -3 && dt <= 0) {
      let uniqueId = starKey(ev);
      if (!notifiedSet.includes(uniqueId)) {
        notifiedSet.push(uniqueId);
        localStorage.setItem(notifiedKey, JSON.stringify(notifiedSet));

        let whenText = "";
        if (dt === 0) whenText = `DZISIAJ o godzinie ${timeStr}!`;
        else if (dt === -1) whenText = `Wczoraj (${ev.date}) o godzinie ${timeStr}`;
        else if (dt === -2) whenText = `Przedwczoraj (${ev.date}) o godzinie ${timeStr}`;
        else whenText = `3 dni temu (${ev.date}) o godzinie ${timeStr}`;

        triggerBrowserNotification(`🔔 Przypomnienie o obserwowanym wydarzeniu!`, `${ev.title} (${ev.location || 'Okolica'}) miało miejsce/odbywa się: ${whenText}`);
      }
    }
  });
}

async function updateNotifUI() {
  let statusEl = document.getElementById('notifStatus');
  let toggleBtn = document.getElementById('notifToggleBtn');
  let testBtn = document.getElementById('notifTestBtn');
  if (!statusEl || !toggleBtn) return;

  let enabled = false;
  try {
    enabled = await store.get('notifyEnabled');
  } catch (e) {}
  if (enabled === null) enabled = false;

  let perm = "Notification" in window ? Notification.permission : "unsupported";

  if (perm === "denied") {
    statusEl.innerHTML = `⚠️ Powiadomienia zablokowane w przeglądarce. Odblokuj w ustawieniach strony.`;
    toggleBtn.style.display = 'none';
    if (testBtn) testBtn.style.display = 'none';
    return;
  }

  if (enabled && perm === "granted") {
    statusEl.innerHTML = `✅ Powiadomienia w tle są <b>włączone</b>.`;
    toggleBtn.innerText = '🔕 Wyłącz powiadomienia';
    toggleBtn.style.background = 'rgba(255, 0, 85, 0.2)';
    toggleBtn.style.borderColor = 'var(--crimson)';
    toggleBtn.style.color = 'var(--crimson)';
    if (testBtn) testBtn.style.display = 'block';
  } else {
    statusEl.innerHTML = `ℹ️ Powiadomienia są <b>wyłączone</b>.`;
    toggleBtn.innerText = '🔔 Włącz powiadomienia';
    toggleBtn.style.background = '';
    toggleBtn.style.borderColor = '';
    toggleBtn.style.color = '';
    if (testBtn) testBtn.style.display = 'none';
  }
}

async function toggleNotifications() {
  let perm = "Notification" in window ? await Notification.requestPermission() : "denied";
  if (perm !== "granted") {
    toast('Brak zgody na powiadomienia w przeglądarce.');
    updateNotifUI();
    return;
  }

  let enabled = false;
  try {
    enabled = await store.get('notifyEnabled');
  } catch (e) {}
  let nextState = !enabled;

  try {
    await store.set('notifyEnabled', nextState);
    if (nextState) {
      let watchlist = state.events
        .filter(e => isStarred(e, starredSet) || e.autoStarred)
        .map(e => ({
          key: starKey(e),
          title: e.title,
          date: e.date,
          location: e.location,
          startISO: toISODate(parseEventDate(e.date)),
          url: e.source
        }));
      await store.set('watchlist', watchlist);

      if ('serviceWorker' in navigator && 'periodicSync' in window.navigator) {
        try {
          let reg = await navigator.serviceWorker.ready;
          await reg.periodicSync.register('motoradar-reminders', {
            minInterval: 24 * 60 * 60 * 1000
          });
        } catch (e) {}
      }
    }
  } catch (e) {}

  toast(nextState ? 'Włączono powiadomienia!' : 'Wyłączono powiadomienia.');
  updateNotifUI();
}

function sendTestNotification() {
  if ("Notification" in window && Notification.permission === "granted") {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification("🏍️ MotoRadar - Test powiadomienia", {
        body: "Powiadomienia działają poprawnie! Będziesz powiadamiany o startujących zlotach i rajdach.",
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        data: { url: './index.html' }
      });
    }).catch(() => {
      new Notification("🏍️ MotoRadar - Test powiadomienia", {
        body: "Powiadomienia działają poprawnie!",
        icon: 'icons/icon-192.png'
      });
    });
    toast('Wysłano powiadomienie testowe!');
  } else {
    toast('Najpierw włącz powiadomienia i wyraź zgodę!');
  }
}

async function loadEvents() {
  try {
    let res = await fetch('events.json?_=' + Date.now());
    let data = await res.json();
    let localCustom = loadJson(localStorage.getItem('motoradar_custom'), []);
    localStorage.removeItem('motoradar_ai_optimized');

    let combined = [...localCustom, ...data];
    let normalized = normalizeEvents(combined);

    let alreadySeeded = localStorage.getItem('motoradar_starred_seeded') === 'true';
    if (!alreadySeeded) {
      let seededSet = starSetFromEvents(normalized, false);
      for (let k of seededSet) starredSet.add(k);
      localStorage.setItem('motoradar_starred', JSON.stringify([...starredSet]));
      localStorage.setItem('motoradar_starred_seeded', 'true');
    }

    state.events = normalized;
    render();
    checkEventNotifications();
    try {
      let watchlist = state.events
        .filter(e => isStarred(e, starredSet) || e.autoStarred)
        .map(e => ({
          key: starKey(e),
          title: e.title,
          date: e.date,
          location: e.location,
          startISO: toISODate(parseEventDate(e.date)),
          url: e.source
        }));
      store.set('watchlist', watchlist).catch(() => {});
    } catch (e) {}
  } catch (e) {
    let list = document.getElementById('eventsList');
    if (list) {
      list.innerHTML = '<div class="empty-state">Błąd pobierania danych. Sprawdź połączenie.</div>';
    }
  }
}

function openSheet(id) {
  let el = document.getElementById(id);
  if (el) el.hidden = false;
}

function closeSheet(id) {
  let el = document.getElementById(id);
  if (el) el.hidden = true;
}

// Client-side DOM wiring
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    let searchInput = document.getElementById('Input');
    let chipsHost = document.getElementById('filterChips');
    let eventsList = document.getElementById('eventsList');
    let btnSettings = document.getElementById('btnSettings');
    let fabAdd = document.getElementById('fabAdd');
    let distSlider = document.getElementById('distSlider');
    let distValue = document.getElementById('distValue');
    let groqKeyInput = document.getElementById('groqKeyInput');
    let aiBtn = document.getElementById('aiBtn');
    let addForm = document.getElementById('addForm');
    let installBtn = document.getElementById('installBtn');

    if (distSlider) {
      distSlider.value = state.settings.maxDist;
      if (distValue) distValue.innerText = state.settings.maxDist;
      distSlider.oninput = (e) => {
        if (distValue) distValue.innerText = e.target.value;
      };
      distSlider.onchange = (e) => {
        state.settings.maxDist = parseInt(e.target.value, 10) || 150;
        localStorage.setItem('motoradar_settings', JSON.stringify(state.settings));
        render();
      };
    }

    if (groqKeyInput) {
      groqKeyInput.value = state.groqKey;
      groqKeyInput.onchange = (e) => {
        state.groqKey = e.target.value.trim();
        localStorage.setItem('motoradar_groq_key', state.groqKey);
        toast('Klucz Groq API został zapisany.');
      };
    }

    let notifToggleBtn = document.getElementById('notifToggleBtn');
    let notifTestBtn = document.getElementById('notifTestBtn');
    if (notifToggleBtn) notifToggleBtn.onclick = toggleNotifications;
    if (notifTestBtn) notifTestBtn.onclick = sendTestNotification;

    if (btnSettings) {
      btnSettings.onclick = () => {
        openSheet('sheetSettings');
        updateNotifUI();
      };
    }
    if (fabAdd) fabAdd.onclick = () => openSheet('sheetAdd');

    document.querySelectorAll('[data-close-sheet]').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.sheet-overlay').forEach(s => s.hidden = true);
      };
    });

    document.querySelectorAll('.sheet-overlay').forEach(overlay => {
      overlay.onclick = (e) => {
        if (e.target === overlay) overlay.hidden = true;
      };
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.sheet-overlay').forEach(s => s.hidden = true);
      }
    });

    if (searchInput) {
      let debounceTimer;
      searchInput.oninput = (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.query = e.target.value;
          render();
        }, 120);
      };
    }

    if (chipsHost) {
      chipsHost.onclick = (e) => {
        let chip = e.target.closest('.chip');
        if (!chip) return;
        chipsHost.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        state.category = chip.getAttribute('data-category') || 'all';
        render();
      };
    }

    if (eventsList) {
      eventsList.onclick = (e) => {
        let starBtn = e.target.closest('[data-action="star"]');
        let card = e.target.closest('.event-card');
        if (!card) return;

        let sKey = card.getAttribute('data-key');
        let ev = state.events.find(x => starKey(x) === sKey);
        if (!ev) return;

        if (starBtn) {
          e.stopPropagation();
          starredSet = toggleStar(starredSet, sKey);
          localStorage.setItem('motoradar_starred', JSON.stringify([...starredSet]));
          try {
            let watchlist = state.events
              .filter(e => isStarred(e, starredSet) || e.autoStarred)
              .map(e => ({
                key: starKey(e),
                title: e.title,
                date: e.date,
                location: e.location,
                startISO: toISODate(parseEventDate(e.date)),
                url: e.source
              }));
            store.set('watchlist', watchlist).catch(() => {});
          } catch (e) {}
          if (starredSet.has(sKey)) {
            playAlertSound();
            navigator.vibrate?.(10);
            toast('Dodano do ważnych ⭐');
          } else {
            toast('Usunięto z ważnych');
          }
          render();
          return;
        }

        if (state.openKeys.has(sKey)) {
          state.openKeys.delete(sKey);
          card.classList.remove('is-open');
          card.setAttribute('aria-expanded', 'false');
        } else {
          state.openKeys.add(sKey);
          card.classList.add('is-open');
          card.setAttribute('aria-expanded', 'true');
        }
      };

      eventsList.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          let card = e.target.closest('.event-card');
          if (card && e.target === card) {
            e.preventDefault();
            card.click();
          }
        }
      };
    }

    if (addForm) {
      addForm.onsubmit = (e) => {
        e.preventDefault();
        let textarea = document.getElementById('addInput');
        let text = textarea ? textarea.value.trim() : '';
        if (!text) return;

        let lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        let title = lines[0] || 'Wydarzenie z własnego wpisu';
        let isOffroad = /rajd|offroad|4x4|teren|cross/i.test(text);

        let custom = loadJson(localStorage.getItem('motoradar_custom'), []);
        let newEv = {
          title,
          fullDescription: text,
          subCategory: isOffroad ? 'Rajd Przeprawowy / Trophy' : 'Zlot / Spot / Spotkanie',
          location: 'Skierniewice',
          locationType: 'exact',
          distanceKm: 0,
          autoStarred: false,
          starred: false,
          date: 'Najbliższy termin',
          custom: true,
          source: 'https://facebook.com'
        };

        custom.push(newEv);
        localStorage.setItem('motoradar_custom', JSON.stringify(custom));
        if (textarea) textarea.value = '';
        closeSheet('sheetAdd');
        toast('Dodano wydarzenie pomyślnie!');
        loadEvents();
      };
    }

    if (aiBtn) {
      aiBtn.onclick = async () => {
        if (!state.groqKey) {
          toast('Najpierw wpisz i zapisz swój klucz Groq API w ustawieniach!');
          return;
        }
        aiBtn.innerText = '⏳ Groq AI porządkuje i deduplikuje...';
        aiBtn.disabled = true;

        try {
          let rawList = state.events.map((e, i) => ({
            id: i,
            title: e.title,
            date: e.date,
            location: e.location,
            desc: e.fullDescription || e.title,
            source: e.source
          }));

          let prompt = `Jesteś głównym asystentem AI aplikacji motoryzacyjnej MotoRadar. Otrzymujesz listę surowych wydarzeń motoryzacyjnych. Twoim zadaniem jest:
1. Usunąć duplikaty (zostawić jedną najlepszą pozycję dla tego samego wydarzenia).
2. Odrzucić spam.
3. Dla każdego wydarzenia przygotować czysty, profesjonalny tytuł ("cleanTitle", max 45 znaków) oraz zwięzły opis ("cleanDesc", 1-2 zdania po polsku).

Zwróć wynik WYŁĄCZNIE jako tablicę JSON w formacie:
[
  {
    "originalIds": [0],
    "cleanTitle": "...",
    "cleanDesc": "...",
    "date": "...",
    "location": "...",
    "subCategory": "Jedna z 5 dokładnych podkategorii: Rajd Przeprawowy / Trophy, Wyprawa Turystyczna / 4x4, Szkolenie / Trening, Tor / Wyścig / Time Attack, Zlot / Spot / Spotkanie",
    "source": "..."
  }
]

Dane wejściowe:
` + JSON.stringify(rawList);

          let resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${state.groqKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [
                { role: "system", content: "You are a precise JSON-only data cleaning and deduplication assistant." },
                { role: "user", content: prompt }
              ],
              temperature: 0.1
            })
          });

          let result = await resp.json();
          let content = result.choices[0].message.content;
          let jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            let cleanedData = JSON.parse(jsonMatch[0]);
            let newEvents = cleanedData.map(item => {
              let orig = state.events[item.originalIds?.[0]] || state.events[0];
              let subCat = item.subCategory || orig.subCategory || "Zlot / Spot";
              let isOffroad = /rajd|offroad|4x4|teren|cross/i.test(item.cleanTitle + " " + item.cleanDesc);
              return {
                title: item.cleanTitle,
                fullDescription: item.cleanDesc,
                subCategory: isOffroad ? "Rajd Przeprawowy / Trophy" : subCat,
                location: item.location || orig.location || "Okolica",
                distanceKm: orig.distanceKm ?? 25,
                starred: orig.starred,
                date: item.date || orig.date || "Wkrótce",
                source: item.source || orig.source || "https://klasyki24.pl",
                aiOptimized: true
              };
            });

            state.events = newEvents;
            localStorage.setItem('motoradar_custom', JSON.stringify(state.events.filter(e => e.custom)));
            render();
            toast(`Groq AI oczyścił listę: ${state.events.length} unikalnych wydarzeń.`);
            closeSheet('sheetSettings');
          } else {
            throw new Error("Błąd parsowania JSON od Groq.");
          }
        } catch (err) {
          toast('Błąd AI: ' + err.message);
        } finally {
          aiBtn.innerText = '✨ Usprawnij wydarzenia przez Groq AI';
          aiBtn.disabled = false;
        }
      };
    }

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (installBtn) {
        installBtn.style.display = 'block';
        installBtn.onclick = async () => {
          deferredPrompt.prompt();
          let choice = await deferredPrompt.userChoice;
          if (choice.outcome === 'accepted') {
            toast('Dziękujemy za zainstalowanie MotoRadaru!');
          }
          deferredPrompt = null;
          installBtn.style.display = 'none';
        };
      }
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }

    loadEvents();
  });
}

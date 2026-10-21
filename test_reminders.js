// Testy logiki przypomnień. Uruchomienie: node --test test_reminders.js
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./reminders.js');

// Środa, 21 października 2026, 10:47 (czas lokalny)
const NOW = new Date(2026, 9, 21, 10, 47);

function memoryStore(initial) {
    const data = Object.assign({}, initial);
    return {
        data,
        get: async (k) => data[k],
        set: async (k, v) => { data[k] = v; },
        update: async (k, fn) => { const r = fn(data[k]); data[k] = r.value; return r.out; }
    };
}

const watch = (key, startISO, extra) => Object.assign(
    { key, title: 'Wydarzenie ' + key, date: startISO, location: 'Łódź', startISO }, extra);

test('parseEventDate: formaty z danych i zakresy zwracają dzień STARTU', () => {
    const iso = (s) => R.toISODate(R.parseEventDate(s, NOW));
    assert.equal(iso('23-10-2026'), '2026-10-23');
    assert.equal(iso('08.11.2026'), '2026-11-08');
    assert.equal(iso('24/10/26'), '2026-10-24');
    assert.equal(iso('24 października'), '2026-10-24');
    assert.equal(iso('23-25 października'), '2026-10-23');   // wcześniej błędnie 25
    assert.equal(iso('23 - 25 października'), '2026-10-23');
});

test('parseEventDate: niepoprawne i brakujące daty dają null', () => {
    assert.equal(R.parseEventDate('Najbliższy termin', NOW), null);
    assert.equal(R.parseEventDate('31-02-2026', NOW), null);
    assert.equal(R.parseEventDate('', NOW), null);
    assert.equal(R.parseEventDate(null, NOW), null);
});

test('parseEventDate: data bez roku z dawna minięta oznacza przyszły rok', () => {
    const dec = new Date(2026, 11, 20);
    assert.equal(R.toISODate(R.parseEventDate('10 stycznia', dec)), '2027-01-10');
    // niedawno minięty dzień zostaje w tym roku
    assert.equal(R.toISODate(R.parseEventDate('15 października', NOW)), '2026-10-15');
});

test('findDateInText wyłapuje datę z wklejonego wpisu', () => {
    assert.equal(R.findDateInText('Zlot Jeepów\n24 października\nSkierniewice'), '24 października');
    assert.equal(R.findDateInText('Rajd 23-25 Października Jura'), '23-25 Października');
    assert.equal(R.findDateInText('Spot 14.11.2026 Łódź'), '14.11.2026');
    assert.equal(R.findDateInText('Bez daty'), null);
    assert.equal(R.findDateInText('Błędna 31.02.2026'), null);
});

test('daysUntil liczy dni kalendarzowe, niezależnie od godziny', () => {
    assert.equal(R.daysUntil('2026-10-21', NOW), 0);
    assert.equal(R.daysUntil('2026-10-24', NOW), 3);
    assert.equal(R.daysUntil('2026-10-20', NOW), -1);
    assert.equal(R.daysUntil('2026-10-24', new Date(2026, 9, 21, 23, 59)), 3);
    assert.equal(R.daysUntil(null, NOW), null);
});

test('daysUntil jest odporne na zmianę czasu (koniec października, Europa)', () => {
    assert.equal(R.daysUntil('2026-10-26', new Date(2026, 9, 24, 12, 0)), 2);   // przez noc zmiany czasu 25.10
    assert.equal(R.daysUntil('2026-10-25', new Date(2026, 9, 24, 23, 30)), 1);
});

test('dueReminders: okno to 3 dni przed startem aż do dnia startu włącznie', () => {
    const list = [
        watch('d4', '2026-10-25'),    // za 4 dni: jeszcze nie
        watch('d3', '2026-10-24'),    // za 3 dni: tak
        watch('d2', '2026-10-23'),
        watch('d1', '2026-10-22'),
        watch('d0', '2026-10-21'),    // dziś: tak
        watch('past', '2026-10-20'),  // już się odbyło: nie
        { key: 'nodate', title: 'Bez daty', startISO: null }
    ];
    const due = R.dueReminders(list, NOW, {});
    assert.deepEqual(due.map(d => d.days), [0, 1, 2, 3]);
    assert.equal(due.length, 4);
});

test('dueReminders: nie powtarza przypomnienia tego samego dnia, ale następnego już tak', () => {
    const list = [watch('a', '2026-10-24')];
    const first = R.dueReminders(list, NOW, {});
    assert.equal(first.length, 1);

    const notified = { [first[0].id]: NOW.getTime() };
    assert.equal(R.dueReminders(list, NOW, notified).length, 0);

    const tomorrow = new Date(2026, 9, 22, 8, 0);
    assert.equal(R.dueReminders(list, tomorrow, notified).length, 1);
});

test('buildMessage: teksty zależne od liczby dni', () => {
    const item = { title: 'Zmota Challenge', date: '24-10-2026', location: 'Rutka-Tartak' };
    assert.match(R.buildMessage(item, 3).title, /Za 3 dni startuje: Zmota Challenge/);
    assert.match(R.buildMessage(item, 2).title, /Za 2 dni startuje/);
    assert.match(R.buildMessage(item, 1).title, /Jutro startuje/);
    assert.match(R.buildMessage(item, 0).title, /Dziś startuje/);
    assert.equal(R.buildMessage(item, 1).body, '24-10-2026 · Rutka-Tartak');
    assert.equal(R.buildMessage({ title: 'X', location: 'Nieznana' }, 1).body, 'Obserwowane wydarzenie');
});

test('check: wyłączone powiadomienia lub brak zgody nic nie wysyłają', async () => {
    const shown = [];
    const show = async (t) => { shown.push(t); };

    const off = memoryStore({ notifyEnabled: false, watchlist: [watch('a', '2026-10-22')] });
    assert.deepEqual(await R.check(show, { store: off, now: NOW, permission: 'granted' }), { sent: 0, reason: 'disabled' });

    const on = memoryStore({ notifyEnabled: true, watchlist: [watch('a', '2026-10-22')] });
    assert.deepEqual(await R.check(show, { store: on, now: NOW, permission: 'denied' }), { sent: 0, reason: 'permission' });
    assert.equal(shown.length, 0);
});

test('check: wysyła raz dziennie i znowu następnego dnia', async () => {
    const shown = [];
    const show = async (title, opts) => { shown.push({ title, opts }); };
    const store = memoryStore({ notifyEnabled: true, watchlist: [watch('a', '2026-10-23')] });

    let res = await R.check(show, { store, now: NOW, permission: 'granted' });
    assert.equal(res.sent, 1);
    assert.match(shown[0].title, /Za 2 dni startuje/);
    assert.equal(shown[0].opts.tag, 'a|2026-10-21');

    res = await R.check(show, { store, now: new Date(2026, 9, 21, 18, 0), permission: 'granted' });
    assert.equal(res.sent, 0);
    assert.equal(shown.length, 1);

    res = await R.check(show, { store, now: new Date(2026, 9, 22, 9, 0), permission: 'granted' });
    assert.equal(res.sent, 1);
    assert.match(shown[1].title, /Jutro startuje/);

    res = await R.check(show, { store, now: new Date(2026, 9, 23, 9, 0), permission: 'granted' });
    assert.equal(res.sent, 1);
    assert.match(shown[2].title, /Dziś startuje/);

    res = await R.check(show, { store, now: new Date(2026, 9, 24, 9, 0), permission: 'granted' });
    assert.equal(res.sent, 0);   // wydarzenie już wystartowało
});

test('check: błąd pokazywania nie "spala" przypomnienia - zostanie ponowione', async () => {
    const store = memoryStore({ notifyEnabled: true, watchlist: [watch('a', '2026-10-22')] });
    const failing = async () => { throw new Error('boom'); };
    await assert.rejects(R.check(failing, { store, now: NOW, permission: 'granted' }), /boom/);
    assert.deepEqual(store.data.notified, {});

    const shown = [];
    const res = await R.check(async (t) => { shown.push(t); }, { store, now: NOW, permission: 'granted' });
    assert.equal(res.sent, 1);
    assert.equal(shown.length, 1);
});

test('check: stare wpisy "wysłano" są sprzątane', async () => {
    const old = new Date(2026, 8, 1).getTime();
    const store = memoryStore({
        notifyEnabled: true,
        watchlist: [],
        notified: { 'x|2026-09-01': old, 'y|2026-10-20': NOW.getTime() - 1000 }
    });
    await R.check(async () => {}, { store, now: NOW, permission: 'granted' });
    assert.deepEqual(Object.keys(store.data.notified), ['y|2026-10-20']);
});

test('check: równoległe wywołania (strona + service worker) wysyłają przypomnienie tylko raz', async () => {
    const shown = [];
    const show = async (title, opts) => { await new Promise(r => setTimeout(r, 5)); shown.push(opts.tag); };
    const store = memoryStore({ notifyEnabled: true, watchlist: [watch('a', '2026-10-22')] });
    const results = await Promise.all([
        R.check(show, { store, now: NOW, permission: 'granted' }),
        R.check(show, { store, now: NOW, permission: 'granted' }),
        R.check(show, { store, now: NOW, permission: 'granted' })
    ]);
    assert.equal(shown.length, 1);
    assert.equal(results.reduce((n, r) => n + r.sent, 0), 1);
});

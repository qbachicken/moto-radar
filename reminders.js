/*
 * MotoRadar - wspólna logika przypomnień.
 * Obsługuje zarówno ES modules (dla js/app.js), jak i globalny scope (dla service workera / przeglądarki).
 */

var REMIND_DAYS_BEFORE = 3;
var DB_NAME = 'motoradar';
var STORE_NAME = 'kv';
var NOTIF_ICON = 'https://cdn-icons-png.flaticon.com/512/3774/3774278.png';
var NOTIFIED_TTL_MS = 14 * 24 * 60 * 60 * 1000;

var MONTHS_PL = {
    'stycznia': 0, 'lutego': 1, 'marca': 2, 'kwietnia': 3, 'maja': 4, 'czerwca': 5,
    'lipca': 6, 'sierpnia': 7, 'września': 8, 'października': 9, 'listopada': 10, 'grudnia': 11
};

function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function pad(n) {
    return n < 10 ? '0' + n : '' + n;
}

export function toISODate(d) {
    if (!d) return null;
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function fromISODate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function validDate(year, month, day) {
    var dt = new Date(year, month, day);
    if (dt.getFullYear() !== year || dt.getMonth() !== month || dt.getDate() !== day) return null;
    return dt;
}

export function parseEventDate(dateStr, now) {
    if (!dateStr) return null;
    now = now || new Date();
    var s = String(dateStr).trim().toLowerCase();

    var m = s.match(/(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)/);
    if (m) {
        var day = parseInt(m[1], 10);
        var month = MONTHS_PL[m[2]];
        var dt = validDate(now.getFullYear(), month, day);
        if (!dt) return null;
        var cutoff = startOfDay(now);
        cutoff.setDate(cutoff.getDate() - 60);
        if (dt < cutoff) dt = validDate(now.getFullYear() + 1, month, day) || dt;
        return dt;
    }

    var m2 = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (m2) {
        var yr = parseInt(m2[3], 10);
        var year = m2[3].length === 2 ? 2000 + yr : yr;
        return validDate(year, parseInt(m2[2], 10) - 1, parseInt(m2[1], 10));
    }
    return null;
}

export function findDateInText(text) {
    var s = String(text || '');
    var textual = s.match(/\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)/i);
    if (textual && parseEventDate(textual[0])) return textual[0];
    var numeric = s.match(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/);
    if (numeric && parseEventDate(numeric[0])) return numeric[0];
    return null;
}

export function daysUntil(startISO, now) {
    var start = fromISODate(startISO);
    if (!start) return null;
    return Math.round((start - startOfDay(now || new Date())) / 86400000);
}

export function buildMessage(item, days) {
    var when;
    if (days === 0) when = 'Dziś startuje';
    else if (days === 1) when = 'Jutro startuje';
    else when = 'Za ' + days + ' dni startuje';

    var parts = [];
    if (item.date) parts.push(item.date);
    if (item.location && item.location !== 'Nieznana') parts.push(item.location);
    return {
        title: '🏍️ ' + when + ': ' + item.title,
        body: parts.join(' · ') || 'Obserwowane wydarzenie'
    };
}

export function dueReminders(watchlist, now, notified) {
    now = now || new Date();
    notified = notified || {};
    var today = toISODate(startOfDay(now));
    var due = [];
    (watchlist || []).forEach(function (item) {
        if (!item || !item.startISO) return;
        var days = daysUntil(item.startISO, now);
        if (days === null || days < 0 || days > REMIND_DAYS_BEFORE) return;
        var id = item.key + '|' + today;
        if (notified[id]) return;
        var msg = buildMessage(item, days);
        due.push({ id: id, days: days, title: msg.title, body: msg.body, url: item.url || null });
    });
    due.sort(function (a, b) { return a.days - b.days; });
    return due;
}

function pruneNotified(notified, now) {
    var out = {};
    Object.keys(notified || {}).forEach(function (k) {
        if (now.getTime() - notified[k] < NOTIFIED_TTL_MS) out[k] = notified[k];
    });
    return out;
}

function openDb() {
    return new Promise(function (resolve, reject) {
        var req = (typeof self !== 'undefined' ? self : window).indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE_NAME); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
    });
}

function withStore(mode, fn) {
    return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE_NAME, mode);
            var result = fn(tx.objectStore(STORE_NAME));
            tx.oncomplete = function () { db.close(); resolve(result && result.result); };
            tx.onerror = function () { db.close(); reject(tx.error); };
            tx.onabort = function () { db.close(); reject(tx.error); };
        });
    });
}

export const store = {
    get: function (key) { return withStore('readonly', function (s) { return s.get(key); }); },
    set: function (key, value) { return withStore('readwrite', function (s) { return s.put(value, key); }); },
    update: function (key, fn) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var s = tx.objectStore(STORE_NAME);
                var out;
                var getReq = s.get(key);
                getReq.onsuccess = function () {
                    var res = fn(getReq.result);
                    out = res.out;
                    s.put(res.value, key);
                };
                tx.oncomplete = function () { db.close(); resolve(out); };
                tx.onerror = function () { db.close(); reject(tx.error); };
                tx.onabort = function () { db.close(); reject(tx.error); };
            });
        });
    }
};

export function check(show, deps) {
    deps = deps || {};
    var storeDep = deps.store || store;
    var now = deps.now || new Date();
    var rootObj = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : {});
    var permission = deps.permission !== undefined
        ? deps.permission
        : (typeof rootObj.Notification !== 'undefined' ? rootObj.Notification.permission : 'denied');

    return Promise.all([storeDep.get('notifyEnabled'), storeDep.get('watchlist')]).then(function (res) {
        if (!res[0]) return { sent: 0, reason: 'disabled' };
        if (permission !== 'granted') return { sent: 0, reason: 'permission' };
        var watchlist = res[1] || [];

        return storeDep.update('notified', function (stored) {
            var notified = pruneNotified(stored || {}, now);
            var due = dueReminders(watchlist, now, notified);
            due.forEach(function (d) { notified[d.id] = now.getTime(); });
            return { value: notified, out: due };
        }).then(function (due) {
            if (due.length === 0) return { sent: 0, reason: 'none-due' };

            var sent = 0;
            var failedIds = [];
            var firstError = null;
            return due.reduce(function (chain, d) {
                return chain.then(function () {
                    return Promise.resolve(show(d.title, {
                        body: d.body,
                        tag: d.id,
                        icon: NOTIF_ICON,
                        badge: NOTIF_ICON,
                        data: { url: d.url || './index.html' }
                    })).then(function () {
                        sent++;
                    }, function (err) {
                        failedIds.push(d.id);
                        firstError = firstError || err;
                    });
                });
            }, Promise.resolve()).then(function () {
                if (failedIds.length === 0) return { sent: sent, reason: 'ok' };
                return storeDep.update('notified', function (stored) {
                    var notified = stored || {};
                    failedIds.forEach(function (id) { delete notified[id]; });
                    return { value: notified, out: null };
                }).then(function () { throw firstError; });
            });
        });
    });
}

export { REMIND_DAYS_BEFORE };

var api = {
    REMIND_DAYS_BEFORE: REMIND_DAYS_BEFORE,
    parseEventDate: parseEventDate,
    findDateInText: findDateInText,
    toISODate: toISODate,
    fromISODate: fromISODate,
    daysUntil: daysUntil,
    buildMessage: buildMessage,
    dueReminders: dueReminders,
    check: check,
    store: store
};

if (typeof self !== 'undefined') self.MotoReminders = api;
if (typeof window !== 'undefined') window.MotoReminders = api;

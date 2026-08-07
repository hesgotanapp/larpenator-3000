// ---------------------------------------------------------------------------
// Larpenator 3000 — cloud sync (shared between the desktop app and the iPhone
// PWA; this exact file is copied into both app/ and mobile/).
//
// Design:
//  - Sync is entirely OPT-IN. Nothing here runs until the caller signs in.
//  - Firestore layout: /users/{uid}/{collection}/{itemId} for array-based
//    stores (one document per entry/note/etc — keeps every document small
//    and lets add/edit/delete map directly onto Firestore writes), plus a
//    single /users/{uid}/settings/main document for the small scalar stores.
//  - Conflict handling: last-write-wins per item, compared by each item's
//    updatedAt (stamped at push time), never a whole-array clobber.
//  - v1 syncs: journal entries, premarket entries, and the settings bundle
//    (rulebook, goals, checklists, weekly reviews, mistake tags, milestone,
//    dashboard mode, algo P&L). Notes/backtests/achievements stay local-only
//    for now and are unaffected either way.
// ---------------------------------------------------------------------------
(function () {
  const cfg = window.LVD_FIREBASE_CONFIG;
  if (!cfg || typeof firebase === 'undefined') {
    window.LvdSync = { isSupported: false };
    return;
  }

  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const db = firebase.firestore();
  try { auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}
  try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}

  const listeners = { authChange: [], error: [] };
  function emitError(context, err) {
    console.error('[LvdSync]', context, err);
    listeners.error.forEach(cb => { try { cb(context, err); } catch (e) {} });
  }
  auth.onAuthStateChanged(user => {
    listeners.authChange.forEach(cb => { try { cb(user); } catch (e) {} });
  });

  function userCol(name) {
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) return null;
    return db.collection('users').doc(uid).collection(name);
  }
  function userDoc(name, id) {
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid) return null;
    return db.collection('users').doc(uid).collection(name).doc(id);
  }
  // Firestore rejects `undefined` field values — strip them via a JSON round-trip.
  function clean(obj) { return JSON.parse(JSON.stringify(obj)); }

  // ---- per-item collection sync (entries, premarketEntries, ...) ----
  function makeCollectionSync(collectionName, getArray, setArray, rerender) {
    let knownIds = new Set();
    let suppress = false;
    let unsubscribe = null;

    function pushAll() {
      const col = userCol(collectionName);
      if (!col || suppress) return;
      const arr = getArray() || [];
      const currentIds = new Set();
      arr.forEach(item => {
        if (!item || item.id == null) return;
        const id = String(item.id);
        currentIds.add(id);
        const stamped = Object.assign({}, item, { updatedAt: item.updatedAt || item.createdAt || Date.now() });
        col.doc(id).set(clean(stamped)).catch(err => emitError('push:' + collectionName, err));
      });
      knownIds.forEach(id => {
        if (!currentIds.has(id)) col.doc(id).delete().catch(err => emitError('delete:' + collectionName, err));
      });
      knownIds = currentIds;
    }

    function start() {
      const col = userCol(collectionName);
      if (!col) return;
      unsubscribe = col.onSnapshot(snap => {
        suppress = true;
        const arr = getArray() || [];
        const byId = new Map(arr.map(x => [String(x.id), x]));
        let changed = false;
        snap.docChanges().forEach(ch => {
          const id = ch.doc.id;
          if (ch.type === 'removed') {
            if (byId.has(id)) { byId.delete(id); changed = true; }
          } else {
            const remote = ch.doc.data();
            const local = byId.get(id);
            const remoteTime = remote.updatedAt || remote.createdAt || 0;
            const localTime = local ? (local.updatedAt || local.createdAt || 0) : -1;
            if (!local || remoteTime >= localTime) { byId.set(id, remote); changed = true; }
          }
        });
        if (changed) {
          const merged = [...byId.values()];
          setArray(merged);
          knownIds = new Set(merged.map(x => String(x.id)));
          if (rerender) rerender();
        }
        suppress = false;
      }, err => emitError('listen:' + collectionName, err));
      // first push uploads anything that only exists locally so far
      pushAll();
    }
    function stop() { if (unsubscribe) { unsubscribe(); unsubscribe = null; } knownIds = new Set(); }

    return { start, stop, pushAll };
  }

  // ---- single settings document sync ----
  function makeSettingsSync(getSettings, setSettings, rerender) {
    let suppress = false;
    let unsubscribe = null;
    function push() {
      const doc = userDoc('settings', 'main');
      if (!doc || suppress) return;
      const data = Object.assign({}, getSettings(), { updatedAt: Date.now() });
      doc.set(clean(data), { merge: true }).catch(err => emitError('push:settings', err));
    }
    function start() {
      const doc = userDoc('settings', 'main');
      if (!doc) return;
      unsubscribe = doc.onSnapshot(snap => {
        if (!snap.exists) { push(); return; }
        suppress = true;
        const remote = snap.data();
        const local = getSettings();
        const remoteTime = remote.updatedAt || 0;
        const localTime = local.updatedAt || 0;
        if (remoteTime > localTime) {
          setSettings(remote);
          if (rerender) rerender();
        }
        suppress = false;
      }, err => emitError('listen:settings', err));
    }
    function stop() { if (unsubscribe) { unsubscribe(); unsubscribe = null; } }
    return { start, stop, push };
  }

  const registry = { collections: new Map(), settings: null };

  window.LvdSync = {
    isSupported: true,
    getUser: () => auth.currentUser,
    onAuthChange: (cb) => { listeners.authChange.push(cb); if (auth.currentUser !== undefined) cb(auth.currentUser); },
    onError: (cb) => { listeners.error.push(cb); },

    async signUp(email, password) {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      return cred.user;
    },
    async signIn(email, password) {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      return cred.user;
    },
    async signOut() {
      registry.collections.forEach(s => s.stop());
      if (registry.settings) registry.settings.stop();
      await auth.signOut();
    },

    // Register an array-based store to keep in sync. Call once per store,
    // after the store's initial local value has been loaded.
    registerCollection(name, getArray, setArray, rerender) {
      const s = makeCollectionSync(name, getArray, setArray, rerender);
      registry.collections.set(name, s);
      if (auth.currentUser) s.start();
      return s;
    },
    registerSettings(getSettings, setSettings, rerender) {
      registry.settings = makeSettingsSync(getSettings, setSettings, rerender);
      if (auth.currentUser) registry.settings.start();
      return registry.settings;
    },
    // Call after any local save() to push that store's current state to the
    // cloud. Cheap no-op if that store isn't registered or sync isn't enabled.
    pushCollection(name) {
      const s = registry.collections.get(name);
      if (s) s.pushAll();
    },
    pushSettings() {
      if (registry.settings) registry.settings.push();
    }
  };

  // Re-attach listeners automatically whenever auth state flips signed-in.
  auth.onAuthStateChanged(user => {
    if (user) {
      registry.collections.forEach(s => s.start());
      if (registry.settings) registry.settings.start();
    } else {
      registry.collections.forEach(s => s.stop());
      if (registry.settings) registry.settings.stop();
    }
  });
})();

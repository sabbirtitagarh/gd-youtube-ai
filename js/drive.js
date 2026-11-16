/* ==========================================================
   Google Sign-In (GIS token flow) + user ke APNE Google Drive me storage.
   Scope: drive.file  => app sirf wahi files dekh sakta hai jo usne khud banayi.
   Folder: "GD YouTube AI"  ->  history.json + thumb-<id>.png
   ========================================================== */
(function (root) {
  var CFG = root.GD || {};
  var LS_TOKEN = 'gdyt.token';
  var LS_USER = 'gdyt.user';
  var LS_FOLDER = 'gdyt.folderId';
  var LS_HIST_FILE = 'gdyt.historyFileId';

  var tokenClient = null;
  var token = null; // {access_token, expires_at}
  var user = null;
  var folderId = null;
  var historyFileId = null;

  function lsGet(k) {
    try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function lsDel(k) {
    try { localStorage.removeItem(k); } catch (e) {}
  }

  function configured() {
    return CFG.GOOGLE_CLIENT_ID && !/PASTE_/.test(CFG.GOOGLE_CLIENT_ID);
  }

  function restore() {
    var t = lsGet(LS_TOKEN);
    if (t && t.expires_at > Date.now() + 30000) token = t;
    user = lsGet(LS_USER);
    folderId = lsGet(LS_FOLDER);
    historyFileId = lsGet(LS_HIST_FILE);
  }
  restore();

  function waitForGis() {
    return new Promise(function (resolve, reject) {
      var tries = 0;
      (function check() {
        if (root.google && root.google.accounts && root.google.accounts.oauth2) return resolve();
        if (++tries > 50) return reject(new Error('Google Sign-In load nahi hua. Internet check karein.'));
        setTimeout(check, 150);
      })();
    });
  }

  // prompt: '' (silent if possible), 'consent' (first time), 'select_account'
  function requestToken(prompt) {
    return new Promise(function (resolve, reject) {
      waitForGis().then(function () {
        tokenClient = root.google.accounts.oauth2.initTokenClient({
          client_id: CFG.GOOGLE_CLIENT_ID,
          scope: CFG.DRIVE_SCOPES,
          callback: function (resp) {
            if (resp.error) return reject(new Error(resp.error_description || resp.error));
            token = {
              access_token: resp.access_token,
              expires_at: Date.now() + (parseInt(resp.expires_in, 10) || 3600) * 1000
            };
            lsSet(LS_TOKEN, token);
            resolve(token);
          },
          error_callback: function (err) {
            reject(new Error(err && err.type === 'popup_closed' ? 'Sign-in cancel ho gaya.' : 'Google sign-in fail hua.'));
          }
        });
        tokenClient.requestAccessToken({ prompt: prompt });
      }, reject);
    });
  }

  async function getToken(interactive) {
    if (token && token.expires_at > Date.now() + 30000) return token.access_token;
    if (!configured()) throw new Error('Google Client ID set nahi hai (js/config.js).');
    // silent refresh (agar user pehle consent de chuka hai)
    try {
      await requestToken(user ? '' : 'consent');
      return token.access_token;
    } catch (e) {
      if (!interactive) throw e;
      await requestToken('select_account');
      return token.access_token;
    }
  }

  async function api(url, options, interactive) {
    var t = await getToken(interactive !== false);
    options = options || {};
    options.headers = Object.assign({ Authorization: 'Bearer ' + t }, options.headers || {});
    var res = await fetch(url, options);
    if (res.status === 401) {
      token = null;
      lsDel(LS_TOKEN);
      t = await getToken(true);
      options.headers.Authorization = 'Bearer ' + t;
      res = await fetch(url, options);
    }
    if (!res.ok) {
      var msg = '';
      try { msg = (await res.json()).error.message; } catch (e) {}
      throw new Error('Drive error ' + res.status + (msg ? ': ' + msg : ''));
    }
    return res;
  }

  /* ---------- sign in / out ---------- */
  async function signIn() {
    if (!configured()) throw new Error('Google Client ID set nahi hai (js/config.js).');
    await requestToken(user ? 'select_account' : 'consent');
    var res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + token.access_token }
    });
    if (!res.ok) throw new Error('Profile load nahi hua.');
    var u = await res.json();
    user = { name: u.name || '', email: u.email || '', picture: u.picture || '' };
    lsSet(LS_USER, user);
    // naye account ka purana folder cache hata do
    folderId = null;
    historyFileId = null;
    lsDel(LS_FOLDER);
    lsDel(LS_HIST_FILE);
    await ensureFolder();
    return user;
  }

  function signOut() {
    try {
      if (token && root.google && root.google.accounts && root.google.accounts.oauth2) {
        root.google.accounts.oauth2.revoke(token.access_token, function () {});
      }
    } catch (e) {}
    token = null;
    user = null;
    folderId = null;
    historyFileId = null;
    [LS_TOKEN, LS_USER, LS_FOLDER, LS_HIST_FILE].forEach(lsDel);
  }

  function isSignedIn() {
    return !!user;
  }
  function getUser() {
    return user;
  }
  // shared-credits ke liye server ko token chahiye
  async function getAccessToken() {
    return getToken(true);
  }

  /* ---------- folder ---------- */
  async function ensureFolder() {
    if (folderId) return folderId;
    var q =
      "name='" + CFG.DRIVE_FOLDER_NAME.replace(/'/g, "\\'") +
      "' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    var res = await api(
      'https://www.googleapis.com/drive/v3/files?spaces=drive&fields=files(id,name)&q=' + encodeURIComponent(q)
    );
    var list = (await res.json()).files || [];
    if (list.length) {
      folderId = list[0].id;
    } else {
      var cr = await api('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: CFG.DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
      });
      folderId = (await cr.json()).id;
    }
    lsSet(LS_FOLDER, folderId);
    return folderId;
  }

  /* ---------- multipart upload (create / update) ---------- */
  function multipartBody(meta, mime, dataBlob) {
    var boundary = 'gdyt' + Math.random().toString(36).slice(2);
    var head =
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n--' + boundary + '\r\nContent-Type: ' + mime + '\r\n\r\n';
    var tail = '\r\n--' + boundary + '--';
    return { boundary: boundary, body: new Blob([head, dataBlob, tail]) };
  }

  async function uploadFile(name, mime, blob, existingId) {
    var fId = await ensureFolder();
    var meta = existingId ? { name: name } : { name: name, parents: [fId] };
    var mp = multipartBody(meta, mime, blob);
    var url = existingId
      ? 'https://www.googleapis.com/upload/drive/v3/files/' + existingId + '?uploadType=multipart&fields=id'
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
    var res = await api(url, {
      method: existingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + mp.boundary },
      body: mp.body
    });
    return (await res.json()).id;
  }

  async function findFile(name) {
    var fId = await ensureFolder();
    var q = "name='" + name.replace(/'/g, "\\'") + "' and '" + fId + "' in parents and trashed=false";
    var res = await api('https://www.googleapis.com/drive/v3/files?fields=files(id)&q=' + encodeURIComponent(q));
    var list = (await res.json()).files || [];
    return list.length ? list[0].id : null;
  }

  /* ---------- history.json ---------- */
  async function loadHistory() {
    if (!historyFileId) {
      historyFileId = await findFile('history.json');
      if (historyFileId) lsSet(LS_HIST_FILE, historyFileId);
    }
    if (!historyFileId) return [];
    try {
      var res = await api('https://www.googleapis.com/drive/v3/files/' + historyFileId + '?alt=media');
      var data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      // file delete ho gayi ho to reset
      historyFileId = null;
      lsDel(LS_HIST_FILE);
      return [];
    }
  }

  async function saveHistory(list) {
    var blob = new Blob([JSON.stringify(list)], { type: 'application/json' });
    try {
      historyFileId = await uploadFile('history.json', 'application/json', blob, historyFileId);
    } catch (e) {
      if (historyFileId) {
        historyFileId = await uploadFile('history.json', 'application/json', blob, null);
      } else throw e;
    }
    lsSet(LS_HIST_FILE, historyFileId);
    return historyFileId;
  }

  async function saveThumbnail(id, pngBlob) {
    return uploadFile('thumb-' + id + '.png', 'image/png', pngBlob, null);
  }

  async function trashFile(fileId) {
    try {
      await api('https://www.googleapis.com/drive/v3/files/' + fileId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true })
      });
    } catch (e) {}
  }

  function folderUrl() {
    return folderId ? 'https://drive.google.com/drive/folders/' + folderId : 'https://drive.google.com/';
  }

  var API = {
    configured: configured,
    signIn: signIn,
    signOut: signOut,
    isSignedIn: isSignedIn,
    getUser: getUser,
    getAccessToken: getAccessToken,
    loadHistory: loadHistory,
    saveHistory: saveHistory,
    saveThumbnail: saveThumbnail,
    trashFile: trashFile,
    folderUrl: folderUrl
  };
  root.GDDrive = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

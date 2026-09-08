/* Вход по Face ID / Touch ID.
   Используется WebAuthn: телефон создаёт ключ в защищённом хранилище и
   подписывает им случайную строку, а приложение проверяет подпись сохранённым
   открытым ключом. Ни отпечаток, ни лицо приложению не передаются и никуда
   не уходят. Код-пароль остаётся запасным входом.                        */
(function (w) {
  'use strict';

  var A = {};

  /* ---------- преобразования ---------- */
  function b64u(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function rnd(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function same(a, b) {
    if (a.length !== b.length) return false;
    var d = 0;
    for (var i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
  }

  /* Подпись ECDSA приходит в формате DER, а WebCrypto ждёт r||s по 32 байта */
  function derToRaw(der) {
    var d = new Uint8Array(der);
    if (d[0] !== 0x30) return d;
    var i = 2;
    if (d[1] & 0x80) i = 2 + (d[1] & 0x7f);
    function int() {
      if (d[i] !== 0x02) return null;
      var len = d[i + 1], start = i + 2;
      i = start + len;
      var v = d.subarray(start, start + len);
      while (v.length > 32 && v[0] === 0) v = v.subarray(1);
      var out = new Uint8Array(32);
      out.set(v, 32 - v.length);
      return out;
    }
    var r = int(), s = int();
    if (!r || !s) return d;
    var raw = new Uint8Array(64);
    raw.set(r, 0); raw.set(s, 32);
    return raw;
  }

  /* ---------- доступность ---------- */
  A.supported = function () {
    /* isSecureContext охватывает https, localhost и 127.0.0.1 */
    return !!(w.isSecureContext && w.PublicKeyCredential &&
      navigator.credentials && navigator.credentials.create);
  };
  A.available = function (cb) {
    if (!A.supported()) return cb(false);
    if (!w.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return cb(false);
    w.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(function (v) { cb(!!v); })
      .catch(function () { cb(false); });
  };
  /* Что именно мешает включить вход по лицу — человеческим языком */
  A.diagnose = function (cb) {
    var out = [];
    var framed = false;
    try { framed = w.self !== w.top; } catch (e) { framed = true; }

    out.push({ k: 'Защищённое соединение', ok: !!w.isSecureContext,
      no: 'нужен адрес на https' });
    out.push({ k: 'Браузер умеет такой вход', ok: !!(w.PublicKeyCredential && navigator.credentials),
      no: 'обновите iOS или откройте в Safari' });
    out.push({ k: 'Открыто напрямую, не в окне другого сайта', ok: !framed,
      no: 'откройте по своей ссылке, а не внутри просмотра' });

    if (!w.PublicKeyCredential || !w.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      out.push({ k: 'Face ID или Touch ID доступен', ok: false, no: 'браузер не сообщает о датчике' });
      return cb(out);
    }
    w.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(function (v) {
        out.push({ k: 'Face ID или Touch ID доступен', ok: !!v,
          no: 'телефон не отдаёт датчик браузеру' });
        cb(out);
      })
      .catch(function () {
        out.push({ k: 'Face ID или Touch ID доступен', ok: false, no: 'проверка не прошла' });
        cb(out);
      });
  };

  A.enabled = function () {
    var f = DB.data.settings.faceId;
    return !!(f && f.id);
  };

  /* ---------- включение ---------- */
  A.register = function (cb) {
    if (!A.supported()) return cb(new Error('Устройство не поддерживает такой вход'));
    var uid = DB.data.settings.faceUser || b64u(rnd(16));
    navigator.credentials.create({
      publicKey: {
        challenge: rnd(32),
        rp: { name: 'Капитал' },
        user: { id: unb64u(uid), name: 'Капитал', displayName: 'Учёт займов' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    }).then(function (cred) {
      if (!cred) throw new Error('Не удалось создать ключ');
      var pub = null, alg = -7;
      try {
        if (cred.response.getPublicKey) pub = b64u(cred.response.getPublicKey());
        if (cred.response.getPublicKeyAlgorithm) alg = cred.response.getPublicKeyAlgorithm();
      } catch (e) { }
      DB.data.settings.faceUser = uid;
      DB.data.settings.faceId = { id: b64u(cred.rawId), pub: pub, alg: alg, addedAt: U.today() };
      DB.save();
      cb(null);
    }).catch(function (e) {
      cb(e && e.name === 'NotAllowedError' ? new Error('Вход отменён') : (e || new Error('Не получилось')));
    });
  };

  A.disable = function () {
    DB.data.settings.faceId = null;
    DB.save();
  };

  /* ---------- проверка при входе ---------- */
  A.verify = function (cb, signal) {
    var f = DB.data.settings.faceId;
    if (!f || !f.id) return cb(new Error('Вход по Face ID не настроен'));
    var challenge = rnd(32);

    navigator.credentials.get({
      signal: signal,
      publicKey: {
        challenge: challenge,
        allowCredentials: [{ type: 'public-key', id: unb64u(f.id), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000
      }
    }).then(function (as) {
      if (!as) throw new Error('Нет ответа');
      var cd = JSON.parse(new TextDecoder().decode(as.response.clientDataJSON));
      if (cd.type !== 'webauthn.get') throw new Error('Неверный ответ');
      if (cd.origin !== location.origin) throw new Error('Чужой адрес');
      if (!same(unb64u(cd.challenge), challenge)) throw new Error('Ответ не совпал с запросом');

      var authData = new Uint8Array(as.response.authenticatorData);
      var flags = authData[32];
      if (!(flags & 0x01)) throw new Error('Нет подтверждения присутствия');
      if (!(flags & 0x04)) throw new Error('Лицо или отпечаток не подтверждены');

      /* если открытый ключ сохранён — проверяем подпись по-настоящему */
      if (!f.pub) return true;
      return crypto.subtle.digest('SHA-256', as.response.clientDataJSON).then(function (hash) {
        var signed = new Uint8Array(authData.length + 32);
        signed.set(authData, 0);
        signed.set(new Uint8Array(hash), authData.length);
        var isRsa = f.alg === -257;
        var imp = isRsa
          ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
          : { name: 'ECDSA', namedCurve: 'P-256' };
        return crypto.subtle.importKey('spki', unb64u(f.pub), imp, false, ['verify'])
          .then(function (key) {
            var sig = isRsa ? new Uint8Array(as.response.signature) : derToRaw(as.response.signature);
            return crypto.subtle.verify(
              isRsa ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash: 'SHA-256' },
              key, sig, signed);
          })
          .then(function (okSig) {
            if (!okSig) throw new Error('Подпись не сошлась');
            return true;
          });
      });
    }).then(function () { cb(null); })
      .catch(function (e) {
        cb(e && e.name === 'NotAllowedError' ? new Error('Вход отменён') : (e || new Error('Не получилось')));
      });
  };

  w.Auth = A;
})(window);

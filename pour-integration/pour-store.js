/**
 * 저장소 어댑터
 *
 * 모듈들은 `getItem(key)` / `setItem(key, value)` 두 가지만 요구한다.
 * 운영에서는 localStorage 를 쓰지 않고, 아래 apiStore 로 서버(D1)를 바라보게 한다.
 *
 *   var store = PourStore.createApiStore({ baseUrl: "/api" });
 *   await store.load();          // 서버에서 한 번 읽어와 메모리에 채운다
 *   PourRecords.list(store);     // 이후 읽기는 메모리에서 (동기)
 *   PourRecords.save(rec, store);// 쓰기는 메모리 갱신 + 서버 저장 (뒤에서 처리)
 *
 * 서버가 제공해야 하는 것 (자세한 규격은 API.md 참고):
 *   GET  {baseUrl}/records            → 공고·실적 배열
 *   PUT  {baseUrl}/records            → 공고·실적 배열 저장 (전체 교체가 아니라 upsert)
 *   GET  {baseUrl}/patents            → POUR 특허 배열
 *   PUT  {baseUrl}/patents            → POUR 특허 배열 저장 (upsert)
 */
(function (root) {
  "use strict";

  var KEY_MAP = {
    "pour.records.v1": "records",
    "pour.patents.v1": "patents"
  };

  function createApiStore(options) {
    var opts = options || {};
    var baseUrl = String(opts.baseUrl || "/api").replace(/\/$/, "");
    var fetchImpl = opts.fetch || (typeof fetch === "function" ? fetch.bind(root) : null);
    var cache = {};           // key → 문자열(JSON)
    var pending = {};         // key → 저장 대기 중인 값
    var inFlight = null;
    var flushTimer = null;
    var listeners = [];

    function endpoint(key) {
      var name = KEY_MAP[key];
      return name ? baseUrl + "/" + name : null;
    }

    function notify(event) {
      listeners.forEach(function (fn) { try { fn(event); } catch (e) {} });
    }

    /** 서버에서 자료를 읽어 메모리에 채운다. 화면을 그리기 전에 한 번 부른다. */
    function load() {
      if (!fetchImpl) return Promise.reject(new Error("fetch 를 사용할 수 없습니다."));
      var keys = Object.keys(KEY_MAP);
      return Promise.all(keys.map(function (key) {
        return fetchImpl(endpoint(key), { headers: { "Accept": "application/json" } })
          .then(function (res) {
            if (!res.ok) throw new Error(endpoint(key) + " 응답 " + res.status);
            return res.json();
          })
          .then(function (data) {
            cache[key] = JSON.stringify(Array.isArray(data) ? data : []);
          });
      })).then(function () {
        notify({ type: "loaded" });
        return true;
      });
    }

    function flush() {
      if (inFlight) return inFlight;
      var keys = Object.keys(pending);
      if (!keys.length) return Promise.resolve(true);

      var batch = {};
      keys.forEach(function (k) { batch[k] = pending[k]; delete pending[k]; });

      inFlight = Promise.all(keys.map(function (key) {
        return fetchImpl(endpoint(key), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: batch[key]
        }).then(function (res) {
          if (!res.ok) throw new Error(endpoint(key) + " 저장 실패 " + res.status);
        });
      })).then(function () {
        inFlight = null;
        notify({ type: "saved" });
        // 저장 중에 또 바뀐 값이 있으면 이어서 보낸다
        if (Object.keys(pending).length) return flush();
        return true;
      }).catch(function (err) {
        inFlight = null;
        // 실패한 값은 되돌려 두고 다음 기회에 다시 보낸다 (자료를 잃지 않는다)
        keys.forEach(function (k) { if (pending[k] == null) pending[k] = batch[k]; });
        notify({ type: "error", error: err });
        throw err;
      });
      return inFlight;
    }

    return {
      getItem: function (key) { return key in cache ? cache[key] : null; },
      setItem: function (key, value) {
        cache[key] = String(value);
        if (!endpoint(key)) return;          // 화면 상태 등 서버에 보낼 필요 없는 값
        pending[key] = String(value);
        // 연속 저장을 한 번으로 묶는다
        if (!flushTimer) {
          flushTimer = setTimeout(function () {
            flushTimer = null;
            flush().catch(function () {});
          }, 150);
        }
      },
      load: load,
      flush: function () {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        return flush();
      },
      hasPending: function () { return Object.keys(pending).length > 0 || !!inFlight; },
      on: function (fn) { listeners.push(fn); },
      /** 화면 상태처럼 서버에 보낼 필요가 없는 값은 브라우저에 남긴다. */
      localKeys: Object.keys(KEY_MAP)
    };
  }

  /**
   * 브라우저 저장소를 쓰는 어댑터 (시연·오프라인 확인용).
   * 운영 자료 저장소로는 쓰지 않는다.
   */
  function createLocalStore(backing) {
    var target = backing || (typeof localStorage !== "undefined" ? localStorage : null);
    var memory = {};
    return {
      getItem: function (key) {
        if (target) { try { return target.getItem(key); } catch (e) {} }
        return key in memory ? memory[key] : null;
      },
      setItem: function (key, value) {
        if (target) { try { target.setItem(key, String(value)); return; } catch (e) {} }
        memory[key] = String(value);
      },
      load: function () { return Promise.resolve(true); },
      flush: function () { return Promise.resolve(true); },
      hasPending: function () { return false; },
      on: function () {}
    };
  }

  var api = { createApiStore: createApiStore, createLocalStore: createLocalStore, KEY_MAP: KEY_MAP };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PourStore = api;
})(typeof self !== "undefined" ? self : this);

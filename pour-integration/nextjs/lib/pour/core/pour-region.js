/**
 * 지역·도시 통합 입력 해석기
 *
 * 화면에는 "지역·도시" 한 칸만 두고, 사용자가 시·군·구 이름만 입력하면
 * 시·도를 자동으로 판단해 내부적으로는 기존 구조대로 region / city 로 분리한다.
 *
 *   "하남"      → { region: "경기", city: "하남" }
 *   "금산군"    → { region: "충남", city: "금산" }
 *   "서울 강남" → { region: "서울", city: "강남" }
 *   "중구"      → 여러 시도에 존재하므로 선택 목록을 돌려준다
 */
(function (root, factory) {
  var data = typeof require === "function" && typeof module === "object"
    ? require("./regions.data.js")
    : root.POUR_REGION_DATA;
  var api = factory(data);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PourRegion = api;
})(typeof self !== "undefined" ? self : this, function (REGION_DATA) {
  "use strict";

  /* ---------------------------------------------------------------- 색인 */

  // 시도 표기 흔들림 흡수: "서울특별시", "서울시", "서울" 모두 "서울"로 본다.
  var PROVINCE_ALIASES = {
    "서울": "서울", "서울시": "서울", "서울특별시": "서울",
    "부산": "부산", "부산시": "부산", "부산광역시": "부산",
    "대구": "대구", "대구시": "대구", "대구광역시": "대구",
    "인천": "인천", "인천시": "인천", "인천광역시": "인천",
    "대전": "대전", "대전시": "대전", "대전광역시": "대전",
    "울산": "울산", "울산시": "울산", "울산광역시": "울산",
    "광주": "광주", "광주시": "광주", "광주광역시": "광주",
    "세종": "세종", "세종시": "세종", "세종특별자치시": "세종",
    "경기": "경기", "경기도": "경기",
    "강원": "강원", "강원도": "강원", "강원특별자치도": "강원",
    "충북": "충북", "충청북도": "충북",
    "충남": "충남", "충청남도": "충남",
    "전북": "전북", "전라북도": "전북", "전북특별자치도": "전북",
    "전남": "전남", "전라남도": "전남",
    "경북": "경북", "경상북도": "경북",
    "경남": "경남", "경상남도": "경남",
    "제주": "제주", "제주도": "제주", "제주특별자치도": "제주"
  };

  var ALL = [];          // [{ region, city, label }]
  var CITY_INDEX = {};   // 정규화된 시군구 이름 → [{ region, city }]

  Object.keys(REGION_DATA).forEach(function (region) {
    REGION_DATA[region].forEach(function (city) {
      var entry = { region: region, city: city, label: region + " " + city };
      ALL.push(entry);
      (CITY_INDEX[city] = CITY_INDEX[city] || []).push(entry);
    });
  });

  /* -------------------------------------------------------------- 정규화 */

  // "하남시" → "하남", "강남구" → "강남", "중구" → "중구"(한 글자만 남으면 유지)
  function stripSuffix(token) {
    var s = token.replace(/(시|군|구)$/, "");
    return s.length >= 2 ? s : token;
  }

  function normalizeCity(text) {
    return String(text).trim().split(/\s+/).filter(Boolean).map(stripSuffix).join(" ");
  }

  function format(region, city) {
    if (!region) return city || "";
    if (!city) return region;
    return region + " " + city;
  }

  /* -------------------------------------------------------------- 해석 */

  /**
   * 입력값을 region / city 로 확정한다.
   * @returns {{status:"empty"}
   *          |{status:"resolved", region, city, label}
   *          |{status:"ambiguous", candidates:Array}
   *          |{status:"notfound", input}}
   */
  function parse(input) {
    var raw = String(input == null ? "" : input).trim().replace(/\s+/g, " ");
    if (!raw) return { status: "empty" };

    var tokens = raw.split(" ");
    var provinceHint = null;

    // 첫 토큰이 시도 이름이면 떼어낸다 ("서울 강남" → 시도 서울 + 시군구 강남)
    if (tokens.length > 1 && PROVINCE_ALIASES[tokens[0]]) {
      provinceHint = PROVINCE_ALIASES[tokens[0]];
      tokens = tokens.slice(1);
    }

    var cityKey = normalizeCity(tokens.join(" "));
    var matches = (CITY_INDEX[cityKey] || []).slice();

    if (provinceHint) {
      matches = matches.filter(function (m) { return m.region === provinceHint; });
      if (matches.length === 1) return resolved(matches[0]);
      if (matches.length > 1) return { status: "ambiguous", candidates: matches };
      return { status: "notfound", input: raw };
    }

    var asProvince = PROVINCE_ALIASES[raw] || null;

    if (matches.length === 1) {
      // "제주"처럼 시도 이름과 시군구 이름이 같은 경우는 그대로 확정한다.
      if (!asProvince || matches[0].region === asProvince) return resolved(matches[0]);
      // "광주"처럼 다른 시도의 시군구이면서 그 자체로 시도이기도 하면 선택을 받는다.
      return {
        status: "ambiguous",
        candidates: matches.concat(REGION_DATA[asProvince].map(toEntry(asProvince)))
      };
    }
    if (matches.length > 1) return { status: "ambiguous", candidates: matches };

    // 시군구로는 못 찾았지만 시도 이름인 경우 (세종처럼 하위 구가 없으면 확정)
    if (asProvince) {
      var cities = REGION_DATA[asProvince] || [];
      if (cities.length === 1) return resolved(toEntry(asProvince)(cities[0]));
      if (cities.length > 1) return { status: "ambiguous", candidates: cities.map(toEntry(asProvince)) };
    }
    return { status: "notfound", input: raw };
  }

  function toEntry(region) {
    return function (city) { return { region: region, city: city, label: region + " " + city }; };
  }

  function resolved(m) {
    return { status: "resolved", region: m.region, city: m.city, label: m.label };
  }

  /* ------------------------------------------------------------ 자동완성 */

  /**
   * 입력 중인 문자열에 대한 추천 목록. 시군구 이름과 "시도 시군구" 표기 모두에서 찾는다.
   * ("광주"를 치면 경기 광주시와 광주광역시 자치구가 모두 후보로 나온다)
   */
  function suggest(input, limit) {
    var q = String(input == null ? "" : input).trim().replace(/\s+/g, " ");
    if (!q) return [];
    var max = limit || 10;
    var key = normalizeCity(q);
    var scored = [];

    ALL.forEach(function (e) {
      var score = -1;
      if (e.city === key || e.city === q) score = 0;
      else if (e.city.indexOf(key) === 0 || e.city.indexOf(q) === 0) score = 1;
      else if (e.label.indexOf(q) === 0) score = 2;
      else if (e.city.indexOf(key) > 0 || e.city.indexOf(q) > 0) score = 3;
      else if (e.label.indexOf(q) > 0) score = 4;
      if (score >= 0) scored.push({ entry: e, score: score });
    });

    scored.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;
      return a.entry.label.localeCompare(b.entry.label, "ko");
    });
    return scored.slice(0, max).map(function (s) { return s.entry; });
  }

  return {
    parse: parse,
    suggest: suggest,
    format: format,
    normalizeCity: normalizeCity,
    all: function () { return ALL.slice(); },
    provinces: function () { return Object.keys(REGION_DATA); }
  };
});

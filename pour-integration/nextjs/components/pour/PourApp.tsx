"use client";
/** POUR 공사실적 관리 — 메인 화면 (엑셀형 목록 중심) */
import { useCallback, useMemo, useState } from "react";
import PourRecords from "@/lib/pour/core/pour-records.js";
import PourPatents from "@/lib/pour/core/pour-patents.js";
import { useProjectStore } from "@/lib/pour/useProjectStore";
import PourGrid from "./PourGrid";
import NoticePanel from "./NoticePanel";
import AwardPanel from "./AwardPanel";
import type { PourRecord } from "@/lib/pour/core";

const MENUS = [
  { key: "records", label: "공고·실적" },
  { key: "patents", label: "특허별 실적" },
  { key: "io", label: "가져오기·내보내기" },
  { key: "stats", label: "통계·분석" },
  { key: "settings", label: "설정" }
] as const;

const STATUS_TABS = ["전체", "낙찰", "공고", "재공고(유찰)"] as const;

export default function PourApp({ apiBase = "/api" }: { apiBase?: string }) {
  const { storage, records, patents, loading, saving, error, commit, reload } = useProjectStore(apiBase);

  const [view, setView] = useState<(typeof MENUS)[number]["key"]>("records");
  const [navOpen, setNavOpen] = useState(false);
  const [statusTab, setStatusTab] = useState<(typeof STATUS_TABS)[number]>("전체");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alertIds, setAlertIds] = useState<string[] | null>(null);
  const [visible, setVisible] = useState<PourRecord[]>([]);

  const [noticeOpen, setNoticeOpen] = useState(false);
  const [editing, setEditing] = useState<PourRecord | null>(null);
  const [awardOpen, setAwardOpen] = useState(false);
  const [awarding, setAwarding] = useState<PourRecord | null>(null);

  const matchesSearch = useCallback((rec: PourRecord) => {
    if (!search) return true;
    const text = [
      rec.client, rec.region, rec.city, rec.phone, rec.contractor, rec.contractorPhone, rec.remark,
      ...rec.projectNames, ...rec.categories, ...rec.patentNames,
      ...rec.patentNumbers.map(PourPatents.formatNumber),
      ...rec.thirdPatentNumbers.map(PourPatents.formatNumber),
      ...rec.patentItems.map((i) => `${i.name} ${i.company}`)
    ].join(" ").toUpperCase();
    return text.includes(search.toUpperCase());
  }, [search]);

  const shown = useMemo(() => records.filter((rec) => {
    if (alertIds && !alertIds.includes(rec.id)) return false;
    return PourRecords.matchesStatusTab(rec, statusTab) && matchesSearch(rec);
  }), [records, alertIds, statusTab, matchesSearch]);

  const counts = useMemo(() => PourRecords.statusCounts(records), [records]);
  const alerts = useMemo(() => PourRecords.alerts(records, storage), [records, storage]);
  const selected = useMemo(
    () => records.find((r) => r.id === selectedId) || null, [records, selectedId]);

  const canAward = !!selected && (selected.status === "공고" || selected.status === "재공고");

  const openNotice = useCallback((record: PourRecord | null) => {
    setEditing(record);
    setNoticeOpen(true);
  }, []);

  const patentTabs = useMemo(
    () => PourRecords.patentTabs(patents, records), [patents, records]);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const sheet = activeSheet || patentTabs[0]?.number || null;
  const sheetRows = useMemo(
    () => (sheet ? PourRecords.recordsForPatent(sheet, records) : []), [sheet, records]);

  return (
    <div className="pour-scope">
      <header className="pour-header">
        <div className="pour-brand">
          <span className="pour-brand-name">NETFORM</span>
          <span className="pour-brand-sub">POUR 공사실적 관리</span>
        </div>
        <button type="button" className="pour-hamburger" onClick={() => setNavOpen((v) => !v)}>☰</button>
        <nav className={`pour-nav${navOpen ? " is-open" : ""}`}>
          {MENUS.map((menu) => (
            <button
              key={menu.key}
              type="button"
              data-view={menu.key}
              className={`pour-nav-item${view === menu.key ? " is-active" : ""}`}
              onClick={() => { setView(menu.key); setNavOpen(false); }}
            >
              {menu.label}
            </button>
          ))}
        </nav>
        <div className="pour-header-right">
          <input
            type="search"
            className="pour-header-search"
            placeholder="전체 검색"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setAlertIds(null); setView("records"); }}
          />
          <span className="pour-user-chip">👤 업무 관리</span>
        </div>
      </header>

      <main className="pour-main">
        {(loading || saving || error) && (
          <div className="pour-alert-bar">
            {loading && <span className="pour-alert-chip" style={{ cursor: "default" }}>자료를 불러오는 중…</span>}
            {saving && <span className="pour-alert-chip" style={{ cursor: "default" }}>저장 중…</span>}
            {error && (
              <span className="pour-alert-chip" style={{ cursor: "default" }}>
                ⚠ 서버와 통신하지 못했습니다: {error}
              </span>
            )}
          </div>
        )}

        {view === "records" && (
          <section>
            <div className="pour-alert-bar">
              {alerts.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  id={`pour-alert-${group.key}`}
                  className="pour-alert-chip"
                  onClick={() => {
                    setStatusTab("전체");
                    setSearch("");
                    setAlertIds(group.records.map((r) => r.id));
                  }}
                >
                  ⚠ {group.label}
                </button>
              ))}
            </div>

            <div className="pour-toolbar">
              <button type="button" className="pour-btn" onClick={() => openNotice(null)}>＋ 새 공고</button>
              <button type="button" className="pour-btn" onClick={() => setView("io")}>⭳ 엑셀 가져오기</button>
              <button type="button" className="pour-btn" onClick={() => setView("io")}>⭱ 엑셀 내보내기</button>
              <button type="button" className="pour-btn" onClick={() => setView("stats")}>📊 통계 보기</button>
              <button type="button" className="pour-btn ghost" onClick={() => setView("settings")}>특허자료 관리</button>
              <button type="button" className="pour-btn ghost" onClick={() => void reload()}>↻ 새로고침</button>
            </div>

            <div className="pour-status-tabs">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  data-status-tab={tab}
                  className={`pour-status-tab${statusTab === tab ? " is-active" : ""}`}
                  onClick={() => { setStatusTab(tab); setAlertIds(null); }}
                >
                  {tab} <span className="cnt">{counts[tab]?.toLocaleString("ko-KR") ?? 0}</span>
                </button>
              ))}
            </div>

            <div className="pour-grid-tools">
              <input
                type="search"
                className="pour-grid-search"
                placeholder="아파트명·공사명·지역·전화번호·시공사·특허번호·공종 검색"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setAlertIds(null); }}
              />
              <button type="button" className="pour-btn ghost" onClick={() => setShowFilters((v) => !v)}>필터</button>
              <span className="pour-spacer" />
              <span className="pour-grid-count">{visible.length.toLocaleString("ko-KR")}건 표시</span>
              <button type="button" className="pour-btn ghost" disabled={!selected}
                      onClick={() => selected && openNotice(selected)}>상세·수정</button>
              <button type="button" className="pour-btn" disabled={!canAward}
                      onClick={() => { if (selected) { setAwarding(selected); setAwardOpen(true); } }}>
                낙찰로 변경
              </button>
            </div>

            <PourGrid
              columns={PourRecords.MAIN_COLUMNS}
              records={shown}
              selectedId={selectedId}
              showFilters={showFilters}
              emptyText="등록된 공고·실적이 없습니다. 「＋ 새 공고」로 등록해 주세요."
              onSelect={(rec) => setSelectedId(rec.id)}
              onOpen={(rec) => openNotice(rec)}
              onVisibleChange={setVisible}
            />
          </section>
        )}

        {view === "patents" && (
          <section>
            <h2 className="pour-view-title">특허별 실적</h2>
            <div className="pour-sheet-tabs">
              {patentTabs.map((tab) => (
                <button
                  key={tab.number}
                  type="button"
                  data-number={tab.number}
                  className={`pour-sheet-tab${sheet === tab.number ? " is-active" : ""}`}
                  title={`${tab.label}${tab.name ? ` — ${tab.name}` : ""}`}
                  onClick={() => setActiveSheet(tab.number)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {sheet && (
              <div className="pour-summary-bar">
                <strong>{patentTabs.find((t) => t.number === sheet)?.label}</strong><br />
                {PourRecords.summaryText("", PourRecords.summarize(sheetRows)).trim()}
              </div>
            )}
            <PourGrid
              columns={PourRecords.PATENT_TAB_COLUMNS}
              records={sheetRows}
              emptyText="이 특허가 적용된 현장이 없습니다."
              onOpen={(rec) => openNotice(rec)}
            />
          </section>
        )}

        {view === "settings" && (
          <section>
            <h2 className="pour-view-title">등록된 POUR 특허 ({patents.length}건)</h2>
            <div className="pour-grid-wrap">
              <table className="pour-grid">
                <thead>
                  <tr><th>특허번호</th><th>특허명·공법명</th><th>공종</th><th>특허권자</th></tr>
                </thead>
                <tbody>
                  {patents.map((p) => (
                    <tr key={p.number}>
                      <td>{PourPatents.formatNumber(p.number)}</td>
                      <td>{p.name}</td>
                      <td className="cell-wrap">{(p.categories || []).join("\n")}</td>
                      <td>{p.company}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === "io" && (
          <section>
            <h2 className="pour-view-title">가져오기·내보내기</h2>
            <p>엑셀 가져오기·내보내기는 기존 화면의 업로드 흐름에 연결하세요.
               파싱은 <code>PourPatents.parseRows()</code>, 내보내기는 <code>PourExport</code> 를 씁니다.</p>
          </section>
        )}

        {view === "stats" && (
          <section>
            <h2 className="pour-view-title">통계·분석</h2>
            <div className="pour-stat-cards">
              {[
                ["전체 현장", `${counts["전체"]?.toLocaleString("ko-KR") ?? 0}건`],
                ["낙찰", `${counts["낙찰"]?.toLocaleString("ko-KR") ?? 0}건`],
                ["공고", `${counts["공고"]?.toLocaleString("ko-KR") ?? 0}건`],
                ["재공고·유찰", `${counts["재공고(유찰)"]?.toLocaleString("ko-KR") ?? 0}건`],
                ["등록 POUR 특허", `${patents.length}건`]
              ].map(([label, value]) => (
                <div className="pour-stat-card" key={label}>
                  <div className="lbl">{label}</div>
                  <div className="val">{value}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <NoticePanel
        open={noticeOpen}
        storage={storage}
        record={editing}
        onClose={() => setNoticeOpen(false)}
        onSaved={() => { commit(); setAlertIds(null); }}
      />
      <AwardPanel
        open={awardOpen}
        storage={storage}
        record={awarding}
        onClose={() => setAwardOpen(false)}
        onSaved={() => { commit(); setAlertIds(null); }}
      />
    </div>
  );
}

"use client";
/** 새 공고 등록 · 자료 수정 패널 (오른쪽 슬라이드) */
import { useCallback, useEffect, useMemo, useState } from "react";
import PourRecords from "@/lib/pour/core/pour-records.js";
import PourRegion from "@/lib/pour/core/pour-region.js";
import PatentEditor, { type PatentEditorValue } from "./PatentEditor";
import CategoryPicker from "./CategoryPicker";
import PourCategories from "@/lib/pour/core/pour-categories.js";
import type { PourRecord, PourStorage, CategoryItem } from "@/lib/pour/core";

export interface NoticePanelProps {
  /** 협약서 발행번호를 지웠을 때 상태를 되돌릴지 확인받는다. 기본은 window.confirm */
  confirmAgreementCleared?: (message: string) => boolean;
  open: boolean;
  storage: PourStorage;
  /** 수정할 자료. 없으면 새 공고 등록 */
  record?: PourRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_FORM = {
  client: "", projectNames: "", city: "", region: "",
  phone: "", households: "", noticeDate: "", documentDueDate: "", bidDate: "",
  // K-APT 공고번호 — 공고 단계에서 확인되는 값
  noticeNo: "",
  noticePatentText: "", agreementNo: "", quality: "", scopes: "", address: "",
  remark: "", contractor: "", status: "공고",
  // 낙찰 뒤에 확인되는 값들. 같은 행에 이어서 담는다.
  contractorPhone: "", awardDate: "", awardAmount: "", isPartner: ""
};

export default function NoticePanel({
  open, storage, record, onClose, onSaved,
  confirmAgreementCleared = (message: string) => window.confirm(message)
}: NoticePanelProps) {
  // 상세 수정일 때만 보이는 항목이 있다 (새 공고 화면에서는 감춘다)
  const isEdit = !!record;
  const [form, setForm] = useState({ ...EMPTY_FORM });
  // 공종은 대분류와 짝지어 두므로 문자열 폼과 따로 관리한다
  const [categoryItems, setCategoryItems] = useState<CategoryItem[]>([]);
  // 특허에서 자동으로 온 공종 이름. 배지에 "특허 자동" 을 붙이는 데만 쓴다.
  const [autoNames, setAutoNames] = useState<string[]>([]);
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const [bidType, setBidType] = useState("");
  const [patents, setPatents] = useState<PatentEditorValue>({ patentItems: [], noticeMultiFlag: false });
  const [message, setMessage] = useState<{ text: string; kind: "error" | "ok" } | null>(null);

  const [isRebid, setIsRebid] = useState(false);
  const [rebidSource, setRebidSource] = useState("");
  const [rebidReason, setRebidReason] = useState("");
  const [previousFailDate, setPreviousFailDate] = useState("");
  const [rebidSearch, setRebidSearch] = useState("");

  const set = useCallback(<K extends keyof typeof EMPTY_FORM>(key: K, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  /* 자료를 열 때 채워 넣는다 */
  useEffect(() => {
    if (!open) return;
    setMessage(null);
    if (record) {
      setForm({
        client: record.client,
        projectNames: record.projectNames.join("\n"),
        city: record.city,
        region: record.region,
        phone: record.phone,
        households: record.households === "" ? "" : String(record.households),
        noticeDate: record.noticeDate,
        documentDueDate: record.documentDueDate,
        bidDate: record.bidDate,
        noticeNo: record.noticeNo,
        noticePatentText: record.noticePatentText,
        agreementNo: record.agreementNo,
        quality: record.quality,
        scopes: (record.scopes || []).join("\n"),
        address: record.address,
        remark: record.remark,
        contractor: record.contractor,
        status: record.status,
        contractorPhone: record.contractorPhone,
        awardDate: record.awardDate,
        awardAmount: record.awardAmount === "" ? "" : String(record.awardAmount),
        isPartner: record.isPartner
      });
      setRegionOptions(record.region ? [record.region] : []);
      setBidType(record.bidType);
      setPatents({ patentItems: record.patentItems, noticeMultiFlag: record.noticeMultiFlag });
      // 항목이 없는 옛 자료는 공종 이름에서 분류를 붙여 온다 (이름은 그대로 남는다)
      setCategoryItems((record.categoryItems && record.categoryItems.length
        ? record.categoryItems
        : PourCategories.itemsFromNames(record.categories)) as CategoryItem[]);
      setIsRebid(false);
    } else {
      setForm({ ...EMPTY_FORM });
      setRegionOptions([]);
      setBidType("");
      setPatents({ patentItems: [], noticeMultiFlag: false });
      setCategoryItems([]);
      setAutoNames([]);
      setIsRebid(false);
      setRebidSource("");
    }
  }, [open, record]);

  /* 도시를 입력하면 지역을 자동으로 채운다 */
  const onCityChange = useCallback((city: string) => {
    set("city", city);
    const parsed = PourRegion.parse(city);
    if (parsed.status === "resolved") {
      setRegionOptions([parsed.region]);
      set("region", parsed.region);
    } else if (parsed.status === "ambiguous") {
      const regions: string[] = [];
      parsed.candidates.forEach((c) => { if (!regions.includes(c.region)) regions.push(c.region); });
      setRegionOptions(regions);
      set("region", regions[0] || "");
    } else {
      setRegionOptions([]);
      set("region", "");
    }
  }, [set]);

  const rebidCandidates = useMemo(() => {
    if (!isRebid) return [];
    const q = rebidSearch.trim().toUpperCase();
    return PourRecords.list(storage).filter((r) => {
      if (!["공고", "재공고", "유찰"].includes(r.status)) return false;
      if (!q) return true;
      return [r.client, r.city, r.region, ...r.projectNames].join(" ").toUpperCase().includes(q);
    });
  }, [isRebid, rebidSearch, storage]);

  const rebidRound = useMemo(() => {
    if (!rebidSource) return "";
    const origin = PourRecords.list(storage).find((r) => r.id === rebidSource);
    if (!origin) return "";
    const rootId = origin.originalProjectId || origin.id;
    let round = 1;
    PourRecords.list(storage).forEach((r) => {
      if (r.originalProjectId === rootId && r.rebidRound) {
        round = Math.max(round, Number(r.rebidRound) + 1);
      }
    });
    return `${round}차`;
  }, [rebidSource, storage]);

  /* 기존 공고를 고르면 내용을 가져온다 (수정 가능) */
  const pickRebidSource = useCallback((id: string) => {
    setRebidSource(id);
    const origin = PourRecords.list(storage).find((r) => r.id === id);
    if (!origin) return;
    setForm((prev) => ({
      ...prev,
      client: origin.client,
      projectNames: origin.projectNames.join("\n"),
      city: origin.city,
      region: origin.region,
      phone: origin.phone,
      households: origin.households === "" ? "" : String(origin.households),
      scopes: (origin.scopes || []).join("\n"),
      noticePatentText: origin.noticePatentText
    }));
    setCategoryItems((origin.categoryItems && origin.categoryItems.length
      ? origin.categoryItems
      : PourCategories.itemsFromNames(origin.categories)) as CategoryItem[]);
    setRegionOptions(origin.region ? [origin.region] : []);
    setPatents({ patentItems: origin.patentItems, noticeMultiFlag: origin.noticeMultiFlag });
    setPreviousFailDate(origin.bidDate || "");
  }, [storage]);

  const save = useCallback(() => {
    const payload = {
      ...form,
      households: form.households,
      bidType,
      // 새 공고는 화면에서 상태를 고르지 않는다. 수정할 때만 고른 값을 쓴다.
      status: record ? form.status : "공고",
      // 공종은 대분류와 짝지어 저장한다. 기존 공종 열은 모델이 함께 채운다.
      categoryItems,
      patentItems: patents.patentItems,
      noticeMultiFlag: patents.noticeMultiFlag
    };

    // 새로 등록할 때만 도시·공고일을 요구한다.
    // 엑셀에서 옮겨 온 자료에는 공고일이 없어(원본에 날짜가 없다) 여기서 막으면
    // 그 자료는 협약서 발행번호조차 넣을 수 없게 된다.
    if (!record) {
      if (!payload.city) { setMessage({ text: "도시를 입력해 주세요.", kind: "error" }); return; }
      if (!payload.noticeDate) {
        setMessage({ text: "공고일을 입력해 주세요.", kind: "error" }); return;
      }
    }

    const dates = PourRecords.validateDates(payload);
    if (!dates.ok) {
      setMessage({ text: dates.errors.map((e) => e.message).join("\n"), kind: "error" });
      return;
    }

    if (record) {
      let result = PourRecords.update(record.id, payload, storage);
      // 협약서 발행번호를 지웠다면 상태를 되돌릴지 물어본다 (과거 번호는 되살리지 않는다)
      if (!result.ok && result.reason === "agreementCleared") {
        const revert = confirmAgreementCleared(result.message || "");
        result = PourRecords.update(
          record.id, { ...payload, agreementCleared: revert ? "notice" : "keep" }, storage);
      }
      if (!result.ok) { setMessage({ text: result.message || "저장하지 못했습니다.", kind: "error" }); return; }
    } else if (isRebid) {
      if (!rebidSource) { setMessage({ text: "재공고할 기존 공고를 선택해 주세요.", kind: "error" }); return; }
      const result = PourRecords.createRebid(
        rebidSource, { ...payload, rebidReason, previousFailDate }, storage);
      if (!result.ok) { setMessage({ text: result.message || "저장하지 못했습니다.", kind: "error" }); return; }
    } else {
      PourRecords.save(payload, storage);
    }
    onSaved();
    onClose();
  }, [form, bidType, patents, categoryItems, record, isRebid, rebidSource, rebidReason,
      previousFailDate, storage, onSaved, onClose, confirmAgreementCleared]);

  return (
    <>
      <div className={`pour-panel-back${open ? " is-open" : ""}`} onClick={onClose} />
      <aside className={`pour-panel${open ? " is-open" : ""}`} aria-hidden={!open}>
        <div className="pour-panel-head">
          <h3 className="pour-panel-title">
            {record ? `자료 수정 — ${record.client || "이름 없음"}` : "새 공고 등록"}
          </h3>
          {!record && (
            <label className="pour-rebid-check">
              <input type="checkbox" checked={isRebid} onChange={(e) => setIsRebid(e.target.checked)} />{" "}
              재공고 건
            </label>
          )}
          <span className="pour-spacer" />
          <button type="button" className="pour-panel-close" onClick={onClose} title="닫기">✕</button>
        </div>

        <div className="pour-panel-body">
          {/* 어느 현장인지, 지금 어느 단계인지 먼저 보이게 한다 */}
          {record && (
            <div className="pour-panel-subject">
              <span className="pour-panel-subject-name">{record.client || "이름 없음"}</span>
              <span className="pour-panel-status" data-status={record.status}>{record.status}</span>
            </div>
          )}
          {record && <div className="pour-stage-head">① 공고 정보</div>}
          {isRebid && !record && (
            <div className="pour-rebid-box">
              <div className="pour-form-row pour-form-row-4">
                <div>
                  <label>기존 공고 검색</label>
                  <input type="text" value={rebidSearch} placeholder="단지명·공사명·도시"
                         onChange={(e) => setRebidSearch(e.target.value)} />
                </div>
                <div>
                  <label>기존 공고 선택</label>
                  <select value={rebidSource} onChange={(e) => pickRebidSource(e.target.value)}>
                    <option value="">— 선택 —</option>
                    {rebidCandidates.map((r) => (
                      <option key={r.id} value={r.id}>
                        {`${r.client || "이름 없음"} / ${PourRegion.format(r.region, r.city)} / ${r.status}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>재공고 차수 <span className="opt">(자동)</span></label>
                  <input type="text" value={rebidRound} readOnly />
                </div>
                <div>
                  <label>이전 유찰일</label>
                  <input type="date" value={previousFailDate}
                         onChange={(e) => setPreviousFailDate(e.target.value)} />
                </div>
              </div>
              <div className="pour-form-row pour-form-row-1">
                <div>
                  <label>재공고 사유</label>
                  <input type="text" value={rebidReason} placeholder="예: 응찰 없음"
                         onChange={(e) => setRebidReason(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <div className="pour-form-row pour-form-row-3">
            <div>
              <label htmlFor="pf-client">아파트·단지명</label>
              <input id="pf-client" type="text" value={form.client}
                     onChange={(e) => set("client", e.target.value)} />
            </div>
            <div className="span-2">
              <label htmlFor="pf-projects">공사명 <span className="opt">(여러 건은 줄바꿈)</span></label>
              <textarea id="pf-projects" rows={2} value={form.projectNames}
                        onChange={(e) => set("projectNames", e.target.value)} />
            </div>
          </div>

          <div className="pour-sub-head">공종</div>
          <div className="pour-form-row pour-form-row-1">
            <div>
              <label>
                대분류를 고른 뒤 세부 공종을 고릅니다{" "}
                <span className="opt">(특허를 고르면 자동으로 채워집니다)</span>
              </label>
              <CategoryPicker
                value={categoryItems}
                onChange={setCategoryItems}
                autoNames={autoNames}
              />
            </div>
          </div>

          <div className="pour-form-row pour-form-row-4">
            <div>
              <label htmlFor="pf-region">지역 <span className="opt">(도시 입력 시 자동)</span></label>
              <select id="pf-region" value={form.region} onChange={(e) => set("region", e.target.value)}>
                {regionOptions.length
                  ? regionOptions.map((r) => <option key={r} value={r}>{r}</option>)
                  : <option value="">—</option>}
              </select>
            </div>
            <div>
              <label htmlFor="pf-city">도시</label>
              <input id="pf-city" type="text" autoComplete="off" placeholder="예: 하남, 금산, 평택"
                     value={form.city} onChange={(e) => onCityChange(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pf-phone">전화번호 <span className="opt">(선택)</span></label>
              <input id="pf-phone" type="text" value={form.phone}
                     onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <label htmlFor="pf-households">세대수 <span className="opt">(선택)</span></label>
              <input id="pf-households" type="text" value={form.households}
                     onChange={(e) => set("households", e.target.value)} />
            </div>
          </div>

          <div className="pour-form-row pour-form-row-4">
            <div>
              <label htmlFor="pf-notice-no">공고번호 <span className="opt">(K-APT)</span></label>
              <input id="pf-notice-no" type="text" value={form.noticeNo}
                     onChange={(e) => set("noticeNo", e.target.value)} />
            </div>
            <div>
              <label htmlFor="pf-notice-date">공고일 <span className="req">*</span></label>
              <input id="pf-notice-date" type="date" value={form.noticeDate}
                     onChange={(e) => set("noticeDate", e.target.value)} />
            </div>
            <div>
              <label htmlFor="pf-due">서류 마감일 <span className="opt">(선택)</span></label>
              <input id="pf-due" type="date" value={form.documentDueDate}
                     onChange={(e) => set("documentDueDate", e.target.value)} />
            </div>
            <div>
              <label htmlFor="pf-bid-date">개찰일 <span className="opt">(선택)</span></label>
              <input id="pf-bid-date" type="date" value={form.bidDate}
                     onChange={(e) => set("bidDate", e.target.value)} />
            </div>
            <div>
              <label>입찰종류</label>
              <div className="pour-bid-group">
                {["서류접수", "전자입찰"].map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    data-bid={kind}
                    className={`pour-bid-btn${bidType === kind ? " is-active" : ""}`}
                    onClick={() => setBidType((prev) => (prev === kind ? "" : kind))}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pour-sub-head">적용 특허</div>

              <div className="pour-form-row pour-form-row-1">
                <div>
                  <label>적용 특허 <span className="opt">(POUR 특허와 타사 특허를 나누어 입력)</span></label>
                  <PatentEditor
                    storage={storage}
                    value={patents}
                    onChange={setPatents}
                    onCategories={(names, replace) => {
                      setAutoNames(names);
                      // 자료를 불러오는 중(replace=false)에는 저장된 공종을 덮지 않는다
                      if (!replace) return;
                      // 확실하지 않은 이름은 임의로 정하지 않고 기타로 간다
                      setCategoryItems(PourCategories.itemsFromNames(names) as CategoryItem[]);
                    }}
                  />
                </div>
              </div>
              {/* 공고문 특허·공법 원문과 협약서 발행번호는 새 공고에서는 감춘다.
                  자료와 목록 열은 그대로 두고 입력 화면에서만 감추는 것이다. */}
              {isEdit && (
                <>
                  <div className="pour-sub-head">공고문 특허·공법</div>
                  <div className="pour-form-row pour-form-row-1">
                    <div>
                      <label htmlFor="pf-notice-patent">공고문 특허·공법 원문</label>
                      <input id="pf-notice-patent" type="text" value={form.noticePatentText}
                             placeholder="공고문에 적힌 특허번호·특허명·공법명"
                             onChange={(e) => set("noticePatentText", e.target.value)} />
                    </div>
                  </div>
                </>
              )}
              <div className="pour-sub-head">공사 내용</div>
              <div className="pour-form-row pour-form-row-fill">
                <div className="span-2">
                  <label htmlFor="pf-scopes">공사범위 <span className="opt">(여러 건은 줄바꿈)</span></label>
                  <textarea id="pf-scopes" rows={2} value={form.scopes}
                            onChange={(e) => set("scopes", e.target.value)} />
                </div>
                <div>
                  <label htmlFor="pf-address">상세 주소</label>
                  <input id="pf-address" type="text" value={form.address}
                         onChange={(e) => set("address", e.target.value)} />
                </div>
              </div>

          {/* ② 낙찰 정보 — 낙찰 뒤에 확인되는 값들. 새 공고 화면에서는 감춘다.
              같은 행에 이어서 담기므로 공고와 낙찰이 두 건으로 나뉘지 않는다. */}
          {isEdit && (
            <>
              <div className="pour-stage-head">② 낙찰 정보</div>
              <div className="pour-form-row pour-form-row-fill">
                <div>
                  <label htmlFor="pf-status">상태</label>
                  <select id="pf-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
                    {PourRecords.STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="pf-contractor">시공사</label>
                  <input id="pf-contractor" type="text" value={form.contractor}
                         onChange={(e) => set("contractor", e.target.value)} />
                </div>
                <div>
                  <label htmlFor="pf-contractor-phone">시공사 전화번호</label>
                  <input id="pf-contractor-phone" type="text" value={form.contractorPhone}
                         onChange={(e) => set("contractorPhone", e.target.value)} />
                </div>
                <div>
                  <label htmlFor="pf-award-date">낙찰일</label>
                  <input id="pf-award-date" type="date" value={form.awardDate}
                         onChange={(e) => set("awardDate", e.target.value)} />
                </div>
                <div>
                  <label htmlFor="pf-award-amount">낙찰금액</label>
                  <input id="pf-award-amount" type="text" value={form.awardAmount}
                         onChange={(e) => set("awardAmount", e.target.value)} />
                </div>
                <div>
                  <label htmlFor="pf-is-partner">협약사 여부</label>
                  <select id="pf-is-partner" value={form.isPartner}
                          onChange={(e) => set("isPartner", e.target.value)}>
                    {["", "예", "아니오"].map((v) => <option key={v} value={v}>{v || "—"}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="pf-agreement">협약서 발행번호</label>
                  <input id="pf-agreement" type="text" value={form.agreementNo}
                         onChange={(e) => set("agreementNo", e.target.value)} />
                </div>
                <div>
                  <label htmlFor="pf-quality">공사 품질</label>
                  <input id="pf-quality" type="text" list="pour-quality" value={form.quality}
                         onChange={(e) => set("quality", e.target.value)} />
                  <datalist id="pour-quality">
                    {PourRecords.QUALITY_OPTIONS.map((q) => <option key={q} value={q} />)}
                  </datalist>
                </div>
                <div className="span-2">
                  <label htmlFor="pf-remark">비고</label>
                  <input id="pf-remark" type="text" value={form.remark}
                         onChange={(e) => set("remark", e.target.value)} />
                </div>
              </div>
            </>
          )}

          {record && record.history.length > 0 && (
            <div className="pour-history">
              <b>수정 이력</b>
              {record.history.map((h, i) => (
                <div key={i}>{`${h.at} · ${h.action} (${h.statusBefore} → ${h.statusAfter})`}</div>
              ))}
            </div>
          )}

          {message && <div className={`pour-form-msg ${message.kind}`}>{message.text}</div>}
        </div>

        <div className="pour-panel-foot">
          <button type="button" className="pour-btn ghost" onClick={onClose}>취소</button>
          <button type="button" className="pour-btn" onClick={save}>
            {record ? "수정 저장" : "공고 등록"}
          </button>
        </div>
      </aside>
    </>
  );
}

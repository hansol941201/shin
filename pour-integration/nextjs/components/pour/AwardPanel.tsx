"use client";
/** 낙찰 상세정보 입력 패널 */
import { useCallback, useEffect, useState } from "react";
import PourRecords from "@/lib/pour/core/pour-records.js";
import PourRegion from "@/lib/pour/core/pour-region.js";
import PatentEditor, { type PatentEditorValue } from "./PatentEditor";
import type { PourRecord, PourStorage } from "@/lib/pour/core";

const CONTRACTOR_FIELDS = [
  { key: "contractor", label: "시공사명", required: true },
  { key: "contractorPhone", label: "시공사 전화번호", required: true, phone: true },
  { key: "contractorContactName", label: "담당자명" },
  { key: "contractorMobile", label: "담당자 휴대전화", phone: true },
  { key: "contractorAddress", label: "시공사 주소" },
  { key: "contractorBusinessNo", label: "사업자등록번호" },
  { key: "contractorNote", label: "시공사 비고" }
] as const;

const INFO_FIELDS = [
  { key: "awardDate", label: "낙찰일", required: true, type: "date" },
  { key: "awardAmount", label: "낙찰금액", required: true, money: true },
  { key: "categories", label: "최종 공종", required: true },
  { key: "status", label: "낙찰 결과 상태", select: true },
  { key: "scopes", label: "최종 공사범위" },
  { key: "quality", label: "공사 품질" },
  { key: "remark", label: "낙찰 비고" }
] as const;

type FieldKey = (typeof CONTRACTOR_FIELDS)[number]["key"] | (typeof INFO_FIELDS)[number]["key"];

export interface AwardPanelProps {
  open: boolean;
  storage: PourStorage;
  record: PourRecord | null;
  onClose: () => void;
  onSaved: () => void;
  /** 특허번호 없이 저장할지 확인받는다. 기본은 window.confirm */
  confirmWithoutPatent?: (message: string) => boolean;
}

export default function AwardPanel({
  open, storage, record, onClose, onSaved, confirmWithoutPatent
}: AwardPanelProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [patents, setPatents] = useState<PatentEditorValue>({ patentItems: [], noticeMultiFlag: false });
  const [message, setMessage] = useState<{ text: string; kind: "error" | "ok" } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !record) return;
    setValues({
      contractor: record.contractor,
      contractorPhone: record.contractorPhone,
      contractorContactName: record.contractorContactName,
      contractorMobile: record.contractorMobile,
      contractorAddress: record.contractorAddress,
      contractorBusinessNo: record.contractorBusinessNo,
      contractorNote: record.contractorNote,
      awardDate: record.awardDate,
      awardAmount: record.awardAmount === "" ? "" : String(record.awardAmount),
      categories: record.categories.join(", "),
      status: "낙찰",
      scopes: (record.scopes || []).join("\n"),
      quality: record.quality,
      remark: record.remark
    });
    setPatents({ patentItems: record.patentItems, noticeMultiFlag: record.noticeMultiFlag });
    setErrors({});
    setMessage(null);
    setSaving(false);
  }, [open, record]);

  const set = useCallback((key: FieldKey, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(() => {
    if (!record) return;
    setErrors({});
    setSaving(true);

    const payload: Record<string, unknown> = {
      ...values,
      patentItems: patents.patentItems,          // 빈 배열이면 "모두 지움"
      noticeMultiFlag: patents.noticeMultiFlag,
      confirmedWithoutPatent: false
    };

    let result = PourRecords.award(record.id, payload, storage);

    if (!result.ok && result.needsConfirm) {
      const ask = confirmWithoutPatent || ((m: string) => window.confirm(m));
      if (ask(result.message || "")) {
        payload.confirmedWithoutPatent = true;
        result = PourRecords.award(record.id, payload, storage);
      } else {
        setMessage({ text: "낙찰 저장을 취소했습니다.", kind: "ok" });
        setSaving(false);
        return;
      }
    }

    if (!result.ok) {
      setErrors(result.fields || {});
      setMessage({ text: result.message || "저장하지 못했습니다.", kind: "error" });
      setSaving(false);
      return;
    }

    onSaved();
    onClose();
  }, [record, values, patents, storage, confirmWithoutPatent, onSaved, onClose]);

  const renderField = (
    field: (typeof CONTRACTOR_FIELDS)[number] | (typeof INFO_FIELDS)[number]
  ) => {
    const key = field.key;
    const phone = "phone" in field && field.phone;
    const money = "money" in field && field.money;
    const isSelect = "select" in field && field.select;
    return (
      <div key={key}>
        <label htmlFor={`aw-${key}`}>
          {field.label}
          {"required" in field && field.required && <span className="req"> *</span>}
        </label>
        {isSelect ? (
          <select id={`aw-${key}`} value={values[key] || "낙찰"} onChange={(e) => set(key, e.target.value)}>
            {PourRecords.STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <input
            id={`aw-${key}`}
            type={"type" in field && field.type ? field.type : "text"}
            value={values[key] || ""}
            onChange={(e) => set(key, e.target.value)}
            onBlur={(e) => {
              // 전화번호는 숫자만 넣으면 하이픈을 붙여 준다 (문자열 그대로 저장)
              if (phone) set(key, PourRecords.formatPhone(e.target.value));
              if (money && e.target.value.trim()) {
                const n = Number(e.target.value.replace(/[^0-9.-]/g, ""));
                if (Number.isFinite(n)) set(key, n.toLocaleString("ko-KR"));
              }
            }}
          />
        )}
        {errors[key] && <span className="pour-field-error" id={`aw-error-${key}`}>{errors[key]}</span>}
      </div>
    );
  };

  return (
    <>
      <div className={`pour-panel-back${open ? " is-open" : ""}`} onClick={onClose} />
      <aside className={`pour-panel${open ? " is-open" : ""}`} aria-hidden={!open}>
        <div className="pour-panel-head">
          <h3 className="pour-panel-title">낙찰 상세정보 입력</h3>
          <span className="pour-spacer" />
          <button type="button" className="pour-panel-close" onClick={onClose} title="닫기">✕</button>
        </div>

        <div className="pour-panel-body">
          {record && (
            <div className="pour-summary-bar">
              <strong>{record.client || "이름 없음"}</strong><br />
              공사명: {record.projectNames.join(" / ") || "—"}<br />
              지역·도시: {PourRegion.format(record.region, record.city) || "—"}<br />
              공고일 {record.noticeDate || "—"} · 서류 마감일 {record.documentDueDate || "—"} ·
              개찰일 {record.bidDate || "—"}<br />
              공고문 특허·공법: {record.noticePatentText || "—"}<br />
              현재 상태: {record.status}
              {record.rebidRound ? ` (재공고 ${record.rebidRound}차)` : ""}
            </div>
          )}

          <div className="pour-sub-head">시공사 정보</div>
          <div className="pour-form-row pour-form-row-fill">{CONTRACTOR_FIELDS.map(renderField)}</div>

          <div className="pour-sub-head">낙찰 정보</div>
          <div className="pour-form-row pour-form-row-fill">{INFO_FIELDS.map(renderField)}</div>

          <div className="pour-sub-head">적용 특허</div>
          <PatentEditor
            storage={storage}
            value={patents}
            onChange={setPatents}
            onCategories={(categories) => {
              if (categories.length) set("categories", categories.join(", "));
            }}
          />

          {message && <div className={`pour-form-msg ${message.kind}`}>{message.text}</div>}
        </div>

        <div className="pour-panel-foot">
          <button type="button" className="pour-btn ghost" onClick={onClose}>취소</button>
          <button type="button" className="pour-btn" onClick={save} disabled={saving}>낙찰로 저장</button>
        </div>
      </aside>
    </>
  );
}

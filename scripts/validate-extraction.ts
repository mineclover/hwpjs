#!/usr/bin/env bun
/**
 * Extraction Validation
 *
 * anomalies.json(추출 결과) × contents-list.json(ground truth)를 교차 검증합니다.
 *
 * Usage:
 *   bun scripts/validate-extraction.ts <anomalies.json> <contents-list.json> [output-dir]
 *
 * Example:
 *   bun scripts/validate-extraction.ts \
 *     pipeline/stage1/anomalies/anomalies.json \
 *     pipeline/contents-list.json \
 *     pipeline/stage1/validation
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const [, , anomaliesPath, contentsPath, outDir = 'pipeline/stage1/validation'] = process.argv;

if (!anomaliesPath || !contentsPath) {
  console.error('Usage: bun scripts/validate-extraction.ts <anomalies.json> <contents-list.json> [output-dir]');
  process.exit(1);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnomalyRecord {
  source_file: string;
  fields: {
    weekly_plan?: {
      found: boolean;
      count?: number;
    };
  };
  anomalies: { rule_id: string; severity: string; message: string; detail?: string }[];
}

interface CourseEntry {
  index: number;
  title: string;
  type: string;
  field: string;
  number: string;
  chapter_count: number;
}

type MatchStatus =
  | 'OK'              // 추출 수 일치
  | 'COUNT_MISMATCH'  // 추출 수 불일치 (실제 오차)
  | 'EXTRACTION_ERROR'// 추출 자체 실패 (weekly_plan not found)
  | 'NO_GROUND_TRUTH' // contents-list에 매핑 안됨
  | 'NO_HWP_FILE';    // HWP 파일이 없어서 검증 불가

interface ValidationResult {
  hwp_file: string;
  title_extracted: string;
  matched_title: string | null;
  expected_count: number | null;
  extracted_count: number | null;
  status: MatchStatus;
  note?: string;
}

// ─── Title normalization ───────────────────────────────────────────────────────

/**
 * HWP 파일명에서 과정 제목을 추출합니다.
 * e.g. "001. 강의계획서_Master-K 기반 PLC 제어 기초_송석환.hwp" → "Master-K 기반 PLC 제어 기초"
 */
function extractTitleFromFilename(filename: string): string {
  let name = filename
    .replace(/^\d+\.\s*/, '')        // "001. " 또는 "021." 제거
    .replace(/강의계획서_/, '')       // 접두어 제거
    .replace(/\.hwp(\.[a-z]+)?$/i, ''); // .hwp, .hwp.hwp 등 제거

  // 마지막 _강사명 제거 (단, 제목 자체에 _가 없을 수도 있음)
  const lastUnderscore = name.lastIndexOf('_');
  if (lastUnderscore > 0) {
    name = name.slice(0, lastUnderscore);
  }

  return name.trim();
}

/**
 * 비교를 위해 특수문자/공백을 정규화합니다.
 * e.g. "PLC 기본(XGT/XGK)" → "plc기본xgtxgk"
 */
function normalize(s: string): string {
  return s.replace(/[\s/\[\]()\-.,!?:]/g, '').toLowerCase();
}

/**
 * 두 제목을 퍼지 매칭합니다.
 * 정규화 후 완전 일치, 또는 한쪽이 다른 쪽을 포함하는지 확인합니다.
 */
function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

// ─── Load data ────────────────────────────────────────────────────────────────

const anomalies: AnomalyRecord[] = JSON.parse(readFileSync(anomaliesPath, 'utf8'));
const courses: CourseEntry[] = JSON.parse(readFileSync(contentsPath, 'utf8'));

// ─── Validate ─────────────────────────────────────────────────────────────────

const results: ValidationResult[] = [];

for (const record of anomalies) {
  const titleExtracted = extractTitleFromFilename(record.source_file);
  const weeklyPlan = record.fields?.weekly_plan;
  const extractedCount = weeklyPlan?.found ? (weeklyPlan.count ?? null) : null;

  // Ground truth 매칭
  const matched = courses.find(c => fuzzyMatch(titleExtracted, c.title));

  if (!matched) {
    results.push({
      hwp_file: record.source_file,
      title_extracted: titleExtracted,
      matched_title: null,
      expected_count: null,
      extracted_count: extractedCount,
      status: 'NO_GROUND_TRUTH',
      note: `contents-list에서 "${titleExtracted}" 매칭 실패`,
    });
    continue;
  }

  const expected = matched.chapter_count;

  let status: MatchStatus;
  let note: string | undefined;

  if (!weeklyPlan?.found) {
    status = 'EXTRACTION_ERROR';
    note = `weekly_plan 추출 실패 (expected: ${expected})`;
  } else if (extractedCount === expected) {
    status = 'OK';
  } else {
    const diff = (extractedCount ?? 0) - expected;
    status = 'COUNT_MISMATCH';
    note = `추출 ${extractedCount} ≠ 실제 ${expected} (차이: ${diff > 0 ? '+' : ''}${diff})`;
  }

  results.push({
    hwp_file: record.source_file,
    title_extracted: titleExtracted,
    matched_title: matched.title,
    expected_count: expected,
    extracted_count: extractedCount,
    status,
    note,
  });
}

// ─── Summary ──────────────────────────────────────────────────────────────────

const summary = {
  total: results.length,
  ok: results.filter(r => r.status === 'OK').length,
  count_mismatch: results.filter(r => r.status === 'COUNT_MISMATCH').length,
  extraction_error: results.filter(r => r.status === 'EXTRACTION_ERROR').length,
  no_ground_truth: results.filter(r => r.status === 'NO_GROUND_TRUTH').length,
};

// ─── Output ───────────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });

const report = { summary, results };
writeFileSync(join(outDir, 'validation.json'), JSON.stringify(report, null, 2), 'utf8');

// HTML 리포트
const rows = results.map(r => {
  const colorMap: Record<MatchStatus, string> = {
    OK: '#22c55e',
    COUNT_MISMATCH: '#f97316',
    EXTRACTION_ERROR: '#ef4444',
    NO_GROUND_TRUTH: '#94a3b8',
    NO_HWP_FILE: '#94a3b8',
  };
  const color = colorMap[r.status];
  return `
    <tr>
      <td>${r.hwp_file}</td>
      <td>${r.matched_title ?? r.title_extracted}</td>
      <td style="text-align:center">${r.expected_count ?? '-'}</td>
      <td style="text-align:center">${r.extracted_count ?? '-'}</td>
      <td style="text-align:center;color:${color};font-weight:600">${r.status}</td>
      <td>${r.note ?? ''}</td>
    </tr>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>Extraction Validation Report</title>
<style>
  body { font-family: sans-serif; padding: 24px; background: #f8fafc; }
  h1 { font-size: 20px; margin-bottom: 16px; }
  .summary { display:flex; gap:16px; margin-bottom:24px; flex-wrap:wrap; }
  .card { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px 20px; min-width:100px; }
  .card .label { font-size:12px; color:#64748b; }
  .card .value { font-size:24px; font-weight:700; }
  .ok    { color:#22c55e }
  .warn  { color:#f97316 }
  .error { color:#ef4444 }
  .gray  { color:#94a3b8 }
  table { width:100%; border-collapse:collapse; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.1); }
  th { background:#1e293b; color:#fff; padding:10px 12px; text-align:left; font-size:13px; }
  td { padding:8px 12px; border-bottom:1px solid #f1f5f9; font-size:13px; vertical-align:top; }
  tr:last-child td { border-bottom:none; }
  tr:hover td { background:#f8fafc; }
</style>
</head>
<body>
<h1>Extraction Validation Report</h1>
<div class="summary">
  <div class="card"><div class="label">전체</div><div class="value">${summary.total}</div></div>
  <div class="card"><div class="label">일치 (OK)</div><div class="value ok">${summary.ok}</div></div>
  <div class="card"><div class="label">수량 불일치</div><div class="value warn">${summary.count_mismatch}</div></div>
  <div class="card"><div class="label">추출 실패</div><div class="value error">${summary.extraction_error}</div></div>
  <div class="card"><div class="label">매핑 실패</div><div class="value gray">${summary.no_ground_truth}</div></div>
</div>
<table>
  <thead>
    <tr>
      <th>HWP 파일</th><th>과정명</th><th>실제 회차</th><th>추출 회차</th><th>상태</th><th>비고</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

writeFileSync(join(outDir, 'validation.html'), html, 'utf8');

// 콘솔 출력
console.log(`\n검증 결과:`);
console.log(`  전체:       ${summary.total}개`);
console.log(`  ✓ 일치:     ${summary.ok}개`);
console.log(`  ⚠ 수량 불일치: ${summary.count_mismatch}개`);
console.log(`  ✗ 추출 실패:  ${summary.extraction_error}개`);
console.log(`  - 매핑 실패:  ${summary.no_ground_truth}개`);

if (summary.count_mismatch > 0 || summary.extraction_error > 0) {
  console.log('\n문제 항목:');
  results
    .filter(r => r.status !== 'OK' && r.status !== 'NO_GROUND_TRUTH')
    .forEach(r => console.log(`  [${r.status}] ${r.hwp_file}\n    → ${r.note}`));
}

console.log(`\nJSON:  ${join(outDir, 'validation.json')}`);
console.log(`HTML:  ${join(outDir, 'validation.html')}`);

/**
 * collect-validation.json → 인덱스 HTML
 */
import * as fs from 'fs';

const inPath = 'D:/woo-work/hwp-pipe-output/collect-validation.json';
const outPath = 'D:/woo-work/hwp-pipe-output/collect-validation.html';

const results: any[] = JSON.parse(fs.readFileSync(inPath, 'utf-8'));

function esc(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TYPE_COLOR: Record<string, string> = {
  course_info: '#3b5bdb',
  weekly_plan: '#0ca678',
  weekly_plan_kor: '#1c7ed6',
  instructor_info: '#e67700',
  expert_criteria: '#7950f2',
};

const TYPE_LABEL: Record<string, string> = {
  course_info: '과정정보',
  weekly_plan: '주차계획',
  weekly_plan_kor: '주차계획KOR',
  instructor_info: '강사정보',
  expert_criteria: '전문가기준',
};

// 유형별 전체 집계
const typeTotals: Record<string, number> = {};
for (const r of results) {
  for (const m of r.matched ?? []) {
    typeTotals[m.type] = (typeTotals[m.type] ?? 0) + 1;
  }
}

function badge(type: string, size: string, matchedText?: string) {
  const color = TYPE_COLOR[type] ?? '#868e96';
  const label = TYPE_LABEL[type] ?? type;
  const tip = matchedText ? ` title="${esc(matchedText)}"` : '';
  return `<span class="badge"${tip} style="background:${color}">${esc(label)} <span class="sz">${esc(size)}</span></span>`;
}

function tableRow(r: any) {
  // tbl 인덱스 전체 범위
  const total = r.totalTables as number;
  const matchedMap: Record<number, any> = {};
  for (const m of r.matched ?? []) matchedMap[m.idx] = m;
  const unmatchedMap: Record<number, any> = {};
  for (const u of r.unmatched ?? []) unmatchedMap[u.idx] = u;

  // 매칭 시각화 셀들
  const cells = Array.from({ length: total }, (_, i) => {
    if (matchedMap[i]) {
      const m = matchedMap[i];
      return `<td class="cell-match">${badge(m.type, m.size, m.matched_text)}</td>`;
    }
    const u = unmatchedMap[i];
    const preview = u?.preview ? `<span class="unmatch-preview">${esc(u.preview)}</span>` : '';
    const sz = u?.size ?? '';
    return `<td class="cell-unmatch"><span class="sz-grey">${esc(sz)}</span>${preview}</td>`;
  }).join('');

  const matchRatio = `${r.matched?.length ?? 0}/${total}`;
  const hasError = r.error ? ' row-error' : '';

  return `<tr class="data-row${hasError}">
    <td class="cdms-col">${esc(r.cdms)}</td>
    <td class="title-col">${esc(r.title)}</td>
    <td class="ratio-col">${matchRatio}</td>
    ${cells}
  </tr>`;
}

// 컬럼 헤더 (최대 테이블 수)
const maxTables = Math.max(...results.map((r) => r.totalTables ?? 0));
const colHeaders = Array.from(
  { length: maxTables },
  (_, i) => `<th class="tbl-col">tbl[${i}]</th>`
).join('');

// 범례
const legendItems = Object.entries(TYPE_COLOR)
  .map(
    ([k, c]) =>
      `<span class="legend-item"><span class="legend-dot" style="background:${c}"></span>${TYPE_LABEL[k] ?? k} <strong>${typeTotals[k] ?? 0}</strong></span>`
  )
  .join('');

// 요약 카드
const totalMatched = results.reduce((n, r) => n + (r.matched?.length ?? 0), 0);
const totalTables = results.reduce((n, r) => n + (r.totalTables ?? 0), 0);
const unmatchedTotal = totalTables - totalMatched;

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>collect_pattern 검증 결과</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Malgun Gothic',sans-serif;font-size:12px;background:#f1f5f9;color:#1e293b;padding:20px;}
h1{font-size:17px;margin-bottom:4px;}
.subtitle{color:#64748b;font-size:12px;margin-bottom:16px;}
.summary{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
.card{background:#fff;border-radius:8px;padding:10px 16px;border:1px solid #e2e8f0;min-width:100px;}
.card .val{font-size:22px;font-weight:700;color:#3b5bdb;}
.card .lbl{font-size:11px;color:#64748b;margin-top:2px;}
.legend{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;}
.legend-item{display:flex;align-items:center;gap:5px;font-size:12px;}
.legend-dot{width:10px;height:10px;border-radius:3px;display:inline-block;}
.table-wrap{overflow-x:auto;border-radius:8px;border:1px solid #e2e8f0;}
table{border-collapse:collapse;width:100%;background:#fff;}
th{background:#1e293b;color:#f1f5f9;padding:6px 8px;text-align:left;font-size:11px;white-space:nowrap;position:sticky;top:0;z-index:1;}
th.tbl-col{background:#334155;min-width:90px;}
td{padding:5px 7px;border-bottom:1px solid #f1f5f9;vertical-align:middle;}
.cdms-col{font-family:monospace;font-size:11px;color:#3b5bdb;white-space:nowrap;font-weight:600;}
.title-col{min-width:200px;font-size:12px;}
.ratio-col{text-align:center;font-weight:600;font-size:11px;white-space:nowrap;}
.cell-match{padding:4px 5px;}
.cell-unmatch{padding:4px 5px;background:#fafafa;}
.badge{display:inline-flex;align-items:center;gap:3px;color:#fff;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap;}
.badge .sz{opacity:.75;font-weight:400;}
.sz-grey{color:#94a3b8;font-size:10px;}
.unmatch-preview{color:#94a3b8;font-size:10px;margin-left:3px;}
.data-row:hover td{background:#f8faff;}
.row-error td{background:#fff0f0;}
</style></head><body>
<h1>collect_pattern 검증 결과</h1>
<p class="subtitle">ktechTableSpecs — 46개 HWP 파일 대상</p>

<div class="summary">
  <div class="card"><div class="val">${results.length}</div><div class="lbl">파일 수</div></div>
  <div class="card"><div class="val">${totalTables}</div><div class="lbl">총 테이블</div></div>
  <div class="card"><div class="val" style="color:#0ca678">${totalMatched}</div><div class="lbl">매칭</div></div>
  <div class="card"><div class="val" style="color:#868e96">${unmatchedTotal}</div><div class="lbl">미매칭 (레이아웃)</div></div>
</div>

<div class="legend">${legendItems}</div>

<div class="table-wrap">
<table>
<thead>
  <tr>
    <th>CDMS</th>
    <th>과정명</th>
    <th>매칭</th>
    ${colHeaders}
  </tr>
</thead>
<tbody>
${results.map(tableRow).join('\n')}
</tbody>
</table>
</div>
</body></html>`;

fs.writeFileSync(outPath, html, 'utf-8');
console.log(`✅ → ${outPath}`);

/**
 * 폴더 내 모든 HWP 파일에서 전체 테이블을 파일별 HTML로 출력
 *
 * Usage: bun scripts/dump-all-tables.ts <input-folder> [output-folder]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as hwpjs from '../packages/hwpjs/dist/index.js';
import {
  transformHwpTablesWithSchema,
  extractAllTableSchemas,
  saveImagesToFiles,
  type TableSchema,
  type ImageMap,
} from '../packages/hwpjs-adapter/src/table-schema';

// ============================================================================
// 체크박스 클러스터 식별 (컨텐츠 기반)
// ============================================================================

/**
 * 체크박스 군집 1: 이론/실습/사례
 * 체크박스 군집 2: 실습/소스파일 (실습파일제공, 소스파일제공, 해당없음)
 */
const CLUSTER_LABELS = {
  group1: ['이론', '실습', '사례'],
  group2: ['실습파일', '소스파일', '해당없음', '해당 없음'],
};

/** 체크 문자(☑ ■ ✓ ✔) 포함 여부 */
function hasCheckMark(val: string): boolean {
  return /[☑■✓✔]/.test(val);
}

/** 미체크 문자(▢ □) 포함 여부 */
function hasUncheckMark(val: string): boolean {
  return /[▢□]/.test(val);
}

/**
 * 셀 값에서 알려진 라벨과 매칭
 * 공백·개행·체크 문자 제거 후 비교
 */
function matchKnownLabel(val: string, labels: string[]): string | null {
  const cleaned = val.replace(/[☑■▢□□✓✔\s\n]/g, '');
  for (const lbl of labels) {
    if (cleaned.includes(lbl.replace(/\s/g, ''))) return lbl;
  }
  return null;
}

/**
 * 셀 하나의 체크 상태
 * - checkmark: ☑/■ 있음 → 체크
 * - text-only: 알려진 라벨이지만 ▢ 없음 → 체크 (▢ 제거 방식)
 * - unchecked: ▢/□ 있음 → 미체크
 * - unknown: 해당 없음
 */
type CheckFormat = 'checkmark' | 'text-only' | 'unchecked' | 'unknown';

interface CheckboxItem {
  label: string;        // "이론" | "실습" | "사례" | ...
  checked: boolean;
  format: CheckFormat;
  raw: string;          // 원본 셀 값 (디버깅용)
}

interface CheckboxCluster {
  groupLabel: string;        // "이론/실습/사례" | "실습/소스파일"
  items: CheckboxItem[];
  nothingChecked: boolean;   // 군집 내 아무것도 체크 안 됨
}

function parseCheckboxItem(val: string, knownLabels: string[]): CheckboxItem | null {
  const matched = matchKnownLabel(val, knownLabels);
  if (!matched) return null;

  let format: CheckFormat;
  let checked: boolean;

  if (hasCheckMark(val)) {
    format = 'checkmark';
    checked = true;
  } else if (hasUncheckMark(val)) {
    format = 'unchecked';
    checked = false;
  } else {
    // 체크 문자 없음 = "▢ 제거" 방식으로 체크된 상태
    format = 'text-only';
    checked = true;
  }

  return { label: matched, checked, format, raw: val };
}

/**
 * "이론/실습/사례" 행에서 체크박스 클러스터를 추출
 * 셀 인덱스가 아닌 셀 내용으로 군집을 식별
 */
function extractCheckboxClusters(cellVals: string[]): CheckboxCluster[] {
  const clusters: CheckboxCluster[] = [];

  // 구분자 라벨 ("이론/실습/사례", "실습/소스파일")로 군집 경계 확인 후
  // 각 셀을 컨텐츠 기반으로 group1 / group2에 배치
  const group1Items: CheckboxItem[] = [];
  const group2Items: CheckboxItem[] = [];

  for (const val of cellVals) {
    const g1 = parseCheckboxItem(val, CLUSTER_LABELS.group1);
    if (g1) { group1Items.push(g1); continue; }

    const g2 = parseCheckboxItem(val, CLUSTER_LABELS.group2);
    if (g2) { group2Items.push(g2); continue; }
  }

  if (group1Items.length > 0) {
    clusters.push({
      groupLabel: '이론/실습/사례',
      items: group1Items,
      nothingChecked: group1Items.every(i => !i.checked),
    });
  }
  if (group2Items.length > 0) {
    clusters.push({
      groupLabel: '실습/소스파일',
      items: group2Items,
      nothingChecked: group2Items.every(i => !i.checked),
    });
  }

  return clusters;
}

// ============================================================================
// HWP → TableSchema 추출
// ============================================================================

async function extractAllFromFile(filePath: string, imageOutputDir: string): Promise<TableSchema[]> {
  const data = fs.readFileSync(filePath);
  const uint8Data = new Uint8Array(data);

  const htmlResult = hwpjs.toHtml(uint8Data, { includeVersion: false, includePageInfo: false });
  const imageMap: ImageMap = new Map();
  const dataUrlMatches = htmlResult.match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g);
  if (dataUrlMatches) {
    dataUrlMatches.forEach((dataUrl, i) => {
      const format = dataUrl.match(/data:image\/([^;]+)/)?.[1] ?? 'unknown';
      imageMap.set(i + 1, { dataUrl, format });
    });
  }

  const jsonString = hwpjs.toJson(uint8Data);
  const parsed = JSON.parse(jsonString);
  if (!parsed.body_text) return [];

  const transformed = transformHwpTablesWithSchema(parsed.body_text, { imageMap });
  const schemas = extractAllTableSchemas(transformed);
  return saveImagesToFiles(schemas, imageOutputDir);
}

// ============================================================================
// HTML 렌더링
// ============================================================================


function renderTableSchema(schema: TableSchema, tableIdx: number): string {
  const merges = schema.merges ?? [];

  const mergeByStart = new Map<string, { rowspan: number; colspan: number }>();
  const mergedAway = new Set<string>();

  for (const m of merges) {
    const rowspan = m.end.row - m.start.row + 1;
    const colspan = m.end.col - m.start.col + 1;
    mergeByStart.set(`${m.start.row},${m.start.col}`, { rowspan, colspan });
    for (let r = m.start.row; r <= m.end.row; r++) {
      for (let c = m.start.col; c <= m.end.col; c++) {
        if (r !== m.start.row || c !== m.start.col) {
          mergedAway.add(`${r},${c}`);
        }
      }
    }
  }

  let html = `<div class="table-wrap">
  <div class="table-label">테이블 ${tableIdx + 1}${schema.caption ? ` — ${schema.caption}` : ''}</div>
  <table>`;

  for (let rowIdx = 0; rowIdx < schema.rows.length; rowIdx++) {
    const row = schema.rows[rowIdx];
    const cellVals = row.cells.map(c => String(c.value ?? '').trim());
    const isLessonRow = cellVals.some(v => v.includes('이론/실습/사례'));

    let rowClass = '';

    if (isLessonRow) {
      const clusters = extractCheckboxClusters(cellVals);
      const group1 = clusters.find(c => c.groupLabel === '이론/실습/사례');

      if (group1?.nothingChecked) {
        rowClass = ' class="no-check"';
      } else if (group1) {
        rowClass = ' class="has-check"';
      }
    }

    html += `<tr${rowClass}>`;

    let cellIdx = 0;
    let colIdx = 0;

    while (cellIdx < row.cells.length) {
      while (mergedAway.has(`${rowIdx},${colIdx}`)) colIdx++;

      const cell = row.cells[cellIdx];
      const mergeInfo = mergeByStart.get(`${rowIdx},${colIdx}`);

      let tdAttrs = '';
      if (mergeInfo) {
        if (mergeInfo.rowspan > 1) tdAttrs += ` rowspan="${mergeInfo.rowspan}"`;
        if (mergeInfo.colspan > 1) tdAttrs += ` colspan="${mergeInfo.colspan}"`;
      }

      let content = String(cell.value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');

      if (cell.images && cell.images.length > 0) {
        content += cell.images.map(img => {
          const fname = path.basename(img.src);
          return `<img src="../table-images/${fname}" style="max-width:160px;max-height:120px;display:block;margin-top:4px;">`;
        }).join('');
      }

      html += `<td${tdAttrs}>${content}</td>`;
      cellIdx++;
      colIdx++;
    }

    html += `</tr>`;
  }

  html += `</table></div>`;
  return html;
}

function wrapHtml(title: string, body: string, tableCount: number, noCheckCount: number): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 13px; margin: 20px; background: #f5f5f5; }
  h1 { color: #333; font-size: 15px; word-break: break-all; }
  .meta { background: #e9ecef; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
  .meta .warn { color: #c62828; font-weight: bold; }
  .nav { margin-bottom: 14px; font-size: 12px; }
  .nav a { color: #0056b3; text-decoration: none; }
  .table-label { font-size: 11px; color: #888; margin-bottom: 4px; }
  .table-wrap { margin-bottom: 20px; overflow-x: auto; }
  table { border-collapse: collapse; min-width: 300px; }
  td { border: 1px solid #ccc; padding: 6px 10px; vertical-align: top; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
  tr:nth-child(even) td { background: #fafafa; }
  /* 체크박스 행 */
  tr.no-check td  { background: #fff3cd !important; }
  tr.has-check td { background: #f0fff4 !important; }
  /* 범례 */
  .legend { font-size: 11px; margin-bottom: 14px; display: flex; gap: 12px; flex-wrap: wrap; }
  .legend span { padding: 2px 8px; border-radius: 4px; }
</style>
</head>
<body>
<div class="nav"><a href="../index.html">← 목록으로</a></div>
<h1>${esc(title)}</h1>
<div class="meta">
  테이블 ${tableCount}개
  ${noCheckCount > 0 ? `<span class="warn"> | ⚠ 이론/실습/사례 미체크 회차 ${noCheckCount}개</span>` : ''}
</div>
<div class="legend">
  <span style="background:#f0fff4;border:1px solid #b2dfdb">✓ 이론/실습/사례 체크 있음</span>
  <span style="background:#fff3cd;border:1px solid #f0c040">⚠ 이론/실습/사례 아무것도 미체크</span>
</div>
${body}
</body>
</html>`;
}

function buildIndex(
  files: Array<{ name: string; htmlName: string; tableCount: number; noCheckCount: number; error?: string }>
): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rows = files.map(f => {
    const warnCell = f.noCheckCount > 0
      ? `<td class="warn">⚠ ${f.noCheckCount}개</td>`
      : `<td class="ok">-</td>`;
    const nameCell = f.error
      ? `<td class="err">${esc(f.name)} (오류: ${esc(f.error)})</td>`
      : `<td><a href="${f.htmlName}">${esc(f.name)}</a></td>`;
    return `<tr>${nameCell}<td>${f.tableCount}</td>${warnCell}</tr>`;
  }).join('\n');

  const totalNoCheck = files.reduce((s, f) => s + f.noCheckCount, 0);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>테이블 전체 출력 — 파일 목록</title>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 13px; margin: 20px; }
  h1 { font-size: 16px; }
  .summary { background: #e9ecef; padding: 10px 14px; border-radius: 6px; margin-bottom: 20px; }
  .summary .warn { color: #c62828; font-weight: bold; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #495057; color: #fff; padding: 8px 12px; text-align: left; }
  td { border: 1px solid #dee2e6; padding: 7px 12px; }
  tr:hover td { background: #f1f3f5; }
  td a { color: #0056b3; text-decoration: none; }
  td.warn { color: #c62828; font-weight: bold; }
  td.ok { color: #aaa; }
  td.err { color: #999; font-style: italic; }
</style>
</head>
<body>
<h1>테이블 전체 출력 — 파일 목록</h1>
<div class="summary">
  파일 ${files.length}개
  ${totalNoCheck > 0 ? `<span class="warn"> | ⚠ 이론/실습/사례 미체크 총 ${totalNoCheck}개</span>` : ''}
</div>
<table>
<thead><tr><th>파일명</th><th>테이블 수</th><th>미체크 회차</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: bun scripts/dump-all-tables.ts <input-folder> [output-folder]');
    process.exit(1);
  }

  const folderPath = args[0];
  const outputDir = args[1] || path.join(folderPath, '..', 'tables-by-file');
  const imageOutputDir = path.join(outputDir, 'table-images');

  fs.mkdirSync(path.join(outputDir, 'files'), { recursive: true });
  fs.mkdirSync(imageOutputDir, { recursive: true });

  const hwpFiles = fs.readdirSync(folderPath)
    .filter(f => f.toLowerCase().endsWith('.hwp'))
    .sort()
    .map(f => ({ name: f, full: path.join(folderPath, f) }));

  console.log(`Found ${hwpFiles.length} HWP files → ${outputDir}`);

  const indexEntries: Array<{
    name: string; htmlName: string; tableCount: number; noCheckCount: number; error?: string;
  }> = [];

  for (const file of hwpFiles) {
    const baseName = file.name.replace(/\.hwp\.hwp$/i, '').replace(/\.hwp$/i, '');
    const htmlName = `files/${baseName}.html`;
    console.log(`Processing: ${file.name}`);

    try {
      const schemas = await extractAllFromFile(file.full, imageOutputDir);

      let noCheckCount = 0;
      for (const schema of schemas) {
        for (const row of schema.rows) {
          const vals = row.cells.map(c => String(c.value ?? '').trim());
          if (!vals.some(v => v.includes('이론/실습/사례'))) continue;
          const clusters = extractCheckboxClusters(vals);
          const g1 = clusters.find(c => c.groupLabel === '이론/실습/사례');
          if (g1?.nothingChecked) noCheckCount++;
        }
      }

      let body = '';
      schemas.forEach((schema, i) => { body += renderTableSchema(schema, i); });

      const fileHtml = wrapHtml(file.name, body, schemas.length, noCheckCount);
      fs.writeFileSync(path.join(outputDir, htmlName), fileHtml, 'utf-8');

      indexEntries.push({ name: file.name, htmlName, tableCount: schemas.length, noCheckCount });
      console.log(`  -> ${schemas.length} tables, ${noCheckCount} no-check rows`);
    } catch (err) {
      console.error(`  -> Error: ${err}`);
      indexEntries.push({ name: file.name, htmlName, tableCount: 0, noCheckCount: 0, error: String(err) });
    }
  }

  fs.writeFileSync(path.join(outputDir, 'index.html'), buildIndex(indexEntries), 'utf-8');

  const totalNoCheck = indexEntries.reduce((s, e) => s + e.noCheckCount, 0);
  console.log(`\nDone! ${path.join(outputDir, 'index.html')}`);
  if (totalNoCheck > 0) console.log(`⚠ 이론/실습/사례 미체크: ${totalNoCheck}개`);
  else console.log('✓ 미체크 없음');
}

main();

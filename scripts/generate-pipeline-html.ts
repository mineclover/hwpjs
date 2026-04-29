import { toJson, toHtml } from '../packages/hwpjs/dist/index.js';
import {
  transformHwpTablesWithSchema,
  extractAllTableSchemas,
  type TableSchema,
  type ImageMap,
} from '../packages/hwpjs-adapter/src/table-schema';
import { tableSchemaToTable } from '../packages/hwpjs-adapter/src/to-table';
import { tableToHtml } from '../packages/table-manager/src/html/html-converter';
import type { Table } from '../packages/table-manager/src/schema.js';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(import.meta.dir, '../crates/hwp-core/tests/fixtures');
const outDir = path.join(import.meta.dir, '../output');
fs.mkdirSync(outDir, { recursive: true });

// toHtml의 base64 이미지 목록 → imageMap (bindata_id = 1-based index)
function buildImageMap(html: string): ImageMap {
  const map: ImageMap = new Map();
  const matches = html.match(/data:image\/([^;]+);base64,[A-Za-z0-9+/=]+/g) ?? [];
  matches.forEach((dataUrl, i) => {
    const format = dataUrl.match(/data:image\/([^;]+)/)?.[1] ?? 'jpeg';
    map.set(i + 1, { dataUrl, format });
  });
  return map;
}

// TableSchema → HTML (이미지 포함)
// tableToHtml은 CellImage 미지원이므로 이미지 셀만 커스텀 처리
function renderSchemaToHtml(schema: TableSchema): string {
  // 이미지가 하나도 없으면 table-manager 그대로 사용
  const hasImages = schema.rows.some(r => r.cells.some(c => c.images && c.images.length > 0));
  if (!hasImages) {
    const table = tableSchemaToTable(schema);
    return tableToHtml(table, { pretty: true, autoGenerateId: true });
  }

  // 이미지 있는 경우: tableToHtml 결과에서 셀 내용만 후처리
  // TableSchema 직접 렌더링
  const table: Table = tableSchemaToTable(schema);
  let html = tableToHtml(table, { pretty: true, autoGenerateId: true });

  // 각 셀의 이미지를 <td> 내용 뒤에 주입
  // — 셀 value와 images를 함께 알고 있는 건 schema 기준이므로
  //   schema 기준으로 직접 테이블 HTML 생성
  return renderSchemaDirectly(schema);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSchemaDirectly(schema: TableSchema): string {
  const merges = schema.merges ?? [];

  function isMergedAway(row: number, col: number): boolean {
    return merges.some(m =>
      (row > m.start.row || (row === m.start.row && col > m.start.col)) &&
      row <= m.end.row && col <= m.end.col
    );
  }

  function getMergeSpan(row: number, col: number) {
    const m = merges.find(m => m.start.row === row && m.start.col === col);
    if (!m) return { colspan: 1, rowspan: 1 };
    return { colspan: m.end.col - m.start.col + 1, rowspan: m.end.row - m.start.row + 1 };
  }

  let colIndex = 0;
  const rows = schema.rows.map((row, rowIdx) => {
    colIndex = 0;
    const cells = row.cells.map(cell => {
      // 병합된 셀 건너뛰기
      while (isMergedAway(rowIdx, colIndex)) colIndex++;

      const { colspan, rowspan } = getMergeSpan(rowIdx, colIndex);
      const spanAttrs = [
        colspan > 1 ? `colspan="${colspan}"` : '',
        rowspan > 1 ? `rowspan="${rowspan}"` : '',
      ].filter(Boolean).join(' ');

      const text = cell.value != null && String(cell.value).trim()
        ? `<span>${escapeHtml(String(cell.value)).replace(/\n/g, '<br>')}</span>`
        : '';

      const imgs = (cell.images ?? []).map(img =>
        `<img src="${img.src}" alt="이미지" style="max-width:100%;display:block;margin-top:4px">`
      ).join('');

      colIndex++;
      return `    <td${spanAttrs ? ' ' + spanAttrs : ''} style="border:1px solid #ccc;padding:6px 10px;vertical-align:top">${text}${imgs}</td>`;
    }).join('\n');
    return `  <tr>\n${cells}\n  </tr>`;
  }).join('\n');

  return `<table style="border-collapse:collapse;width:100%;font-size:13px">\n${rows}\n</table>`;
}

const targets = ['table.hwp', 'table2.hwp', 'noori.hwp'];

for (const name of targets) {
  const hwpPath = path.join(fixturesDir, name);
  if (!fs.existsSync(hwpPath)) continue;

  const buf = fs.readFileSync(hwpPath);

  // 1) hwpjs 원본 HTML (이미지 포함) + imageMap 빌드
  const hwpHtml = toHtml(buf, { includeVersion: true });
  fs.writeFileSync(path.join(outDir, `${path.basename(name, '.hwp')}-hwpjs.html`), hwpHtml);
  const imageMap = buildImageMap(hwpHtml);

  // 2) Pipeline: imageMap 포함 변환
  const json = JSON.parse(toJson(buf));
  const transformed = transformHwpTablesWithSchema(json, { imageMap });
  const schemas = extractAllTableSchemas(transformed);

  const baseName = path.basename(name, '.hwp');
  const totalImages = schemas.reduce((n, s) =>
    n + s.rows.flatMap(r => r.cells).reduce((m, c) => m + (c.images?.length ?? 0), 0), 0);

  const tablesHtml = schemas.map((schema, i) => {
    const html = renderSchemaToHtml(schema);
    const imgCount = schema.rows.flatMap(r => r.cells).reduce((n, c) => n + (c.images?.length ?? 0), 0);
    return `<section><h3>Table ${i + 1}${imgCount > 0 ? ` (이미지 ${imgCount}개)` : ''}</h3>${html}</section>`;
  }).join('\n');

  const pipelineHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${baseName} — HWP Table Pipeline</title>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; padding: 24px; background: #f5f5f5; }
  h1 { color: #1a1a2e; margin-bottom: 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 32px; }
  section { background: white; border-radius: 8px; padding: 20px; margin-bottom: 24px;
            box-shadow: 0 1px 4px rgba(0,0,0,.1); }
  h3 { margin: 0 0 12px; color: #444; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  td { vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  img { max-width: 100%; }
</style>
</head>
<body>
<h1>${baseName}.hwp — 테이블 파이프라인 출력</h1>
<p class="meta">
  테이블: <strong>${schemas.length}개</strong> &nbsp;|&nbsp;
  이미지: <strong>${totalImages}개</strong> &nbsp;|&nbsp;
  imageMap: <strong>${imageMap.size}개</strong>
</p>
${schemas.length === 0 ? '<p>테이블 없음</p>' : tablesHtml}
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, `${baseName}-pipeline.html`), pipelineHtml);
  console.log(`✓ ${name}: 테이블 ${schemas.length}개, 이미지 ${totalImages}개 → output/${baseName}-pipeline.html`);
}

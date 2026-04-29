import { toJson, toHtml } from '../packages/hwpjs/dist/index.js';
import {
  transformHwpTablesWithSchema,
  extractAllTableSchemas,
  type TableSchema,
  type ImageMap,
} from '../packages/hwpjs-adapter/src/table-schema';
import { tableSchemaToTable } from '../packages/hwpjs-adapter/src/to-table';
import { tableToHtml } from '../packages/table-manager/src/html/html-converter';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(import.meta.dir, '../crates/hwp-core/tests/fixtures');
const outDir = path.join(import.meta.dir, '../output');
fs.mkdirSync(outDir, { recursive: true });

// hwpjs toHtml 출력에서 base64 이미지 목록 추출 → imageMap
// imageMap 빌드는 hwpjs의 안정적인 toHtml 결과를 그대로 활용
function buildImageMap(html: string): ImageMap {
  const map: ImageMap = new Map();
  const matches = html.match(/data:image\/([^;]+);base64,[A-Za-z0-9+/=]+/g) ?? [];
  matches.forEach((dataUrl, i) => {
    const format = dataUrl.match(/data:image\/([^;]+)/)?.[1] ?? 'jpeg';
    map.set(i + 1, { dataUrl, format });
  });
  return map;
}

// JSON에서 테이블 셀 내 bindata_id 위치를 찾아 imageMap으로 schemas에 이미지 주입
// — 어댑터 코드를 수정하지 않고 generate 스크립트에서만 처리
function injectImagesIntoSchemas(
  bodyText: unknown,
  schemas: TableSchema[],
  imageMap: ImageMap,
): void {
  if (imageMap.size === 0) return;

  // JSON에서 table 객체를 순서대로 수집
  const rawTables: unknown[] = [];
  function collectTables(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(collectTables); return; }
    const rec = obj as Record<string, unknown>;
    if ('table' in rec) { rawTables.push(rec['table']); return; }
    Object.values(rec).forEach(collectTables);
  }
  collectTables(bodyText);

  // 각 table의 cells → paragraphs → records를 재귀 탐색해 bindata_id 수집
  function findBinIds(obj: unknown): number[] {
    const ids: number[] = [];
    function walk(o: unknown): void {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      const r = o as Record<string, unknown>;
      if (r['type'] === 'shape_component_picture') {
        const binId = (r['shape_component_picture'] as any)?.picture_info?.bindata_id;
        if (typeof binId === 'number') ids.push(binId);
      }
      Object.values(r).forEach(walk);
    }
    walk(obj);
    return ids;
  }

  // rawTables[i] ↔ schemas[i] 1:1 대응
  for (let ti = 0; ti < Math.min(rawTables.length, schemas.length); ti++) {
    const rawTable = rawTables[ti] as { cells?: unknown[] };
    const schema = schemas[ti];
    const cells = rawTable.cells ?? [];

    let cellIdx = 0;
    for (const row of schema.rows) {
      for (const cell of row.cells) {
        const rawCell = cells[cellIdx++];
        const binIds = findBinIds(rawCell);
        if (binIds.length > 0) {
          cell.images = binIds
            .filter(id => imageMap.has(id))
            .map(id => {
              const img = imageMap.get(id)!;
              return { id: `img-${id}`, src: img.dataUrl, format: img.format };
            });
        }
      }
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// TableSchema → HTML (이미지 포함)
// 이미지 없는 경우 table-manager tableToHtml 사용
// 이미지 있는 경우 TableSchema 직접 렌더링 (tableToHtml은 CellImage 미지원)
function renderSchemaToHtml(schema: TableSchema): string {
  const hasImages = schema.rows.some(r => r.cells.some(c => c.images && c.images.length > 0));
  if (!hasImages) {
    return tableToHtml(tableSchemaToTable(schema), { pretty: true, autoGenerateId: true });
  }
  return renderSchemaDirectly(schema);
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

  const rows = schema.rows.map((row, rowIdx) => {
    let colIndex = 0;
    const cells = row.cells.map(cell => {
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
        `<img src="${img.src}" alt="" style="max-width:100%;display:block;margin-top:4px">`
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
  const baseName = path.basename(name, '.hwp');

  // hwpjs toHtml — 이미지 추출의 신뢰 소스
  const hwpHtml = toHtml(buf, { includeVersion: true });
  fs.writeFileSync(path.join(outDir, `${baseName}-hwpjs.html`), hwpHtml);
  const imageMap = buildImageMap(hwpHtml);

  // pipeline: 어댑터는 구조 변환만 담당, 이미지는 generate 스크립트에서 주입
  const json = JSON.parse(toJson(buf));
  const transformed = transformHwpTablesWithSchema(json);
  const schemas = extractAllTableSchemas(transformed);
  injectImagesIntoSchemas(json.body_text, schemas, imageMap);

  const totalImages = schemas.reduce((n, s) =>
    n + s.rows.flatMap(r => r.cells).reduce((m, c) => m + (c.images?.length ?? 0), 0), 0);

  const tablesHtml = schemas.map((schema, i) => {
    const imgCount = schema.rows.flatMap(r => r.cells).reduce((n, c) => n + (c.images?.length ?? 0), 0);
    const html = renderSchemaToHtml(schema);
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
  imageMap(from toHtml): <strong>${imageMap.size}개</strong>
</p>
${schemas.length === 0 ? '<p>테이블 없음</p>' : tablesHtml}
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, `${baseName}-pipeline.html`), pipelineHtml);
  console.log(`✓ ${name}: 테이블 ${schemas.length}개, 이미지 ${totalImages}개 (imageMap: ${imageMap.size}개)`);
}

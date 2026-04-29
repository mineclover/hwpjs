import { toJson, toHtml } from '../packages/hwpjs/dist/index.js';
import {
  transformHwpTablesWithSchema,
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

// ─── 타입 ────────────────────────────────────────────────────────────────────

type TextBlock = {
  type: 'text';
  lines: string[];
  paths: string[];        // 각 줄의 JSON path
};

type TableBlock = {
  type: 'table';
  schema: TableSchema;
  path: string;           // tableSchema의 JSON path
  cellPaths: string[][];  // rows × cells JSON path
};

type DocBlock = TextBlock | TableBlock;

// ─── imageMap ────────────────────────────────────────────────────────────────

function buildImageMap(html: string): ImageMap {
  const map: ImageMap = new Map();
  const matches = html.match(/data:image\/([^;]+);base64,[A-Za-z0-9+/=]+/g) ?? [];
  matches.forEach((dataUrl, i) => {
    const format = dataUrl.match(/data:image\/([^;]+)/)?.[1] ?? 'jpeg';
    map.set(i + 1, { dataUrl, format });
  });
  return map;
}

// ─── JSON path 추적 블록 추출 ──────────────────────────────────────────────────

function extractParaText(para: Record<string, unknown>): string {
  const records = (para['records'] as any[]) ?? [];
  return records
    .filter(r => r.type === 'para_text' && r.text)
    .map(r => String(r.text).replace(/[\x00-\x1F]/g, '').trim())
    .filter(Boolean)
    .join(' ');
}

function findTableSchemasWithPaths(
  obj: unknown,
  basePath: string,
  results: Array<{ schema: TableSchema; path: string }> = [],
): Array<{ schema: TableSchema; path: string }> {
  if (!obj || typeof obj !== 'object') return results;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findTableSchemasWithPaths(v, `${basePath}[${i}]`, results));
    return results;
  }
  const rec = obj as Record<string, unknown>;
  if ('tableSchema' in rec) {
    results.push({ schema: rec['tableSchema'] as TableSchema, path: `${basePath}.tableSchema` });
    return results;
  }
  for (const [k, v] of Object.entries(rec)) {
    findTableSchemasWithPaths(v, `${basePath}.${k}`, results);
  }
  return results;
}

function buildDocumentBlocks(transformed: unknown): DocBlock[] {
  const blocks: DocBlock[] = [];
  const body = (transformed as any)?.body_text;
  if (!body) return blocks;

  for (const [si, section] of (body.sections ?? []).entries()) {
    for (const [pi, para] of (section.paragraphs ?? []).entries()) {
      const paraPath = `body_text.sections[${si}].paragraphs[${pi}]`;

      const found = findTableSchemasWithPaths(para, paraPath);
      if (found.length > 0) {
        for (const { schema, path: tablePath } of found) {
          // 셀별 JSON path: 단순화해서 table path 기반으로 row/cell 인덱스
          const cellPaths = schema.rows.map((row, ri) =>
            row.cells.map((_, ci) => `${tablePath}.rows[${ri}].cells[${ci}]`)
          );
          blocks.push({ type: 'table', schema, path: tablePath, cellPaths });
        }
        continue;
      }

      const text = extractParaText(para);
      if (!text) continue;

      const last = blocks[blocks.length - 1];
      if (last?.type === 'text') {
        last.lines.push(text);
        last.paths.push(paraPath);
      } else {
        blocks.push({ type: 'text', lines: [text], paths: [paraPath] });
      }
    }
  }

  return blocks;
}

// ─── 이미지 주입 ──────────────────────────────────────────────────────────────

function injectImages(rawBodyText: unknown, blocks: DocBlock[], imageMap: ImageMap): void {
  if (imageMap.size === 0) return;

  const rawTables: unknown[] = [];
  function collectTables(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(collectTables); return; }
    const r = obj as Record<string, unknown>;
    if ('table' in r) { rawTables.push(r['table']); return; }
    Object.values(r).forEach(collectTables);
  }
  collectTables(rawBodyText);

  function findBinIds(obj: unknown): number[] {
    const ids: number[] = [];
    function walk(o: unknown): void {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      const r = o as Record<string, unknown>;
      if (r['type'] === 'shape_component_picture') {
        const id = (r['shape_component_picture'] as any)?.picture_info?.bindata_id;
        if (typeof id === 'number') ids.push(id);
      }
      Object.values(r).forEach(walk);
    }
    walk(obj);
    return ids;
  }

  const tableBlocks = blocks.filter((b): b is TableBlock => b.type === 'table');
  for (let ti = 0; ti < Math.min(rawTables.length, tableBlocks.length); ti++) {
    const rawTable = rawTables[ti] as { cells?: unknown[] };
    const schema = tableBlocks[ti].schema;
    const cells = rawTable.cells ?? [];
    let ci = 0;
    for (const row of schema.rows) {
      for (const cell of row.cells) {
        const binIds = findBinIds(cells[ci++]);
        if (binIds.length > 0) {
          cell.images = binIds
            .filter(id => imageMap.has(id))
            .map(id => { const img = imageMap.get(id)!; return { id: `img-${id}`, src: img.dataUrl, format: img.format }; });
        }
      }
    }
  }
}

// ─── 렌더러 ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderTableSchema(block: TableBlock): string {
  const { schema, cellPaths } = block;
  const hasImages = schema.rows.some(r => r.cells.some(c => c.images && c.images.length > 0));

  const merges = schema.merges ?? [];
  function isMergedAway(r: number, c: number) {
    return merges.some(m =>
      (r > m.start.row || (r === m.start.row && c > m.start.col)) &&
      r <= m.end.row && c <= m.end.col
    );
  }
  function getSpan(r: number, c: number) {
    const m = merges.find(m => m.start.row === r && m.start.col === c);
    return m ? { colspan: m.end.col - m.start.col + 1, rowspan: m.end.row - m.start.row + 1 } : { colspan: 1, rowspan: 1 };
  }

  if (!hasImages) {
    // table-manager 렌더링 + 셀 path overlay를 위해 직접 렌더링으로 통일
  }

  const rows = schema.rows.map((row, ri) => {
    let ci = 0;
    const tds = row.cells.map((cell, cellListIdx) => {
      while (isMergedAway(ri, ci)) ci++;
      const { colspan, rowspan } = getSpan(ri, ci);
      const spanAttr = [colspan > 1 ? `colspan="${colspan}"` : '', rowspan > 1 ? `rowspan="${rowspan}"` : ''].filter(Boolean).join(' ');
      const cellPath = cellPaths[ri]?.[cellListIdx] ?? '';
      const text = cell.value != null && String(cell.value).trim()
        ? esc(String(cell.value)).replace(/\n/g, '<br>') : '';
      const imgs = (cell.images ?? []).map(img =>
        `<img src="${img.src}" alt="" class="cell-img">`
      ).join('');
      ci++;
      return `<td${spanAttr ? ' ' + spanAttr : ''}>
          <div class="cell-path">${esc(cellPath)}</div>
          <div class="cell-content">${text}${imgs}</div>
        </td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  return `<table>${rows}</table>`;
}

function renderBlocks(blocks: DocBlock[]): string {
  let tableIdx = 0;
  return blocks.map(block => {
    if (block.type === 'text') {
      const items = block.lines.map((line, i) => `
        <div class="text-item">
          <div class="id-col"><span class="path-tag">${esc(block.paths[i] ?? '')}</span></div>
          <div class="content-col"><p>${esc(line)}</p></div>
        </div>`).join('');
      return `<div class="block text-block">${items}</div>`;
    }

    tableIdx++;
    const imgCount = block.schema.rows.flatMap(r => r.cells).reduce((n, c) => n + (c.images?.length ?? 0), 0);
    return `<div class="block table-block">
      <div class="block-header">
        <span class="table-index">Table ${tableIdx}</span>
        <span class="path-tag">${esc(block.path)}</span>
        ${imgCount > 0 ? `<span class="img-badge">이미지 ${imgCount}개</span>` : ''}
      </div>
      <div class="table-wrap">${renderTableSchema(block)}</div>
    </div>`;
  }).join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const target = 'noori.hwp';
const hwpPath = path.join(fixturesDir, target);
const buf = fs.readFileSync(hwpPath);
const baseName = path.basename(target, '.hwp');

// JSON 원본 저장
const jsonObj = JSON.parse(toJson(buf));
const jsonOutPath = path.join(outDir, `${baseName}.json`);
fs.writeFileSync(jsonOutPath, JSON.stringify(jsonObj, null, 2));

// imageMap
const hwpHtml = toHtml(buf, { includeVersion: true });
fs.writeFileSync(path.join(outDir, `${baseName}-hwpjs.html`), hwpHtml);
const imageMap = buildImageMap(hwpHtml);

// 변환 + 블록 추출
const transformed = transformHwpTablesWithSchema(jsonObj);
const blocks = buildDocumentBlocks(transformed);
injectImages(jsonObj.body_text, blocks, imageMap);

const tableCount = blocks.filter(b => b.type === 'table').length;
const textCount  = blocks.filter(b => b.type === 'text').length;
const imageTotal = blocks
  .filter((b): b is TableBlock => b.type === 'table')
  .reduce((n, b) => n + b.schema.rows.flatMap(r => r.cells).reduce((m, c) => m + (c.images?.length ?? 0), 0), 0);

const absJsonPath = path.resolve(jsonOutPath).replace(/\\/g, '/');
const absHwpPath  = path.resolve(hwpPath).replace(/\\/g, '/');

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${baseName} — HWP Pipeline</title>
<style>
  :root {
    --id-bg: #f0f4ff;
    --id-fg: #3b5bdb;
    --id-border: #c5d0fa;
    --content-bg: #ffffff;
    --block-border: #e2e8f0;
    --table-header-bg: #f8fafc;
  }
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', sans-serif; margin: 0; padding: 24px 32px;
         background: #f1f5f9; color: #1e293b; }

  /* 최상단 파일 정보 */
  .file-info { background: #1e293b; color: #e2e8f0; border-radius: 10px;
               padding: 16px 20px; margin-bottom: 28px; font-size: 12px; }
  .file-info h1 { margin: 0 0 10px; font-size: 18px; color: #f8fafc; }
  .file-row { display: flex; gap: 8px; align-items: baseline; margin: 4px 0; }
  .file-label { color: #94a3b8; min-width: 60px; flex-shrink: 0; }
  .file-path { font-family: monospace; color: #7dd3fc; word-break: break-all; }
  .file-stats { margin-top: 10px; display: flex; gap: 16px; }
  .stat { background: #334155; border-radius: 6px; padding: 4px 10px; font-size: 11px; color: #cbd5e1; }
  .stat strong { color: #f8fafc; }

  /* 블록 공통 */
  .block { margin-bottom: 12px; border-radius: 8px; overflow: hidden;
           border: 1px solid var(--block-border); }

  /* 텍스트 블록 */
  .text-block { background: var(--content-bg); }
  .text-item { display: grid; grid-template-columns: 280px 1fr;
               border-bottom: 1px solid var(--block-border); }
  .text-item:last-child { border-bottom: none; }
  .id-col { background: var(--id-bg); padding: 10px 12px; border-right: 2px solid var(--id-border);
            display: flex; align-items: flex-start; }
  .content-col { padding: 10px 14px; }
  .content-col p { margin: 0; font-size: 13px; line-height: 1.7; }

  /* 테이블 블록 */
  .table-block { background: var(--content-bg); }
  .block-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px;
                  background: var(--table-header-bg); border-bottom: 1px solid var(--block-border); }
  .table-index { background: #3b5bdb; color: white; font-size: 11px; font-weight: bold;
                 padding: 2px 9px; border-radius: 10px; white-space: nowrap; }
  .img-badge { background: #7c3aed; color: white; font-size: 11px;
               padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
  .table-wrap { overflow-x: auto; padding: 12px; }

  /* 테이블 */
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  td { vertical-align: top; padding: 0; border: 1px solid #cbd5e1; }
  .cell-path { background: var(--id-bg); color: var(--id-fg); font-family: monospace;
               font-size: 10px; padding: 3px 6px; border-bottom: 1px solid var(--id-border);
               line-height: 1.4; }
  .cell-content { padding: 6px 8px; font-size: 12px; line-height: 1.6; min-height: 24px; }
  .cell-img { max-width: 100%; display: block; margin-top: 4px; }
  tr:nth-child(even) .cell-content { background: #f8fafc; }

  /* path tag (인라인) */
  .path-tag { font-family: monospace; font-size: 10px; color: var(--id-fg);
              background: var(--id-bg); border: 1px solid var(--id-border);
              padding: 2px 7px; border-radius: 4px; word-break: break-all; }
</style>
</head>
<body>

<div class="file-info">
  <h1>${baseName}.hwp — HWP Pipeline 출력</h1>
  <div class="file-row"><span class="file-label">HWP</span><span class="file-path">${absHwpPath}</span></div>
  <div class="file-row"><span class="file-label">JSON</span><span class="file-path">${absJsonPath}</span></div>
  <div class="file-stats">
    <div class="stat">텍스트 블록 <strong>${textCount}</strong></div>
    <div class="stat">테이블 <strong>${tableCount}</strong></div>
    <div class="stat">이미지 <strong>${imageTotal}</strong></div>
    <div class="stat">imageMap <strong>${imageMap.size}</strong></div>
  </div>
</div>

${renderBlocks(blocks)}

</body>
</html>`;

const outPath = path.join(outDir, `${baseName}-pipeline.html`);
fs.writeFileSync(outPath, html);
console.log(`✓ ${target}`);
console.log(`  텍스트 ${textCount}블록 / 테이블 ${tableCount}개 / 이미지 ${imageTotal}개`);
console.log(`  JSON → ${absJsonPath}`);
console.log(`  HTML → ${path.resolve(outPath).replace(/\\/g, '/')}`);

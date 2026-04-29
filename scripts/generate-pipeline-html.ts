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

type TextBlock  = { type: 'text';  lines: string[] };
type TableBlock = { type: 'table'; schema: TableSchema };
type DocBlock   = TextBlock | TableBlock;

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

// ─── 문서 블록 추출 (단락 순서 유지) ─────────────────────────────────────────

function findAllTableSchemas(obj: unknown, results: TableSchema[] = []): TableSchema[] {
  if (!obj || typeof obj !== 'object') return results;
  if (Array.isArray(obj)) { obj.forEach(v => findAllTableSchemas(v, results)); return results; }
  const rec = obj as Record<string, unknown>;
  if ('tableSchema' in rec) {
    results.push(rec['tableSchema'] as TableSchema);
    return results; // tableSchema 아래에 중첩 테이블은 없으므로 중단
  }
  Object.values(rec).forEach(v => findAllTableSchemas(v, results));
  return results;
}

function extractParaText(para: Record<string, unknown>): string {
  const records = (para['records'] as any[]) ?? [];
  const lines: string[] = [];
  for (const rec of records) {
    if (rec.type === 'para_text' && rec.text) {
      const clean = String(rec.text).replace(/[\x00-\x1F]/g, '').trim();
      if (clean) lines.push(clean);
    }
  }
  return lines.join(' ');
}

function buildDocumentBlocks(transformed: unknown): DocBlock[] {
  const blocks: DocBlock[] = [];

  const body = (transformed as any)?.body_text;
  if (!body) return blocks;

  for (const section of body.sections ?? []) {
    for (const para of section.paragraphs ?? []) {
      const schemas = findAllTableSchemas(para);
      if (schemas.length > 0) {
        for (const schema of schemas) blocks.push({ type: 'table', schema });
        continue;
      }

      // 일반 텍스트 단락
      const text = extractParaText(para);
      if (!text) continue;

      // 직전 블록이 text면 합치기
      const last = blocks[blocks.length - 1];
      if (last?.type === 'text') {
        last.lines.push(text);
      } else {
        blocks.push({ type: 'text', lines: [text] });
      }
    }
  }

  return blocks;
}

// ─── 이미지 주입 (어댑터 코드 불변, 스크립트에서만 처리) ──────────────────────

function injectImages(rawBodyText: unknown, blocks: DocBlock[], imageMap: ImageMap): void {
  if (imageMap.size === 0) return;

  // 원본 JSON에서 table 객체 순서대로 수집
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
        const binId = (r['shape_component_picture'] as any)?.picture_info?.bindata_id;
        if (typeof binId === 'number') ids.push(binId);
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
    let cellIdx = 0;
    for (const row of schema.rows) {
      for (const cell of row.cells) {
        const binIds = findBinIds(cells[cellIdx++]);
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

// ─── 렌더러 ──────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTableSchema(schema: TableSchema): string {
  const hasImages = schema.rows.some(r => r.cells.some(c => c.images && c.images.length > 0));
  if (!hasImages) {
    return tableToHtml(tableSchemaToTable(schema), { pretty: true, autoGenerateId: true });
  }

  // 이미지 있는 경우 TableSchema 직접 렌더링 (tableToHtml은 CellImage 미지원)
  const merges = schema.merges ?? [];
  function isMergedAway(row: number, col: number) {
    return merges.some(m =>
      (row > m.start.row || (row === m.start.row && col > m.start.col)) &&
      row <= m.end.row && col <= m.end.col
    );
  }
  function getSpan(row: number, col: number) {
    const m = merges.find(m => m.start.row === row && m.start.col === col);
    return m
      ? { colspan: m.end.col - m.start.col + 1, rowspan: m.end.row - m.start.row + 1 }
      : { colspan: 1, rowspan: 1 };
  }

  const rows = schema.rows.map((row, ri) => {
    let ci = 0;
    const tds = row.cells.map(cell => {
      while (isMergedAway(ri, ci)) ci++;
      const { colspan, rowspan } = getSpan(ri, ci);
      const span = [colspan > 1 ? `colspan="${colspan}"` : '', rowspan > 1 ? `rowspan="${rowspan}"` : ''].filter(Boolean).join(' ');
      const text = cell.value != null && String(cell.value).trim()
        ? `<span>${escapeHtml(String(cell.value)).replace(/\n/g, '<br>')}</span>` : '';
      const imgs = (cell.images ?? []).map(img =>
        `<img src="${img.src}" alt="" style="max-width:100%;display:block;margin-top:4px">`
      ).join('');
      ci++;
      return `      <td${span ? ' ' + span : ''}>${text}${imgs}</td>`;
    }).join('\n');
    return `    <tr>\n${tds}\n    </tr>`;
  }).join('\n');

  return `  <table>\n${rows}\n  </table>`;
}

function renderBlocks(blocks: DocBlock[]): string {
  let tableIdx = 0;
  return blocks.map(block => {
    if (block.type === 'text') {
      const html = block.lines.map(l => `<p>${escapeHtml(l)}</p>`).join('\n');
      return `<div class="text-block">${html}</div>`;
    }
    tableIdx++;
    const imgCount = block.schema.rows.flatMap(r => r.cells).reduce((n, c) => n + (c.images?.length ?? 0), 0);
    const badge = imgCount > 0 ? `<span class="img-badge">이미지 ${imgCount}개</span>` : '';
    return `<div class="table-block"><div class="table-label">Table ${tableIdx}${badge}</div>${renderTableSchema(block.schema)}</div>`;
  }).join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const targets = ['table.hwp', 'table2.hwp', 'noori.hwp'];

for (const name of targets) {
  const hwpPath = path.join(fixturesDir, name);
  if (!fs.existsSync(hwpPath)) continue;

  const buf = fs.readFileSync(hwpPath);
  const baseName = path.basename(name, '.hwp');

  const hwpHtml = toHtml(buf, { includeVersion: true });
  fs.writeFileSync(path.join(outDir, `${baseName}-hwpjs.html`), hwpHtml);
  const imageMap = buildImageMap(hwpHtml);

  const json = JSON.parse(toJson(buf));
  const transformed = transformHwpTablesWithSchema(json);
  const blocks = buildDocumentBlocks(transformed);
  injectImages(json.body_text, blocks, imageMap);

  const tableCount = blocks.filter(b => b.type === 'table').length;
  const textCount  = blocks.filter(b => b.type === 'text').length;
  const imageTotal = blocks
    .filter((b): b is TableBlock => b.type === 'table')
    .reduce((n, b) => n + b.schema.rows.flatMap(r => r.cells).reduce((m, c) => m + (c.images?.length ?? 0), 0), 0);

  const pipelineHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${baseName} — HWP Pipeline</title>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; padding: 24px; max-width: 960px; margin: 0 auto; background: #f5f5f5; }
  h1 { color: #1a1a2e; margin-bottom: 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 32px; }
  .text-block { background: white; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px;
                box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .text-block p { margin: 4px 0; font-size: 14px; line-height: 1.7; color: #333; }
  .table-block { background: white; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px;
                 box-shadow: 0 1px 3px rgba(0,0,0,.08); position: relative; }
  .table-label { font-size: 12px; font-weight: bold; color: #555; margin-bottom: 8px;
                 display: flex; align-items: center; gap: 8px; }
  .img-badge { background: #4f46e5; color: white; font-size: 11px;
               padding: 2px 8px; border-radius: 10px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  td, th { border: 1px solid #ccc; padding: 6px 10px; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  img { max-width: 100%; }
</style>
</head>
<body>
<h1>${baseName}.hwp</h1>
<p class="meta">
  블록: 텍스트 <strong>${textCount}개</strong> / 테이블 <strong>${tableCount}개</strong> / 이미지 <strong>${imageTotal}개</strong>
</p>
${renderBlocks(blocks)}
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, `${baseName}-pipeline.html`), pipelineHtml);
  console.log(`✓ ${name}: 텍스트 ${textCount}블록, 테이블 ${tableCount}개, 이미지 ${imageTotal}개`);
}

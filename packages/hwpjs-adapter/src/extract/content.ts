import { transformHwpTablesWithSchema, type TableSchema, type ImageMap } from '../table-schema.js';
import type { DocRecord, TableRecord, TableRowRecord, TableCellRecord, MergeRange } from './types.js';

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

function extractParaText(para: Record<string, unknown>): string {
  return ((para['records'] as any[]) ?? [])
    .filter(r => r.type === 'para_text' && r.text)
    .map(r => String(r.text).replace(/[\x00-\x1F]/g, '').trim())
    .filter(Boolean)
    .join(' ');
}

function findAllTableSchemas(
  obj: unknown,
  basePath: string,
  out: Array<{ schema: TableSchema; path: string }> = [],
): Array<{ schema: TableSchema; path: string }> {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findAllTableSchemas(v, `${basePath}[${i}]`, out));
    return out;
  }
  const rec = obj as Record<string, unknown>;
  if ('tableSchema' in rec) {
    out.push({ schema: rec['tableSchema'] as TableSchema, path: `${basePath}.tableSchema` });
    return out;
  }
  for (const [k, v] of Object.entries(rec)) findAllTableSchemas(v, `${basePath}.${k}`, out);
  return out;
}

function schemaToTableRecord(
  schema: TableSchema,
  schemaPath: string,
): TableRecord {
  const merges = (schema.merges ?? []) as MergeRange[];

  const rows: TableRowRecord[] = schema.rows.map((row, ri) => {
    const cells: TableCellRecord[] = row.cells.map((cell, ci) => ({
      path: `${schemaPath}.rows[${ri}].cells[${ci}]`,
      content: cell.value != null ? String(cell.value).replace(/[\x00-\x1F]/g, '').trim() : '',
      ...(cell.images && cell.images.length > 0
        ? { images: cell.images.map(img => ({ id: img.id, src: img.src, format: img.format })) }
        : {}),
    }));
    return { cells };
  });

  return {
    row_count: schema.rows.length,
    col_count: schema.rows[0]?.cells.length ?? 0,
    ...(merges.length > 0 ? { merges } : {}),
    rows,
  };
}

// ─── 이미지 주입 (hwpjs toHtml 출력 기반) ────────────────────────────────────

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

function injectImages(
  rawBodyText: unknown,
  tableRecords: TableRecord[],
  imageMap: ImageMap,
): void {
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

  for (let ti = 0; ti < Math.min(rawTables.length, tableRecords.length); ti++) {
    const rawCells = ((rawTables[ti] as any)?.cells ?? []) as unknown[];
    let ci = 0;
    for (const row of tableRecords[ti].rows) {
      for (const cell of row.cells) {
        const binIds = findBinIds(rawCells[ci++]);
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

// ─── 공개 API ─────────────────────────────────────────────────────────────────

export function extractContent(
  hwpJson: unknown,
  rawBodyText: unknown,
  imageMap: ImageMap,
): DocRecord[] {
  const records: DocRecord[] = [];
  const body = (hwpJson as any)?.body_text;
  if (!body) return records;

  const transformed = transformHwpTablesWithSchema(body);

  // 테이블 records 미리 수집 (이미지 주입용)
  const allTableRecords: TableRecord[] = [];

  for (const [si, section] of (transformed.sections ?? []).entries()) {
    for (const [pi, para] of (section.paragraphs ?? []).entries()) {
      const paraPath = `body_text.sections[${si}].paragraphs[${pi}]`;
      const found = findAllTableSchemas(para, paraPath);

      if (found.length > 0) {
        for (const { schema, path: tablePath } of found) {
          const table = schemaToTableRecord(schema, tablePath);
          allTableRecords.push(table);
          records.push({ path: tablePath, kind: 'table', table });
        }
        continue;
      }

      const content = extractParaText(para as any);
      if (content) records.push({ path: paraPath, kind: 'text', content });
    }
  }

  injectImages(rawBodyText, allTableRecords, imageMap);
  return records;
}

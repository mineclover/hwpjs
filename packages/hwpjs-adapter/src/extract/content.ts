import { transformHwpTablesWithSchema, type TableSchema, type ImageMap } from '../table-schema.js';
import type { DocRecord, TableRecord, TableRowRecord, TableCellRecord, MergeRange } from './types.js';

// ─── 텍스트 추출 헬퍼 ─────────────────────────────────────────────────────────

function runsToText(para: any): string {
  return ((para?.records ?? []) as any[])
    .filter((r: any) => r.type === 'para_text')
    .flatMap((r: any) => r.runs ?? [])
    .filter((r: any) => r.kind === 'text')
    .map((r: any) => String(r.text ?? '').replace(/[\x00-\x1F]/g, '').trim())
    .filter(Boolean)
    .join('');
}

function extractParaText(para: any): string {
  // runs 방식 우선, 없으면 .text 필드
  const fromRuns = runsToText(para);
  if (fromRuns) return fromRuns;
  return ((para?.records ?? []) as any[])
    .filter((r: any) => r.type === 'para_text' && r.text)
    .map((r: any) => String(r.text).replace(/[\x00-\x1F]/g, '').trim())
    .filter(Boolean)
    .join(' ');
}

// ─── ctrl_header(tbl).paragraphs → 셀 텍스트 매핑 ────────────────────────────
// ktech 강의계획서 HWP는 셀 paragraphs가 비어있고
// ctrl_header(tbl).paragraphs[]에 전체 텍스트가 플랫하게 저장됨

function getFlatTextsFromTblCtrl(rawPara: any): string[] {
  const texts: string[] = [];
  for (const rec of rawPara?.records ?? []) {
    if (rec.type === 'ctrl_header' && rec.ctrl_id?.trim() === 'tbl') {
      for (const p of rec.paragraphs ?? []) {
        const t = runsToText(p) ||
          ((p.records ?? []).filter((r: any) => r.type === 'para_text' && r.text)
            .map((r: any) => String(r.text).replace(/[\x00-\x1F]/g, '').trim())
            .filter(Boolean).join(' '));
        texts.push(t); // 빈 것도 포함 (위치 보존)
      }
    }
  }
  return texts;
}

// 모든 셀이 비어있는지 확인
function allCellsEmpty(schema: TableSchema): boolean {
  return schema.rows.every(row =>
    row.cells.every(cell => !cell.value || String(cell.value).trim() === '')
  );
}

// 플랫 텍스트를 셀에 순서대로 채우기
// 셀 순서: 병합 제외하고 실제로 존재하는 셀 (row-major)
function fillCellsFromFlat(schema: TableSchema, flatTexts: string[]): void {
  const merges = schema.merges ?? [];

  function isMergedAway(row: number, col: number): boolean {
    return merges.some(m =>
      (row > m.start.row || (row === m.start.row && col > m.start.col)) &&
      row <= m.end.row && col <= m.end.col
    );
  }

  // 실제 셀 목록 (merged-away 제외, 행/열 위치 포함)
  const realCells: Array<{ cell: (typeof schema.rows)[0]['cells'][0]; ri: number; ci: number }> = [];
  for (let ri = 0; ri < schema.rows.length; ri++) {
    let ci = 0;
    for (const cell of schema.rows[ri].cells) {
      while (isMergedAway(ri, ci)) ci++;
      realCells.push({ cell, ri, ci });
      ci++;
    }
  }

  // 비어있지 않은 플랫 텍스트만 사용
  const nonEmpty = flatTexts.filter(t => t.trim());

  if (nonEmpty.length === 0) return;

  // 1:1 매핑 (셀 수 ≥ 텍스트 수인 경우)
  for (let i = 0; i < Math.min(realCells.length, nonEmpty.length); i++) {
    realCells[i].cell.value = nonEmpty[i];
  }
}

// ─── TableSchema → TableRecord ───────────────────────────────────────────────

function schemaToTableRecord(schema: TableSchema, schemaPath: string): TableRecord {
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

// ─── tableSchema 탐색 ────────────────────────────────────────────────────────

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

// ─── 이미지 주입 ──────────────────────────────────────────────────────────────

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

function injectImages(rawBodyText: unknown, tableRecords: TableRecord[], imageMap: ImageMap): void {
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
            .map(id => { const img = imageMap.get(id)!; return { id: `img-${id}`, src: img.dataUrl, format: img.format }; });
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
  const rawSections = (rawBodyText as any)?.sections ?? [];
  const allTableRecords: TableRecord[] = [];

  for (const [si, section] of (transformed.sections ?? []).entries()) {
    const rawParas = rawSections[si]?.paragraphs ?? [];

    for (const [pi, para] of (section.paragraphs ?? []).entries()) {
      const paraPath = `body_text.sections[${si}].paragraphs[${pi}]`;
      const found = findAllTableSchemas(para, paraPath);

      if (found.length > 0) {
        // 원본 단락에서 플랫 텍스트 추출 (ktech 스타일 대응)
        const rawPara = rawParas[pi];
        const flatTexts = getFlatTextsFromTblCtrl(rawPara);

        for (const { schema, path: tablePath } of found) {
          // 셀이 비어있으면 플랫 텍스트로 채움
          if (allCellsEmpty(schema) && flatTexts.length > 0) {
            fillCellsFromFlat(schema, flatTexts);
          }
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

/**
 * JSON 트리 탐색 유틸리티
 *
 * HWP JSON 내부의 테이블 관련 구조를 찾는 공통 함수들.
 * table-schema.ts, content.ts, style.ts 의 중복 구현을 제거한다.
 */

import type { TableSchema } from '../table-schema.js';

// ─── tableSchema 노드 수집 ────────────────────────────────────────────────────

/**
 * 객체 트리를 재귀 탐색하여 tableSchema 키를 가진 모든 노드를 수집한다.
 *
 * @param obj      - 탐색할 루트 객체
 * @param basePath - JSON 경로 접두사 (결과의 path 필드에 사용)
 * @param out      - 결과를 누적할 배열 (내부 재귀용)
 */
export function collectAllTableSchemas(
  obj: unknown,
  basePath = '',
  out: Array<{ schema: TableSchema; path: string }> = [],
): Array<{ schema: TableSchema; path: string }> {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectAllTableSchemas(v, `${basePath}[${i}]`, out));
    return out;
  }
  const rec = obj as Record<string, unknown>;
  if ('tableSchema' in rec) {
    out.push({ schema: rec['tableSchema'] as TableSchema, path: `${basePath}.tableSchema` });
    return out;
  }
  for (const [k, v] of Object.entries(rec)) {
    collectAllTableSchemas(v, basePath ? `${basePath}.${k}` : k, out);
  }
  return out;
}

/**
 * 객체 트리에서 tableSchema 값만 순서대로 반환한다 (path 없이).
 */
export function collectTableSchemas(obj: unknown): TableSchema[] {
  return collectAllTableSchemas(obj).map(e => e.schema);
}

// ─── raw table 노드 수집 ─────────────────────────────────────────────────────

/**
 * 객체 트리를 재귀 탐색하여 `table` 키를 가진 노드의 값을 수집한다.
 * HWP raw JSON에서 테이블 셀 스타일 정보를 읽을 때 사용한다.
 */
export function collectRawTables(obj: unknown, out: unknown[] = []): unknown[] {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { obj.forEach(v => collectRawTables(v, out)); return out; }
  const rec = obj as Record<string, unknown>;
  if ('table' in rec) { out.push(rec['table']); return out; }
  Object.values(rec).forEach(v => collectRawTables(v, out));
  return out;
}

// ─── bindata ID 수집 ──────────────────────────────────────────────────────────

/**
 * 객체 트리에서 shape_component_picture 노드의 bindata_id를 수집한다.
 */
export function collectBinIds(obj: unknown, out: number[] = []): number[] {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { obj.forEach(v => collectBinIds(v, out)); return out; }
  const rec = obj as Record<string, unknown>;
  if (rec['type'] === 'shape_component_picture') {
    const id = (rec['shape_component_picture'] as any)?.picture_info?.bindata_id;
    if (typeof id === 'number') out.push(id);
  }
  Object.values(rec).forEach(v => collectBinIds(v, out));
  return out;
}

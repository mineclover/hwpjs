/**
 * 테이블 수집기
 *
 * TableTypeSchema[]의 collect_pattern을 기준으로 TableSchema[] 전체를 스캔하여
 * 조건에 맞는 테이블을 CollectedTable[]로 반환합니다.
 * 각 결과에는 어떤 패턴으로 매칭됐는지 MatchInfo가 포함됩니다.
 */

import type { TableSchema } from '../table-schema.js';
import { tableSchemaToTable } from '../to-table.js';
import type {
  CollectPattern,
  TableTypeSchema,
  CollectedTable,
  MatchInfo,
  HeaderContainsPattern,
  CaptionContainsPattern,
  CellMatchesPattern,
  SizePattern,
} from './types.js';

// ============================================================================
// 패턴별 매칭 로직
// ============================================================================

interface MatchResult {
  matched: boolean;
  info?: MatchInfo;
}

function matchHeaderContains(
  schema: TableSchema,
  pattern: HeaderContainsPattern,
): MatchResult {
  const rows = pattern.row !== undefined
    ? [schema.rows[pattern.row]].filter(Boolean)
    : schema.rows;

  for (let ri = 0; ri < rows.length; ri++) {
    const actualRow = pattern.row !== undefined ? pattern.row : ri;
    const row = rows[ri];
    for (let ci = 0; ci < row.cells.length; ci++) {
      const val = String(row.cells[ci].value ?? '').trim();
      if (val.includes(pattern.text)) {
        return {
          matched: true,
          info: {
            pattern_type: 'header_contains',
            matched_text: val,
            location: { row: actualRow, col: ci },
          },
        };
      }
    }
  }
  return { matched: false };
}

function matchCaptionContains(
  schema: TableSchema,
  pattern: CaptionContainsPattern,
): MatchResult {
  const caption = schema.caption ?? '';
  if (caption.includes(pattern.text)) {
    return {
      matched: true,
      info: { pattern_type: 'caption_contains', matched_text: caption },
    };
  }
  return { matched: false };
}

function matchCellMatches(
  schema: TableSchema,
  pattern: CellMatchesPattern,
): MatchResult {
  const row = schema.rows[pattern.row];
  if (!row) return { matched: false };
  const cell = row.cells[pattern.col];
  if (!cell) return { matched: false };

  const val = String(cell.value ?? '').trim();
  const re = new RegExp(pattern.pattern);
  if (re.test(val)) {
    return {
      matched: true,
      info: {
        pattern_type: 'cell_matches',
        matched_text: val,
        location: { row: pattern.row, col: pattern.col },
      },
    };
  }
  return { matched: false };
}

function matchSize(schema: TableSchema, pattern: SizePattern): MatchResult {
  const rows = schema.rows.length;
  const cols = schema.rows[0]?.cells.length ?? 0;
  const ok =
    (pattern.min_rows === undefined || rows >= pattern.min_rows) &&
    (pattern.min_cols === undefined || cols >= pattern.min_cols);
  return ok
    ? { matched: true, info: { pattern_type: 'size' } }
    : { matched: false };
}

function matchPattern(schema: TableSchema, pattern: CollectPattern): MatchResult {
  switch (pattern.type) {
    case 'header_contains':
      return matchHeaderContains(schema, pattern as HeaderContainsPattern);
    case 'caption_contains':
      return matchCaptionContains(schema, pattern as CaptionContainsPattern);
    case 'cell_matches':
      return matchCellMatches(schema, pattern as CellMatchesPattern);
    case 'size':
      return matchSize(schema, pattern as SizePattern);
    case 'and': {
      let lastInfo: MatchInfo | undefined;
      for (const sub of pattern.patterns) {
        const r = matchPattern(schema, sub);
        if (!r.matched) return { matched: false };
        lastInfo = r.info;
      }
      return { matched: true, info: lastInfo };
    }
    case 'or': {
      for (const sub of pattern.patterns) {
        const r = matchPattern(schema, sub);
        if (r.matched) return r;
      }
      return { matched: false };
    }
    default:
      return { matched: false };
  }
}

// ============================================================================
// 공개 API
// ============================================================================

export interface CollectOptions {
  /**
   * true: 하나의 테이블이 여러 유형에 중복 매칭될 수 있음 (기본: false)
   * false: 먼저 매칭된 유형에만 귀속, 이후 유형 탐색에서 제외
   */
  allow_multi_match?: boolean;
}

/**
 * 정의된 테이블 유형들과 TableSchema 배열을 대조하여
 * 조건에 맞는 테이블을 수집합니다.
 *
 * @param schemas   - HWP에서 추출된 TableSchema 전체 배열
 * @param types     - 수집 대상 테이블 유형 정의 배열
 * @param options   - 수집 옵션
 */
export function collectTables(
  schemas: TableSchema[],
  types: TableTypeSchema[],
  options: CollectOptions = {},
): CollectedTable[] {
  const { allow_multi_match = false } = options;
  const results: CollectedTable[] = [];
  const usedIndices = new Set<number>();

  for (const tableType of types) {
    for (let ti = 0; ti < schemas.length; ti++) {
      if (!allow_multi_match && usedIndices.has(ti)) continue;

      const schema = schemas[ti];
      const { matched, info } = matchPattern(schema, tableType.collect_pattern);

      if (matched && info) {
        const captured = schema; // closure용 캡처
        results.push({
          table_type: tableType.name,
          match_info: info,
          table_index: ti,
          schema: captured,
          toTable() {
            return tableSchemaToTable(captured);
          },
        });
        if (!allow_multi_match) usedIndices.add(ti);
      }
    }
  }

  return results;
}

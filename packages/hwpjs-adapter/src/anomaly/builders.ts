/**
 * Anomaly 빌더 — AnomalyRule / Condition 팩토리
 *
 * Raw 객체 리터럴 대신 타입 안전한 팩토리 함수를 제공한다.
 *
 * @example
 * ```ts
 * import { cond, rule } from '@ohah/hwpjs-adapter/anomaly';
 *
 * const rules = [
 *   rule('R01', 'ERROR',
 *     cond.exists('instructor_name'),
 *     '강사 이름이 누락되었습니다.',
 *   ),
 *   rule('R02', 'WARN',
 *     cond.and(
 *       cond.exists('weekly_plan'),
 *       cond.count('weekly_plan', 'gte', 8),
 *     ),
 *     '주차별 계획이 8주 미만입니다.',
 *   ),
 * ];
 * ```
 */

import type {
  Severity,
  CompareOp,
  Quantifier,
  AggFn,
  Condition,
  ExistsCondition,
  CountCondition,
  ArrayMatchCondition,
  ValueMatchCondition,
  AggregateCondition,
  AndCondition,
  OrCondition,
  WhereClause,
  AnomalyRule,
  FieldDef,
  FieldType,
  ExtractorStrategy,
  AnchorConfig,
} from './types.js';

// ─── Condition 빌더 ──────────────────────────────────────────────────────────

export const cond = {
  /** 필드 존재 여부 조건 */
  exists(field: string, expected = true): ExistsCondition {
    return { type: 'exists', field, expected };
  },

  /** 필드 카운트 비교 조건 */
  count(field: string, op: CompareOp, value: number | [number, number]): CountCondition {
    return { type: 'count', field, op, value };
  },

  /** 배열 항목 매칭 조건 */
  arrayMatch(
    field: string,
    quantifier: Quantifier,
    where: WhereClause,
  ): ArrayMatchCondition {
    return { type: 'array_match', field, quantifier, where };
  },

  /** 필드 값 비교 조건 */
  valueMatch(
    field: string,
    op: CompareOp,
    value?: unknown,
    patternStr?: string,
  ): ValueMatchCondition {
    return { type: 'value_match', field, op, value, pattern: patternStr };
  },

  /** 집계 함수 비교 조건 */
  aggregate(field: string, fn: AggFn, op: CompareOp, value: number): AggregateCondition {
    return { type: 'aggregate', field, fn, op, value };
  },

  /** 모든 하위 조건을 동시에 만족 */
  and(...conditions: Condition[]): AndCondition {
    return { type: 'and', conditions };
  },

  /** 하위 조건 중 하나 이상을 만족 */
  or(...conditions: Condition[]): OrCondition {
    return { type: 'or', conditions };
  },
} as const;

// ─── AnomalyRule 빌더 ────────────────────────────────────────────────────────

/**
 * AnomalyRule을 생성한다.
 */
export function rule(
  rule_id: string,
  severity: Severity,
  condition: Condition,
  message: string,
): AnomalyRule {
  return { rule_id, severity, condition, message };
}

// ─── FieldDef 빌더 ───────────────────────────────────────────────────────────

export interface FieldDefOptions {
  label?: string;
  required?: boolean;
  options?: string[];
  min_count?: number;
  min_rows?: number;
  anchor?: string;
  anchors?: string[];
  anchors_config?: AnchorConfig[];
  item_header_pattern?: string;
  pattern?: string;
  table_index?: number;
}

function makeFieldDef(
  id: string,
  type: FieldType,
  strategy: ExtractorStrategy,
  opts: FieldDefOptions = {},
): FieldDef {
  const {
    label = id,
    required,
    options,
    min_count,
    min_rows,
    anchor,
    anchors,
    anchors_config,
    item_header_pattern,
    pattern,
    table_index,
  } = opts;

  const extractor: FieldDef['extractor'] = { strategy };
  if (anchor)             extractor.anchor = anchor;
  if (anchors)            extractor.anchors = anchors;
  if (anchors_config)     extractor.anchors_config = anchors_config;
  if (min_rows)           extractor.min_rows = min_rows;
  if (item_header_pattern) extractor.item_header_pattern = item_header_pattern;
  if (pattern)            extractor.pattern = pattern;
  if (table_index !== undefined) extractor.table_index = table_index;

  const def: FieldDef = { id, label, type, extractor };
  if (required !== undefined) def.required = required;
  if (options)    def.options = options;
  if (min_count !== undefined) def.min_count = min_count;
  return def;
}

export const field = {
  /** row_contains_label 전략으로 텍스트 필드 정의 */
  text(id: string, anchor: string, opts: Omit<FieldDefOptions, 'anchor'> = {}): FieldDef {
    return makeFieldDef(id, 'text', 'row_contains_label', { ...opts, anchor });
  },

  /** rows_after_header 전략으로 테이블 행 필드 정의 */
  tableRows(id: string, anchors: string | string[], opts: FieldDefOptions = {}): FieldDef {
    const a = Array.isArray(anchors) ? { anchors } : { anchor: anchors };
    return makeFieldDef(id, 'table_rows', 'rows_after_header', { ...opts, ...a });
  },

  /** row_contains_label 전략으로 체크박스 클러스터 필드 정의 */
  checkbox(id: string, anchor: string, options: string[], opts: FieldDefOptions = {}): FieldDef {
    return makeFieldDef(id, 'checkbox_cluster', 'row_contains_label', { ...opts, anchor, options });
  },

  /** row_contains_label 전략으로 숫자 집합 필드 정의 */
  numberSet(id: string, anchor: string, opts: FieldDefOptions = {}): FieldDef {
    return makeFieldDef(id, 'number_set', 'row_contains_label', { ...opts, anchor });
  },

  /** cell_value_match 전략으로 필드 정의 */
  cellMatch(id: string, pattern: string, opts: FieldDefOptions = {}): FieldDef {
    return makeFieldDef(id, 'text', 'cell_value_match', { ...opts, pattern });
  },
} as const;

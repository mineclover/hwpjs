/**
 * Anomaly Detection Framework — Rule Evaluator
 *
 * AnomalyRule 배열과 추출된 필드 맵을 받아 위반된 규칙(AnomalyHit[])을 반환합니다.
 */

import type {
  AnomalyRule,
  Condition,
  ExistsCondition,
  CountCondition,
  ArrayMatchCondition,
  ValueMatchCondition,
  AggregateCondition,
  AndCondition,
  OrCondition,
  CompareOp,
  WhereClause,
  ExtractedField,
  ExtractedCheckboxCluster,
  ExtractedTableRows,
  ExtractedNumberSet,
  ExtractedText,
  AnomalyHit,
  FieldLocation,
} from './types';

// ============================================================================
// Comparison Utilities
// ============================================================================

function compareNum(actual: number, op: CompareOp, value: number | [number, number]): boolean {
  if (op === 'between') {
    const [min, max] = value as [number, number];
    return actual >= min && actual <= max;
  }
  const v = value as number;
  switch (op) {
    case 'eq':
      return actual === v;
    case 'neq':
      return actual !== v;
    case 'lt':
      return actual < v;
    case 'lte':
      return actual <= v;
    case 'gt':
      return actual > v;
    case 'gte':
      return actual >= v;
    default:
      return false;
  }
}

function compareAny(actual: unknown, op: CompareOp, value: unknown, pattern?: string): boolean {
  if (op === 'matches') {
    const p = pattern ?? (typeof value === 'string' ? value : '');
    return typeof actual === 'string' && new RegExp(p).test(actual);
  }
  if (typeof actual === 'number' && typeof value === 'number') {
    return compareNum(actual, op, value);
  }
  if (op === 'eq') return actual === value;
  if (op === 'neq') return actual !== value;
  return false;
}

// ============================================================================
// Field Path Resolution
// ============================================================================

/**
 * 점 표기 경로로 ExtractedField 내 배열을 꺼냅니다.
 * e.g. "teaching_method.options" → options 배열
 */
function resolveSubArray(field: ExtractedField, subPath: string): unknown[] {
  if (!field.found) return [];

  switch (subPath) {
    case 'options':
      return (field as ExtractedCheckboxCluster).options ?? [];
    case 'rows':
      return (field as ExtractedTableRows).rows ?? [];
    case 'values':
      return (field as ExtractedNumberSet).values?.map((v) => ({ value: v })) ?? [];
    default:
      return [];
  }
}

/** 항목에서 prop 값을 꺼냅니다 */
function getProp(item: unknown, prop: string): unknown {
  if (typeof item === 'object' && item !== null) {
    return (item as Record<string, unknown>)[prop];
  }
  return item;
}

function matchWhere(item: unknown, where: WhereClause): boolean {
  const actual = getProp(item, where.prop);
  return compareAny(actual, where.op, where.value);
}

// ============================================================================
// Per-condition Evaluators
// ============================================================================

interface EvalResult {
  triggered: boolean;
  detail?: string;
}

function evalExists(c: ExistsCondition, fields: Record<string, ExtractedField>): EvalResult {
  const field = fields[c.field];
  const found = field?.found === true;
  // triggered when actual state differs from expected (normal) state
  const triggered = found !== c.expected;
  return { triggered, detail: `found=${found}, expected=${c.expected}` };
}

function evalCount(c: CountCondition, fields: Record<string, ExtractedField>): EvalResult {
  const field = fields[c.field];
  if (!field?.found) {
    return { triggered: true, detail: 'field not found' };
  }
  const actual = (field as ExtractedTableRows).count ?? 0;
  const triggered = compareNum(actual, c.op, c.value);
  return { triggered, detail: `count=${actual}` };
}

function evalArrayMatch(
  c: ArrayMatchCondition,
  fields: Record<string, ExtractedField>
): EvalResult {
  const dotIdx = c.field.indexOf('.');
  const fieldId = dotIdx >= 0 ? c.field.slice(0, dotIdx) : c.field;
  const subPath = dotIdx >= 0 ? c.field.slice(dotIdx + 1) : 'options';

  const field = fields[fieldId];
  if (!field?.found) {
    return { triggered: true, detail: 'field not found' };
  }

  const arr = resolveSubArray(field, subPath);
  let triggered: boolean;

  switch (c.quantifier) {
    case 'none':
      // anomaly when none of the items satisfy the condition
      triggered = arr.length > 0 && arr.every((item) => !matchWhere(item, c.where));
      break;
    case 'any':
      // anomaly when any item satisfies the condition
      triggered = arr.some((item) => matchWhere(item, c.where));
      break;
    case 'all':
      // anomaly when all items satisfy the condition
      triggered = arr.length > 0 && arr.every((item) => matchWhere(item, c.where));
      break;
    default:
      triggered = false;
  }

  return { triggered, detail: `array.length=${arr.length}` };
}

function evalValueMatch(
  c: ValueMatchCondition,
  fields: Record<string, ExtractedField>
): EvalResult {
  const field = fields[c.field];
  if (!field?.found) {
    return { triggered: true, detail: 'field not found' };
  }
  const actual = (field as ExtractedText).value ?? '';
  const triggered = compareAny(actual, c.op, c.value, c.pattern);
  return { triggered, detail: `value=${JSON.stringify(actual)}` };
}

function evalAggregate(c: AggregateCondition, fields: Record<string, ExtractedField>): EvalResult {
  const field = fields[c.field];
  if (!field?.found) {
    return { triggered: true, detail: 'field not found' };
  }

  const values = (field as ExtractedNumberSet).values ?? [];
  let agg: number;

  switch (c.fn) {
    case 'sum':
      agg = values.reduce((a, b) => a + b, 0);
      break;
    case 'min':
      agg = values.length ? Math.min(...values) : 0;
      break;
    case 'max':
      agg = values.length ? Math.max(...values) : 0;
      break;
    case 'avg':
      agg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      break;
    case 'count':
      agg = values.length;
      break;
    default:
      agg = 0;
  }

  const triggered = compareNum(agg, c.op, c.value);
  return { triggered, detail: `${c.fn}=${agg}` };
}

function evalCondition(condition: Condition, fields: Record<string, ExtractedField>): EvalResult {
  switch (condition.type) {
    case 'exists':
      return evalExists(condition as ExistsCondition, fields);
    case 'count':
      return evalCount(condition as CountCondition, fields);
    case 'array_match':
      return evalArrayMatch(condition as ArrayMatchCondition, fields);
    case 'value_match':
      return evalValueMatch(condition as ValueMatchCondition, fields);
    case 'aggregate':
      return evalAggregate(condition as AggregateCondition, fields);
    case 'and': {
      const results = (condition as AndCondition).conditions.map((c) => evalCondition(c, fields));
      return { triggered: results.every((r) => r.triggered) };
    }
    case 'or': {
      const results = (condition as OrCondition).conditions.map((c) => evalCondition(c, fields));
      return { triggered: results.some((r) => r.triggered) };
    }
    default:
      return { triggered: false };
  }
}

// ============================================================================
// Location Helper
// ============================================================================

function getFieldId(condition: Condition): string | null {
  if ('field' in condition) {
    const f = (condition as { field: string }).field;
    return f.includes('.') ? f.split('.')[0] : f;
  }
  return null;
}

function resolveLocation(
  condition: Condition,
  fields: Record<string, ExtractedField>
): FieldLocation | undefined {
  const fieldId = getFieldId(condition);
  if (!fieldId) return undefined;
  const f = fields[fieldId];
  if (f?.found) return (f as { location?: FieldLocation }).location;
  return undefined;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * AnomalyRule 배열을 평가하여 위반된 규칙을 반환합니다.
 */
export function evaluateRules(
  rules: AnomalyRule[],
  fields: Record<string, ExtractedField>
): AnomalyHit[] {
  const hits: AnomalyHit[] = [];

  for (const rule of rules) {
    const { triggered, detail } = evalCondition(rule.condition, fields);
    if (!triggered) continue;

    const hit: AnomalyHit = {
      rule_id: rule.rule_id,
      severity: rule.severity,
      message: rule.message,
    };

    const loc = resolveLocation(rule.condition, fields);
    if (loc) hit.location = loc;
    if (detail) hit.detail = detail;

    hits.push(hit);
  }

  return hits;
}

import { describe, it, expect } from 'bun:test';
import { extractField, extractAllFields } from '../src/anomaly/extractor';
import { evaluateRules } from '../src/anomaly/evaluator';
import { cond, rule, field as fieldBuilder } from '../src/anomaly/builders';
import { pattern } from '../src/collection/builders';
import type { TableSchema } from '../src/table-schema';
import type { ExtractedField, ExtractedTableRows, ExtractedCheckboxCluster, ExtractedNumberSet, ExtractedText } from '../src/anomaly/types';

// ─── 테스트용 TableSchema 빌더 ────────────────────────────────────────────────

function makeSchema(cells: Array<Array<string | null>>, caption?: string): TableSchema {
  return {
    caption,
    rows: cells.map(row => ({ cells: row.map(v => ({ value: v })) })),
  };
}

// ─── extractField ─────────────────────────────────────────────────────────────

describe('extractField — row_contains_label (text)', () => {
  const table = makeSchema([
    ['강사명', '홍길동'],
    ['소속', '한국대학교'],
    ['이메일', 'test@test.com'],
  ]);

  it('anchor 행 발견 시 text 추출', () => {
    const def = fieldBuilder.text('name', '강사명');
    const result = extractField(def, [table]) as ExtractedText;
    expect(result.found).toBe(true);
    expect(result.value).toContain('홍길동');
  });

  it('anchor 없으면 found=false', () => {
    const def = fieldBuilder.text('phone', '연락처');
    const result = extractField(def, [table]);
    expect(result.found).toBe(false);
  });

  it('여러 테이블 중에서 탐색', () => {
    const t2 = makeSchema([['연락처', '010-1234-5678']]);
    const def = fieldBuilder.text('phone', '연락처');
    const result = extractField(def, [table, t2]) as ExtractedText;
    expect(result.found).toBe(true);
    expect(result.value).toContain('010-1234-5678');
  });

  it('location에 table_index 포함', () => {
    const t2 = makeSchema([['연락처', '010-0000-0000']]);
    const def = fieldBuilder.text('phone', '연락처');
    const result = extractField(def, [table, t2]) as ExtractedText;
    expect(result.found).toBe(true);
    expect(result.location?.table_index).toBe(1);
  });
});

describe('extractField — rows_after_header (table_rows)', () => {
  const table = makeSchema([
    ['회차', '주요내용', '시간'],
    ['1',    '이론 설명', '2h'],
    ['2',    '실습',     '3h'],
    ['3',    '복습',     '1h'],
  ]);

  it('헤더 이후 행 수집', () => {
    const def = fieldBuilder.tableRows('weekly', '회차');
    const result = extractField(def, [table]) as ExtractedTableRows;
    expect(result.found).toBe(true);
    expect(result.rows.length).toBe(3);
    expect(result.rows[0][0]).toBe('1');
  });

  it('min_rows 미충족 시 found=false', () => {
    const def = fieldBuilder.tableRows('weekly', '회차', { min_rows: 10 });
    const result = extractField(def, [table]);
    expect(result.found).toBe(false);
  });

  it('복수 anchor 중 충족하는 것 사용', () => {
    const def = fieldBuilder.tableRows('weekly', ['없는헤더', '회차']);
    const result = extractField(def, [table]) as ExtractedTableRows;
    expect(result.found).toBe(true);
    expect(result.count).toBe(3);
  });

  it('count 필드 정확', () => {
    const def = fieldBuilder.tableRows('weekly', '회차');
    const result = extractField(def, [table]) as ExtractedTableRows;
    expect(result.count).toBe(3);
  });
});

describe('extractField — row_contains_label (checkbox_cluster)', () => {
  const table = makeSchema([
    ['수업방법', '☑이론 □실습 □현장실습'],
  ]);

  it('체크된 항목 parsing', () => {
    const def = fieldBuilder.checkbox('method', '수업방법', ['이론', '실습', '현장실습']);
    const result = extractField(def, [table]) as ExtractedCheckboxCluster;
    expect(result.found).toBe(true);
    const checked = result.options.filter(o => o.checked);
    expect(checked.some(o => o.option === '이론')).toBe(true);
  });

  it('format 필드 존재', () => {
    const def = fieldBuilder.checkbox('method', '수업방법', ['이론', '실습', '현장실습']);
    const result = extractField(def, [table]) as ExtractedCheckboxCluster;
    expect(result.found).toBe(true);
    for (const opt of result.options) {
      expect(['checkmark', 'unchecked', 'text-only', 'bare-uncheck']).toContain(opt.format);
    }
  });
});

describe('extractField — row_contains_label (number_set)', () => {
  const table = makeSchema([
    ['총 시간', '30 60 90'],
  ]);

  it('숫자 추출', () => {
    const def = fieldBuilder.numberSet('hours', '총 시간');
    const result = extractField(def, [table]) as ExtractedNumberSet;
    expect(result.found).toBe(true);
    expect(result.values).toContain(30);
    expect(result.values).toContain(60);
    expect(result.values).toContain(90);
  });
});

describe('extractAllFields', () => {
  const table = makeSchema([
    ['강사명', '김철수'],
    ['소속',   '서울대'],
  ]);

  it('여러 필드를 id→ExtractedField 맵으로 반환', () => {
    const fields = [
      fieldBuilder.text('name', '강사명'),
      fieldBuilder.text('org',  '소속'),
      fieldBuilder.text('phone', '연락처'),
    ];
    const result = extractAllFields(fields, [table]);
    expect(result['name']?.found).toBe(true);
    expect(result['org']?.found).toBe(true);
    expect(result['phone']?.found).toBe(false);
  });

  it('빈 테이블 배열이면 모두 found=false', () => {
    const fields = [fieldBuilder.text('name', '강사명')];
    const result = extractAllFields(fields, []);
    expect(result['name']?.found).toBe(false);
  });
});

// ─── evaluateRules ────────────────────────────────────────────────────────────

const foundText = (value: string): ExtractedField => ({
  found: true,
  value,
  location: { table_index: 0 },
});

const foundRows = (rows: string[][], count?: number): ExtractedField => ({
  found: true,
  rows,
  count: count ?? rows.length,
  location: { table_index: 0 },
});

const foundNumbers = (values: number[]): ExtractedField => ({
  found: true,
  values,
  location: { table_index: 0 },
});

const foundCheckbox = (options: Array<{ option: string; checked: boolean }>): ExtractedField => ({
  found: true,
  options: options.map(o => ({ ...o, recognized: true, format: o.checked ? 'checkmark' : 'unchecked' as any })),
  location: { table_index: 0 },
});

const notFound: ExtractedField = { found: false };

describe('evaluateRules — exists 조건', () => {
  it('필드가 없는데 expected=true → 트리거', () => {
    const rules = [rule('R1', 'ERROR', cond.exists('name', true), '이름 누락')];
    const hits = evaluateRules(rules, { name: notFound });
    expect(hits).toHaveLength(1);
    expect(hits[0].rule_id).toBe('R1');
  });

  it('필드가 있고 expected=true → 미트리거', () => {
    const rules = [rule('R1', 'ERROR', cond.exists('name', true), '이름 누락')];
    const hits = evaluateRules(rules, { name: foundText('홍길동') });
    expect(hits).toHaveLength(0);
  });

  it('필드가 있는데 expected=false → 트리거', () => {
    const rules = [rule('R1', 'WARN', cond.exists('name', false), '이름이 있으면 안 됨')];
    const hits = evaluateRules(rules, { name: foundText('홍길동') });
    expect(hits).toHaveLength(1);
  });
});

describe('evaluateRules — count 조건', () => {
  it('count gte 트리거 (행 수 미달)', () => {
    const rules = [rule('R2', 'WARN', cond.count('weekly', 'gte', 8), '8주 이상이어야 함')];
    const hits = evaluateRules(rules, { weekly: foundRows([['1'], ['2']]) });
    // count=2, 2 >= 8은 false → 미트리거? 아니면 트리거?
    // evaluator: triggered = compareNum(actual, op, value) → 2 >= 8 = false → 미트리거
    expect(hits).toHaveLength(0);
  });

  it('count lt 트리거 (행 수 미달)', () => {
    const rules = [rule('R2', 'WARN', cond.count('weekly', 'lt', 8), '8주 미만')];
    const hits = evaluateRules(rules, { weekly: foundRows([['1'], ['2']]) });
    // 2 < 8 = true → 트리거
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('WARN');
  });

  it('count between 트리거', () => {
    const rules = [rule('R3', 'INFO', cond.count('weekly', 'between', [5, 10]), '5~10주 범위')];
    const rows6 = Array.from({ length: 6 }, (_, i) => [String(i + 1)]);
    const hits = evaluateRules(rules, { weekly: foundRows(rows6) });
    // 6 between 5~10 = true → 트리거
    expect(hits).toHaveLength(1);
  });

  it('필드 없으면 트리거', () => {
    const rules = [rule('R4', 'ERROR', cond.count('weekly', 'gte', 1), '데이터 없음')];
    const hits = evaluateRules(rules, {});
    expect(hits).toHaveLength(1);
  });
});

describe('evaluateRules — value_match 조건', () => {
  it('eq 매칭', () => {
    const rules = [rule('R5', 'ERROR', cond.valueMatch('status', 'eq', '완료'), '완료 상태')];
    const hits = evaluateRules(rules, { status: foundText('완료') });
    expect(hits).toHaveLength(1);
  });

  it('matches 정규식', () => {
    const rules = [rule('R6', 'WARN', cond.valueMatch('email', 'matches', undefined, '@'), '이메일 형식')];
    const hitYes = evaluateRules(rules, { email: foundText('test@test.com') });
    const hitNo  = evaluateRules(rules, { email: foundText('invalid') });
    expect(hitYes).toHaveLength(1);
    expect(hitNo).toHaveLength(0);
  });
});

describe('evaluateRules — aggregate 조건', () => {
  const fields = { hours: foundNumbers([10, 20, 30]) };

  it('sum 집계', () => {
    // sum=60, gte 50 → 트리거
    const rules = [rule('R7', 'INFO', cond.aggregate('hours', 'sum', 'gte', 50), '합계 50 이상')];
    expect(evaluateRules(rules, fields)).toHaveLength(1);
  });

  it('avg 집계', () => {
    // avg=20, lte 15 → 미트리거
    const rules = [rule('R8', 'INFO', cond.aggregate('hours', 'avg', 'lte', 15), '평균 15 이하')];
    expect(evaluateRules(rules, fields)).toHaveLength(0);
  });

  it('count 집계', () => {
    // count=3, eq 3 → 트리거
    const rules = [rule('R9', 'INFO', cond.aggregate('hours', 'count', 'eq', 3), '값 3개')];
    expect(evaluateRules(rules, fields)).toHaveLength(1);
  });

  it('빈 배열 → min/max/avg = 0', () => {
    const rules = [rule('R10', 'WARN', cond.aggregate('hours', 'min', 'eq', 0), 'min=0')];
    expect(evaluateRules(rules, { hours: foundNumbers([]) })).toHaveLength(1);
  });
});

describe('evaluateRules — array_match 조건', () => {
  const cbFields = {
    method: foundCheckbox([
      { option: '이론', checked: true },
      { option: '실습', checked: false },
    ]),
  };

  it('any — 체크된 항목 있음 → 트리거', () => {
    const rules = [rule('R11', 'INFO',
      cond.arrayMatch('method.options', 'any', { prop: 'checked', op: 'eq', value: true }),
      '체크된 항목 존재',
    )];
    expect(evaluateRules(rules, cbFields)).toHaveLength(1);
  });

  it('all — 모두 체크 여부', () => {
    // 실습이 false이므로 all checked = false → 미트리거
    const rules = [rule('R12', 'WARN',
      cond.arrayMatch('method.options', 'all', { prop: 'checked', op: 'eq', value: true }),
      '모두 체크됨',
    )];
    expect(evaluateRules(rules, cbFields)).toHaveLength(0);
  });

  it('none — 체크된 항목 없음 트리거', () => {
    const allUnchecked = {
      method: foundCheckbox([
        { option: '이론', checked: false },
        { option: '실습', checked: false },
      ]),
    };
    const rules = [rule('R13', 'ERROR',
      cond.arrayMatch('method.options', 'none', { prop: 'checked', op: 'eq', value: true }),
      '아무것도 선택 안 됨',
    )];
    expect(evaluateRules(rules, allUnchecked)).toHaveLength(1);
  });
});

describe('evaluateRules — and / or 조건', () => {
  it('and — 모두 트리거 시만 hit', () => {
    const rules = [rule('R14', 'ERROR',
      cond.and(cond.exists('a', true), cond.exists('b', true)),
      'a,b 모두 없음',
    )];
    const hitBoth = evaluateRules(rules, { a: notFound, b: notFound });
    const hitOne  = evaluateRules(rules, { a: foundText('x'), b: notFound });
    expect(hitBoth).toHaveLength(1);
    expect(hitOne).toHaveLength(0);
  });

  it('or — 하나라도 트리거 시 hit', () => {
    const rules = [rule('R15', 'WARN',
      cond.or(cond.exists('a', true), cond.exists('b', true)),
      'a 또는 b 없음',
    )];
    const hitOne  = evaluateRules(rules, { a: notFound, b: foundText('x') });
    const hitNone = evaluateRules(rules, { a: foundText('x'), b: foundText('y') });
    expect(hitOne).toHaveLength(1);
    expect(hitNone).toHaveLength(0);
  });
});

describe('evaluateRules — severity / hit 구조', () => {
  it('hit에 rule_id, severity, message 포함', () => {
    const rules = [rule('MY_RULE', 'CRITICAL', cond.exists('x', true), '필드 X 없음')];
    const [hit] = evaluateRules(rules, { x: notFound });
    expect(hit.rule_id).toBe('MY_RULE');
    expect(hit.severity).toBe('CRITICAL');
    expect(hit.message).toBe('필드 X 없음');
  });

  it('location 포함 (필드 found인 경우)', () => {
    const rules = [rule('R', 'WARN', cond.valueMatch('v', 'eq', '나쁜값'), '나쁜 값')];
    const [hit] = evaluateRules(rules, { v: foundText('나쁜값') });
    expect(hit.location?.table_index).toBe(0);
  });

  it('규칙 미트리거 시 빈 배열', () => {
    const rules = [rule('R', 'ERROR', cond.exists('x', true), '없음')];
    expect(evaluateRules(rules, { x: foundText('있음') })).toHaveLength(0);
  });

  it('빈 rules → 빈 배열', () => {
    expect(evaluateRules([], { x: notFound })).toHaveLength(0);
  });
});

// ─── 빌더 패턴 검증 ──────────────────────────────────────────────────────────

describe('빌더 — pattern (collect_pattern)', () => {
  it('pattern.header() 올바른 구조 생성', () => {
    expect(pattern.header('주요내용')).toEqual({ type: 'header_contains', text: '주요내용' });
    expect(pattern.header('주요내용', 0)).toEqual({ type: 'header_contains', text: '주요내용', row: 0 });
  });

  it('pattern.size() 올바른 구조 생성', () => {
    expect(pattern.size({ min_rows: 10 })).toEqual({ type: 'size', min_rows: 10 });
  });

  it('pattern.and() 중첩 가능', () => {
    const p = pattern.and(
      pattern.header('주요내용'),
      pattern.size({ min_rows: 10 }),
    );
    expect(p.type).toBe('and');
    expect(p.patterns).toHaveLength(2);
  });

  it('pattern.or() 중첩 가능', () => {
    const p = pattern.or(pattern.header('성명'), pattern.header('강사명'));
    expect(p.type).toBe('or');
    expect(p.patterns).toHaveLength(2);
  });
});

describe('빌더 — cond / rule (anomaly)', () => {
  it('rule() 올바른 구조', () => {
    const r = rule('R01', 'ERROR', cond.exists('x'), '없음');
    expect(r).toEqual({
      rule_id: 'R01',
      severity: 'ERROR',
      condition: { type: 'exists', field: 'x', expected: true },
      message: '없음',
    });
  });

  it('cond.and/or 중첩', () => {
    const c = cond.and(cond.exists('a'), cond.or(cond.exists('b'), cond.exists('c')));
    expect(c.type).toBe('and');
    expect((c as any).conditions[1].type).toBe('or');
  });
});

describe('빌더 — field', () => {
  it('field.text() extractor 구조', () => {
    const f = fieldBuilder.text('name', '성명');
    expect(f.id).toBe('name');
    expect(f.type).toBe('text');
    expect(f.extractor.strategy).toBe('row_contains_label');
    expect(f.extractor.anchor).toBe('성명');
  });

  it('field.tableRows() with array anchors', () => {
    const f = fieldBuilder.tableRows('weekly', ['회차', '주차']);
    expect(f.type).toBe('table_rows');
    expect(f.extractor.anchors).toEqual(['회차', '주차']);
  });

  it('field.checkbox() with options', () => {
    const f = fieldBuilder.checkbox('method', '수업방법', ['이론', '실습']);
    expect(f.type).toBe('checkbox_cluster');
    expect(f.options).toEqual(['이론', '실습']);
  });
});

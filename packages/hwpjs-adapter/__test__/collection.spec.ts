import { describe, it, expect } from 'bun:test';
import { toJson } from '@ohah/hwpjs';
import {
  collectTables,
  collectWithSpecs,
  collectTablesFromHwp,
} from '../src/collection/index';
import type { TableSchema } from '../src/table-schema';
import type { TableTypeDef, TableTypeSpec } from '../src/collection/types';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../../../crates/hwp-core/tests/fixtures');

// ─── 테스트용 TableSchema 빌더 ────────────────────────────────────────────────

function makeSchema(
  cells: Array<Array<string | null>>,
  caption?: string,
): TableSchema {
  return {
    caption,
    rows: cells.map(row => ({
      cells: row.map(v => ({ value: v })),
    })),
  };
}

// ─── header_contains ─────────────────────────────────────────────────────────

describe('header_contains 패턴', () => {
  const schema = makeSchema([['헤더A', '헤더B'], ['값1', '값2']]);

  it('텍스트가 포함된 셀이 있으면 매칭', () => {
    const [result] = collectTables([schema], [
      { name: 'test', collect_pattern: { type: 'header_contains', text: '헤더A' } },
    ]);
    expect(result).toBeDefined();
    expect(result.match_info.matched_text).toBe('헤더A');
    expect(result.match_info.location).toEqual({ row: 0, col: 0 });
  });

  it('부분 일치도 매칭', () => {
    const [result] = collectTables([schema], [
      { name: 'test', collect_pattern: { type: 'header_contains', text: '헤더' } },
    ]);
    expect(result).toBeDefined();
  });

  it('없는 텍스트는 미매칭', () => {
    const results = collectTables([schema], [
      { name: 'test', collect_pattern: { type: 'header_contains', text: '없는텍스트' } },
    ]);
    expect(results).toHaveLength(0);
  });

  it('row 지정 시 해당 행만 검색', () => {
    const match = collectTables([schema], [
      { name: 'test', collect_pattern: { type: 'header_contains', text: '헤더A', row: 0 } },
    ]);
    const noMatch = collectTables([schema], [
      { name: 'test', collect_pattern: { type: 'header_contains', text: '헤더A', row: 1 } },
    ]);
    expect(match).toHaveLength(1);
    expect(noMatch).toHaveLength(0);
  });

  it('null 셀은 무시', () => {
    const schemaWithNull = makeSchema([[null, '헤더B']]);
    const results = collectTables([schemaWithNull], [
      { name: 'test', collect_pattern: { type: 'header_contains', text: '헤더B' } },
    ]);
    expect(results).toHaveLength(1);
  });
});

// ─── caption_contains ────────────────────────────────────────────────────────

describe('caption_contains 패턴', () => {
  it('캡션에 텍스트가 있으면 매칭', () => {
    const schema = makeSchema([['셀']], '주차별 계획표');
    const results = collectTables([schema], [
      { name: 'test', collect_pattern: { type: 'caption_contains', text: '주차별' } },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].match_info.matched_text).toBe('주차별 계획표');
  });

  it('캡션 없으면 미매칭', () => {
    const schema = makeSchema([['셀']]);
    const results = collectTables([schema], [
      { name: 'test', collect_pattern: { type: 'caption_contains', text: '주차별' } },
    ]);
    expect(results).toHaveLength(0);
  });
});

// ─── cell_matches ─────────────────────────────────────────────────────────────

describe('cell_matches 패턴', () => {
  const schema = makeSchema([['성명 홍길동', '소속 한국대'], ['값A', '값B']]);

  it('정규식으로 셀 매칭', () => {
    const results = collectTables([schema], [
      { name: 'test', collect_pattern: { type: 'cell_matches', row: 0, col: 0, pattern: '성명' } },
    ]);
    expect(results).toHaveLength(1);
  });

  it('정규식 미매칭', () => {
    const results = collectTables([schema], [
      { name: 'test', collect_pattern: { type: 'cell_matches', row: 0, col: 0, pattern: '^없음$' } },
    ]);
    expect(results).toHaveLength(0);
  });

  it('잘못된 정규식 → 크래시 없이 미매칭', () => {
    expect(() => {
      collectTables([schema], [
        { name: 'test', collect_pattern: { type: 'cell_matches', row: 0, col: 0, pattern: '[invalid' } },
      ]);
    }).not.toThrow();
    const results = collectTables([schema], [
      { name: 'test', collect_pattern: { type: 'cell_matches', row: 0, col: 0, pattern: '[invalid' } },
    ]);
    expect(results).toHaveLength(0);
  });

  it('범위 초과 row/col → 크래시 없이 미매칭', () => {
    expect(() => {
      collectTables([schema], [
        { name: 'test', collect_pattern: { type: 'cell_matches', row: 99, col: 99, pattern: '.*' } },
      ]);
    }).not.toThrow();
  });
});

// ─── size 패턴 ────────────────────────────────────────────────────────────────

describe('size 패턴', () => {
  const s3x2 = makeSchema([['a','b'],['c','d'],['e','f']]); // 3행 2열

  it('min_rows 충족', () => {
    expect(collectTables([s3x2], [{ name: 't', collect_pattern: { type: 'size', min_rows: 3 } }])).toHaveLength(1);
    expect(collectTables([s3x2], [{ name: 't', collect_pattern: { type: 'size', min_rows: 4 } }])).toHaveLength(0);
  });

  it('max_rows 충족', () => {
    expect(collectTables([s3x2], [{ name: 't', collect_pattern: { type: 'size', max_rows: 3 } }])).toHaveLength(1);
    expect(collectTables([s3x2], [{ name: 't', collect_pattern: { type: 'size', max_rows: 2 } }])).toHaveLength(0);
  });

  it('min_cols / max_cols', () => {
    expect(collectTables([s3x2], [{ name: 't', collect_pattern: { type: 'size', min_cols: 2, max_cols: 2 } }])).toHaveLength(1);
    expect(collectTables([s3x2], [{ name: 't', collect_pattern: { type: 'size', min_cols: 3 } }])).toHaveLength(0);
  });

  it('복합 범위 조건', () => {
    // 3행 2열은 min_rows:2 max_rows:5 min_cols:2 max_cols:3 에 맞음
    expect(collectTables([s3x2], [{
      name: 't',
      collect_pattern: { type: 'size', min_rows: 2, max_rows: 5, min_cols: 2, max_cols: 3 },
    }])).toHaveLength(1);
  });

  it('빈 테이블 (0행) — min_rows:1이면 미매칭', () => {
    const empty: TableSchema = { rows: [] };
    expect(collectTables([empty], [{ name: 't', collect_pattern: { type: 'size', min_rows: 1 } }])).toHaveLength(0);
  });
});

// ─── and / or ────────────────────────────────────────────────────────────────

describe('and 패턴', () => {
  const schema = makeSchema([['주요내용', '시간'], ['내용1', '1h']]);

  it('모든 하위 패턴 충족 시 매칭', () => {
    const results = collectTables([schema], [{
      name: 't',
      collect_pattern: {
        type: 'and',
        patterns: [
          { type: 'header_contains', text: '주요내용' },
          { type: 'size', min_rows: 2 },
        ],
      },
    }]);
    expect(results).toHaveLength(1);
  });

  it('하나라도 미충족 시 미매칭', () => {
    const results = collectTables([schema], [{
      name: 't',
      collect_pattern: {
        type: 'and',
        patterns: [
          { type: 'header_contains', text: '주요내용' },
          { type: 'size', min_rows: 10 },  // 2행 < 10
        ],
      },
    }]);
    expect(results).toHaveLength(0);
  });
});

describe('or 패턴', () => {
  const schema = makeSchema([['성명', '홍길동']]);

  it('하나라도 충족 시 매칭', () => {
    const results = collectTables([schema], [{
      name: 't',
      collect_pattern: {
        type: 'or',
        patterns: [
          { type: 'header_contains', text: '없음' },
          { type: 'header_contains', text: '성명' },
        ],
      },
    }]);
    expect(results).toHaveLength(1);
  });

  it('모두 미충족 시 미매칭', () => {
    const results = collectTables([schema], [{
      name: 't',
      collect_pattern: {
        type: 'or',
        patterns: [
          { type: 'header_contains', text: '없음A' },
          { type: 'header_contains', text: '없음B' },
        ],
      },
    }]);
    expect(results).toHaveLength(0);
  });
});

// ─── collectTables 옵션 ──────────────────────────────────────────────────────

describe('collectTables — 중복 매칭 방지', () => {
  const schema = makeSchema([['구성내용', '시간'], ['내용', '2h']]);
  const types: TableTypeDef[] = [
    { name: 'typeA', collect_pattern: { type: 'header_contains', text: '구성내용' } },
    { name: 'typeB', collect_pattern: { type: 'header_contains', text: '구성내용' } },
  ];

  it('기본(allow_multi_match=false): 하나에만 귀속', () => {
    const results = collectTables([schema], types);
    expect(results).toHaveLength(1);
    expect(results[0].table_type).toBe('typeA');
  });

  it('allow_multi_match=true: 중복 허용', () => {
    const results = collectTables([schema], types, { allow_multi_match: true });
    expect(results).toHaveLength(2);
  });
});

describe('collectTables — table_index 정확성', () => {
  const s1 = makeSchema([['A']]);
  const s2 = makeSchema([['구성내용']]);
  const s3 = makeSchema([['B']]);

  it('table_index가 원래 배열 인덱스와 일치', () => {
    const results = collectTables([s1, s2, s3], [
      { name: 'test', collect_pattern: { type: 'header_contains', text: '구성내용' } },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].table_index).toBe(1);
  });
});

// ─── collectWithSpecs — transform_rule 포함 ───────────────────────────────────

describe('collectWithSpecs', () => {
  const schema = makeSchema([['주요내용', '시간']]);
  const spec: TableTypeSpec<{ id: string }> = {
    def: {
      name: 'weekly',
      collect_pattern: { type: 'header_contains', text: '주요내용' },
    },
    transform_rule: { id: 'weekly_rule' },
  };

  it('transform_rule이 결과에 포함됨', () => {
    const { collectWithSpecs } = require('../src/collection/index');
    const results = collectWithSpecs([schema], [spec]);
    expect(results).toHaveLength(1);
    expect(results[0].transform_rule).toEqual({ id: 'weekly_rule' });
  });

  it('toTable() 호출 가능', () => {
    const { collectWithSpecs } = require('../src/collection/index');
    const results = collectWithSpecs([schema], [spec]);
    expect(() => results[0].toTable()).not.toThrow();
  });
});

// ─── collectTablesFromHwp — 실제 HWP 파일 ────────────────────────────────────

describe('collectTablesFromHwp', () => {
  it('table.hwp에서 테이블 수집', () => {
    const hwpPath = path.join(fixturesDir, 'table.hwp');
    const hwpJson = JSON.parse(toJson(fs.readFileSync(hwpPath)));

    const results = collectTablesFromHwp(hwpJson, [{
      def: {
        name: 'any_table',
        collect_pattern: { type: 'size', min_rows: 1 },
      },
    }]);

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.table_type).toBe('any_table');
      expect(r.schema.rows.length).toBeGreaterThan(0);
    }
  });

  it('body_text 없는 객체 → 빈 배열', () => {
    const results = collectTablesFromHwp({}, [{
      def: { name: 'test', collect_pattern: { type: 'size', min_rows: 1 } },
    }]);
    expect(results).toHaveLength(0);
  });

  it('null 입력 → 빈 배열', () => {
    const results = collectTablesFromHwp(null, [{
      def: { name: 'test', collect_pattern: { type: 'size', min_rows: 1 } },
    }]);
    expect(results).toHaveLength(0);
  });
});

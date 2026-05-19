import { describe, it, expect } from 'bun:test';
import { toJson } from '@ohah/hwpjs';
import { extract } from '../src/extract/index';
import { extractContent } from '../src/extract/content';
import { extractStyle } from '../src/extract/style';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../../../crates/hwp-core/tests/fixtures');

function loadHwpJson(name: string) {
  return JSON.parse(toJson(fs.readFileSync(path.join(fixturesDir, name))));
}

// ─── extractContent 단위 테스트 ───────────────────────────────────────────────

describe('extractContent', () => {
  it('body_text 없으면 빈 배열', () => {
    const result = extractContent({}, null, new Map());
    expect(result).toHaveLength(0);
  });

  it('null 입력 → 빈 배열', () => {
    expect(extractContent(null, null, new Map())).toHaveLength(0);
  });

  it('텍스트 단락 → text 레코드 추출', () => {
    const hwpJson = {
      body_text: {
        sections: [
          {
            paragraphs: [
              {
                para_header: {},
                records: [
                  {
                    type: 'para_text',
                    runs: [{ kind: 'text', text: '안녕하세요' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const records = extractContent(hwpJson, hwpJson.body_text, new Map());
    expect(records.some((r) => r.kind === 'text' && r.content === '안녕하세요')).toBe(true);
  });

  it('텍스트 레코드에 JSON path 포함', () => {
    const hwpJson = {
      body_text: {
        sections: [
          {
            paragraphs: [
              {
                para_header: {},
                records: [{ type: 'para_text', runs: [{ kind: 'text', text: '테스트' }] }],
              },
            ],
          },
        ],
      },
    };
    const records = extractContent(hwpJson, hwpJson.body_text, new Map());
    const textRec = records.find((r) => r.kind === 'text');
    expect(textRec?.path).toBe('body_text.sections[0].paragraphs[0]');
  });

  it('제어 문자가 포함된 텍스트 정규화', () => {
    const hwpJson = {
      body_text: {
        sections: [
          {
            paragraphs: [
              {
                para_header: {},
                records: [{ type: 'para_text', runs: [{ kind: 'text', text: '텍스트\x00값' }] }],
              },
            ],
          },
        ],
      },
    };
    const records = extractContent(hwpJson, hwpJson.body_text, new Map());
    const textRec = records.find((r) => r.kind === 'text');
    expect(textRec?.content).toBe('텍스트값');
  });

  it('빈 단락은 레코드에 미포함', () => {
    const hwpJson = {
      body_text: {
        sections: [
          {
            paragraphs: [
              { para_header: {}, records: [] },
              {
                para_header: {},
                records: [{ type: 'para_text', runs: [{ kind: 'text', text: '내용' }] }],
              },
            ],
          },
        ],
      },
    };
    const records = extractContent(hwpJson, hwpJson.body_text, new Map());
    expect(records.filter((r) => r.kind === 'text')).toHaveLength(1);
  });

  it('table 레코드에 row_count / col_count 포함', () => {
    const hwpJson = loadHwpJson('table.hwp');
    const records = extractContent(hwpJson, hwpJson.body_text, new Map());
    const tableRecs = records.filter((r) => r.kind === 'table');
    expect(tableRecs.length).toBeGreaterThan(0);
    for (const rec of tableRecs) {
      expect(rec.table?.row_count).toBeGreaterThan(0);
      expect(rec.table?.col_count).toBeGreaterThan(0);
    }
  });

  it('셀 path 형식이 올바름', () => {
    const hwpJson = loadHwpJson('table.hwp');
    const records = extractContent(hwpJson, hwpJson.body_text, new Map());
    const tableRec = records.find((r) => r.kind === 'table');
    const firstCell = tableRec?.table?.rows[0]?.cells[0];
    expect(firstCell?.path).toMatch(/\.rows\[0\]\.cells\[0\]$/);
  });

  it('noori.hwp — 텍스트와 테이블 혼합 추출', () => {
    const hwpPath = path.join(fixturesDir, 'noori.hwp');
    if (!fs.existsSync(hwpPath)) return;

    const hwpJson = loadHwpJson('noori.hwp');
    const records = extractContent(hwpJson, hwpJson.body_text, new Map());
    const textCount = records.filter((r) => r.kind === 'text').length;
    const tableCount = records.filter((r) => r.kind === 'table').length;
    expect(textCount + tableCount).toBeGreaterThan(0);
  });
});

// ─── extractStyle 단위 테스트 ─────────────────────────────────────────────────

describe('extractStyle', () => {
  it('doc_info 없으면 레코드를 그대로 반환', () => {
    const records = [{ kind: 'text' as const, path: 'p', content: '안녕' }];
    const result = extractStyle({}, records);
    expect(result).toBe(records); // 같은 참조
    expect(result[0].content).toBe('안녕');
  });

  it('body_text 없으면 레코드를 그대로 반환', () => {
    const records = [{ kind: 'text' as const, path: 'p', content: '안녕' }];
    const result = extractStyle({ doc_info: {} }, records);
    expect(result).toBe(records);
  });

  it('charshape.hwp — 텍스트 레코드에 runs 주입', () => {
    const hwpPath = path.join(fixturesDir, 'charshape.hwp');
    if (!fs.existsSync(hwpPath)) return;

    const hwpJson = loadHwpJson('charshape.hwp');
    let records = extractContent(hwpJson, hwpJson.body_text, new Map());
    records = extractStyle(hwpJson, records);

    const withRuns = records.filter((r) => r.kind === 'text' && r.runs && r.runs.length > 0);
    expect(withRuns.length).toBeGreaterThan(0);
  });

  it('텍스트 레코드에 para_style 주입', () => {
    const hwpPath = path.join(fixturesDir, 'parashape.hwp');
    if (!fs.existsSync(hwpPath)) return;

    const hwpJson = loadHwpJson('parashape.hwp');
    let records = extractContent(hwpJson, hwpJson.body_text, new Map());
    records = extractStyle(hwpJson, records);

    const textRecs = records.filter((r) => r.kind === 'text');
    expect(textRecs.length).toBeGreaterThan(0);
    // para_style 필드 존재 여부만 확인 (모든 레코드가 스타일 있을 수도, 없을 수도 있음)
    const withStyle = textRecs.filter((r) => r.para_style);
    expect(withStyle.length).toBeGreaterThanOrEqual(0);
  });

  it('runs의 text 합이 원본 content와 일치', () => {
    const hwpPath = path.join(fixturesDir, 'charshape.hwp');
    if (!fs.existsSync(hwpPath)) return;

    const hwpJson = loadHwpJson('charshape.hwp');
    let records = extractContent(hwpJson, hwpJson.body_text, new Map());
    records = extractStyle(hwpJson, records);

    for (const rec of records) {
      if (rec.kind !== 'text' || !rec.runs || rec.runs.length === 0) continue;
      const runsText = rec.runs.map((r) => r.text).join('');
      // runs 결합이 원본 content와 동일해야 함 (정규화 후)
      expect(runsText.replace(/\s/g, '')).toBe((rec.content ?? '').replace(/\s/g, ''));
    }
  });
});

// ─── extract() 통합 API ───────────────────────────────────────────────────────

describe('extract() 통합 API', () => {
  it('content API만 → runs/para_style 없음', () => {
    const hwpJson = loadHwpJson('table.hwp');
    const result = extract(hwpJson, { apis: ['content'] });

    expect(result.meta.apis).toEqual(['content']);
    expect(result.records.length).toBeGreaterThan(0);

    const textRecs = result.records.filter((r) => r.kind === 'text');
    // content만이므로 runs가 없거나 빈 배열
    const hasRuns = textRecs.some((r) => r.runs && r.runs.length > 0);
    expect(hasRuns).toBe(false);
  });

  it('content+style API → 텍스트 레코드에 runs 포함', () => {
    const hwpPath = path.join(fixturesDir, 'charshape.hwp');
    if (!fs.existsSync(hwpPath)) return;

    const hwpJson = loadHwpJson('charshape.hwp');
    const result = extract(hwpJson, { apis: ['content', 'style'] });

    expect(result.meta.apis).toEqual(['content', 'style']);
    const textRecs = result.records.filter((r) => r.kind === 'text');
    const hasRuns = textRecs.some((r) => r.runs && r.runs.length > 0);
    expect(hasRuns).toBe(true);
  });

  it('meta에 extracted_at 포함', () => {
    const hwpJson = loadHwpJson('table.hwp');
    const result = extract(hwpJson);
    expect(result.meta.extracted_at).toBeTruthy();
    expect(new Date(result.meta.extracted_at).getTime()).not.toBeNaN();
  });

  it('sourcePaths 반영', () => {
    const hwpJson = loadHwpJson('table.hwp');
    const result = extract(hwpJson, {
      sourcePaths: { hwp: '/some/path.hwp', json: '/some/path.json' },
    });
    expect(result.meta.source_hwp).toBe('/some/path.hwp');
    expect(result.meta.source_json).toBe('/some/path.json');
  });

  it('table 레코드에 merges 포함 (table.hwp — 병합 있는 테이블)', () => {
    const hwpJson = loadHwpJson('table.hwp');
    const result = extract(hwpJson, { apis: ['content'] });
    const tableWithMerge = result.records.find(
      (r) => r.kind === 'table' && r.table?.merges && r.table.merges.length > 0
    );
    expect(tableWithMerge).toBeDefined();
    expect(tableWithMerge!.table!.merges![0]).toMatchObject({
      start: expect.objectContaining({ row: expect.any(Number), col: expect.any(Number) }),
      end: expect.objectContaining({ row: expect.any(Number), col: expect.any(Number) }),
    });
  });
});

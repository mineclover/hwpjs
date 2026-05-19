import { describe, it, expect } from 'bun:test';
import { normalizeText, normalizeCellValue } from '../src/utils/normalize';
import {
  collectAllTableSchemas,
  collectTableSchemas,
  collectRawTables,
  collectBinIds,
} from '../src/utils/traverse';
import {
  buildImageMapFromHtml,
  mergeImageMaps,
  emptyImageMap,
} from '../src/utils/image-map';

// ─── normalize ───────────────────────────────────────────────────────────────

describe('normalizeText', () => {
  it('null/undefined → 빈 문자열', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  it('숫자·불리언 → 문자열 변환', () => {
    expect(normalizeText(42)).toBe('42');
    expect(normalizeText(true)).toBe('true');
  });

  it('앞뒤 공백 제거', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('제어 문자 제거 (\\x00–\\x09, \\x0B–\\x1F)', () => {
    expect(normalizeText('a\x00b\x01c')).toBe('abc');
    expect(normalizeText('a\x09b')).toBe('ab');   // tab
    expect(normalizeText('a\x0Bb')).toBe('ab');   // vertical tab
  });

  it('\\n(0x0A)은 기본적으로 보존', () => {
    expect(normalizeText('a\nb')).toBe('a\nb');
  });

  it('keepNewlines=false 이면 \\n도 제거', () => {
    expect(normalizeText('a\nb', false)).toBe('ab');
  });

  it('일반 텍스트는 변경 없음', () => {
    expect(normalizeText('한글 텍스트')).toBe('한글 텍스트');
  });
});

describe('normalizeCellValue', () => {
  it('null → 빈 문자열', () => {
    expect(normalizeCellValue(null)).toBe('');
  });

  it('일반 값 정규화', () => {
    expect(normalizeCellValue('  test\x00  ')).toBe('test');
  });
});

// ─── traverse ────────────────────────────────────────────────────────────────

const mockSchema = { rows: [{ cells: [{ value: 'A' }] }] };

describe('collectAllTableSchemas', () => {
  it('최상위 tableSchema 노드 수집', () => {
    const obj = { tableSchema: mockSchema };
    const result = collectAllTableSchemas(obj, 'root');
    expect(result).toHaveLength(1);
    expect(result[0].schema).toBe(mockSchema);
    expect(result[0].path).toBe('root.tableSchema');
  });

  it('중첩 객체에서 tableSchema 수집', () => {
    const obj = { a: { b: { tableSchema: mockSchema } } };
    const result = collectAllTableSchemas(obj, 'root');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('root.a.b.tableSchema');
  });

  it('배열 안의 tableSchema 수집', () => {
    const obj = { paragraphs: [{ tableSchema: mockSchema }, { text: 'hi' }] };
    const result = collectAllTableSchemas(obj, 'root');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('root.paragraphs[0].tableSchema');
  });

  it('여러 tableSchema 수집', () => {
    const schema2 = { rows: [{ cells: [{ value: 'B' }] }] };
    const obj = {
      sections: [{ paragraphs: [{ tableSchema: mockSchema }] }],
      other: { tableSchema: schema2 },
    };
    const result = collectAllTableSchemas(obj);
    expect(result).toHaveLength(2);
  });

  it('tableSchema 발견 시 하위 탐색 중단', () => {
    // tableSchema 노드 안에 또 tableSchema가 있어도 중복 수집 안 됨
    const nested = { tableSchema: { nested: { tableSchema: mockSchema } } };
    const result = collectAllTableSchemas(nested, 'root');
    expect(result).toHaveLength(1);
  });

  it('빈 객체는 빈 배열 반환', () => {
    expect(collectAllTableSchemas({})).toHaveLength(0);
    expect(collectAllTableSchemas(null)).toHaveLength(0);
  });
});

describe('collectTableSchemas', () => {
  it('schema만 추출 (path 없이)', () => {
    const obj = { tableSchema: mockSchema };
    const schemas = collectTableSchemas(obj);
    expect(schemas).toHaveLength(1);
    expect(schemas[0]).toBe(mockSchema);
  });
});

describe('collectRawTables', () => {
  it('table 키를 가진 노드의 값 수집', () => {
    const tbl = { cells: [] };
    const obj = { ctrl_header: { table: tbl } };
    const result = collectRawTables(obj);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(tbl);
  });

  it('table 발견 시 하위 탐색 중단', () => {
    const tbl = { cells: [], nested: { table: {} } };
    const obj = { table: tbl };
    const result = collectRawTables(obj);
    expect(result).toHaveLength(1);
  });

  it('배열 안 탐색', () => {
    const t1 = { cells: [] }, t2 = { cells: [] };
    const obj = [{ table: t1 }, { table: t2 }];
    const result = collectRawTables(obj);
    expect(result).toHaveLength(2);
  });
});

describe('collectBinIds', () => {
  it('shape_component_picture에서 bindata_id 수집', () => {
    const obj = {
      type: 'shape_component_picture',
      shape_component_picture: { picture_info: { bindata_id: 3 } },
    };
    const ids = collectBinIds(obj);
    expect(ids).toEqual([3]);
  });

  it('bindata_id가 없으면 수집 안 됨', () => {
    const obj = { type: 'shape_component_picture', shape_component_picture: {} };
    expect(collectBinIds(obj)).toHaveLength(0);
  });

  it('중첩 구조에서 여러 개 수집', () => {
    const obj = {
      cells: [
        {
          type: 'shape_component_picture',
          shape_component_picture: { picture_info: { bindata_id: 1 } },
        },
        {
          type: 'shape_component_picture',
          shape_component_picture: { picture_info: { bindata_id: 2 } },
        },
      ],
    };
    expect(collectBinIds(obj)).toEqual([1, 2]);
  });

  it('숫자가 아닌 id는 무시', () => {
    const obj = {
      type: 'shape_component_picture',
      shape_component_picture: { picture_info: { bindata_id: 'abc' } },
    };
    expect(collectBinIds(obj)).toHaveLength(0);
  });
});

// ─── image-map ───────────────────────────────────────────────────────────────

describe('buildImageMapFromHtml', () => {
  const fakeJpeg = 'data:image/jpeg;base64,/9j/4AAQ';
  const fakePng  = 'data:image/png;base64,iVBORw0KGgo';

  it('data URL 1개 → Map(1, id=1)', () => {
    const map = buildImageMapFromHtml(`<img src="${fakeJpeg}">`);
    expect(map.size).toBe(1);
    expect(map.get(1)?.format).toBe('jpeg');
    expect(map.get(1)?.dataUrl).toBe(fakeJpeg);
  });

  it('data URL 여러 개 → 1-based 순서 인덱스', () => {
    const html = `<img src="${fakeJpeg}"><img src="${fakePng}">`;
    const map = buildImageMapFromHtml(html);
    expect(map.size).toBe(2);
    expect(map.get(1)?.format).toBe('jpeg');
    expect(map.get(2)?.format).toBe('png');
  });

  it('data URL 없으면 빈 Map', () => {
    expect(buildImageMapFromHtml('<p>no images</p>').size).toBe(0);
  });

  it('빈 문자열 → 빈 Map', () => {
    expect(buildImageMapFromHtml('').size).toBe(0);
  });
});

describe('mergeImageMaps', () => {
  it('두 Map을 병합', () => {
    const a: Map<number, any> = new Map([[1, { dataUrl: 'a', format: 'jpeg' }]]);
    const b: Map<number, any> = new Map([[2, { dataUrl: 'b', format: 'png' }]]);
    const merged = mergeImageMaps(a, b);
    expect(merged.size).toBe(2);
    expect(merged.get(1)?.dataUrl).toBe('a');
    expect(merged.get(2)?.dataUrl).toBe('b');
  });

  it('같은 ID는 뒤의 것이 우선', () => {
    const a: Map<number, any> = new Map([[1, { dataUrl: 'first', format: 'jpeg' }]]);
    const b: Map<number, any> = new Map([[1, { dataUrl: 'second', format: 'png' }]]);
    expect(mergeImageMaps(a, b).get(1)?.dataUrl).toBe('second');
  });

  it('인자 없으면 빈 Map', () => {
    expect(mergeImageMaps().size).toBe(0);
  });
});

describe('emptyImageMap', () => {
  it('빈 Map 반환', () => {
    expect(emptyImageMap().size).toBe(0);
  });
});

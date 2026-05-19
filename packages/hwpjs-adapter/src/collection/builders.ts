/**
 * collect_pattern 빌더
 *
 * Raw 객체 리터럴 대신 타입 안전한 팩토리 함수를 제공한다.
 *
 * @example
 * ```ts
 * import { pattern } from '@ohah/hwpjs-adapter/collection';
 *
 * const spec = {
 *   def: {
 *     name: 'weekly_plan_kor',
 *     collect_pattern: pattern.and(
 *       pattern.header('주요내용'),
 *       pattern.size({ min_rows: 10 }),
 *     ),
 *   },
 * };
 * ```
 */

import type {
  CollectPattern,
  HeaderContainsPattern,
  CaptionContainsPattern,
  CellMatchesPattern,
  SizePattern,
  AndPattern,
  OrPattern,
} from './types.js';

export const pattern = {
  /** 헤더 행에 텍스트 포함 여부 */
  header(text: string, row?: number): HeaderContainsPattern {
    return row !== undefined
      ? { type: 'header_contains', text, row }
      : { type: 'header_contains', text };
  },

  /** 캡션에 텍스트 포함 여부 */
  caption(text: string): CaptionContainsPattern {
    return { type: 'caption_contains', text };
  },

  /** 특정 셀이 정규식에 매칭 */
  cell(row: number, col: number, regex: string): CellMatchesPattern {
    return { type: 'cell_matches', row, col, pattern: regex };
  },

  /** 행/열 수 범위 조건 */
  size(opts: Omit<SizePattern, 'type'>): SizePattern {
    return { type: 'size', ...opts };
  },

  /** 모든 하위 패턴을 동시에 만족 */
  and(...patterns: CollectPattern[]): AndPattern {
    return { type: 'and', patterns };
  },

  /** 하위 패턴 중 하나 이상을 만족 */
  or(...patterns: CollectPattern[]): OrPattern {
    return { type: 'or', patterns };
  },
} as const;

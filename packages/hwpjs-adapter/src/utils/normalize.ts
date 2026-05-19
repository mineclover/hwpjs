/**
 * 텍스트 정규화 유틸리티
 *
 * ktech HWP 파일의 셀·단락 텍스트에는 제어 문자가 포함될 수 있다.
 * \n(0x0A)은 보존하고, 나머지 제어 문자(0x00–0x09, 0x0B–0x1F)를 제거한다.
 */

const CTRL_STRIP = /[\x00-\x09\x0B-\x1F]/g;

/**
 * 셀/단락 값에서 제어 문자를 제거하고 앞뒤 공백을 정리한다.
 * null/undefined는 빈 문자열로 변환한다.
 *
 * @param value  - 정규화할 원본 값
 * @param keepNewlines - false로 설정하면 \n도 제거 (기본: true)
 */
export function normalizeText(value: unknown, keepNewlines = true): string {
  const s = String(value ?? '');
  return (keepNewlines ? s.replace(CTRL_STRIP, '') : s.replace(/[\x00-\x1F]/g, '')).trim();
}

/**
 * 셀 value를 정규화하여 반환한다.
 * 숫자·불리언도 문자열로 변환한다.
 */
export function normalizeCellValue(value: unknown): string {
  return normalizeText(value);
}

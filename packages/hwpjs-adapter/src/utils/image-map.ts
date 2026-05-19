/**
 * ImageMap 생성 유틸리티
 *
 * HWP 파일에서 이미지를 추출하여 bindata_id → { dataUrl, format } 매핑을 만든다.
 */

import type { ImageMap } from '../table-schema.js';

/**
 * toHtml() 출력에서 data URL을 추출하여 ImageMap을 구성한다.
 *
 * hwpjs의 toHtml()은 이미지를 data URL로 인라인 삽입한다.
 * ID는 1-based 순서 인덱스로 부여된다.
 *
 * @example
 * ```ts
 * const html = toHtml(buf);
 * const imageMap = buildImageMapFromHtml(html);
 * const result = extract(hwpJson, { imageMap });
 * ```
 */
export function buildImageMapFromHtml(html: string): ImageMap {
  const map: ImageMap = new Map();
  const matches = html.match(/data:image\/([^;]+);base64,[A-Za-z0-9+/=]+/g) ?? [];
  matches.forEach((dataUrl, i) => {
    const format = dataUrl.match(/data:image\/([^;]+)/)?.[1] ?? 'jpeg';
    map.set(i + 1, { dataUrl, format });
  });
  return map;
}

/**
 * 여러 ImageMap을 병합하여 반환한다.
 * 같은 ID가 충돌하면 뒤의 것이 우선한다.
 */
export function mergeImageMaps(...maps: ImageMap[]): ImageMap {
  const result: ImageMap = new Map();
  for (const m of maps) {
    for (const [k, v] of m) result.set(k, v);
  }
  return result;
}

/**
 * 빈 ImageMap을 생성한다 (이미지가 없는 경우 명시적으로 사용).
 */
export function emptyImageMap(): ImageMap {
  return new Map();
}

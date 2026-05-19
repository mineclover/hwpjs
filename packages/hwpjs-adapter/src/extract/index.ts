import type { ExtractApi, ExtractResult, ExtractMeta } from './types.js';
import { extractContent } from './content.js';
import { extractStyle } from './style.js';
import type { ImageMap } from '../table-schema.js';

export type {
  ExtractResult,
  ExtractApi,
  DocRecord,
  StyleRun,
  CharStyle,
  ParagraphStyle,
  TableRecord,
  TableRowRecord,
  TableCellRecord,
  MergeRange,
} from './types.js';

export type ExtractOptions = {
  apis?: ExtractApi[]; // default: ['content']
  imageMap?: ImageMap;
  sourcePaths?: { hwp?: string; json?: string };
};

export function extract(hwpJson: unknown, options: ExtractOptions = {}): ExtractResult {
  const { apis = ['content'], imageMap = new Map(), sourcePaths = {} } = options;

  const meta: ExtractMeta = {
    source_hwp: sourcePaths.hwp ?? '',
    source_json: sourcePaths.json ?? '',
    extracted_at: new Date().toISOString(),
    apis,
  };

  const rawBodyText = (hwpJson as any)?.body_text;

  // API 1: content
  let records = extractContent(hwpJson, rawBodyText, imageMap);

  // API 2: style (content records에 in-place로 style 필드 추가)
  if (apis.includes('style')) {
    records = extractStyle(hwpJson, records);
  }

  return { meta, records };
}

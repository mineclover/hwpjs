// Re-export native bindings with aliases
export * from './dist/index.js';
import { toMarkdown, type ToMarkdownOptions, type ToMarkdownResult } from './dist/index.js';

// Alias for backwards compatibility
export function parseHwpToMarkdown(data: Buffer, options?: ToMarkdownOptions): ToMarkdownResult {
  return toMarkdown(data, options);
}

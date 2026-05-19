export { collectTables, collectWithSpecs, collectTablesFromHwp } from './collector.js';
export type { CollectOptions } from './collector.js';
export { pattern } from './builders.js';
export type {
  CollectPattern,
  HeaderContainsPattern,
  CaptionContainsPattern,
  CellMatchesPattern,
  SizePattern,
  AndPattern,
  OrPattern,
  TableTypeDef,
  TableTypeSpec,
  MatchInfo,
  CollectedTable,
} from './types.js';

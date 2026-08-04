/**
 * Minimal Source Map v3 generator.
 *
 * The TypeScript stripper preserves line numbers (removed spans are replaced
 * with spaces, newlines kept), so the emitted JS maps 1:1 onto the original
 * TS source. `generateSourceMap` emits a valid Source Map v3 document with
 * an identity line mapping plus the embedded original source.
 */

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toVLQ(value: number): string {
  let vlq = '';
  let v = value < 0 ? (-value << 1) | 1 : value << 1;
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    vlq += BASE64[digit];
  } while (v > 0);
  return vlq;
}

export interface SourceMapOptions {
  generatedFile: string;
  sourceFile: string;
  source: string;
  generatedLines: number;
  /** Optional per-line overrides: [genLine(1-based), srcLine(1-based)][] for non-identity mapping */
  lineMap?: Array<[number, number]>;
}

export interface SourceMap {
  version: number;
  file: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent: (string | null)[];
  names: string[];
  mappings: string;
}

export function generateSourceMap(opts: SourceMapOptions): SourceMap {
  const override = new Map<number, number>((opts.lineMap || []).map(([g, s]) => [g, s]));
  const total = Math.max(opts.generatedLines, 1);

  let prevSrcLine = 0;
  let prevSrcCol = 0;
  const lineMappings: string[] = [];

  for (let gen = 1; gen <= total; gen++) {
    const srcLine = override.get(gen) ?? gen;
    const srcCol = 0;
    const segment = [
      toVLQ(0),                        // generated column delta
      toVLQ(0),                        // source index delta
      toVLQ(srcLine - prevSrcLine),    // source line delta
      toVLQ(srcCol - prevSrcCol)       // source column delta
    ].join('');
    lineMappings.push(segment);
    prevSrcLine = srcLine;
    prevSrcCol = srcCol;
  }

  return {
    version: 3,
    file: opts.generatedFile,
    sources: [opts.sourceFile],
    sourcesContent: [opts.source],
    names: [],
    mappings: lineMappings.join(';')
  };
}
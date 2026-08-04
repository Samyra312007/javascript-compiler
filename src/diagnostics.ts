export enum DiagnosticSeverity {
  Error = 'error',
  Warning = 'warning',
  Info = 'info'
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  length: number;
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  location: SourceLocation;
}

export type DiagnosticFilter = (d: Diagnostic) => boolean;

/**
 * Collects structured diagnostics across the whole pipeline.
 * Optionally reads source lines to render pretty, caret-annotated output.
 */
export class Diagnostics {
  private items: Diagnostic[] = [];
  private sourceLines: Map<string, string[]> = new Map();

  constructor(private showSource: boolean = true) {}

  public setSource(file: string, source: string): void {
    this.sourceLines.set(file, source.split('\n'));
  }

  public add(d: Diagnostic): void {
    this.items.push(d);
  }

  public error(file: string, message: string, line = 0, column = 0, code = 'error', length = 0): void {
    this.items.push({ severity: DiagnosticSeverity.Error, message, code, location: { file, line, column, length } });
  }

  public warn(file: string, message: string, line = 0, column = 0, code = 'warning', length = 0): void {
    this.items.push({ severity: DiagnosticSeverity.Warning, message, code, location: { file, line, column, length } });
  }

  public info(file: string, message: string, line = 0, column = 0, code = 'info', length = 0): void {
    this.items.push({ severity: DiagnosticSeverity.Info, message, code, location: { file, line, column, length } });
  }

  public hasErrors(): boolean {
    return this.items.some((d) => d.severity === DiagnosticSeverity.Error);
  }

  public count(severity?: DiagnosticSeverity): number {
    if (!severity) return this.items.length;
    return this.items.filter((d) => d.severity === severity).length;
  }

  public all(): Diagnostic[] {
    return this.items;
  }

  public bySeverity(severity: DiagnosticSeverity): Diagnostic[] {
    return this.items.filter((d) => d.severity === severity);
  }

  public filter(fn: DiagnosticFilter): Diagnostic[] {
    return this.items.filter(fn);
  }

  public clear(): void {
    this.items = [];
  }

  /**
   * Pretty-print a diagnostic with a source snippet and caret marker.
   */
  public format(d: Diagnostic): string {
    const { file, line, column, length } = d.location;
    const label = `${file}:${line}:${column}`;
    const head = `${d.severity.toUpperCase()} [${d.code}] ${label}: ${d.message}`;
    if (!this.showSource || !file) return head;

    const lines = this.sourceLines.get(file);
    if (!lines || line < 1 || line > lines.length) return head;

    const srcLine = lines[line - 1];
    const caretCol = Math.max(0, column - 1);
    const carets = Math.max(1, length || 1);
    return `${head}\n  ${srcLine}\n  ${' '.repeat(caretCol)}${'^'.repeat(carets)}`;
  }

  public render(): string {
    const out: string[] = [];
    for (const d of this.items) {
      out.push(this.format(d));
      out.push('');
    }
    return out.join('\n').replace(/\n$/, '');
  }

  public summary(): string {
    const errs = this.count(DiagnosticSeverity.Error);
    const warns = this.count(DiagnosticSeverity.Warning);
    const parts: string[] = [];
    if (errs) parts.push(`${errs} error${errs === 1 ? '' : 's'}`);
    if (warns) parts.push(`${warns} warning${warns === 1 ? '' : 's'}`);
    return parts.join(', ') || '0 problems';
  }
}
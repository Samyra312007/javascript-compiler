export interface PeepholeOptions {
  // No configuration knobs yet; reserved for future tuning.
}

export function applyPeephole(lines: string[], options?: PeepholeOptions): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = (lines[i + 1] || '').trim();

    // Skip pure no-ops.
    if (/^MOV\s+R\d+,\s*R\d+$/i.test(line)) {
      const m = line.match(/^MOV\s+(R\d+),\s*(R\d+)$/i);
      if (m && m[1].toUpperCase() === m[2].toUpperCase()) continue;
    }
    if (/^mov\s+\w+,\s*\w+$/i.test(line)) {
      const m = line.match(/^mov\s+(\w+),\s*(\w+)$/i);
      if (m && m[1].toLowerCase() === m[2].toLowerCase()) continue;
    }

    // ADD/SUB of 0 and MUL/DIV by 1 are no-ops.
    if (/^ADD\s+R\d+,\s*0$/i.test(line)) continue;
    if (/^add\s+\w+,\s*0$/i.test(line)) continue;
    if (/^SUB\s+R\d+,\s*0$/i.test(line)) continue;
    if (/^sub\s+\w+,\s*0$/i.test(line)) continue;
    if (/^MUL\s+R\d+,\s*1$/i.test(line)) continue;
    if (/^imul\s+\w+,\s*\w+,\s*1$/i.test(line)) continue;

    // Jumps to the immediately-following label are no-ops.
    if (/^JMP\s+\d+$/i.test(line)) {
      const addr = line.match(/^JMP\s+(\d+)$/i)![1];
      if (next.startsWith(addr)) continue;
    }
    if (/^jmp\s+\.L\d+$/i.test(line)) {
      const addr = line.match(/^jmp\s+(\.L\d+)$/i)![1];
      if (next.startsWith(addr)) continue;
    }

    out.push(line);
  }
  return out;
}

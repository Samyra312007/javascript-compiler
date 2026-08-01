import { TACInstruction, TACOp } from '../../ir/tac.js';
import { isTemp, isPureInstruction, isPureExpression } from '../utils.js';
import { buildCFG, BasicBlock } from '../cfg.js';
import { computeTempIntervals } from '../dataflow.js';
import type { PassResult } from './simplify.js';

export function deadCodeElimination(instructions: TACInstruction[]): PassResult {
  let changed = false;
  let cur = instructions.slice();

  // 1. Dead-temp elimination: remove pure defs of temps that are never used.
  //    Iterate to fixpoint so removals cascade.
  while (true) {
    const intervals = computeTempIntervals(cur);
    const keep: boolean[] = new Array(cur.length).fill(true);
    let removed = false;
    for (let i = 0; i < cur.length; i++) {
      const inst = cur[i];
      if (!isPureInstruction(inst)) continue;
      const r = inst.result;
      if (!r || !isTemp(r)) continue;
      if (!intervals.has(r) || intervals.get(r)!.end === intervals.get(r)!.defIndex) {
        // The temp is defined but never used anywhere.
        keep[i] = false;
        removed = true;
      }
    }
    if (!removed) break;
    cur = cur.filter((_, i) => keep[i]);
    changed = true;
  }

  // 2. Unreachable pure-block elimination (conservative: only blocks with no
  //    side effects and no function labels are candidates for removal).
  const unreachable = findUnreachableBlocks(cur);
  if (unreachable.size > 0) {
    const cfg = buildCFG(cur);
    const ranges = blockRanges(cur, cfg.blocks);
    const removable = new Set<number>();
    for (const b of cfg.blocks) {
      if (!unreachable.has(b.id)) continue;
      if (isPureBlock(b)) removable.add(b.id);
    }
    if (removable.size > 0) {
      const keep = new Set<number>();
      for (const b of cfg.blocks) {
        if (removable.has(b.id)) continue;
        const [s, e] = ranges.get(b.id)!;
        for (let i = s; i < e; i++) keep.add(i);
      }
      cur = cur.filter((_, i) => keep.has(i));
      changed = true;
    }
  }

  // 3. Label cleanup: drop unused jump-target markers that are not function entries.
  const targetCount = new Map<number, number>();
  for (const inst of cur) {
    if (inst.op === TACOp.JUMP || inst.op === TACOp.COND_JUMP) {
      if (inst.label !== undefined) targetCount.set(inst.label, (targetCount.get(inst.label) ?? 0) + 1);
    }
  }
  const labelsToKeep = new Set<number>();
  for (const inst of cur) {
    if (inst.op === TACOp.LABEL) {
      if (inst.result !== undefined || (targetCount.get(inst.label!) ?? 0) > 0) {
        labelsToKeep.add(inst.label!);
      }
    }
  }
  if (labelsToKeep.size > 0) {
    const before = cur.length;
    cur = cur.filter((inst) => {
      if (inst.op === TACOp.LABEL && !labelsToKeep.has(inst.label!)) return false;
      return true;
    });
    if (cur.length !== before) changed = true;
  }

  return { instructions: cur, changed };
}

function findUnreachableBlocks(instructions: TACInstruction[]): Set<number> {
  const cfg = buildCFG(instructions);
  const ranges = blockRanges(instructions, cfg.blocks);
  const roots = new Set<number>([0]);
  for (const b of cfg.blocks) {
    const first = instructions[ranges.get(b.id)![0]];
    if (first && first.op === TACOp.LABEL && first.result !== undefined) {
      roots.add(b.id); // function-entry blocks are reachable via calls
    }
  }
  const reachable = new Set<number>();
  const stack = [...roots];
  while (stack.length > 0) {
    const v = stack.pop()!;
    if (reachable.has(v)) continue;
    reachable.add(v);
    for (const s of cfg.blocks[v].succs) stack.push(s);
  }
  const unreachable = new Set<number>();
  for (const b of cfg.blocks) if (!reachable.has(b.id)) unreachable.add(b.id);
  return unreachable;
}

function isPureBlock(block: BasicBlock): boolean {
  for (const inst of block.instructions) {
    if (inst.op === TACOp.LABEL && inst.result !== undefined) return false;
    if (inst.op === TACOp.LABEL || inst.op === TACOp.JUMP) continue;
    if (!isPureExpression(inst) && inst.op !== TACOp.ASSIGN) return false;
    if (inst.op === TACOp.ASSIGN && !isTemp(inst.result)) return false;
  }
  return true;
}

function blockRanges(instructions: TACInstruction[], blocks: BasicBlock[]): Map<number, [number, number]> {
  const ranges = new Map<number, [number, number]>();
  let idx = 0;
  for (const b of blocks) {
    ranges.set(b.id, [idx, idx + b.instructions.length]);
    idx += b.instructions.length;
  }
  return ranges;
}

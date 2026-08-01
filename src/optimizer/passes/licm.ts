import { TACInstruction } from '../../ir/tac.js';
import { isTemp, isOpaqueConstant, isPureInstruction } from '../utils.js';
import { buildCFG, computeDominators, findNaturalLoops, BasicBlock } from '../cfg.js';
import { computeTempIntervals } from '../dataflow.js';
import type { PassResult } from './simplify.js';

export function loopInvariantCodeMotion(instructions: TACInstruction[]): PassResult {
  let changed = false;
  let cur = instructions.slice();

  for (let iter = 0; iter < 32; iter++) {
    const cfg = buildCFG(cur);
    const dom = computeDominators(cfg);
    const loops = findNaturalLoops(cfg, dom);
    if (loops.length === 0) break;

    const { blockOfIndex, blockEnd } = indexMap(cur, cfg.blocks);
    const intervals = computeTempIntervals(cur);
    const defBlock = new Map<string, number>();
    for (const [t, iv] of intervals) defBlock.set(t, blockOfIndex[iv.defIndex]);

    let hoisted = false;
    for (const loop of loops) {
      if (loop.preheader === null) continue;

      const invariant = new Set<number>();
      let innerChanged = true;
      while (innerChanged) {
        innerChanged = false;
        for (let i = 0; i < cur.length; i++) {
          if (invariant.has(i)) continue;
          const inst = cur[i];
          if (!loop.body.has(blockOfIndex[i])) continue;
          if (!isPureInstruction(inst) || !isTemp(inst.result)) continue;
          if (isInvariant(inst, loop, intervals, defBlock, invariant)) {
            invariant.add(i);
            innerChanged = true;
          }
        }
      }
      if (invariant.size === 0) continue;

      const preheaderEnd = blockEnd[loop.preheader];
      const hoistedInstrs = [...invariant].sort((a, b) => a - b).map((i) => cur[i]);
      const keep = new Set<number>();
      for (let i = 0; i < cur.length; i++) if (!invariant.has(i)) keep.add(i);
      const filtered = cur.filter((_, i) => keep.has(i));
      cur = [...filtered.slice(0, preheaderEnd), ...hoistedInstrs, ...filtered.slice(preheaderEnd)];
      hoisted = true;
      changed = true;
      break;
    }
    if (!hoisted) break;
  }

  return { instructions: cur, changed };
}

function isInvariant(
  inst: TACInstruction,
  loop: { body: Set<number> },
  intervals: Map<string, { temp: string; defIndex: number; start: number; end: number }>,
  defBlock: Map<string, number>,
  invariant: Set<number>,
): boolean {
  for (const operand of [inst.arg1, inst.arg2]) {
    if (operand === undefined) continue;
    if (isOpaqueConstant(operand)) continue;
    if (isTemp(operand)) {
      const iv = intervals.get(operand);
      if (!iv) return false;
      const db = defBlock.get(operand);
      if (db !== undefined && !loop.body.has(db)) continue;
      if (invariant.has(iv.defIndex)) continue;
      return false;
    }
    // A non-temp identifier (variable) is never loop-invariant here.
    return false;
  }
  return true;
}

function indexMap(instructions: TACInstruction[], blocks: BasicBlock[]): {
  blockOfIndex: number[];
  blockEnd: number[];
} {
  const blockOfIndex: number[] = new Array(instructions.length);
  const blockEnd: number[] = new Array(blocks.length);
  let idx = 0;
  for (const b of blocks) {
    blockEnd[b.id] = idx + b.instructions.length;
    for (let i = 0; i < b.instructions.length; i++) {
      blockOfIndex[idx + i] = b.id;
    }
    idx += b.instructions.length;
  }
  return { blockOfIndex, blockEnd };
}

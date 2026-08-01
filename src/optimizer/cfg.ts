import { TACInstruction, TACOp } from '../ir/tac.js';

export interface BasicBlock {
  id: number;
  instructions: TACInstruction[];
  labels: number[];
  preds: number[];
  succs: number[];
}

export interface CFG {
  blocks: BasicBlock[];
  labelToBlock: Map<number, number>;
}

export function buildCFG(instructions: TACInstruction[]): CFG {
  const blocks: BasicBlock[] = [];
  const labelToBlock = new Map<number, number>();
  let current: TACInstruction[] = [];
  let currentLabels: number[] = [];

  const flushBlock = () => {
    if (current.length === 0 && currentLabels.length === 0) return;
    const block: BasicBlock = {
      id: blocks.length,
      instructions: current,
      labels: currentLabels,
      preds: [],
      succs: [],
    };
    for (const l of currentLabels) labelToBlock.set(l, block.id);
    blocks.push(block);
    current = [];
    currentLabels = [];
  };

  for (const inst of instructions) {
    if (inst.op === TACOp.LABEL) {
      flushBlock();
      currentLabels.push(inst.label!);
      current.push(inst);
    } else {
      current.push(inst);
      if (inst.op === TACOp.JUMP || inst.op === TACOp.COND_JUMP || inst.op === TACOp.RETURN) {
        flushBlock();
      }
    }
  }
  flushBlock();

  const addSucc = (i: number, j: number) => {
    if (j < 0 || j >= blocks.length || j === i) return;
    if (!blocks[i].succs.includes(j)) {
      blocks[i].succs.push(j);
      blocks[j].preds.push(i);
    }
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const last = block.instructions[block.instructions.length - 1];
    if (last && last.op === TACOp.JUMP) {
      const target = labelToBlock.get(last.label!);
      if (target !== undefined) addSucc(i, target);
    } else if (last && last.op === TACOp.COND_JUMP) {
      const target = labelToBlock.get(last.label!);
      if (target !== undefined) addSucc(i, target);
      addSucc(i, i + 1);
    } else if (last && last.op === TACOp.RETURN) {
      // no successors
    } else {
      addSucc(i, i + 1);
    }
  }

  return { blocks, labelToBlock };
}

export function computeDominators(cfg: CFG): Map<number, Set<number>> {
  const n = cfg.blocks.length;
  const dom = new Map<number, Set<number>>();
  const all = new Set<number>(Array.from({ length: n }, (_, i) => i));
  for (const b of cfg.blocks) dom.set(b.id, new Set(all));
  dom.set(0, new Set([0]));

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < n; i++) {
      const preds = cfg.blocks[i].preds;
      if (preds.length === 0) continue;
      let inter: Set<number> | null = null;
      for (const p of preds) {
        const dp = dom.get(p);
        if (!dp) continue;
        if (inter === null) inter = new Set(dp);
        else {
          for (const x of [...inter]) if (!dp.has(x)) inter.delete(x);
        }
      }
      if (inter === null) inter = new Set([i]);
      inter.add(i);
      const prev = dom.get(i)!;
      if (prev.size !== inter.size || !setsEqual(prev, inter)) {
        dom.set(i, inter);
        changed = true;
      }
    }
  }
  return dom;
}

export interface Loop {
  header: number;
  body: Set<number>;
  preheader: number | null;
}

export function findNaturalLoops(cfg: CFG, dom: Map<number, Set<number>>): Loop[] {
  const loops: Loop[] = [];
  for (const block of cfg.blocks) {
    for (const s of block.succs) {
      if (dom.get(block.id)!.has(s)) {
        const body = new Set<number>([s]);
        const stack = [block.id];
        while (stack.length > 0) {
          const v = stack.pop()!;
          if (body.has(v)) continue;
          body.add(v);
          for (const p of cfg.blocks[v].preds) {
            if (!body.has(p)) stack.push(p);
          }
        }
        let preheader: number | null = null;
        for (const p of cfg.blocks[s].preds) {
          if (!body.has(p)) {
            preheader = p;
            break;
          }
        }
        loops.push({ header: s, body, preheader });
      }
    }
  }
  return loops;
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

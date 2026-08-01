import { TACInstruction } from '../ir/tac.js';
import { isTemp, defName, usedNames } from './utils.js';

export interface TempInterval {
  temp: string;
  defIndex: number;
  start: number;
  end: number;
}

export function computeTempIntervals(instructions: TACInstruction[]): Map<string, TempInterval> {
  const def = new Map<string, number>();
  const lastUse = new Map<string, number>();
  instructions.forEach((inst, i) => {
    const d = defName(inst);
    if (d && isTemp(d) && !def.has(d)) def.set(d, i);
    for (const u of usedNames(inst)) {
      if (isTemp(u)) lastUse.set(u, Math.max(lastUse.get(u) ?? -1, i));
    }
  });
  const intervals = new Map<string, TempInterval>();
  for (const [t, d] of def) {
    const end = Math.max(lastUse.get(t) ?? d, d);
    intervals.set(t, { temp: t, defIndex: d, start: d, end });
  }
  return intervals;
}

export function isTempDeadAt(intervals: Map<string, TempInterval>, temp: string, index: number): boolean {
  const iv = intervals.get(temp);
  if (!iv) return true;
  return iv.end < index;
}

export function isTempLiveAt(intervals: Map<string, TempInterval>, temp: string, index: number): boolean {
  const iv = intervals.get(temp);
  if (!iv) return false;
  return iv.start <= index && index <= iv.end;
}

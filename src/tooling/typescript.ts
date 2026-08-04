/**
 * Best-effort TypeScript -> JavaScript type-stripper.
 *
 * Strips type annotations and type-only syntax while PRESERVING line numbers
 * (removed spans are replaced with spaces, newlines kept) so that the output
 * can be mapped back 1:1 to the original source for source maps.
 *
 * Handles: variable/param/return/property annotations, interface/type
 * declarations, numeric enums, access modifiers, `as` casts, `!` non-null
 * assertions, `implements`, `import type`, optional params, and generic
 * parameter lists on functions/classes. Does NOT handle call-site generic
 * type arguments (`foo<number>(x)`).
 */

export interface Edit {
  start: number;
  end: number;
  text?: string;
}

type TKind = 'ident' | 'num' | 'str' | 'tmpl' | 'regex' | 'op' | 'other';

interface TSToken {
  kind: TKind;
  value: string;
  start: number;
  end: number;
}

const MAX_OP = [
  '>>>=', '**=', '===', '!==', '>>>=', '<<=', '>>=', '&&=', '||=', '??=',
  '...', '**', '>>>', '<<', '>>', '==', '!=', '<=', '>=', '&&', '||', '??',
  '?.', '=>', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  '+', '-', '*', '/', '%', '&', '|', '^', '~', '!', '<', '>', '=', '?', ':',
  ';', ',', '.', '(', ')', '{', '}', '[', ']', '`', '@', '#'
];

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;
const CONTROL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch']);
const MODIFIERS = new Set(['public', 'private', 'protected', 'readonly', 'abstract', 'override']);
const TYPE_DECL_KEYWORDS = new Set(['interface', 'declare', 'namespace']);

function isIdentChar(ch: string): boolean {
  return IDENT_PART.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v' || ch === '\u00a0';
}

export function tokenizeTS(source: string): TSToken[] {
  const tokens: TSToken[] = [];
  const n = source.length;
  let i = 0;

  const push = (kind: TKind, start: number, end: number) => {
    tokens.push({ kind, value: source.slice(start, end), start, end });
  };

  const prevToken = () => tokens[tokens.length - 1];

  while (i < n) {
    const ch = source[i];

    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    // Line comment
    if (ch === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (ch === '/' && source[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i = Math.min(n, i + 2);
      push('other', start, i);
      continue;
    }

    // String literal
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      while (i < n) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) { i++; break; }
        i++;
      }
      push('str', start, i);
      continue;
    }

    // Template literal (treated as opaque, incl. ${...})
    if (ch === '`') {
      const start = i;
      i++;
      while (i < n) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '`') { i++; break; }
        i++;
      }
      push('tmpl', start, i);
      continue;
    }

    // Regex literal heuristic
    if (ch === '/') {
      const prev = prevToken();
      const isRegex = !prev || prev.kind === 'op' || prev.kind === 'regex' ||
        (prev.kind === 'ident' && ['return', 'typeof', 'instanceof', 'in', 'of', 'case', 'delete', 'void', 'new', 'do', 'else', 'yield', 'await'].includes(prev.value)) ||
        prev.kind === 'other' && (prev.value === ')' || prev.value === ']' || prev.value === '}');
      if (isRegex) {
        const start = i;
        i++;
        let inClass = false;
        while (i < n) {
          const c = source[i];
          if (c === '\\') { i += 2; continue; }
          if (c === '[') { inClass = true; i++; continue; }
          if (c === ']') { inClass = false; i++; continue; }
          if (c === '/' && !inClass) { i++; break; }
          if (c === '\n') break;
          i++;
        }
        while (i < n && /[A-Za-z]/.test(source[i])) i++;
        push('regex', start, i);
        continue;
      }
    }

    // Number
    if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1]))) {
      const start = i;
      if (source[i] === '0' && (source[i + 1] === 'x' || source[i + 1] === 'X')) {
        i += 2;
        while (i < n && /[0-9a-fA-F_]/.test(source[i])) i++;
      } else if (source[i] === '0' && (source[i + 1] === 'b' || source[i + 1] === 'B')) {
        i += 2;
        while (i < n && /[01_]/.test(source[i])) i++;
      } else {
        while (i < n && /[0-9_]/.test(source[i])) i++;
        if (source[i] === '.') { i++; while (i < n && /[0-9_]/.test(source[i])) i++; }
        if (source[i] === 'e' || source[i] === 'E') {
          i++;
          if (source[i] === '+' || source[i] === '-') i++;
          while (i < n && isDigit(source[i])) i++;
        }
      }
      push('num', start, i);
      continue;
    }

    // Identifier / keyword
    if (IDENT_START.test(ch)) {
      const start = i;
      while (i < n && isIdentChar(source[i])) i++;
      push('ident', start, i);
      continue;
    }

    // Operator / punctuation (longest match)
    let matched = false;
    for (const op of MAX_OP) {
      if (source.startsWith(op, i)) {
        push('op', i, i + op.length);
        i += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Unknown char
    const start = i;
    i++;
    push('other', start, i);
  }

  return tokens;
}

interface ParenInfo {
  param: boolean;
  catchList: boolean;
}

export function stripTypeScript(source: string): { code: string; edits: Edit[] } {
  const tokens = tokenizeTS(source);
  const n = tokens.length;
  const removed: boolean[] = new Array(n).fill(false);
  const edits: Edit[] = [];

  const markRange = (from: number, to: number) => {
    for (let k = from; k <= to; k++) removed[k] = true;
  };

  const isRemoved = (idx: number) => idx < 0 || idx >= n || removed[idx];
  const nextSig = (idx: number): number => {
    let k = idx + 1;
    while (k < n && isRemoved(k)) k++;
    return k;
  };
  const prevSig = (idx: number): number => {
    let k = idx - 1;
    while (k >= 0 && isRemoved(k)) k--;
    return k;
  };

  // ---- Pass A: classify '(' as parameter list or grouping/call ----
  const parenInfo: ParenInfo[] = [];
  const pstack: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    if (t.value === '(') {
      pstack.push(i);
      parenInfo.push({ param: false, catchList: false });
    } else if (t.value === ')') {
      const openIdx = pstack.pop();
      if (openIdx === undefined) continue;
      const prev = prevSig(openIdx);
      const prevPrev = prev >= 0 ? prevSig(prev) : -1;
      // find matching close then the token after it
      let depth = 0;
      let after: number | null = null;
      for (let k = openIdx + 1; k < n; k++) {
        if (tokens[k].value === '(') depth++;
        else if (tokens[k].value === ')') {
          if (depth === 0) { after = nextSig(k); break; }
          depth--;
        }
      }
      let param = false;
      if (prev >= 0 && tokens[prev].value === 'function') param = true;
      else if (prev >= 0 && prevPrev >= 0 && tokens[prevPrev].value === 'function' && tokens[prev].kind === 'ident') param = true;
      else if (prev >= 0 && tokens[prev].value === 'catch') param = true;
      if (after !== null) {
        if (tokens[after].value === '=>' || tokens[after].value === '{' || tokens[after].value === ':') param = true;
      }
      parenInfo[parenInfo.length - 1].param = param;
    }
  }

  // ---- Pass B: strip type annotations / type-only syntax ----
  // parenDepth stack: '(' frames, +1 for '(', -1 for ')'
  // braceStack: block/object depth; classBodyStack marks class-body top-depth
  const stack: { kind: 'paren' | 'brace' | 'bracket' | 'angle'; param?: boolean; braceKind?: 'block' | 'object' | 'pattern' }[] = [];
  const classBodyDepth: number[] = [];
  let openParenCount = 0;
  let lastClosedParam = false;

  let declMode = false; // inside a let/const/var declaration (awaiting annotation before =)
  let inImport = false;

  const angleIsGeneric = (i: number): boolean => {
    // '<' right after a function/class name is a generic-parameter list
    const prev = prevSig(i);
    const prevPrev = prev >= 0 ? prevSig(prev) : -1;
    if (prev >= 0 && tokens[prev].kind === 'ident') {
      if (prevPrev >= 0 && tokens[prevPrev].value === 'function') return true;
      if (prevPrev >= 0 && tokens[prevPrev].value === 'class') return true;
      if (tokens[prev].value === 'interface' || tokens[prev].value === 'type') return true;
    }
    // generic arrow: `= <T>(...) =>` or `(<T>(...) =>`
    if (prev >= 0 && (tokens[prev].value === '=' || tokens[prev].value === '(' || tokens[prev].value === ':')) {
      // find matching '>'
      let depth = 0;
      for (let k = i + 1; k < n; k++) {
        const v = tokens[k].value;
        if (v === '<') depth++;
        else if (v === '>') {
          if (depth === 0) {
            const after = nextSig(k);
            if (after < n && tokens[after].value === '(') {
              // check it's an arrow: find matching close followed by =>
              let d2 = 0;
              for (let m = after + 1; m < n; m++) {
                if (tokens[m].value === '(') d2++;
                else if (tokens[m].value === ')') {
                  if (d2 === 0) {
                    const aa = nextSig(m);
                    return aa < n && tokens[aa].value === '=>';
                  }
                  d2--;
                }
              }
            }
            return false;
          }
          depth--;
        }
      }
    }
    return false;
  };

  const stripAnnotationEnd = (fromIdx: number, stopValues: Set<string>): number => {
    // marks tokens from ':' to the end of the type; returns index after type
    let depth = 0;
    let k = fromIdx + 1;
    for (; k < n; k++) {
      const t = tokens[k];
      if (t.kind === 'str' || t.kind === 'tmpl' || t.kind === 'regex') continue;
      const v = t.value;
      if (v === '(' || v === '{' || v === '[' || v === '<') depth++;
      else if (v === ')' || v === '}' || v === ']' || v === '>') {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0 && (stopValues.has(v) || t.kind === 'other')) {
        break;
      }
    }
    return k; // first token NOT part of the type
  };

  const stripReturnType = (colonIdx: number): number => {
    // like stripAnnotationEnd but the function-body '{' terminates the type.
    // An object type opens only when '{' directly follows a type-opening token
    // (':', '|', '&', '=', '(', '[', ',', '=>', 'extends').
    let depth = 0;
    let k = colonIdx + 1;
    for (; k < n; k++) {
      const t = tokens[k];
      if (t.kind === 'str' || t.kind === 'tmpl' || t.kind === 'regex') continue;
      const v = t.value;
      if (depth === 0 && (v === '=>' || v === ';' || v === ',' || v === '}')) break;
      if (v === '{') {
        if (depth === 0) {
          const pk = prevSig(k);
          const prevV = pk >= 0 ? tokens[pk].value : '';
          if (!['(', '[', ':', '|', '&', '=', ',', '=>', 'extends'].includes(prevV)) break;
        }
        depth++;
        continue;
      }
      if (v === '(' || v === '[' || v === '<') depth++;
      else if (v === ')' || v === ']' || v === '>') {
        if (depth === 0) break;
        depth--;
      } else if (v === '}') {
        if (depth === 0) break;
        depth--;
      }
    }
    return k;
  };

  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    const v = t.value;
    const prev = prevSig(i);
    const prevTok = prev >= 0 ? tokens[prev] : null;
    const top = stack[stack.length - 1];

    if (isRemoved(i)) {
      // still need to maintain stack for removed tokens (e.g. generic params on function)
      if (v === '(') stack.push({ kind: 'paren' });
      else if (v === ')') { while (stack.length && stack[stack.length - 1].kind !== 'paren') stack.pop(); if (stack.length) stack.pop(); }
      else if (v === '{') stack.push({ kind: 'brace' });
      else if (v === '}') { while (stack.length && stack[stack.length - 1].kind !== 'brace') stack.pop(); if (stack.length) stack.pop(); }
      else if (v === '[') stack.push({ kind: 'bracket' });
      else if (v === ']') { while (stack.length && stack[stack.length - 1].kind !== 'bracket') stack.pop(); if (stack.length) stack.pop(); }
      continue;
    }

    // -------- statement-level type constructs --------
    if (t.kind === 'ident') {
      // `import type ... from '...'` -> remove whole statement
      if (v === 'import' && !inImport) {
        const nx = nextSig(i);
        if (nx < n && tokens[nx].value === 'type') {
          let k = i;
          let end = nx;
          // find end of statement: ';' or EOF or a line break after a string
          while (k < n) {
            if (tokens[k].value === ';') { end = k; break; }
            if (tokens[k].kind === 'str' && (tokens[k].end >= n || source[tokens[k].end] === '\n' || source[tokens[k].end] === ';')) {
              end = k;
              break;
            }
            k++;
          }
          markRange(i, end);
          // register removed import as a container
          continue;
        }
      }
      // `import { type A, B } from 'x'` -> remove just `type`
      if (v === 'import' && !inImport) { inImport = true; }
      if (inImport && v === 'type') {
        const nx = nextSig(i);
        if (nx < n && tokens[nx].kind === 'ident') { markRange(i, i); continue; }
      }
      if (v === 'from' && inImport) inImport = false;

      // `export type X = ...` / `export interface ...` -> remove statement
      if (v === 'export') {
        const nx = nextSig(i);
        if (nx < n && (tokens[nx].value === 'type' || tokens[nx].value === 'interface')) {
          let k = i;
          let end = nx;
          let braceDepth = 0;
          while (k < n) {
            const tv = tokens[k].value;
            if (tv === ';' && braceDepth === 0) { end = k; break; }
            if (tv === '{') braceDepth++;
            else if (tv === '}') { if (braceDepth === 0) { end = k; break; } braceDepth--; }
            k++;
          }
          markRange(i, end);
          continue;
        }
      }

      // `interface X { ... }` / `declare ...` / `namespace X { }` / `type X = ...`
      if (TYPE_DECL_KEYWORDS.has(v) || (v === 'type' && !declMode)) {
        // `type X<...> = ...` requires an ident (optionally generic) followed by '='
        if (v === 'type') {
          const nx = nextSig(i);
          if (nx >= n || tokens[nx].kind !== 'ident') continue;
          let k = nextSig(nx);
          if (k < n && tokens[k].value === '<') {
            let depth = 0;
            for (; k < n; k++) {
              if (tokens[k].value === '<') depth++;
              else if (tokens[k].value === '>') { depth--; if (depth === 0) { k = nextSig(k); break; } }
            }
          }
          if (k >= n || tokens[k].value !== '=') continue;
        }
        // find the end: matching '}' (for interface/namespace) or ';' (for type/declare)
        let k = i;
        let end = i;
        let braceDepth = 0;
        const newStmt = new Set(['function', 'class', 'let', 'const', 'var', 'interface', 'type', 'import', 'export', 'return', 'if', 'for', 'while', 'switch', 'throw', 'try', 'async', 'enum']);
        while (k < n) {
          const tv = tokens[k].value;
          if (v === 'type' || v === 'declare') {
            if (tv === '{') braceDepth++;
            else if (tv === '}') {
              if (braceDepth > 0) braceDepth--;
              else { end = k; break; }
            } else if (tv === ';' && braceDepth === 0) {
              end = k;
              break;
            } else if (braceDepth === 0 && tokens[k].kind === 'ident' && newStmt.has(tv) && k > i + 2) {
              break;
            }
          } else {
            // interface / namespace: end at the matching '}'
            if (tv === '{') braceDepth++;
            else if (tv === '}') {
              if (braceDepth === 0) { end = k; break; }
              if (braceDepth === 1) { end = k; break; }
              braceDepth--;
            } else if (tv === ';' && braceDepth === 0) {
              end = k;
              break;
            }
          }
          k++;
        }
        // don't remove if we never found a terminating brace/semicolon (unsafe)
        if (end > i) markRange(i, end);
        continue;
      }

      // access modifiers -> remove the modifier token
      if (MODIFIERS.has(v)) {
        const nx = nextSig(i);
        if (nx < n && (tokens[nx].kind === 'ident' || tokens[nx].value === '(')) {
          markRange(i, i);
          continue;
        }
      }

      // `implements X, Y` in class -> remove
      if (v === 'implements') {
        let k = i;
        let end = i;
        while (k < n) {
          if (tokens[k].value === '{') { end = k - 1; break; }
          if (tokens[k].value === ';') { end = k; break; }
          k++;
        }
        markRange(i, end);
        continue;
      }

      // `let/const/var` enters declaration mode
      if (v === 'let' || v === 'const' || v === 'var') {
        declMode = true;
        continue;
      }
    }

    // -------- declaration-mode annotation: `let x: T` --------
    const inObjectLike = top && top.kind === 'brace' && top.braceKind === 'object';
    if (v === ':' && declMode && !inObjectLike) {
      // in a declaration: only when previous token is an ident or a pattern end
      if (prevTok && (prevTok.kind === 'ident' || prevTok.value === '}' || prevTok.value === ']')) {
        const end = stripAnnotationEnd(i, new Set(['=', ',', ';', ')', '}', ']', '=>', '{']));
        markRange(i, end - 1);
        i = end - 1;
        continue;
      }
    }

    // -------- class-body property annotation: `x: T;` / `x: T = ...` --------
    if (v === ':' && classBodyDepth.length > 0) {
      const topBrace = stack[stack.length - 1];
      if (topBrace && topBrace.kind === 'brace' && classBodyDepth[classBodyDepth.length - 1] === stack.length - 1) {
        if (prevTok && (prevTok.kind === 'ident' || prevTok.value === '}')) {
          const end = stripAnnotationEnd(i, new Set([';', '=', '}', ')', ',']));
          markRange(i, end - 1);
          i = end - 1;
          continue;
        }
      }
    }

    // -------- param-list annotation: `(a: T, b: U)` --------
    if (v === ':' && top && top.kind === 'paren' && top.param) {
      if (prevTok && (prevTok.kind === 'ident' || prevTok.value === '}' || prevTok.value === ']' || prevTok.value === 'this')) {
        const end = stripAnnotationEnd(i, new Set(['=', ',', ')', '=>', '{', '}']));
        markRange(i, end - 1);
        i = end - 1;
        continue;
      }
    }

    // -------- return-type annotation after a param list: `): T` --------
    if (v === ':' && lastClosedParam && prevTok && prevTok.value === ')') {
      const end = stripReturnType(i);
      markRange(i, end - 1);
      i = end - 1;
      continue;
    }
    if (v === '?' && top && top.kind === 'paren' && top.param) {
      if (prevTok && prevTok.kind === 'ident') { markRange(i, i); continue; }
    }
    if (v === '?' && classBodyDepth.length > 0) {
      const topBrace = stack[stack.length - 1];
      if (topBrace && topBrace.kind === 'brace' && classBodyDepth[classBodyDepth.length - 1] === stack.length - 1) {
        if (prevTok && prevTok.kind === 'ident') { markRange(i, i); continue; }
      }
    }

    // -------- `as Type` cast --------
    if (t.kind === 'ident' && v === 'as' && !inImport) {
      if (prevTok && (prevTok.kind === 'ident' || prevTok.value === ')' || prevTok.value === ']')) {
        const end = stripAnnotationEnd(i, new Set([';', ',', ')', ']', '}', '=', '=>', '+', '-', '*', '/', '%', '==', '===', '!=', '!==', '&&', '||', '?', '??', '?.', '<', '>', '<=', '>=', '++', '--']));
        markRange(i, end - 1);
        i = end - 1;
        continue;
      }
    }

    // -------- `!` non-null assertion --------
    if (v === '!' && prevTok && (prevTok.kind === 'ident' || prevTok.value === ')' || prevTok.value === ']')) {
      markRange(i, i);
      continue;
    }

    // -------- generic parameter lists: `function f<T>(`, `class A<T>` --------
    if (v === '<' && angleIsGeneric(i)) {
      let depth = 0;
      let end = i;
      for (let k = i; k < n; k++) {
        if (tokens[k].value === '<') depth++;
        else if (tokens[k].value === '>') {
          depth--;
          if (depth === 0) { end = k; break; }
        }
      }
      if (end > i) {
        markRange(i, end);
        i = end;
        continue;
      }
    }

    // -------- stack maintenance --------
    if (v === '(') {
      const info = parenInfo[openParenCount] ?? { param: false, catchList: false };
      openParenCount++;
      stack.push({ kind: 'paren', param: info.param });
    } else if (v === ')') {
      const closingParen = stack[stack.length - 1];
      while (stack.length && stack[stack.length - 1].kind !== 'paren') stack.pop();
      lastClosedParam = stack[stack.length - 1]?.kind === 'paren' ? (stack[stack.length - 1] as any).param === true : false;
      void closingParen;
      if (stack.length) stack.pop();
    } else if (v === '{') {
      // classify brace: block vs object-literal vs destructuring pattern
      const prevV = prevTok ? prevTok.value : '';
      const objectLike = new Set(['=', '(', '[', ',', ':', '?', 'return', 'throw', 'case', 'yield', 'await', 'typeof', 'delete', 'void', 'new', '+', '-', '*', '/', '%', '&', '|', '^', '!', '<', '>', '==', '===', '!=', '!==', '&&', '||', '??', '<=', '>=', '**', '+=', '-=']);
      const braceKind = (prevV === 'let' || prevV === 'const' || prevV === 'var') ? 'pattern'
        : objectLike.has(prevV) ? 'object' : 'block';
      stack.push({ kind: 'brace', braceKind });
      const isClass = (() => {
        const step = () => {
          p = prevSig(p);
          while (p >= 0 && isRemoved(p)) p = prevSig(p);
        };
        let p = prev;
        while (p >= 0 && isRemoved(p)) p = prevSig(p);
        while (p >= 0 && tokens[p].value === 'implements') step();
        while (p >= 0 && tokens[p].kind === 'ident' && tokens[p].value !== 'class') {
          step();
          if (p >= 0 && tokens[p].value === 'extends') step();
        }
        return p >= 0 && tokens[p].value === 'class';
      })();
      if (isClass) {
        classBodyDepth.push(stack.length - 1);
      }
    } else if (v === '}') {
      while (stack.length && stack[stack.length - 1].kind !== 'brace') stack.pop();
      if (stack.length) {
        if (classBodyDepth.length && classBodyDepth[classBodyDepth.length - 1] === stack.length - 1) {
          classBodyDepth.pop();
        }
        stack.pop();
      }
    } else if (v === '[') {
      stack.push({ kind: 'bracket' });
    } else if (v === ']') {
      while (stack.length && stack[stack.length - 1].kind !== 'bracket') stack.pop();
      if (stack.length) stack.pop();
    }

    // -------- declaration mode toggling --------
    if (declMode) {
      if (v === '=') declMode = false;
      else if (v === ';') declMode = false;
      else if (v === ',' && (!top || top.kind === 'paren')) declMode = true;
    }
  }

  // ---- Apply edits (removed tokens -> spans, plus replacement text) ----
  const removals: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < n; i++) {
    if (removed[i]) {
      const start = tokens[i].start;
      let end = tokens[i].end;
      while (i + 1 < n && removed[i + 1]) {
        i++;
        end = tokens[i].end;
      }
      removals.push({ start, end });
    }
  }

  let code = source;
  const all = [...removals.map((r) => ({ ...r, text: undefined as string | undefined })), ...edits];
  all.sort((a, b) => a.start - b.start || b.end - a.end);

  // build output char-by-char (preserve newlines so line numbers are stable)
  const chars = source.split('');
  for (const e of all) {
    const text = e.text ?? '';
    for (let k = e.start; k < e.end; k++) {
      if (chars[k] !== '\n') chars[k] = '';
    }
    // place replacement text at start (overwrite; blanked chars above are already cleared)
    if (text) {
      for (let k = 0; k < text.length; k++) {
        const idx = e.start + k;
        if (idx < chars.length) chars[idx] = text[k];
      }
    }
  }
  code = chars.join('');
  // replace empty gaps with spaces, preserving newlines
  code = code.replace(/\u0000/g, ' ');
  // collapse runs of spaces introduced across edits but preserve line structure is fine.

  return { code, edits: all };
}

export function isTypeScriptFile(file: string): boolean {
  return /\.(ts|tsx)$/i.test(file);
}
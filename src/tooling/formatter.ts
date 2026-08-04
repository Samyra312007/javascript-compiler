/**
 * Minimal JS/TS source formatter.
 *
 * Re-indents code based on braces/parens/brackets and normalizes spacing.
 * Reuses the offset-aware tokenizer from the TypeScript stripper so strings,
 * template literals and regexes are never mangled. Line comments are dropped;
 * block comments are preserved.
 */

import { tokenizeTS } from './typescript.js';

const CONTROL_KEYS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
const INLINE_AFTER_BLOCK = new Set(['else', 'catch', 'finally', 'while']);
const NO_SPACE_OPS = new Set(['.', '?.', '(', '[', '!', '~', '++', '--', '#', '@']);
const VALUE_CLOSERS = new Set([')', ']', '}']);

function isValueToken(t: { kind: string; value: string }): boolean {
  return t.kind === 'ident' || t.kind === 'num' || t.kind === 'str' || t.kind === 'regex';
}

export function formatJS(source: string): string {
  const tokens = tokenizeTS(source);
  if (tokens.length === 0) return source;

  const out: string[] = [];
  let indent = 0;
  let atLineStart = true;
  let prev: { kind: string; value: string } | null = null;
  let lastWasBinaryOp = false;
  let parenDepth = 0;

  const write = (text: string) => {
    if (atLineStart && text.trim()) {
      out.push('  '.repeat(indent));
      atLineStart = false;
    }
    out.push(text);
  };

  const writeSpace = () => {
    if (atLineStart) return;
    const last = out[out.length - 1];
    if (last && last.endsWith(' ')) return;
    out.push(' ');
  };

  const newline = () => {
    if (!atLineStart) {
      out.push('\n');
      atLineStart = true;
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const v = t.value;

    if (t.kind === 'tmpl') {
      if (prev && (isValueToken(prev) || prev.value === '=' || prev.value === ':')) writeSpace();
      write(v);
      prev = t;
      continue;
    }

    if (t.kind === 'other' && v.startsWith('/*')) {
      write(v);
      newline();
      prev = t;
      continue;
    }

    // line comment (dropped by the tokenizer) — handled implicitly

    if (v === '{') {
      if (!atLineStart) write(' ');
      write('{');
      indent++;
      newline();
      prev = t;
      continue;
    }

    if (v === '}') {
      newline();
      indent = Math.max(0, indent - 1);
      const nx = i + 1 < tokens.length ? tokens[i + 1].value : '';
      write('}');
      if (INLINE_AFTER_BLOCK.has(nx) || nx === ';' || nx === ',') {
        prev = t;
        continue;
      }
      newline();
      prev = t;
      continue;
    }

    if (v === ';') {
      write(';');
      if (parenDepth > 0) writeSpace();
      if (parenDepth === 0) newline();
      prev = t;
      continue;
    }

    if (v === ',') {
      write(', ');
      prev = t;
      continue;
    }

    // ---- spacing ----
    let space = false;
    const prevV = prev ? prev.value : '';
    const prevIsWord = prev ? isValueToken(prev) : false;
    const curIsWord = isValueToken(t);
    const prevIsCloser = prev ? VALUE_CLOSERS.has(prevV) : false;

    if (v === '(' || v === '[') {
      // `if (` and `= [` get a space; `f(` and `a[` do not
      if (prev && (CONTROL_KEYS.has(prevV) || ['=', 'return', ':', '=>', '&&', '||', '?', ',', '=>', 'of'].includes(prevV))) space = true;
      parenDepth++;
      lastWasBinaryOp = false;
    } else if (v === ')' || v === ']') {
      space = false;
      parenDepth = Math.max(0, parenDepth - 1);
      lastWasBinaryOp = false;
    } else if (v === '.') {
      space = false;
      lastWasBinaryOp = false;
    } else if (curIsWord) {
      space = !atLineStart && (prevIsWord || prevIsCloser || lastWasBinaryOp || prevV === ':' || prevV === ',');
      lastWasBinaryOp = false;
    } else if (v === ':' ) {
      space = false;
      write(v);
      writeSpace();
      lastWasBinaryOp = false;
      prev = t;
      continue;
    } else if (t.kind === 'op') {
      // binary operator if the previous token is a value (not a prefix keyword)
      const unaryPrefix = prev && ['return', 'typeof', 'delete', 'void', 'case', 'throw', 'yield', 'await', '=>', '(', '[', ',', ':', '=', '{', ';', '&&', '||', '?'].includes(prevV);
      const isBinary = (prevIsWord || prevIsCloser) && !unaryPrefix;
      if (isBinary) {
        space = !NO_SPACE_OPS.has(v) && !atLineStart;
        lastWasBinaryOp = space;
      } else {
        // unary: keep attached to operands, but keep a space after a keyword/operator
        space = prevIsWord || (!!prev && ['=', '+', '-', '*', '/', '%', '&&', '||', '?', ':', '==', '===', '!=', '!==', '<', '>', '<=', '>='].includes(prevV));
        lastWasBinaryOp = false;
      }
    } else if (t.kind === 'other') {
      space = false;
      lastWasBinaryOp = false;
    }

    if (space) writeSpace();
    write(v);

    prev = t;
  }
  if (!atLineStart) out.push('\n');

  return out.join('').replace(/[ \t]+$/gm, '').replace(/[ \t]+\n/g, '\n');
}
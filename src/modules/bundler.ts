import * as path from 'path';
import { Program } from '../ast/ast-types.js';
import { ModuleGraph, ModuleRecord } from './graph.js';
import {
  ModuleAnalysis, ModuleRewriter, ExportTarget, prefixed, moduleObjectNameOf,
  collectPatternNames
} from './rewriter.js';

export interface BundleResult {
  program: Program | null;
  errors: string[];
}

export function hasModuleSyntax(ast: Program): boolean {
  for (const stmt of ast.body) {
    if (stmt.type === 'ImportDeclaration' ||
        stmt.type === 'ExportNamedDeclaration' ||
        stmt.type === 'ExportDefaultDeclaration' ||
        stmt.type === 'ExportAllDeclaration') {
      return true;
    }
  }
  let found = false;
  const walk = (node: any): void => {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node.type === 'CallExpression' &&
        node.callee && node.callee.type === 'Identifier' && node.callee.name === 'require' &&
        node.arguments[0] && node.arguments[0].type === 'Literal' &&
        typeof node.arguments[0].value === 'string') {
      found = true;
      return;
    }
    if (node.type === 'ImportExpression' &&
        node.source && node.source.type === 'Literal' &&
        typeof node.source.value === 'string') {
      found = true;
      return;
    }
    if (node.type === 'MemberExpression') {
      const obj = node.object;
      if (obj && obj.type === 'Identifier') {
        if (obj.name === 'module' && node.property && node.property.name === 'exports') {
          found = true;
          return;
        }
        if (obj.name === 'exports') {
          found = true;
          return;
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key !== 'type') walk(node[key]);
    }
  };
  walk(ast);
  return found;
}

export function bundle(entryPath: string): BundleResult {
  const graph = new ModuleGraph();
  const records = graph.build(entryPath);

  const errors: string[] = [...graph.getErrors()];
  const idToRecord = new Map<number, ModuleRecord>();
  for (const r of records) idToRecord.set(r.id, r);

  const infos = new Map<number, ModuleAnalysis>();
  for (const record of records) {
    infos.set(record.id, analyzeModule(record, graph));
  }

  const exportMaps = resolveExports(infos);
  computeModuleObjectNeeds(infos, idToRecord);

  if (errors.length > 0) {
    return { program: null, errors };
  }

  const moduleObjectNames = new Map<number, string>();
  for (const info of infos.values()) {
    moduleObjectNames.set(info.moduleId, info.moduleObjectName);
  }

  const mergedBody: any[] = [];
  for (const record of records) {
    const info = infos.get(record.id)!;
    const rewriter = new ModuleRewriter(info, exportMaps, moduleObjectNames);
    mergedBody.push(...rewriter.rewrite(record.ast));
  }

  return {
    program: {
      type: 'Program',
      body: mergedBody,
      sourceFile: path.resolve(entryPath)
    },
    errors
  };
}

function analyzeModule(record: ModuleRecord, graph: ModuleGraph): ModuleAnalysis {
  const id = record.id;
  const info: ModuleAnalysis = {
    moduleId: id,
    prefix: `__m${id}_`,
    topDecls: new Map(),
    importSpecs: new Map(),
    importSourceModuleIds: new Map(),
    importTargets: new Map(),
    nsImports: new Map(),
    namedExports: new Map(),
    reexports: [],
    exportAll: [],
    defaultLocal: null,
    defaultSynthesizedName: null,
    isCjs: false,
    cjsNamed: new Map(),
    moduleObjectName: moduleObjectNameOf(id),
    moduleObjectNeeded: false,
    sourceToModuleId: new Map()
  };

  for (const [source, resolved] of record.resolvedPaths) {
    const srcId = graph.moduleIdForPath(resolved);
    if (srcId !== undefined) info.sourceToModuleId.set(source, srcId);
  }

  const stmts = record.ast.body;

  for (const stmt of stmts) {
    collectTopDecl(stmt, info);
  }

  for (const stmt of stmts) {
    if (stmt.type !== 'ImportDeclaration') continue;
    const srcVal = stmt.source.value;
    if (typeof srcVal !== 'string') continue;
    const srcId = info.sourceToModuleId.get(srcVal);
    if (srcId === undefined) continue;
    for (const spec of stmt.specifiers) {
      const local = spec.local.name;
      if (spec.type === 'ImportDefaultSpecifier') {
        info.importSpecs.set(local, { kind: 'default', imported: 'default' });
        info.importSourceModuleIds.set(local, srcId);
      } else if (spec.type === 'ImportNamespaceSpecifier') {
        info.importSpecs.set(local, { kind: 'namespace', imported: '' });
        info.importSourceModuleIds.set(local, srcId);
        info.nsImports.set(local, srcId);
      } else {
        info.importSpecs.set(local, { kind: 'named', imported: spec.imported.name });
        info.importSourceModuleIds.set(local, srcId);
      }
    }
  }

  for (const stmt of stmts) {
    if (stmt.type === 'ExportNamedDeclaration') {
      if (stmt.declaration) {
        const d = stmt.declaration;
        if (d.type === 'VariableDeclaration') {
          for (const vd of d.declarations) {
            const names = new Set<string>();
            collectPatternNames(vd.id, names);
            for (const n of names) info.namedExports.set(n, n);
          }
        } else if (d.type === 'FunctionDeclaration') {
          info.namedExports.set(d.name.name, d.name.name);
        } else if (d.type === 'ClassDeclaration' && d.id) {
          info.namedExports.set(d.id.name, d.id.name);
        }
      } else if (stmt.source) {
        const srcVal = stmt.source.value;
        if (typeof srcVal !== 'string') continue;
        const srcId = info.sourceToModuleId.get(srcVal);
        if (srcId === undefined) continue;
        for (const spec of stmt.specifiers) {
          info.reexports.push({ sourceModuleId: srcId, local: spec.local.name, exported: spec.exported.name });
        }
      } else {
        for (const spec of stmt.specifiers) {
          info.namedExports.set(spec.exported.name, spec.local.name);
        }
      }
    } else if (stmt.type === 'ExportAllDeclaration') {
      const srcVal = stmt.source.value;
      if (typeof srcVal !== 'string') continue;
      const srcId = info.sourceToModuleId.get(srcVal);
      if (srcId !== undefined) info.exportAll.push(srcId);
    } else if (stmt.type === 'ExportDefaultDeclaration') {
      const d = stmt.declaration;
      if (d.type === 'FunctionDeclaration') {
        if (d.name.name.startsWith('__anon_default')) {
          info.defaultSynthesizedName = prefixed(id, 'default');
          info.defaultLocal = prefixed(id, 'default');
          info.topDecls.set('__anon_default', prefixed(id, 'default'));
        } else {
          info.defaultLocal = d.name.name;
        }
      } else if (d.type === 'ClassDeclaration') {
        if (d.id) {
          info.defaultLocal = d.id.name;
        } else {
          info.defaultSynthesizedName = prefixed(id, 'default');
          info.defaultLocal = prefixed(id, 'default');
        }
      } else {
        info.defaultSynthesizedName = prefixed(id, 'default');
        info.defaultLocal = prefixed(id, 'default');
      }
    }
  }

  collectCjsInfo(info, record.ast);
  return info;
}

function collectTopDecl(stmt: any, info: ModuleAnalysis): void {
  const id = info.moduleId;
  const visit = (node: any): void => {
    if (!node) return;
    if (node.type === 'VariableDeclaration') {
      for (const d of node.declarations) {
        const names = new Set<string>();
        collectPatternNames(d.id, names);
        for (const n of names) info.topDecls.set(n, prefixed(id, n));
      }
    } else if (node.type === 'FunctionDeclaration') {
      info.topDecls.set(node.name.name, prefixed(id, node.name.name));
    } else if (node.type === 'ClassDeclaration' && node.id) {
      info.topDecls.set(node.id.name, prefixed(id, node.id.name));
    }
  };

  if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
    visit(stmt.declaration);
  } else if (stmt.type === 'ExportDefaultDeclaration') {
    if (stmt.declaration.type === 'FunctionDeclaration') {
      if (stmt.declaration.name.name.startsWith('__anon_default')) {
        info.topDecls.set('__anon_default', prefixed(id, 'default'));
      } else {
        info.topDecls.set(stmt.declaration.name.name, prefixed(id, stmt.declaration.name.name));
      }
    } else if (stmt.declaration.type === 'ClassDeclaration' && stmt.declaration.id) {
      info.topDecls.set(stmt.declaration.id.name, prefixed(id, stmt.declaration.id.name));
    }
  } else {
    visit(stmt);
  }
}

function collectCjsInfo(info: ModuleAnalysis, ast: Program): void {
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node.type === 'AssignmentExpression' && node.operator === '=') {
      const left = node.left;
      if (isModuleExportsExpr(left)) {
        info.isCjs = true;
        if (node.right.type === 'ObjectLiteral') {
          for (const prop of node.right.properties) {
            const keyName = prop.key.type === 'Identifier'
              ? prop.key.name
              : (prop.key.type === 'Literal' ? String(prop.key.value) : null);
            if (keyName === null) continue;
            if (prop.value && prop.value.type === 'Identifier' && info.topDecls.has(prop.value.name)) {
              info.cjsNamed.set(keyName, prop.value.name);
            } else {
              info.cjsNamed.set(keyName, null);
            }
          }
        }
      } else if (left.type === 'MemberExpression' && !left.computed &&
                 left.property.type === 'Identifier' && isModuleExportsExpr(left.object)) {
        info.isCjs = true;
        const local = (node.right.type === 'Identifier' && info.topDecls.has(node.right.name))
          ? node.right.name : null;
        info.cjsNamed.set(left.property.name, local);
      }
    }
    for (const key of Object.keys(node)) {
      if (key !== 'type') walk(node[key]);
    }
  };
  walk(ast);
}

function isModuleExportsExpr(node: any): boolean {
  if (!node) return false;
  if (node.type === 'Identifier' && node.name === 'exports') return true;
  if (node.type === 'MemberExpression' &&
      node.object.type === 'Identifier' && node.object.name === 'module' &&
      !node.computed && node.property.type === 'Identifier' && node.property.name === 'exports') {
    return true;
  }
  return false;
}

function resolveExports(infos: Map<number, ModuleAnalysis>): Map<number, Map<string, ExportTarget | null>> {
  const exportMaps = new Map<number, Map<string, ExportTarget | null>>();

  const resolveExport = (moduleId: number, exportedName: string, stack: Set<number>): ExportTarget | null => {
    const info = infos.get(moduleId)!;
    if (stack.has(moduleId)) return null;
    stack.add(moduleId);

    let map = exportMaps.get(moduleId);
    if (!map) {
      map = new Map();
      exportMaps.set(moduleId, map);
    }
    if (map.has(exportedName)) {
      stack.delete(moduleId);
      return map.get(exportedName) ?? null;
    }

    let target: ExportTarget | null = null;
    if (info.isCjs) {
      if (exportedName === 'default') {
        target = { kind: 'binding', name: info.moduleObjectName };
      } else {
        const local = info.cjsNamed.get(exportedName);
        target = local
          ? { kind: 'binding', name: prefixed(info.moduleId, local) }
          : { kind: 'member', object: info.moduleObjectName, property: exportedName };
      }
    } else if (exportedName === 'default') {
      if (info.defaultLocal) {
        target = {
          kind: 'binding',
          name: info.defaultLocal.startsWith('__m') ? info.defaultLocal : prefixed(info.moduleId, info.defaultLocal)
        };
      }
    } else if (info.namedExports.has(exportedName)) {
      const local = info.namedExports.get(exportedName)!;
      const spec = info.importSpecs.get(local);
      const srcId = info.importSourceModuleIds.get(local);
      if (spec && srcId !== undefined) {
        target = resolveExport(srcId, spec.imported, stack);
        if (!target) target = { kind: 'binding', name: prefixed(info.moduleId, local) };
      } else {
        target = { kind: 'binding', name: prefixed(info.moduleId, local) };
      }
    } else {
      for (const re of info.reexports) {
        if (re.exported === exportedName) {
          target = resolveExport(re.sourceModuleId, re.local, stack);
          if (target) break;
        }
      }
      if (!target) {
        for (const srcId of info.exportAll) {
          if (exportedName === 'default') continue;
          target = resolveExport(srcId, exportedName, stack);
          if (target) break;
        }
      }
    }

    map.set(exportedName, target);
    stack.delete(moduleId);
    return target;
  };

  for (const info of infos.values()) {
    const names = new Set<string>(info.namedExports.keys());
    for (const re of info.reexports) names.add(re.exported);
    for (const name of names) resolveExport(info.moduleId, name, new Set());
    if (info.defaultLocal) resolveExport(info.moduleId, 'default', new Set());
  }

  // Expand export-all re-exports transitively.
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 200) {
    changed = false;
    iterations++;
    for (const info of infos.values()) {
      if (info.exportAll.length === 0) continue;
      const ownMap = exportMaps.get(info.moduleId);
      if (!ownMap) continue;
      for (const srcId of info.exportAll) {
        const srcMap = exportMaps.get(srcId);
        if (!srcMap) continue;
        for (const name of srcMap.keys()) {
          if (name === 'default') continue;
          if (!ownMap.has(name)) {
            resolveExport(info.moduleId, name, new Set());
            changed = true;
          }
        }
      }
    }
  }

  computeImportTargets(infos, (moduleId, exportedName) => resolveExport(moduleId, exportedName, new Set()));

  return exportMaps;
}

function computeImportTargets(
  infos: Map<number, ModuleAnalysis>,
  resolveExport: (moduleId: number, exportedName: string) => ExportTarget | null
): void {
  for (const info of infos.values()) {
    for (const [local, spec] of info.importSpecs) {
      const srcId = info.importSourceModuleIds.get(local);
      if (srcId === undefined) continue;
      let target: ExportTarget | null = null;
      if (spec.kind === 'namespace') {
        const srcInfo = infos.get(srcId);
        target = srcInfo ? { kind: 'binding', name: srcInfo.moduleObjectName } : null;
      } else {
        target = resolveExport(srcId, spec.imported);
      }
      if (!target) {
        target = { kind: 'binding', name: prefixed(info.moduleId, local) };
      }
      info.importTargets.set(local, target);
    }
  }
}

function computeModuleObjectNeeds(
  infos: Map<number, ModuleAnalysis>,
  idToRecord: Map<number, ModuleRecord>
): void {
  const mark = (moduleId: number): void => {
    const info = infos.get(moduleId);
    if (info) info.moduleObjectNeeded = true;
  };

  for (const info of infos.values()) {
    if (info.isCjs) info.moduleObjectNeeded = true;
  }

  for (const info of infos.values()) {
    for (const srcId of info.nsImports.values()) mark(srcId);

    const record = idToRecord.get(info.moduleId);
    if (!record) continue;
    const walk = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (node.type === 'CallExpression' &&
          node.callee && node.callee.type === 'Identifier' && node.callee.name === 'require' &&
          node.arguments[0] && node.arguments[0].type === 'Literal' &&
          typeof node.arguments[0].value === 'string') {
        const srcId = info.sourceToModuleId.get(node.arguments[0].value);
        if (srcId !== undefined) mark(srcId);
        return;
      }
      if (node.type === 'ImportExpression' &&
          node.source && node.source.type === 'Literal' &&
          typeof node.source.value === 'string') {
        const srcId = info.sourceToModuleId.get(node.source.value);
        if (srcId !== undefined) mark(srcId);
        return;
      }
      for (const key of Object.keys(node)) {
        if (key !== 'type') walk(node[key]);
      }
    };
    walk(record.ast);
  }
}

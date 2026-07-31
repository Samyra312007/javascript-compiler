import * as fs from 'fs';
import * as path from 'path';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { Program } from '../ast/ast-types.js';
import { ModuleResolver } from './resolver.js';

export interface ModuleRecord {
  id: number;
  path: string;
  ast: Program;
  imports: string[];
  resolvedPaths: Map<string, string>;
}

export class ModuleGraph {
  private modules: ModuleRecord[] = [];
  private pathToId: Map<string, number> = new Map();
  private visiting: Set<string> = new Set();
  private nextId: number = 0;
  private errors: string[] = [];

  public build(entryPath: string): ModuleRecord[] {
    this.modules = [];
    this.pathToId.clear();
    this.visiting.clear();
    this.nextId = 0;
    this.errors = [];

    const absolute = path.resolve(entryPath);
    this.addModule(absolute);
    this.sortDependencies();
    return this.modules;
  }

  public getErrors(): string[] {
    return this.errors;
  }

  public getModules(): ModuleRecord[] {
    return this.modules;
  }

  public moduleIdForPath(absolutePath: string): number | undefined {
    return this.pathToId.get(path.resolve(absolutePath));
  }

  public getModule(pathOrId: string | number): ModuleRecord | undefined {
    if (typeof pathOrId === 'number') return this.modules[pathOrId];
    const id = this.pathToId.get(path.resolve(pathOrId));
    return id === undefined ? undefined : this.modules.find(m => m.id === id);
  }

  private addModule(absolutePath: string): number {
    const existing = this.pathToId.get(absolutePath);
    if (existing !== undefined) return existing;

    if (this.visiting.has(absolutePath)) {
      return this.pathToId.get(absolutePath)!;
    }
    this.visiting.add(absolutePath);

    if (!fs.existsSync(absolutePath)) {
      this.errors.push(`Module not found: ${absolutePath}`);
      this.visiting.delete(absolutePath);
      return -1;
    }

    const id = this.nextId++;
    const sourceCode = fs.readFileSync(absolutePath, 'utf-8');

    let ast: Program;
    try {
      const lexer = new Lexer(sourceCode);
      const tokens = lexer.scanTokens();
      const parser = new Parser(tokens);
      ast = parser.parse();
    } catch (e: any) {
      this.errors.push(`Failed to parse ${absolutePath}: ${e.message}`);
      this.visiting.delete(absolutePath);
      return -1;
    }

    const record: ModuleRecord = {
      id,
      path: absolutePath,
      ast,
      imports: [],
      resolvedPaths: new Map()
    };
    this.pathToId.set(absolutePath, id);
    this.modules.push(record);

    const importSources = ModuleGraph.collectImportSources(ast);
    for (const source of importSources) {
      const resolved = ModuleResolver.resolve(source, path.dirname(absolutePath));
      if (!resolved) {
        this.errors.push(`Cannot resolve module '${source}' from ${absolutePath}`);
        continue;
      }
      record.imports.push(source);
      record.resolvedPaths.set(source, resolved);
      this.addModule(resolved);
    }

    this.visiting.delete(absolutePath);
    return id;
  }

  private static collectImportSources(ast: Program): string[] {
    const sources: string[] = [];
    const visit = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }

      if (node.type === 'ImportDeclaration' && node.source && typeof node.source.value === 'string') {
        sources.push(node.source.value);
        return;
      }
      if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
          node.source && typeof node.source.value === 'string') {
        sources.push(node.source.value);
        return;
      }
      if (node.type === 'ImportExpression' && node.source && typeof node.source.value === 'string') {
        sources.push(node.source.value);
        return;
      }
      if (node.type === 'CallExpression' && node.callee &&
          node.callee.type === 'Identifier' && node.callee.name === 'require' &&
          node.arguments.length === 1 && node.arguments[0].type === 'Literal' &&
          typeof node.arguments[0].value === 'string') {
        sources.push(node.arguments[0].value);
        return;
      }

      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'loc') continue;
        visit(node[key]);
      }
    };
    visit(ast);
    return sources;
  }

  private sortDependencies(): void {
    const sorted: ModuleRecord[] = [];
    const visited: Set<number> = new Set();
    const visiting: Set<number> = new Set();
    const byId = new Map<number, ModuleRecord>();
    for (const m of this.modules) byId.set(m.id, m);

    const visit = (id: number): void => {
      if (visited.has(id) || visiting.has(id)) return;
      visiting.add(id);
      const rec = byId.get(id)!;
      for (const resolved of rec.resolvedPaths.values()) {
        const depId = this.pathToId.get(path.resolve(resolved));
        if (depId !== undefined) visit(depId);
      }
      visiting.delete(id);
      visited.add(id);
      sorted.push(rec);
    };

    for (const m of this.modules) visit(m.id);
    this.modules = sorted;
  }
}

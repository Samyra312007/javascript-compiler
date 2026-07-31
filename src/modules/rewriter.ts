import {
  Program, Statement, Expression, MemberExpression,
  BlockStatement, VariableDeclaration, ObjectProperty
} from '../ast/ast-types.js';

export type ExportTarget =
  | { kind: 'binding'; name: string }
  | { kind: 'member'; object: string; property: string };

export interface ImportSpec {
  kind: 'named' | 'default' | 'namespace';
  imported: string;
}

export interface ModuleAnalysis {
  moduleId: number;
  prefix: string;
  topDecls: Map<string, string>;
  importSpecs: Map<string, ImportSpec>;
  importSourceModuleIds: Map<string, number>;
  importTargets: Map<string, ExportTarget>;
  nsImports: Map<string, number>;
  namedExports: Map<string, string>;
  reexports: Array<{ sourceModuleId: number; local: string; exported: string }>;
  exportAll: number[];
  defaultLocal: string | null;
  defaultSynthesizedName: string | null;
  isCjs: boolean;
  cjsNamed: Map<string, string | null>;
  moduleObjectName: string;
  moduleObjectNeeded: boolean;
  sourceToModuleId: Map<string, number>;
}

export function prefixed(moduleId: number, name: string): string {
  return `__m${moduleId}_${name}`;
}

export function moduleObjectNameOf(moduleId: number): string {
  return `__m${moduleId}_module`;
}

export function exportTargetToNode(target: ExportTarget): Expression {
  if (target.kind === 'binding') {
    return { type: 'Identifier', name: target.name };
  }
  return {
    type: 'MemberExpression',
    object: { type: 'Identifier', name: target.object },
    property: { type: 'Identifier', name: target.property },
    computed: false,
    optional: false
  };
}

export function collectPatternNames(pattern: any, out: Set<string>): void {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    out.add(pattern.name);
  } else if (pattern.type === 'ArrayPattern') {
    for (const el of pattern.elements || []) collectPatternNames(el, out);
    if (pattern.rest) collectPatternNames(pattern.rest, out);
  } else if (pattern.type === 'ObjectPattern') {
    for (const prop of pattern.properties || []) collectPatternNames(prop.value, out);
    if (pattern.rest) collectPatternNames(pattern.rest, out);
  } else if (pattern.type === 'AssignmentPattern') {
    collectPatternNames(pattern.left, out);
  } else if (pattern.type === 'AssignmentProperty') {
    collectPatternNames(pattern.value, out);
  }
}

export class ModuleRewriter {
  private scopeStack: Set<string>[] = [];
  private info: ModuleAnalysis;
  private exportMaps: Map<number, Map<string, ExportTarget | null>>;
  private moduleObjectNames: Map<number, string>;

  constructor(
    info: ModuleAnalysis,
    exportMaps: Map<number, Map<string, ExportTarget | null>>,
    moduleObjectNames: Map<number, string>
  ) {
    this.info = info;
    this.exportMaps = exportMaps;
    this.moduleObjectNames = moduleObjectNames;
  }

  public rewrite(ast: Program): Statement[] {
    const body: Statement[] = [];

    if (this.info.isCjs) {
      body.push(this.makeModuleObjectVar());
    }

    for (const stmt of ast.body) {
      const out = this.transformStatement(stmt);
      if (out) body.push(out);
    }

    if (!this.info.isCjs && this.info.moduleObjectNeeded) {
      const synthesized = this.buildModuleObjectSynthesis();
      body.push(...synthesized);
    }

    return body;
  }

  // ===== scope helpers =====

  private isTopLevel(): boolean {
    return this.scopeStack.length === 0;
  }

  private pushScope(): void {
    this.scopeStack.push(new Set());
  }

  private popScope(): void {
    this.scopeStack.pop();
  }

  private declareLocal(name: string): void {
    if (this.scopeStack.length > 0) {
      this.scopeStack[this.scopeStack.length - 1].add(name);
    }
  }

  private declareLocals(names: string[]): void {
    for (const n of names) this.declareLocal(n);
  }

  private inScope(name: string): boolean {
    for (const frame of this.scopeStack) {
      if (frame.has(name)) return true;
    }
    return false;
  }

  // ===== statement transforms =====

  private transformStatement(node: any): Statement | null {
    if (!node) return null;
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
        return null;
      case 'ExportNamedDeclaration':
        return this.transformExportNamed(node);
      case 'ExportDefaultDeclaration':
        return this.transformExportDefault(node);
      case 'VariableDeclaration':
        return this.transformVariableDeclaration(node);
      case 'FunctionDeclaration':
        return this.transformFunctionDeclaration(node);
      case 'ClassDeclaration':
        return this.transformClassDeclaration(node);
      case 'BlockStatement':
        return this.transformBlockStatement(node);
      case 'IfStatement':
        node.test = this.transformExpression(node.test);
        node.consequent = this.transformStatement(node.consequent) as Statement;
        if (node.alternate) node.alternate = this.transformStatement(node.alternate) as Statement;
        return node;
      case 'WhileStatement':
        node.test = this.transformExpression(node.test);
        node.body = this.transformStatement(node.body) as Statement;
        return node;
      case 'DoWhileStatement':
        node.body = this.transformStatement(node.body) as Statement;
        node.test = this.transformExpression(node.test);
        return node;
      case 'ForStatement':
        return this.transformForStatement(node);
      case 'ForInStatement':
      case 'ForOfStatement':
        return this.transformForInOf(node);
      case 'SwitchStatement':
        return this.transformSwitchStatement(node);
      case 'TryStatement':
        return this.transformTryStatement(node);
      case 'ThrowStatement':
        node.argument = this.transformExpression(node.argument);
        return node;
      case 'ReturnStatement':
        if (node.argument) node.argument = this.transformExpression(node.argument);
        return node;
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'EmptyStatement':
      case 'DebuggerStatement':
        return node;
      case 'ExpressionStatement':
        node.expression = this.transformExpression(node.expression);
        return node;
      case 'LabeledStatement':
        node.body = this.transformStatement(node.body) as Statement;
        return node;
      default:
        return node;
    }
  }

  private transformExportNamed(node: any): Statement | null {
    if (node.declaration) {
      return this.transformStatement(node.declaration);
    }
    return null;
  }

  private transformExportDefault(node: any): Statement | null {
    const decl = node.declaration;
    if (decl.type === 'FunctionDeclaration') {
      if (this.info.defaultSynthesizedName) {
        decl.name = { type: 'Identifier', name: this.info.defaultSynthesizedName };
      }
      return this.transformFunctionDeclaration(decl);
    }
    if (decl.type === 'ClassDeclaration') {
      if (!decl.id && this.info.defaultSynthesizedName) {
        decl.id = { type: 'Identifier', name: this.info.defaultSynthesizedName };
      }
      return this.transformClassDeclaration(decl);
    }
    const varStmt: VariableDeclaration = {
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: [{
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: this.info.defaultSynthesizedName || `__m${this.info.moduleId}_default` },
        init: this.transformExpression(decl)
      }]
    };
    return varStmt;
  }

  private transformVariableDeclaration(node: any): Statement {
    const top = this.isTopLevel();
    for (const decl of node.declarations) {
      if (decl.id) this.transformPatternDeclaration(decl.id, top);
      if (decl.init) decl.init = this.transformExpression(decl.init);
    }
    return node;
  }

  private transformPatternDeclaration(pattern: any, top: boolean): void {
    if (!pattern) return;
    if (pattern.type === 'Identifier') {
      if (top) {
        const pref = this.info.topDecls.get(pattern.name);
        if (pref) pattern.name = pref;
      }
      return;
    }
    if (pattern.type === 'ArrayPattern') {
      for (const el of pattern.elements || []) this.transformPatternDeclaration(el, top);
      if (pattern.rest) this.transformPatternDeclaration(pattern.rest, top);
      return;
    }
    if (pattern.type === 'ObjectPattern') {
      for (const prop of pattern.properties || []) this.transformPatternDeclaration(prop.value, top);
      if (pattern.rest) this.transformPatternDeclaration(pattern.rest, top);
      return;
    }
    if (pattern.type === 'AssignmentPattern') {
      this.transformPatternDeclaration(pattern.left, top);
      pattern.right = this.transformExpression(pattern.right);
      return;
    }
    if (pattern.type === 'AssignmentProperty') {
      this.transformPatternDeclaration(pattern.value, top);
    }
  }

  private transformFunctionDeclaration(node: any): Statement {
    if (this.isTopLevel()) {
      const pref = this.info.topDecls.get(node.name.name);
      if (pref) node.name.name = pref;
    } else {
      this.declareLocal(node.name.name);
    }
    this.transformFunctionBody(node.params, node.body);
    return node;
  }

  private transformFunctionBody(params: any[], body: BlockStatement): void {
    this.pushScope();
    for (const p of params || []) {
      const out = new Set<string>();
      collectPatternNames(p.param, out);
      this.declareLocals(Array.from(out));
      if (p.default) p.default = this.transformExpression(p.default);
    }
    if (body) {
      this.transformBlockStatement(body);
    }
    this.popScope();
  }

  private transformBlockStatement(node: BlockStatement): BlockStatement {
    this.pushScope();
    const names = new Set<string>();
    for (const stmt of node.body) {
      if (stmt.type === 'VariableDeclaration') {
        for (const d of stmt.declarations) collectPatternNames(d.id, names);
      } else if (stmt.type === 'FunctionDeclaration') {
        names.add(stmt.name.name);
      } else if (stmt.type === 'ClassDeclaration') {
        if (stmt.id) names.add(stmt.id.name);
      }
    }
    this.declareLocals(Array.from(names));
    const newBody: Statement[] = [];
    for (const stmt of node.body) {
      const out = this.transformStatement(stmt);
      if (out) newBody.push(out as Statement);
    }
    this.popScope();
    node.body = newBody;
    return node;
  }

  private transformForStatement(node: any): Statement {
    this.pushScope();
    if (node.init) {
      if (node.init.type === 'VariableDeclaration') {
        const names = new Set<string>();
        for (const d of node.init.declarations) collectPatternNames(d.id, names);
        this.declareLocals(Array.from(names));
        this.transformVariableDeclaration(node.init);
      } else {
        node.init = this.transformExpression(node.init);
      }
    }
    if (node.test) node.test = this.transformExpression(node.test);
    if (node.update) node.update = this.transformExpression(node.update);
    node.body = this.transformStatement(node.body) as Statement;
    this.popScope();
    return node;
  }

  private transformForInOf(node: any): Statement {
    this.pushScope();
    if (node.left && node.left.type === 'VariableDeclaration') {
      const names = new Set<string>();
      for (const d of node.left.declarations) collectPatternNames(d.id, names);
      this.declareLocals(Array.from(names));
      this.transformVariableDeclaration(node.left);
    } else if (node.left) {
      node.left = this.transformExpression(node.left);
    }
    node.right = this.transformExpression(node.right);
    node.body = this.transformStatement(node.body) as Statement;
    this.popScope();
    return node;
  }

  private transformSwitchStatement(node: any): Statement {
    node.discriminant = this.transformExpression(node.discriminant);
    this.pushScope();
    const names = new Set<string>();
    for (const c of node.cases) {
      for (const stmt of c.consequent) {
        if (stmt.type === 'VariableDeclaration') {
          for (const d of stmt.declarations) collectPatternNames(d.id, names);
        } else if (stmt.type === 'FunctionDeclaration') {
          names.add(stmt.name.name);
        } else if (stmt.type === 'ClassDeclaration') {
          if (stmt.id) names.add(stmt.id.name);
        }
      }
    }
    this.declareLocals(Array.from(names));
    for (const c of node.cases) {
      if (c.test) c.test = this.transformExpression(c.test);
      const cons: Statement[] = [];
      for (const stmt of c.consequent) {
        const out = this.transformStatement(stmt);
        if (out) cons.push(out as Statement);
      }
      c.consequent = cons;
    }
    this.popScope();
    return node;
  }

  private transformTryStatement(node: any): Statement {
    node.block = this.transformBlockStatement(node.block);
    if (node.handler) {
      this.pushScope();
      if (node.handler.param) {
        const names = new Set<string>();
        collectPatternNames(node.handler.param, names);
        this.declareLocals(Array.from(names));
      }
      node.handler.body = this.transformBlockStatement(node.handler.body);
      this.popScope();
    }
    if (node.finalizer) node.finalizer = this.transformBlockStatement(node.finalizer);
    return node;
  }

  // ===== expression transforms =====

  private transformExpression(node: any): any {
    if (!node) return null;
    switch (node.type) {
      case 'Identifier':
        return this.transformIdentifier(node);
      case 'MemberExpression':
        return this.transformMemberExpression(node);
      case 'CallExpression':
        return this.transformCallExpression(node);
      case 'ImportExpression':
        return this.transformImportExpression(node);
      case 'BinaryExpression':
      case 'LogicalExpression':
        node.left = this.transformExpression(node.left);
        node.right = this.transformExpression(node.right);
        return node;
      case 'UnaryExpression':
      case 'AwaitExpression':
      case 'SpreadElement':
        node.argument = this.transformExpression(node.argument);
        return node;
      case 'YieldExpression':
        if (node.argument) node.argument = this.transformExpression(node.argument);
        return node;
      case 'UpdateExpression':
        node.argument = this.transformExpression(node.argument);
        return node;
      case 'AssignmentExpression':
        if (node.left.type === 'MemberExpression') {
          node.left = this.transformMemberExpression(node.left);
        } else if (node.left.type === 'Identifier') {
          node.left = this.transformIdentifier(node.left);
        } else {
          this.transformPatternDeclaration(node.left, false);
        }
        node.right = this.transformExpression(node.right);
        return node;
      case 'ConditionalExpression':
        node.test = this.transformExpression(node.test);
        node.consequent = this.transformExpression(node.consequent);
        node.alternate = this.transformExpression(node.alternate);
        return node;
      case 'ChainExpression':
        node.expression = this.transformExpression(node.expression);
        return node;
      case 'NewExpression':
        node.callee = this.transformExpression(node.callee);
        node.arguments = node.arguments.map((a: any) => this.transformExpression(a));
        return node;
      case 'ArrayLiteral':
        node.elements = (node.elements || []).map((e: any) => e ? this.transformExpression(e) : null);
        return node;
      case 'ObjectLiteral':
        return this.transformObjectLiteral(node);
      case 'FunctionExpression':
        return this.transformFunctionExpression(node);
      case 'ArrowFunctionExpression':
        return this.transformArrowFunction(node);
      case 'ClassExpression':
        return this.transformClassExpression(node);
      case 'TemplateLiteral':
        node.expressions = (node.expressions || []).map((e: any) => this.transformExpression(e));
        return node;
      case 'SequenceExpression':
        node.expressions = (node.expressions || []).map((e: any) => this.transformExpression(e));
        return node;
      case 'Literal':
      case 'RegexLiteral':
      case 'ThisExpression':
      case 'SuperExpression':
      case 'MetaProperty':
        return node;
      default:
        return node;
    }
  }

  private transformIdentifier(node: any): Expression {
    const name = node.name;
    if (this.inScope(name)) return node;

    if (this.info.isCjs && (name === 'module' || name === 'exports')) {
      node.name = this.info.moduleObjectName;
      return node;
    }

    const target = this.info.importTargets.get(name);
    if (target) return exportTargetToNode(target);

    const prefixedName = this.info.topDecls.get(name);
    if (prefixedName) {
      node.name = prefixedName;
      return node;
    }

    return node;
  }

  private transformMemberExpression(node: any): Expression {
    // CJS: module.exports collapses to the module object
    if (node.object.type === 'Identifier' && node.object.name === 'module' &&
        !node.computed && node.property.type === 'Identifier' && node.property.name === 'exports') {
      return { type: 'Identifier', name: this.info.moduleObjectName };
    }

    // Namespace import: ns.foo -> resolved export binding
    if (node.object.type === 'Identifier' && this.info.nsImports.has(node.object.name)) {
      const srcId = this.info.nsImports.get(node.object.name)!;
      let propName: string | null = null;
      if (!node.computed && node.property.type === 'Identifier') {
        propName = node.property.name;
      } else if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') {
        propName = node.property.value;
      }
      if (propName !== null) {
        const map = this.exportMaps.get(srcId);
        const target = map ? map.get(propName) : undefined;
        if (target) return exportTargetToNode(target);
        node.object = { type: 'Identifier', name: this.moduleObjectNames.get(srcId) || moduleObjectNameOf(srcId) };
        if (node.computed) node.property = { type: 'Literal', value: propName };
        return node;
      }
      node.object = { type: 'Identifier', name: this.moduleObjectNames.get(srcId) || moduleObjectNameOf(srcId) };
      node.property = this.transformExpression(node.property);
      return node;
    }

    node.object = this.transformExpression(node.object);
    if (node.computed) node.property = this.transformExpression(node.property);
    return node;
  }

  private transformCallExpression(node: any): Expression {
    if (node.callee && node.callee.type === 'Identifier' && node.callee.name === 'require') {
      const arg = node.arguments[0];
      if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
        const srcId = this.info.sourceToModuleId.get(arg.value);
        if (srcId !== undefined && srcId >= 0) {
          return { type: 'Identifier', name: this.moduleObjectNames.get(srcId) || moduleObjectNameOf(srcId) };
        }
      }
    }
    node.callee = this.transformExpression(node.callee);
    node.arguments = (node.arguments || []).map((a: any) => this.transformExpression(a));
    return node;
  }

  private transformImportExpression(node: any): Expression {
    if (node.source && node.source.type === 'Literal' && typeof node.source.value === 'string') {
      const srcId = this.info.sourceToModuleId.get(node.source.value);
      if (srcId !== undefined && srcId >= 0) {
        return { type: 'Identifier', name: this.moduleObjectNames.get(srcId) || moduleObjectNameOf(srcId) };
      }
    }
    node.source = this.transformExpression(node.source);
    return node;
  }

  private transformObjectLiteral(node: any): Expression {
    for (const prop of node.properties || []) {
      if (prop.method) {
        prop.value = this.transformFunctionExpression(prop.value);
      } else {
        if (prop.shorthand && prop.key && prop.key.type === 'Identifier') {
          prop.key = { type: 'Identifier', name: prop.key.name };
        }
        if (prop.computed) prop.key = this.transformExpression(prop.key);
        prop.value = this.transformExpression(prop.value);
      }
    }
    return node;
  }

  private transformFunctionExpression(node: any): Expression {
    this.pushScope();
    if (node.id) this.declareLocal(node.id.name);
    for (const p of node.params || []) {
      const out = new Set<string>();
      collectPatternNames(p.param, out);
      this.declareLocals(Array.from(out));
      if (p.default) p.default = this.transformExpression(p.default);
    }
    if (node.body) {
      this.transformBlockStatement(node.body);
    }
    this.popScope();
    return node;
  }

  private transformArrowFunction(node: any): Expression {
    this.pushScope();
    for (const p of node.params || []) {
      const out = new Set<string>();
      collectPatternNames(p.param, out);
      this.declareLocals(Array.from(out));
      if (p.default) p.default = this.transformExpression(p.default);
    }
    if (node.expression) {
      node.body = this.transformExpression(node.body);
    } else {
      this.transformBlockStatement(node.body);
    }
    this.popScope();
    return node;
  }

  private transformClassExpression(node: any): Expression {
    if (node.id) {
      if (this.isTopLevel()) {
        const pref = this.info.topDecls.get(node.id.name);
        if (pref) node.id.name = pref;
      } else {
        this.declareLocal(node.id.name);
      }
    }
    return this.transformClassBody(node);
  }

  private transformClassDeclaration(node: any): Statement {
    if (this.isTopLevel()) {
      if (node.id) {
        const pref = this.info.topDecls.get(node.id.name);
        if (pref) node.id.name = pref;
      }
    } else if (node.id) {
      this.declareLocal(node.id.name);
    }
    this.transformClassBody(node);
    return node;
  }

  private transformClassBody(node: any): any {
    if (node.superClass) node.superClass = this.transformExpression(node.superClass);
    for (const method of node.body.body) {
      if (method.computed) method.key = this.transformExpression(method.key);
      method.value = this.transformFunctionExpression(method.value);
    }
    return node;
  }

  // ===== module object synthesis =====

  private makeModuleObjectVar(): VariableDeclaration {
    return {
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: [{
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: this.info.moduleObjectName },
        init: { type: 'ObjectLiteral', properties: [] }
      }]
    };
  }

  private buildModuleObjectSynthesis(): Statement[] {
    const statements: Statement[] = [];
    const props: ObjectProperty[] = [];
    const stores: Statement[] = [];
    const map = this.exportMaps.get(this.info.moduleId);

    if (map) {
      for (const [exportedName, target] of map) {
        if (!target) continue;
        if (target.kind === 'binding') {
          props.push({
            type: 'ObjectProperty',
            key: { type: 'Identifier', name: exportedName },
            value: { type: 'Identifier', name: target.name },
            computed: false,
            shorthand: false,
            method: false
          });
        } else {
          const member: MemberExpression = {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: target.object },
            property: { type: 'Identifier', name: target.property },
            computed: false,
            optional: false
          };
          stores.push({
            type: 'ExpressionStatement',
            expression: {
              type: 'AssignmentExpression',
              operator: '=',
              left: member,
              right: member
            }
          });
        }
      }
    }

    statements.push({
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: [{
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: this.info.moduleObjectName },
        init: { type: 'ObjectLiteral', properties: props }
      }]
    });
    statements.push(...stores);
    return statements;
  }
}

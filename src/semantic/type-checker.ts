import { Program, Statement, Expression, BlockStatement, FunctionParam } from '../ast/ast-types.js';
import { SymbolTable, SymbolKind, DataType } from './symbol-table.js';

export class TypeChecker {
  private symbolTable: SymbolTable;
  private errors: Array<{ message: string; line: number }> = [];
  private warnings: Array<{ message: string; line: number }> = [];
  private currentFunction: string | null = null;
  private functionReturnTypes: Map<string, DataType[]> = new Map();
  private functionEndsWithReturn: Set<string> = new Set();
  private inLoop: number = 0;
  private inSwitch: number = 0;
  private inBlock: boolean = false;

  constructor() {
    this.symbolTable = new SymbolTable();
  }

  public check(ast: Program): boolean {
    this.errors = [];
    this.warnings = [];
    try {
      this.visitProgram(ast);
      this.checkWarnings();
    } catch (error) {
      if (error instanceof Error) {
        this.errors.push({ message: error.message, line: 0 });
      }
    }
    return this.errors.length === 0;
  }

  private checkWarnings(): void {
    for (const { symbol } of this.symbolTable.getAllSymbolsFlat()) {
      if (symbol.isUsed) continue;
      if (symbol.kind === SymbolKind.Builtin) continue;
      if (symbol.kind === SymbolKind.Function) continue;
      this.addWarning(`Unused variable '${symbol.name}'`, symbol.declaredAt);
    }
  }

  private visitProgram(node: Program): void {
    this.hoistFunctionDeclarations(node.body);
    for (const stmt of node.body) {
      this.visitStatement(stmt);
    }
  }

  private visitStatement(node: Statement): void {
    switch (node.type) {
      case 'VariableDeclaration':
        this.visitVariableDeclaration(node as any);
        break;
      case 'FunctionDeclaration':
        this.visitFunctionDeclaration(node as any);
        break;
      case 'IfStatement':
        this.visitIfStatement(node as any);
        break;
      case 'WhileStatement':
        this.visitWhileStatement(node as any);
        break;
      case 'DoWhileStatement':
        this.visitWhileStatement(node as any);
        break;
      case 'ForStatement':
        this.visitForStatement(node as any);
        break;
      case 'ForInStatement':
        this.visitForInOf(node as any);
        break;
      case 'ForOfStatement':
        this.visitForInOf(node as any);
        break;
      case 'SwitchStatement':
        this.visitSwitchStatement(node as any);
        break;
      case 'TryStatement':
        this.visitTryStatement(node as any);
        break;
      case 'ThrowStatement':
        this.visitExpression((node as any).argument);
        break;
      case 'BlockStatement':
        this.visitBlockStatement(node as any);
        break;
      case 'ReturnStatement':
        this.visitReturnStatement(node as any);
        break;
      case 'BreakStatement':
      case 'ContinueStatement':
        break;
      case 'ExpressionStatement':
        this.visitExpression((node as any).expression);
        break;
      case 'EmptyStatement':
      case 'DebuggerStatement':
        break;
      case 'LabeledStatement':
        this.visitStatement((node as any).body);
        break;
      case 'ClassDeclaration':
        this.visitClassDeclaration(node as any);
        break;
      case 'ImportDeclaration':
        this.visitImportDeclaration(node as any);
        break;
      case 'ExportNamedDeclaration':
        this.visitExportNamedDeclaration(node as any);
        break;
      case 'ExportDefaultDeclaration':
        this.visitExportDefaultDeclaration(node as any);
        break;
      case 'ExportAllDeclaration':
        break;
      default:
        break;
    }
  }

  private visitVariableDeclaration(node: any): void {
    for (const decl of node.declarations) {
      let type = DataType.Any;
      if (decl.init) {
        type = this.getExpressionType(decl.init);
      }
      const isConst = node.kind === 'const';
      if (node.kind === 'var' && this.inBlock) {
        this.declarePatternInFunctionScope(decl.id, type, !!decl.init, isConst);
      } else {
        this.declarePattern(decl.id, type, !!decl.init, isConst);
      }
      if (decl.init) this.visitExpression(decl.init);
    }
  }

  private declarePattern(pattern: any, type: DataType, initialized: boolean, isConst: boolean = false): void {
    if (pattern.type === 'Identifier') {
      if (this.symbolTable.lookupCurrent(pattern.name)) {
        this.addError(`Duplicate declaration: ${pattern.name}`, 0);
        return;
      }
      this.symbolTable.declare({
        name: pattern.name,
        kind: SymbolKind.Variable,
        type,
        declaredAt: 0,
        isInitialized: initialized,
        isUsed: false,
        isConst
      });
    } else if (pattern.type === 'ArrayPattern') {
      if (pattern.elements) {
        for (const el of pattern.elements) {
          if (el) this.declarePattern(el, type, initialized, isConst);
        }
      }
      if (pattern.rest) {
        this.declarePattern(pattern.rest, type, initialized, isConst);
      }
    } else if (pattern.type === 'ObjectPattern') {
      if (pattern.properties) {
        for (const prop of pattern.properties) {
          this.declarePattern(prop.value, type, initialized, isConst);
        }
      }
      if (pattern.rest) {
        this.declarePattern(pattern.rest, type, initialized, isConst);
      }
    } else if (pattern.type === 'AssignmentProperty') {
      this.declarePattern(pattern.value, type, initialized, isConst);
    }
  }

  private declarePatternInFunctionScope(pattern: any, type: DataType, initialized: boolean, isConst: boolean = false): void {
    let scope = this.symbolTable.getCurrentScope();
    while (scope.parent && scope.parent.parent) {
      scope = scope.parent;
    }
    if (pattern.type === 'Identifier') {
      if (scope.lookupCurrent(pattern.name)) {
        this.addError(`Duplicate declaration: ${pattern.name}`, 0);
        return;
      }
      scope.declare({
        name: pattern.name,
        kind: SymbolKind.Variable,
        type,
        declaredAt: 0,
        isInitialized: initialized,
        isUsed: false,
        isConst
      });
    } else if (pattern.type === 'ArrayPattern') {
      if (pattern.elements) {
        for (const el of pattern.elements) {
          if (el) this.declarePatternInFunctionScope(el, type, initialized, isConst);
        }
      }
      if (pattern.rest) this.declarePatternInFunctionScope(pattern.rest, type, initialized, isConst);
    } else if (pattern.type === 'ObjectPattern') {
      if (pattern.properties) {
        for (const prop of pattern.properties) {
          this.declarePatternInFunctionScope(prop.value, type, initialized, isConst);
        }
      }
      if (pattern.rest) this.declarePatternInFunctionScope(pattern.rest, type, initialized, isConst);
    } else if (pattern.type === 'AssignmentProperty') {
      this.declarePatternInFunctionScope(pattern.value, type, initialized, isConst);
    }
  }

  private hoistFunctionDeclarations(body: any[]): void {
    for (const stmt of body) {
      if (stmt.type === 'FunctionDeclaration') {
        const funcName = stmt.name.name;
        if (!this.symbolTable.lookupCurrent(funcName)) {
          this.symbolTable.declare({
            name: funcName,
            kind: SymbolKind.Function,
            type: DataType.Function,
            declaredAt: 0,
            isInitialized: true,
            isUsed: false
          });
        }
      }
    }
  }

  private visitFunctionDeclaration(node: any): void {
    const funcName = node.name.name;
    if (!this.symbolTable.lookupCurrent(funcName)) {
      this.symbolTable.declare({
        name: funcName,
        kind: SymbolKind.Function,
        type: DataType.Function,
        declaredAt: 0,
        isInitialized: true,
        isUsed: false
      });
    }

    this.symbolTable.enterScope();
    const prevFunction = this.currentFunction;
    this.currentFunction = funcName;
    this.functionReturnTypes.set(funcName, []);

    this.hoistFunctionDeclarations(node.body.body);

    for (const param of node.params) {
      this.declareFunctionParam(param);
    }

    let lastStmt: any = null;
    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
      lastStmt = stmt;
    }

    const returnTypes = this.functionReturnTypes.get(funcName) || [];
    if (returnTypes.length > 0) {
      const inferredReturnType = this.unionType(returnTypes);
      const funcSymbol = this.symbolTable.lookupCurrent(funcName);
      if (funcSymbol) {
        funcSymbol.returnType = inferredReturnType;
      }
      if (!lastStmt || lastStmt.type !== 'ReturnStatement') {
        this.addWarning(`Function '${funcName}' does not always return a value`, 0);
      }
    }

    this.symbolTable.exitScope();
    this.currentFunction = prevFunction;
  }

  private declareFunctionParam(param: any): void {
    const paramNode = param.param || param;
    if (paramNode.type === 'Identifier') {
      this.symbolTable.declare({
        name: paramNode.name,
        kind: SymbolKind.Parameter,
        type: DataType.Any,
        declaredAt: 0,
        isInitialized: true,
        isUsed: false
      });
    }
  }

  private visitIfStatement(node: any): void {
    const testType = this.getExpressionType(node.test);
    this.visitExpression(node.test);
    if (testType !== DataType.Boolean) {
      this.addError(`Conditional test is not boolean: ${testType}`, 0);
    }
    this.visitStatement(node.consequent);
    if (node.alternate) this.visitStatement(node.alternate);
  }

  private visitWhileStatement(node: any): void {
    const testType = this.getExpressionType(node.test);
    this.visitExpression(node.test);
    if (testType !== DataType.Boolean) {
      this.addError(`Loop condition is not boolean: ${testType}`, 0);
    }
    this.inLoop++;
    this.visitStatement(node.body);
    this.inLoop--;
  }

  private visitForStatement(node: any): void {
    this.symbolTable.enterScope();
    if (node.init) {
      if (node.init.type === 'VariableDeclaration') {
        this.visitVariableDeclaration(node.init);
      } else {
        this.visitExpression(node.init);
      }
    }
    if (node.test) this.getExpressionType(node.test);
    if (node.update) this.visitExpression(node.update);
    this.inLoop++;
    this.visitStatement(node.body);
    this.inLoop--;
    this.symbolTable.exitScope();
  }

  private visitForInOf(node: any): void {
    this.symbolTable.enterScope();
    if (node.left.type === 'VariableDeclaration') {
      this.visitVariableDeclaration(node.left);
    } else {
      this.visitExpression(node.left);
    }
    this.visitExpression(node.right);
    this.inLoop++;
    this.visitStatement(node.body);
    this.inLoop--;
    this.symbolTable.exitScope();
  }

  private visitSwitchStatement(node: any): void {
    this.getExpressionType(node.discriminant);
    this.inSwitch++;
    for (const c of node.cases) {
      if (c.test) this.getExpressionType(c.test);
      for (const stmt of c.consequent) {
        this.visitStatement(stmt);
      }
    }
    this.inSwitch--;
  }

  private visitTryStatement(node: any): void {
    this.visitBlockStatement(node.block);
    if (node.handler) {
      this.symbolTable.enterScope();
      if (node.handler.param) {
        const param = node.handler.param;
        if (param.type === 'Identifier') {
          this.symbolTable.declare({
            name: param.name,
            kind: SymbolKind.Variable,
            type: DataType.Any,
            declaredAt: 0,
            isInitialized: true,
            isUsed: false
          });
        }
      }
      this.visitBlockStatement(node.handler.body);
      this.symbolTable.exitScope();
    }
    if (node.finalizer) {
      this.visitBlockStatement(node.finalizer);
    }
  }

  private visitBlockStatement(node: any): void {
    this.symbolTable.enterScope();
    const prevInBlock = this.inBlock;
    this.inBlock = true;
    for (const stmt of node.body) {
      this.visitStatement(stmt);
    }
    this.inBlock = prevInBlock;
    this.symbolTable.exitScope();
  }

  private visitReturnStatement(node: any): void {
    if (this.currentFunction) {
      if (node.argument) {
        const returnType = this.visitExpression(node.argument);
        const types = this.functionReturnTypes.get(this.currentFunction) || [];
        types.push(returnType);
        this.functionReturnTypes.set(this.currentFunction, types);
      }
    } else if (node.argument) {
      this.visitExpression(node.argument);
    }
  }

  private visitImportDeclaration(node: any): void {
    for (const spec of node.specifiers || []) {
      const name = spec.local?.name;
      if (name && !this.symbolTable.lookupCurrent(name)) {
        this.symbolTable.declare({
          name,
          kind: SymbolKind.Variable,
          type: DataType.Any,
          declaredAt: 0,
          isInitialized: true,
          isUsed: false
        });
      }
    }
  }

  private visitExportNamedDeclaration(node: any): void {
    if (node.declaration) {
      this.visitStatement(node.declaration);
    }
  }

  private visitExportDefaultDeclaration(node: any): void {
    if (node.declaration) {
      if (node.declaration.type === 'FunctionDeclaration' ||
          node.declaration.type === 'ClassDeclaration') {
        this.visitStatement(node.declaration);
      } else {
        this.getExpressionType(node.declaration);
      }
    }
  }

  private visitClassDeclaration(node: any): void {
    if (node.id) {
      this.symbolTable.declare({
        name: node.id.name,
        kind: SymbolKind.Variable,
        type: DataType.Function,
        declaredAt: 0,
        isInitialized: true,
        isUsed: false
      });
    }
    if (node.superClass) this.visitExpression(node.superClass);
    for (const method of node.body.body) {
      this.visitExpression(method.value);
    }
  }

  private visitExpression(node: Expression): DataType {
    return this.getExpressionType(node);
  }

  private getExpressionType(node: Expression): DataType {
    if (!node) return DataType.Any;

    switch (node.type) {
      case 'Literal': {
        const val = (node as any).value;
        if (val === null) return DataType.Null;
        if (val === undefined) return DataType.Undefined;
        if (typeof val === 'number') return DataType.Number;
        if (typeof val === 'string') return DataType.String;
        if (typeof val === 'boolean') return DataType.Boolean;
        if (typeof val === 'bigint') return DataType.Any;
        return DataType.Any;
      }

      case 'Identifier': {
        const symbol = this.symbolTable.lookup((node as any).name);
        if (!symbol) {
          this.addError(`Undefined variable: ${(node as any).name}`, 0);
          return DataType.Any;
        }
        symbol.isUsed = true;
        return symbol.type;
      }

      case 'ThisExpression':
        return DataType.Object;

      case 'SuperExpression':
        return DataType.Object;

      case 'ArrayLiteral': {
        const arr = node as any;
        let elementType = DataType.Any;
        if (arr.elements) {
          for (const element of arr.elements) {
            if (element && element.type !== 'SpreadElement') {
              const elType = this.getExpressionType(element);
              if (elementType === DataType.Any) {
                elementType = elType;
              } else if (elType !== elementType) {
                elementType = DataType.Any;
              }
            } else if (element) {
              this.getExpressionType(element);
            }
          }
        }
        return DataType.Array;
      }

      case 'ObjectLiteral': {
        const obj = node as any;
        for (const prop of obj.properties) {
          this.getExpressionType(prop.value);
          if (prop.key && prop.key.type !== 'Identifier' && prop.key.type !== 'Literal') {
            this.getExpressionType(prop.key);
          }
        }
        return DataType.Object;
      }

      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const fn = node as any;
        this.symbolTable.enterScope();
        const prevFunction = this.currentFunction;
        const anonKey = `__anon_${this.functionReturnTypes.size}`;
        this.currentFunction = anonKey;
        this.functionReturnTypes.set(anonKey, []);

        for (const param of (fn.params || [])) {
          this.declareFunctionParam(param);
        }

        if (fn.expression) {
          const returnType = this.getExpressionType(fn.body);
          this.functionReturnTypes.set(anonKey, [returnType]);
        } else if (fn.body) {
          if (fn.body.type === 'BlockStatement') {
            for (const stmt of fn.body.body) {
              this.visitStatement(stmt);
            }
          }
        }

        const returnTypes = this.functionReturnTypes.get(anonKey) || [];
        if (returnTypes.length > 0) {
          fn._returnType = this.unionType(returnTypes);
        }

        this.currentFunction = prevFunction;
        this.symbolTable.exitScope();
        return DataType.Function;
      }

      case 'ClassExpression': {
        const cls = node as any;
        if (cls.superClass) this.getExpressionType(cls.superClass);
        return DataType.Function;
      }

      case 'NewExpression': {
        const newExpr = node as any;
        this.getExpressionType(newExpr.callee);
        for (const arg of newExpr.arguments) this.getExpressionType(arg);
        return DataType.Object;
      }

      case 'CallExpression': {
        const call = node as any;
        const calleeType = this.getExpressionType(call.callee);
        for (const arg of call.arguments) {
          if (arg.type === 'SpreadElement') {
            this.getExpressionType(arg.argument);
          } else {
            this.getExpressionType(arg);
          }
        }
        if (call.callee.type === 'MemberExpression') {
          const obj = call.callee.object;
          if (obj.type === 'Identifier' && obj.name === 'console') {
            return DataType.Void;
          }
        }
        if (call.callee.type === 'Identifier') {
          const symbol = this.symbolTable.lookup(call.callee.name);
          if (symbol && symbol.returnType) {
            return symbol.returnType;
          }
        }
        if (call.callee._returnType) {
          return call.callee._returnType;
        }
        if (calleeType === DataType.Function) return DataType.Any;
        return DataType.Any;
      }

      case 'MemberExpression': {
        const member = node as any;
        this.getExpressionType(member.object);
        if (member.object.type === 'Identifier' && member.object.name === 'console') {
          return DataType.Void;
        }
        return DataType.Any;
      }

      case 'BinaryExpression': {
        const bin = node as any;
        const leftType = this.getExpressionType(bin.left);
        const rightType = this.getExpressionType(bin.right);

        if (bin.operator === '===' || bin.operator === '!==') {
          this.checkTypeCompatibility(leftType, rightType, bin.operator);
          return DataType.Boolean;
        }

        if (['==', '!=', '<', '>', '<=', '>=', 'in', 'instanceof'].includes(bin.operator)) {
          this.checkTypeCompatibility(leftType, rightType, bin.operator);
          return DataType.Boolean;
        }

        if (['&&', '||', '??'].includes(bin.operator)) {
          return this.logicalExpressionType(bin.operator, leftType, rightType);
        }

        if (['+', '-', '*', '/', '%', '**'].includes(bin.operator)) {
          this.checkNumericOperation(leftType, rightType, bin.operator);
          if (bin.operator === '+' &&
              (leftType === DataType.String || rightType === DataType.String)) {
            return DataType.String;
          }
          return DataType.Number;
        }

        if (['&', '|', '^', '<<', '>>', '>>>'].includes(bin.operator)) {
          this.checkNumericOperation(leftType, rightType, bin.operator);
          return DataType.Number;
        }

        return DataType.Any;
      }

      case 'UnaryExpression': {
        const unary = node as any;
        const argType = this.getExpressionType(unary.argument);
        if (['typeof', 'void'].includes(unary.operator)) return DataType.String;
        if (['!', 'delete'].includes(unary.operator)) return DataType.Boolean;
        if (['+', '-', '~'].includes(unary.operator)) {
          if (argType !== DataType.Number && argType !== DataType.Any) {
            this.addError(`Unary operator '${unary.operator}' applied to non-number type: ${argType}`, 0);
          }
          return DataType.Number;
        }
        return DataType.Any;
      }

      case 'UpdateExpression': {
        const update = node as any;
        const argType = this.getExpressionType(update.argument);
        if (argType !== DataType.Number && argType !== DataType.Any) {
          this.addError(`Update operator applied to non-number type: ${argType}`, 0);
        }
        return DataType.Number;
      }

      case 'AssignmentExpression': {
        const assign = node as any;
        const rightType = this.getExpressionType(assign.right);
        if (assign.left.type === 'Identifier') {
          const symbol = this.symbolTable.lookup(assign.left.name);
          if (symbol) {
            if (symbol.isConst) {
              this.addError(`Assignment to constant variable: ${assign.left.name}`, 0);
            }
            symbol.type = this.unifyType(symbol.type, rightType);
            symbol.isInitialized = true;
          }
        } else {
          this.getExpressionType(assign.left);
        }
        if (assign.left.type === 'Identifier' && assign.operator !== '=') {
          const symbol = this.symbolTable.lookup(assign.left.name);
          if (symbol && symbol.type !== DataType.Number && symbol.type !== DataType.Any) {
            this.addError(`Compound assignment to non-number type: ${symbol.type}`, 0);
          }
        }
        return rightType;
      }

      case 'LogicalExpression': {
        const log = node as any;
        const leftType = this.getExpressionType(log.left);
        const rightType = this.getExpressionType(log.right);
        return this.logicalExpressionType(log.operator, leftType, rightType);
      }

      case 'ConditionalExpression': {
        const cond = node as any;
        this.getExpressionType(cond.test);
        const consType = this.getExpressionType(cond.consequent);
        const altType = this.getExpressionType(cond.alternate);
        return this.commonType(consType, altType);
      }

      case 'RegexLiteral':
        return DataType.RegExp;

      case 'TemplateLiteral': {
        const templ = node as any;
        for (const expr of templ.expressions) this.getExpressionType(expr);
        return DataType.String;
      }

      case 'SpreadElement': {
        const spread = node as any;
        return this.getExpressionType(spread.argument);
      }

      case 'AwaitExpression': {
        const awaitExpr = node as any;
        return this.getExpressionType(awaitExpr.argument);
      }

      case 'YieldExpression': {
        const yieldExpr = node as any;
        if (yieldExpr.argument) this.getExpressionType(yieldExpr.argument);
        return DataType.Any;
      }

      case 'SequenceExpression': {
        const seq = node as any;
        let lastType = DataType.Any;
        for (const expr of seq.expressions) lastType = this.getExpressionType(expr);
        return lastType;
      }

      case 'MetaProperty':
        return DataType.Any;

      case 'ImportExpression':
        return DataType.Any;

      default:
        return DataType.Any;
    }
  }

  private logicalExpressionType(op: string, left: DataType, right: DataType): DataType {
    if (op === '&&') return right;
    if (op === '??') return left === DataType.Null || left === DataType.Undefined ? right : left;
    return this.commonType(left, right);
  }

  private commonType(a: DataType, b: DataType): DataType {
    if (a === b) return a;
    if (a === DataType.Any || b === DataType.Any) return DataType.Any;
    if (a === DataType.Null) return b;
    if (b === DataType.Null) return a;
    if (a === DataType.Undefined) return b;
    if (b === DataType.Undefined) return a;
    return DataType.Any;
  }

  private unionType(types: DataType[]): DataType {
    if (types.length === 0) return DataType.Any;
    if (types.length === 1) return types[0];
    let result = types[0];
    for (let i = 1; i < types.length; i++) {
      result = this.commonType(result, types[i]);
    }
    return result;
  }

  private unifyType(existing: DataType, newType: DataType): DataType {
    if (existing === DataType.Any) return newType;
    if (newType === DataType.Any) return existing;
    if (existing === newType) return existing;
    return DataType.Any;
  }

  private checkTypeCompatibility(left: DataType, right: DataType, operator: string): void {
    if (left === DataType.Any || right === DataType.Any) return;
    if (left === right) return;
    if (left === DataType.Null || right === DataType.Null) return;
    if (left === DataType.Undefined || right === DataType.Undefined) return;
    if (operator === '===' || operator === '!==') {
      this.addError(`Strict equality between incompatible types: ${left} and ${right}`, 0);
    }
  }

  private checkNumericOperation(left: DataType, right: DataType, operator: string): void {
    if (left === DataType.Any || right === DataType.Any) return;
    if (left === DataType.Number && right === DataType.Number) return;
    if (operator === '+' && (left === DataType.String || right === DataType.String)) return;
    if (left === DataType.String || left === DataType.Boolean ||
        right === DataType.String || right === DataType.Boolean) {
      this.addError(`Operator '${operator}' applied to non-numeric types: ${left} and ${right}`, 0);
    }
  }

  private addError(message: string, line: number): void {
    this.errors.push({ message, line });
  }

  private addWarning(message: string, line: number): void {
    this.warnings.push({ message, line });
  }

  public getErrors(): Array<{ message: string; line: number }> {
    return this.errors;
  }

  public getWarnings(): Array<{ message: string; line: number }> {
    return this.warnings;
  }

  public getSymbolTable(): SymbolTable {
    return this.symbolTable;
  }
}

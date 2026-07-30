import { Program, Statement, Expression, BlockStatement, FunctionParam } from '../ast/ast-types.js';
import { SymbolTable, SymbolKind, DataType } from './symbol-table.js';

export class TypeChecker {
  private symbolTable: SymbolTable;
  private errors: Array<{ message: string; line: number }> = [];
  private currentFunction: string | null = null;
  private inLoop: number = 0;
  private inSwitch: number = 0;

  constructor() {
    this.symbolTable = new SymbolTable();
  }

  public check(ast: Program): boolean {
    this.errors = [];
    try {
      this.visitProgram(ast);
    } catch (error) {
      if (error instanceof Error) {
        this.errors.push({ message: error.message, line: 0 });
      }
    }
    return this.errors.length === 0;
  }

  private visitProgram(node: Program): void {
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
      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration':
        // Module declarations - skip type checking for now
        break;
      default:
        break;
    }
  }

  private visitVariableDeclaration(node: any): void {
    for (const decl of node.declarations) {
      const varName = decl.id.type === 'Identifier' ? decl.id.name : null;
      let type = DataType.Any;

      if (decl.init) {
        const initType = this.getExpressionType(decl.init);
        type = initType;
      }

      if (varName) {
        if (this.symbolTable.lookupCurrent(varName)) {
          this.addError(`Duplicate declaration: ${varName}`, 0);
          continue;
        }
        this.symbolTable.declare({
          name: varName,
          kind: SymbolKind.Variable,
          type,
          declaredAt: 0,
          isInitialized: !!decl.init,
          isUsed: false
        });
      }

      if (decl.init) this.visitExpression(decl.init);
    }
  }

  private visitFunctionDeclaration(node: any): void {
    const funcName = node.name.name;

    this.symbolTable.declare({
      name: funcName,
      kind: SymbolKind.Function,
      type: DataType.Function,
      declaredAt: 0,
      isInitialized: true,
      isUsed: false
    });

    this.symbolTable.enterScope();
    this.currentFunction = funcName;

    for (const param of node.params) {
      this.declareFunctionParam(param);
    }

    for (const stmt of node.body.body) {
      this.visitStatement(stmt);
    }

    this.symbolTable.exitScope();
    this.currentFunction = null;
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
    this.getExpressionType(node.test);
    this.visitExpression(node.test);
    this.visitStatement(node.consequent);
    if (node.alternate) this.visitStatement(node.alternate);
  }

  private visitWhileStatement(node: any): void {
    this.getExpressionType(node.test);
    this.visitExpression(node.test);
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
    for (const stmt of node.body) {
      this.visitStatement(stmt);
    }
    this.symbolTable.exitScope();
  }

  private visitReturnStatement(node: any): void {
    if (node.argument) this.visitExpression(node.argument);
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
        if (arr.elements) {
          for (const element of arr.elements) {
            if (element) this.getExpressionType(element);
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
        for (const param of (fn.params || [])) {
          this.declareFunctionParam(param);
        }
        if (fn.expression) {
          this.getExpressionType(fn.body);
        } else if (fn.body) {
          if (fn.body.type === 'BlockStatement') {
            for (const stmt of fn.body.body) {
              this.visitStatement(stmt);
            }
          }
        }
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
        this.getExpressionType(call.callee);
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
          return DataType.Boolean;
        }

        if (['==', '!=', '<', '>', '<=', '>=', 'in', 'instanceof'].includes(bin.operator)) {
          return DataType.Boolean;
        }

        if (['&&', '||', '??'].includes(bin.operator)) {
          return leftType;
        }

        if (['+', '-', '*', '/', '%', '**'].includes(bin.operator)) {
          if (bin.operator === '+' &&
              (leftType === DataType.String || rightType === DataType.String)) {
            return DataType.String;
          }
          return DataType.Number;
        }

        if (['&', '|', '^', '<<', '>>', '>>>'].includes(bin.operator)) {
          return DataType.Number;
        }

        return DataType.Any;
      }

      case 'UnaryExpression': {
        const unary = node as any;
        this.getExpressionType(unary.argument);
        if (['typeof', 'void'].includes(unary.operator)) return DataType.String;
        if (['!', 'delete'].includes(unary.operator)) return DataType.Boolean;
        if (['+', '-', '~'].includes(unary.operator)) return DataType.Number;
        return DataType.Any;
      }

      case 'UpdateExpression': {
        const update = node as any;
        this.getExpressionType(update.argument);
        return DataType.Number;
      }

      case 'AssignmentExpression': {
        const assign = node as any;
        const rightType = this.getExpressionType(assign.right);
        if (assign.left.type === 'Identifier') {
          const symbol = this.symbolTable.lookup(assign.left.name);
          if (symbol) symbol.isInitialized = true;
        } else {
          this.getExpressionType(assign.left);
        }
        return rightType;
      }

      case 'LogicalExpression': {
        const log = node as any;
        const leftType = this.getExpressionType(log.left);
        this.getExpressionType(log.right);
        return leftType;
      }

      case 'ConditionalExpression': {
        const cond = node as any;
        this.getExpressionType(cond.test);
        const consType = this.getExpressionType(cond.consequent);
        this.getExpressionType(cond.alternate);
        return consType;
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

  private addError(message: string, line: number): void {
    this.errors.push({ message, line });
  }

  public getErrors(): Array<{ message: string; line: number }> {
    return this.errors;
  }

  public getSymbolTable(): SymbolTable {
    return this.symbolTable;
  }
}
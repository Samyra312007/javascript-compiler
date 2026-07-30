export enum TACOp {
  ADD = 'ADD',
  SUB = 'SUB',
  MUL = 'MUL',
  DIV = 'DIV',
  MOD = 'MOD',
  POW = 'POW',
  EQ = 'EQ',
  NE = 'NE',
  STRICT_EQ = 'STRICT_EQ',
  STRICT_NE = 'STRICT_NE',
  LT = 'LT',
  GT = 'GT',
  LE = 'LE',
  GE = 'GE',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  BIT_AND = 'BIT_AND',
  BIT_OR = 'BIT_OR',
  BIT_XOR = 'BIT_XOR',
  BIT_NOT = 'BIT_NOT',
  SHL = 'SHL',
  SHR = 'SHR',
  USHR = 'USHR',
  ASSIGN = 'ASSIGN',
  LOAD = 'LOAD',
  STORE = 'STORE',
  LABEL = 'LABEL',
  JUMP = 'JUMP',
  COND_JUMP = 'COND_JUMP',
  CALL = 'CALL',
  PARAM = 'PARAM',
  RETURN = 'RETURN',
  INC = 'INC',
  DEC = 'DEC',
  NEG = 'NEG',
  TYPEOF = 'TYPEOF',
  DELETE = 'DELETE',
  NEW = 'NEW',
  SPREAD = 'SPREAD',
}

export interface TACInstruction {
  op: TACOp;
  result?: string;
  arg1?: string;
  arg2?: string;
  label?: number;
}

export class TACGenerator {
  private instructions: TACInstruction[] = [];
  private tempCounter: number = 0;
  private labelCounter: number = 0;

  public generate(ast: any): TACInstruction[] {
    this.instructions = [];
    this.tempCounter = 0;
    this.labelCounter = 0;

    if (ast && ast.body) {
      for (const stmt of ast.body) {
        this.generateNode(stmt);
      }
    }

    return this.instructions;
  }

  private generateNode(node: any): string | null {
    if (!node) return null;

    switch (node.type) {
      case 'Program':
        return this.generateProgram(node);
      case 'VariableDeclaration':
        return this.generateVariableDeclaration(node);
      case 'FunctionDeclaration':
        return this.generateFunctionDeclaration(node);
      case 'FunctionExpression':
        return this.generateFunctionExpression(node);
      case 'ArrowFunctionExpression':
        return this.generateArrowFunction(node);
      case 'ClassDeclaration':
        return this.generateClassDeclaration(node);
      case 'ClassExpression':
        return this.generateClassExpression(node);
      case 'IfStatement':
        return this.generateIfStatement(node);
      case 'WhileStatement':
        return this.generateWhileStatement(node);
      case 'DoWhileStatement':
        return this.generateDoWhileStatement(node);
      case 'ForStatement':
        return this.generateForStatement(node);
      case 'ForInStatement':
        return this.generateForInStatement(node);
      case 'ForOfStatement':
        return this.generateForOfStatement(node);
      case 'SwitchStatement':
        return this.generateSwitchStatement(node);
      case 'TryStatement':
        return this.generateTryStatement(node);
      case 'ThrowStatement':
        return this.generateThrowStatement(node);
      case 'ReturnStatement':
        return this.generateReturnStatement(node);
      case 'BreakStatement':
        return null;
      case 'ContinueStatement':
        return null;
      case 'ExpressionStatement':
        return this.generateExpression(node.expression);
      case 'BlockStatement':
        return this.generateBlockStatement(node);
      case 'EmptyStatement':
        return null;
      case 'DebuggerStatement':
        return null;
      case 'LabeledStatement':
        return this.generateNode(node.body);
      case 'BinaryExpression':
        return this.generateBinaryExpression(node);
      case 'UnaryExpression':
        return this.generateUnaryExpression(node);
      case 'UpdateExpression':
        return this.generateUpdateExpression(node);
      case 'AssignmentExpression':
        return this.generateAssignmentExpression(node);
      case 'LogicalExpression':
        return this.generateLogicalExpression(node);
      case 'ConditionalExpression':
        return this.generateConditionalExpression(node);
      case 'Identifier':
        return this.generateIdentifier(node);
      case 'Literal':
        return this.generateLiteral(node);
      case 'CallExpression':
        return this.generateCallExpression(node);
      case 'NewExpression':
        return this.generateNewExpression(node);
      case 'MemberExpression':
        return this.generateMemberExpression(node);
      case 'ArrayLiteral':
        return this.generateArrayLiteral(node);
      case 'ObjectLiteral':
        return this.generateObjectLiteral(node);
      case 'TemplateLiteral':
        return this.generateTemplateLiteral(node);
      case 'ThisExpression':
        return 'this';
      case 'SuperExpression':
        return 'super';
      case 'RegexLiteral':
        return this.generateRegexLiteral(node);
      case 'SpreadElement':
        return this.generateSpreadElement(node);
      case 'AwaitExpression':
        return this.generateNode(node.argument);
      case 'YieldExpression':
        return this.generateNode(node.argument);
      case 'SequenceExpression':
        return this.generateSequenceExpression(node);
      case 'MetaProperty':
        return null;
      case 'ImportExpression':
        return null;
      case 'ImportDeclaration':
      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration':
        return null;
      default:
        return null;
    }
  }

  // ====== Statements ======

  private generateProgram(node: any): string | null {
    for (const stmt of node.body) this.generateNode(stmt);
    return null;
  }

  private generateVariableDeclaration(node: any): string | null {
    for (const decl of node.declarations) {
      if (decl.init) {
        const value = this.generateNode(decl.init);
        if (value && decl.id.type === 'Identifier') {
          this.addInstruction({ op: TACOp.ASSIGN, result: decl.id.name, arg1: value });
        }
      }
    }
    return null;
  }

  private generateFunctionDeclaration(node: any): string | null {
    const label = this.newLabel();
    this.addInstruction({ op: TACOp.LABEL, label, result: node.name.name });
    for (const param of node.params) {
      const paramName = param.param?.name;
      if (paramName) {
        this.addInstruction({ op: TACOp.ASSIGN, result: paramName, arg1: `param_${paramName}` });
      }
    }
    this.generateNode(node.body);
    this.addInstruction({ op: TACOp.RETURN });
    return null;
  }

  private generateFunctionExpression(node: any): string {
    const temp = this.newTemp();
    const label = this.newLabel();
    this.addInstruction({ op: TACOp.LABEL, label, result: temp });
    for (const param of node.params) {
      const paramName = param.param?.name;
      if (paramName) {
        this.addInstruction({ op: TACOp.ASSIGN, result: paramName, arg1: `param_${paramName}` });
      }
    }
    this.generateNode(node.body);
    this.addInstruction({ op: TACOp.RETURN });
    this.addInstruction({ op: TACOp.ASSIGN, result: temp, arg1: `func_${label}` });
    return temp;
  }

  private generateArrowFunction(node: any): string {
    const temp = this.newTemp();
    const label = this.newLabel();
    this.addInstruction({ op: TACOp.LABEL, label, result: temp });
    for (const param of node.params) {
      const paramName = param.param?.name;
      if (paramName) {
        this.addInstruction({ op: TACOp.ASSIGN, result: paramName, arg1: `param_${paramName}` });
      }
    }
    if (node.expression) {
      const result = this.generateNode(node.body);
      if (result) this.addInstruction({ op: TACOp.RETURN, arg1: result });
    } else {
      this.generateNode(node.body);
    }
    this.addInstruction({ op: TACOp.RETURN });
    this.addInstruction({ op: TACOp.ASSIGN, result: temp, arg1: `func_${label}` });
    return temp;
  }

  private generateClassDeclaration(node: any): string | null {
    if (node.id) {
      const temp = this.newTemp();
      this.addInstruction({ op: TACOp.ASSIGN, result: node.id.name, arg1: `class_${node.id.name}` });
    }
    return null;
  }

  private generateClassExpression(node: any): string {
    const temp = this.newTemp();
    this.addInstruction({ op: TACOp.ASSIGN, result: temp, arg1: '{}' });
    return temp;
  }

  private generateIfStatement(node: any): string | null {
    const elseLabel = this.newLabel();
    const endLabel = this.newLabel();
    const cond = this.generateNode(node.test);
    this.addInstruction({ op: TACOp.COND_JUMP, arg1: cond || 'false', arg2: 'false', label: elseLabel });
    this.generateNode(node.consequent);
    this.addInstruction({ op: TACOp.JUMP, label: endLabel });
    this.addInstruction({ op: TACOp.LABEL, label: elseLabel });
    if (node.alternate) this.generateNode(node.alternate);
    this.addInstruction({ op: TACOp.LABEL, label: endLabel });
    return null;
  }

  private generateWhileStatement(node: any): string | null {
    const startLabel = this.newLabel();
    const endLabel = this.newLabel();
    this.addInstruction({ op: TACOp.LABEL, label: startLabel });
    const cond = this.generateNode(node.test);
    this.addInstruction({ op: TACOp.COND_JUMP, arg1: cond || 'false', arg2: 'false', label: endLabel });
    this.generateNode(node.body);
    this.addInstruction({ op: TACOp.JUMP, label: startLabel });
    this.addInstruction({ op: TACOp.LABEL, label: endLabel });
    return null;
  }

  private generateDoWhileStatement(node: any): string | null {
    const startLabel = this.newLabel();
    const endLabel = this.newLabel();
    this.addInstruction({ op: TACOp.LABEL, label: startLabel });
    this.generateNode(node.body);
    const cond = this.generateNode(node.test);
    this.addInstruction({ op: TACOp.COND_JUMP, arg1: cond || 'true', arg2: 'true', label: startLabel });
    this.addInstruction({ op: TACOp.LABEL, label: endLabel });
    return null;
  }

  private generateForStatement(node: any): string | null {
    const startLabel = this.newLabel();
    const endLabel = this.newLabel();
    if (node.init) {
      if (node.init.type === 'VariableDeclaration') this.generateVariableDeclaration(node.init);
      else this.generateNode(node.init);
    }
    this.addInstruction({ op: TACOp.LABEL, label: startLabel });
    if (node.test) {
      const cond = this.generateNode(node.test);
      this.addInstruction({ op: TACOp.COND_JUMP, arg1: cond || 'true', arg2: 'false', label: endLabel });
    }
    this.generateNode(node.body);
    if (node.update) this.generateNode(node.update);
    this.addInstruction({ op: TACOp.JUMP, label: startLabel });
    this.addInstruction({ op: TACOp.LABEL, label: endLabel });
    return null;
  }

  private generateForInStatement(node: any): string | null {
    const obj = this.generateNode(node.right);
    const startLabel = this.newLabel();
    const endLabel = this.newLabel();
    this.addInstruction({ op: TACOp.LABEL, label: startLabel });
    this.addInstruction({ op: TACOp.COND_JUMP, arg1: obj || 'false', arg2: 'false', label: endLabel });
    if (node.left.type === 'VariableDeclaration') {
      const id = node.left.declarations[0]?.id;
      if (id?.name) this.addInstruction({ op: TACOp.ASSIGN, result: id.name, arg1: obj || '' });
    }
    this.generateNode(node.body);
    this.addInstruction({ op: TACOp.JUMP, label: startLabel });
    this.addInstruction({ op: TACOp.LABEL, label: endLabel });
    return null;
  }

  private generateForOfStatement(node: any): string | null {
    const arr = this.generateNode(node.right);
    const startLabel = this.newLabel();
    const endLabel = this.newLabel();
    const idxTemp = this.newTemp();
    this.addInstruction({ op: TACOp.ASSIGN, result: idxTemp, arg1: '0' });
    this.addInstruction({ op: TACOp.LABEL, label: startLabel });
    this.addInstruction({ op: TACOp.COND_JUMP, arg1: idxTemp, arg2: arr || '0', label: endLabel });
    if (node.left.type === 'VariableDeclaration') {
      const id = node.left.declarations[0]?.id;
      if (id?.name) this.addInstruction({ op: TACOp.ASSIGN, result: id.name, arg1: arr || '' });
    }
    this.generateNode(node.body);
    this.addInstruction({ op: TACOp.ADD, result: idxTemp, arg1: idxTemp, arg2: '1' });
    this.addInstruction({ op: TACOp.JUMP, label: startLabel });
    this.addInstruction({ op: TACOp.LABEL, label: endLabel });
    return null;
  }

  private generateSwitchStatement(node: any): string | null {
    const disc = this.generateNode(node.discriminant);
    const endLabel = this.newLabel();
    for (const c of node.cases) {
      if (c.test) {
        const testVal = this.generateNode(c.test);
        const temp = this.newTemp();
        this.addInstruction({ op: TACOp.EQ, result: temp, arg1: disc || '0', arg2: testVal || '0' });
        const caseLabel = this.newLabel();
        this.addInstruction({ op: TACOp.COND_JUMP, arg1: temp, arg2: 'true', label: caseLabel });
        this.addInstruction({ op: TACOp.JUMP, label: endLabel });
        this.addInstruction({ op: TACOp.LABEL, label: caseLabel });
      }
      for (const stmt of c.consequent) {
        if (stmt.type === 'BreakStatement') {
          this.addInstruction({ op: TACOp.JUMP, label: endLabel });
        } else {
          this.generateNode(stmt);
        }
      }
    }
    this.addInstruction({ op: TACOp.LABEL, label: endLabel });
    return null;
  }

  private generateTryStatement(node: any): string | null {
    this.generateNode(node.block);
    if (node.handler) this.generateNode(node.handler.body);
    if (node.finalizer) this.generateNode(node.finalizer);
    return null;
  }

  private generateThrowStatement(node: any): string | null {
    const val = this.generateNode(node.argument);
    this.addInstruction({ op: TACOp.CALL, result: '__throw', arg1: val || 'undefined' });
    return null;
  }

  private generateReturnStatement(node: any): string | null {
    if (node.argument) {
      const value = this.generateNode(node.argument);
      this.addInstruction({ op: TACOp.RETURN, arg1: value || undefined });
    } else {
      this.addInstruction({ op: TACOp.RETURN });
    }
    return null;
  }

  private generateBlockStatement(node: any): string | null {
    for (const stmt of node.body) this.generateNode(stmt);
    return null;
  }

  // ====== Expressions ======

  private generateBinaryExpression(node: any): string {
    const left = this.generateNode(node.left);
    const right = this.generateNode(node.right);
    const result = this.newTemp();

    let op: TACOp;
    switch (node.operator) {
      case '+': op = TACOp.ADD; break;
      case '-': op = TACOp.SUB; break;
      case '*': op = TACOp.MUL; break;
      case '/': op = TACOp.DIV; break;
      case '%': op = TACOp.MOD; break;
      case '**': op = TACOp.POW; break;
      case '==': op = TACOp.EQ; break;
      case '!=': op = TACOp.NE; break;
      case '===': op = TACOp.STRICT_EQ; break;
      case '!==': op = TACOp.STRICT_NE; break;
      case '<': op = TACOp.LT; break;
      case '>': op = TACOp.GT; break;
      case '<=': op = TACOp.LE; break;
      case '>=': op = TACOp.GE; break;
      case '&&': op = TACOp.AND; break;
      case '||': op = TACOp.OR; break;
      case '&': op = TACOp.BIT_AND; break;
      case '|': op = TACOp.BIT_OR; break;
      case '^': op = TACOp.BIT_XOR; break;
      case '<<': op = TACOp.SHL; break;
      case '>>': op = TACOp.SHR; break;
      case '>>>': op = TACOp.USHR; break;
      default: throw new Error(`Unknown binary operator: ${node.operator}`);
    }

    this.addInstruction({ op, result, arg1: left || '0', arg2: right || '0' });
    return result;
  }

  private generateUnaryExpression(node: any): string {
    if (node.operator === 'typeof') {
      const arg = this.generateNode(node.argument);
      const result = this.newTemp();
      this.addInstruction({ op: TACOp.TYPEOF, result, arg1: arg || 'undefined' });
      return result;
    }
    if (node.operator === 'delete') {
      const arg = this.generateNode(node.argument);
      const result = this.newTemp();
      this.addInstruction({ op: TACOp.DELETE, result, arg1: arg || '' });
      return result;
    }
    if (node.operator === '!') {
      const arg = this.generateNode(node.argument);
      const result = this.newTemp();
      this.addInstruction({ op: TACOp.NOT, result, arg1: arg || 'false' });
      return result;
    }
    if (node.operator === '-') {
      const arg = this.generateNode(node.argument);
      const result = this.newTemp();
      this.addInstruction({ op: TACOp.SUB, result, arg1: '0', arg2: arg || '0' });
      return result;
    }
    if (node.operator === '~') {
      const arg = this.generateNode(node.argument);
      const result = this.newTemp();
      this.addInstruction({ op: TACOp.BIT_NOT, result, arg1: arg || '0' });
      return result;
    }
    if (node.operator === '+') {
      return this.generateNode(node.argument) || '0';
    }
    if (node.operator === 'void') {
      this.generateNode(node.argument);
      const result = this.newTemp();
      this.addInstruction({ op: TACOp.ASSIGN, result, arg1: 'undefined' });
      return result;
    }
    return this.generateNode(node.argument) || '0';
  }

  private generateUpdateExpression(node: any): string {
    const arg = this.generateNode(node.argument);
    const result = this.newTemp();
    if (node.operator === '++') {
      this.addInstruction({ op: TACOp.ASSIGN, result, arg1: arg || '0' });
      this.addInstruction({ op: TACOp.ADD, result: arg || result, arg1: arg || '0', arg2: '1' });
    } else {
      this.addInstruction({ op: TACOp.ASSIGN, result, arg1: arg || '0' });
      this.addInstruction({ op: TACOp.SUB, result: arg || result, arg1: arg || '0', arg2: '1' });
    }
    return node.prefix ? arg || result : result;
  }

  private generateAssignmentExpression(node: any): string {
    const right = this.generateNode(node.right);
    const compoundOp = node.operator.replace('=', '');
    const targetName = node.left.type === 'Identifier' ? node.left.name : null;

    if (node.operator === '=') {
      if (targetName) {
        this.addInstruction({ op: TACOp.ASSIGN, result: targetName, arg1: right || '0' });
        return targetName;
      }
      if (node.left.type === 'MemberExpression') {
        const obj = this.generateNode(node.left.object);
        const prop = node.left.property?.name || '0';
        this.addInstruction({ op: TACOp.STORE, result: `${obj}.${prop}`, arg1: right || '0' });
        return right || '0';
      }
      return right || '0';
    }

    // Compound assignment: +=, -=, etc.
    if (targetName) {
      const leftVal = this.generateNode(node.left);
      const temp = this.newTemp();
      this.addInstruction({ op: TACOp.ADD, result: temp, arg1: leftVal || '0', arg2: right || '0' });
      this.addInstruction({ op: TACOp.ASSIGN, result: targetName, arg1: temp });
      return temp;
    }

    this.addInstruction({ op: TACOp.ASSIGN, result: targetName || this.newTemp(), arg1: right || '0' });
    return right || '0';
  }

  private generateLogicalExpression(node: any): string {
    const result = this.newTemp();
    const endLabel = this.newLabel();

    if (node.operator === '||') {
      const left = this.generateNode(node.left);
      this.addInstruction({ op: TACOp.ASSIGN, result, arg1: left || 'false' });
      this.addInstruction({ op: TACOp.COND_JUMP, arg1: result, arg2: 'true', label: endLabel });
      const right = this.generateNode(node.right);
      this.addInstruction({ op: TACOp.ASSIGN, result, arg1: right || 'false' });
    } else if (node.operator === '&&') {
      const left = this.generateNode(node.left);
      this.addInstruction({ op: TACOp.ASSIGN, result, arg1: left || 'false' });
      this.addInstruction({ op: TACOp.COND_JUMP, arg1: result, arg2: 'false', label: endLabel });
      const right = this.generateNode(node.right);
      this.addInstruction({ op: TACOp.ASSIGN, result, arg1: right || 'false' });
    } else {
      const left = this.generateNode(node.left);
      const right = this.generateNode(node.right);
      this.addInstruction({ op: TACOp.OR, result, arg1: left || 'false', arg2: right || 'false' });
    }

    this.addInstruction({ op: TACOp.LABEL, label: endLabel });
    return result;
  }

  private generateConditionalExpression(node: any): string {
    const result = this.newTemp();
    const elseLabel = this.newLabel();
    const endLabel = this.newLabel();
    const cond = this.generateNode(node.test);
    this.addInstruction({ op: TACOp.COND_JUMP, arg1: cond || 'false', arg2: 'false', label: elseLabel });
    const cons = this.generateNode(node.consequent);
    this.addInstruction({ op: TACOp.ASSIGN, result, arg1: cons || '0' });
    this.addInstruction({ op: TACOp.JUMP, label: endLabel });
    this.addInstruction({ op: TACOp.LABEL, label: elseLabel });
    const alt = this.generateNode(node.alternate);
    this.addInstruction({ op: TACOp.ASSIGN, result, arg1: alt || '0' });
    this.addInstruction({ op: TACOp.LABEL, label: endLabel });
    return result;
  }

  private generateCallExpression(node: any): string {
    const callee = this.generateNode(node.callee);
    const temp = this.newTemp();

    if (node.callee.type === 'Identifier' && node.callee.name === 'console') {
      // Handled by member resolution
    }

    for (const arg of node.arguments) {
      if (arg.type === 'SpreadElement') {
        const argVal = this.generateNode(arg.argument);
        if (argVal) {
          this.addInstruction({ op: TACOp.PARAM, arg1: argVal });
          this.addInstruction({ op: TACOp.SPREAD, arg1: argVal });
        }
      } else {
        const argVal = this.generateNode(arg);
        if (argVal) this.addInstruction({ op: TACOp.PARAM, arg1: argVal });
      }
    }

    this.addInstruction({ op: TACOp.CALL, result: temp, arg1: callee || '' });
    return temp;
  }

  private generateNewExpression(node: any): string {
    const temp = this.newTemp();
    const callee = this.generateNode(node.callee);
    for (const arg of node.arguments) {
      const argVal = this.generateNode(arg);
      if (argVal) this.addInstruction({ op: TACOp.PARAM, arg1: argVal });
    }
    this.addInstruction({ op: TACOp.NEW, result: temp, arg1: callee || '' });
    return temp;
  }

  private generateMemberExpression(node: any): string {
    const object = this.generateNode(node.object);
    const property = node.property?.name || '';
    if (object === 'console' && property === 'log') return 'print';
    return `${object || ''}.${property}`;
  }

  private generateIdentifier(node: any): string {
    return node.name;
  }

  private generateLiteral(node: any): string {
    const temp = this.newTemp();
    const val = node.bigint ? node.bigint : String(node.value);
    this.addInstruction({ op: TACOp.ASSIGN, result: temp, arg1: val });
    return temp;
  }

  private generateArrayLiteral(node: any): string {
    const temp = this.newTemp();
    this.addInstruction({ op: TACOp.ASSIGN, result: temp, arg1: '[]' });
    for (const element of node.elements) {
      if (element) {
        const elementVal = this.generateNode(element);
        if (elementVal) {
          this.addInstruction({ op: TACOp.CALL, result: temp, arg1: 'push' });
          this.addInstruction({ op: TACOp.PARAM, arg1: elementVal });
        }
      }
    }
    return temp;
  }

  private generateObjectLiteral(node: any): string {
    const temp = this.newTemp();
    this.addInstruction({ op: TACOp.ASSIGN, result: temp, arg1: '{}' });
    for (const prop of node.properties) {
      let key: string;
      if (prop.key.type === 'Identifier') key = prop.key.name;
      else if (prop.key.type === 'Literal') key = String(prop.key.value);
      else key = 'unknown';
      const value = this.generateNode(prop.value);
      if (value) {
        this.addInstruction({ op: TACOp.CALL, result: temp, arg1: 'setProperty' });
        this.addInstruction({ op: TACOp.PARAM, arg1: key });
        this.addInstruction({ op: TACOp.PARAM, arg1: value });
      }
    }
    return temp;
  }

  private generateTemplateLiteral(node: any): string {
    const temp = this.newTemp();
    let combined = '';
    for (let i = 0; i < node.quasis.length; i++) {
      combined += node.quasis[i].value.cooked || '';
      if (i < node.expressions.length) {
        const expr = this.generateNode(node.expressions[i]);
        combined += expr ? `\${${expr}}` : '';
      }
    }
    this.addInstruction({ op: TACOp.ASSIGN, result: temp, arg1: `"${combined}"` });
    return temp;
  }

  private generateRegexLiteral(node: any): string {
    const temp = this.newTemp();
    this.addInstruction({ op: TACOp.ASSIGN, result: temp, arg1: `/${node.pattern}/${node.flags}` });
    return temp;
  }

  private generateSpreadElement(node: any): string {
    return this.generateNode(node.argument) || 'undefined';
  }

  private generateSequenceExpression(node: any): string {
    let lastResult: string | null = null;
    for (const expr of node.expressions) {
      lastResult = this.generateNode(expr);
    }
    return lastResult || '0';
  }

  private generateExpression(node: any): string | null {
    return this.generateNode(node);
  }

  private addInstruction(inst: TACInstruction): void {
    this.instructions.push(inst);
  }

  private newTemp(): string {
    return `t${this.tempCounter++}`;
  }

  private newLabel(): number {
    return this.labelCounter++;
  }
}
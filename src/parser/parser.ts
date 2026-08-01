import { Token, TokenType } from '../lexer/token.js';
import {
  Program, Statement, Expression,
  VariableDeclaration, FunctionDeclaration, FunctionParam,
  IfStatement, WhileStatement, DoWhileStatement,
  ForStatement, ForInStatement, ForOfStatement,
  SwitchStatement, SwitchCase,
  TryStatement, CatchClause, ThrowStatement,
  ReturnStatement, BreakStatement, ContinueStatement,
  BlockStatement, ExpressionStatement, EmptyStatement, DebuggerStatement,
  LabeledStatement,
  ClassDeclaration, ClassBody, MethodDefinition,
  ImportDeclaration, ImportSpecifier,
  ImportDefaultSpecifier, ImportNamespaceSpecifier, ImportNamedSpecifier,
  ExportNamedDeclaration, ExportDefaultDeclaration, ExportAllDeclaration, ExportSpecifier,
  BinaryExpression, UnaryExpression, UpdateExpression,
  AssignmentExpression, LogicalExpression, ConditionalExpression,
  ChainExpression,
  MemberExpression, CallExpression, NewExpression,
  ArrayLiteral, ObjectLiteral, ObjectProperty,
  FunctionExpression, ArrowFunctionExpression,
  ClassExpression,
  TemplateLiteral, TemplateElement,
  Identifier, ThisExpression, SuperExpression,
  Literal, RegexLiteral,
  SpreadElement, MetaProperty,
  AwaitExpression, YieldExpression,
  ImportExpression, SequenceExpression,
  Pattern, ArrayPattern, ObjectPattern, AssignmentProperty, AssignmentPattern
} from '../ast/ast-types.js';

export class Parser {
  private tokens: Token[];
  private current: number = 0;
  private templateDepth: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public parse(): Program {
    const statements: Statement[] = [];

    while (!this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }

    return {
      type: 'Program',
      body: statements,
      sourceFile: ''
    };
  }

  // ==================== STATEMENTS ====================

  private parseStatement(): Statement | null {
    if (this.match(TokenType.Semicolon)) return { type: 'EmptyStatement' };
    if (this.match(TokenType.Debugger)) return { type: 'DebuggerStatement' } as DebuggerStatement;

    if (this.check(TokenType.LeftBrace)) return this.parseBlockStatementInternal();
    if (this.match(TokenType.Let) || this.match(TokenType.Const) || this.match(TokenType.Var)) {
      return this.parseVariableDeclaration();
    }
    if (this.match(TokenType.Function)) return this.parseFunctionDeclaration();
    if (this.check(TokenType.Async) && this.checkNext(TokenType.Function)) {
      this.advance();
      this.advance();
      return this.parseFunctionDeclaration(true);
    }
    if (this.match(TokenType.Class)) return this.parseClassDeclaration();
    if (this.match(TokenType.If)) return this.parseIfStatement();
    if (this.match(TokenType.While)) return this.parseWhileStatement();
    if (this.match(TokenType.Do)) return this.parseDoWhileStatement();
    if (this.match(TokenType.For)) return this.parseForStatement();
    if (this.match(TokenType.Switch)) return this.parseSwitchStatement();
    if (this.match(TokenType.Try)) return this.parseTryStatement();
    if (this.match(TokenType.Throw)) return this.parseThrowStatement();
    if (this.match(TokenType.Return)) return this.parseReturnStatement();
    if (this.match(TokenType.Break)) return this.parseBreakStatement();
    if (this.match(TokenType.Continue)) return this.parseContinueStatement();
    if (this.check(TokenType.Import)) {
      if (this.checkNext(TokenType.LeftParen)) {
        return this.parseExpressionStatement();
      }
      this.advance();
      return this.parseImportDeclaration();
    }
    if (this.match(TokenType.Export)) return this.parseExportDeclaration();

    if (this.check(TokenType.Identifier) && this.checkNext(TokenType.Colon)) {
      return this.parseLabeledStatement();
    }

    return this.parseExpressionStatement();
  }

  private parseVariableDeclaration(): VariableDeclaration {
    const kindToken = this.previous();
    const kind = kindToken.type === TokenType.Let ? 'let' :
                 kindToken.type === TokenType.Const ? 'const' : 'var';
    const declarations: VariableDeclaration['declarations'] = [];

    do {
      let id: Identifier | Pattern;
      if (this.check(TokenType.LeftBracket) || this.check(TokenType.LeftBrace)) {
        id = this.parsePattern();
      } else {
        id = this.parseIdentifier();
      }

      let init: Expression | null = null;
      if (this.match(TokenType.Equals)) {
        init = this.parseExpression();
      }

      declarations.push({ type: 'VariableDeclarator', id, init });
    } while (this.match(TokenType.Comma));

    this.match(TokenType.Semicolon);
    return { type: 'VariableDeclaration', kind, declarations };
  }

  private parseFunctionDeclaration(async: boolean = false): FunctionDeclaration {
    const generator = this.match(TokenType.Star);
    const name = this.parseIdentifier();
    return this.parseFunctionBody(name, async, generator);
  }

  private parseDefaultFunctionDeclaration(async: boolean): FunctionDeclaration {
    const generator = this.match(TokenType.Star);
    let name: Identifier;
    if (this.check(TokenType.Identifier)) {
      name = this.parseIdentifier();
    } else {
      name = { type: 'Identifier', name: '__anon_default' };
    }
    return this.parseFunctionBody(name, async, generator);
  }

  private parseFunctionBody(name: Identifier, async: boolean, generator: boolean): FunctionDeclaration {
    this.consume(TokenType.LeftParen, "Expected '(' after function name");
    const params = this.parseFunctionParams();
    this.consume(TokenType.RightParen, "Expected ')' after parameters");
    const body = this.parseBlockStatementInternal();

    return {
      type: 'FunctionDeclaration',
      name,
      params,
      body,
      async,
      generator
    };
  }

  private parseFunctionParams(): FunctionParam[] {
    const params: FunctionParam[] = [];

    if (this.check(TokenType.RightParen)) return params;

    do {
      if (this.match(TokenType.DotDotDot)) {
        const param = this.parseIdentifier();
        params.push({ type: 'FunctionParam', param, default: null, rest: true });
        break;
      }

      let param: Identifier | Pattern;
      if (this.check(TokenType.LeftBracket) || this.check(TokenType.LeftBrace)) {
        param = this.parsePattern();
      } else {
        param = this.parseIdentifier();
      }

      let defaultVal: Expression | null = null;
      if (this.match(TokenType.Equals)) {
        defaultVal = this.parseExpression();
      }

      params.push({ type: 'FunctionParam', param, default: defaultVal, rest: false });
    } while (this.match(TokenType.Comma));

    return params;
  }

  private parseIfStatement(): IfStatement {
    this.consume(TokenType.LeftParen, "Expected '(' after 'if'");
    const test = this.parseExpression();
    this.consume(TokenType.RightParen, "Expected ')' after condition");
    const consequent = this.parseStatement()!;
    let alternate: Statement | null = null;
    if (this.match(TokenType.Else)) alternate = this.parseStatement();
    return { type: 'IfStatement', test, consequent, alternate };
  }

  private parseWhileStatement(): WhileStatement {
    this.consume(TokenType.LeftParen, "Expected '(' after 'while'");
    const test = this.parseExpression();
    this.consume(TokenType.RightParen, "Expected ')' after condition");
    const body = this.parseStatement()!;
    return { type: 'WhileStatement', test, body };
  }

  private parseDoWhileStatement(): DoWhileStatement {
    const body = this.parseStatement()!;
    this.consume(TokenType.While, "Expected 'while' after do body");
    this.consume(TokenType.LeftParen, "Expected '(' after 'while'");
    const test = this.parseExpression();
    this.consume(TokenType.RightParen, "Expected ')' after condition");
    this.match(TokenType.Semicolon);
    return { type: 'DoWhileStatement', body, test };
  }

  private parseForStatement(): Statement {
    this.consume(TokenType.LeftParen, "Expected '(' after 'for'");
    let awaitToken = false;
    if (this.match(TokenType.Await)) awaitToken = true;

    // for-in / for-of or variable init detection
    if (this.match(TokenType.Let) || this.match(TokenType.Const) || this.match(TokenType.Var)) {
      const kindToken = this.previous();
      const kind = kindToken.type === TokenType.Let ? 'let' :
                   kindToken.type === TokenType.Const ? 'const' : 'var';

      let id: Identifier | null = null;
      let init: Expression | null = null;

      if (this.check(TokenType.LeftBracket) || this.check(TokenType.LeftBrace)) {
        const pattern = this.parsePattern();
        if (this.match(TokenType.Equals)) init = this.parseAssignment();
        if (this.match(TokenType.Of)) {
          const right = this.parseExpression();
          this.consume(TokenType.RightParen, "Expected ')' after for-of");
          const body = this.parseStatement()!;
          return { type: 'ForOfStatement', left: { type: 'VariableDeclaration', kind, declarations: [{ type: 'VariableDeclarator', id: pattern, init }] }, right, body, await: awaitToken };
        }
        if (this.match(TokenType.In)) {
          const right = this.parseExpression();
          this.consume(TokenType.RightParen, "Expected ')' after for-in");
          const body = this.parseStatement()!;
          return { type: 'ForInStatement', left: { type: 'VariableDeclaration', kind, declarations: [{ type: 'VariableDeclarator', id: pattern, init }] }, right, body };
        }
        this.match(TokenType.Semicolon);
        const test = !this.check(TokenType.Semicolon) && !this.check(TokenType.RightParen) ? this.parseExpression() : null;
        this.match(TokenType.Semicolon);
        const update = !this.check(TokenType.RightParen) ? this.parseExpression() : null;
        this.consume(TokenType.RightParen, "Expected ')' after for clauses");
        const body = this.parseStatement()!;
        return { type: 'ForStatement', init: { type: 'VariableDeclaration', kind, declarations: [{ type: 'VariableDeclarator', id: pattern, init }] }, test, update, body };
      }

      id = this.parseIdentifier();

      if (this.match(TokenType.Of)) {
        const right = this.parseExpression();
        this.consume(TokenType.RightParen, "Expected ')' after for-of");
        const body = this.parseStatement()!;
        return { type: 'ForOfStatement', left: { type: 'VariableDeclaration', kind, declarations: [{ type: 'VariableDeclarator', id, init: null }] }, right, body, await: awaitToken };
      }
      if (this.match(TokenType.In)) {
        const right = this.parseExpression();
        this.consume(TokenType.RightParen, "Expected ')' after for-in");
        const body = this.parseStatement()!;
        return { type: 'ForInStatement', left: { type: 'VariableDeclaration', kind, declarations: [{ type: 'VariableDeclarator', id, init: null }] }, right, body };
      }

      if (this.match(TokenType.Equals)) init = this.parseAssignment();

      this.match(TokenType.Semicolon);
      const testVar = !this.check(TokenType.Semicolon) && !this.check(TokenType.RightParen) ? this.parseExpression() : null;
      this.match(TokenType.Semicolon);
      const updateVar = !this.check(TokenType.RightParen) ? this.parseExpression() : null;
      this.consume(TokenType.RightParen, "Expected ')' after for clauses");
      const bodyVar = this.parseStatement()!;
      return { type: 'ForStatement', init: { type: 'VariableDeclaration', kind, declarations: [{ type: 'VariableDeclarator', id, init }] }, test: testVar, update: updateVar, body: bodyVar };
    }

    // Non-variable for loop init
    if (this.match(TokenType.Semicolon)) {
      const test = !this.check(TokenType.Semicolon) ? this.parseExpression() : null;
      this.match(TokenType.Semicolon);
      const update = !this.check(TokenType.RightParen) ? this.parseExpression() : null;
      this.consume(TokenType.RightParen, "Expected ')' after for clauses");
      const body = this.parseStatement()!;
      return { type: 'ForStatement', init: null, test, update, body };
    }

    const expr = this.parseExpression();
    if (this.match(TokenType.Of)) {
      const right = this.parseExpression();
      this.consume(TokenType.RightParen, "Expected ')' after for-of");
      const body = this.parseStatement()!;
      return { type: 'ForOfStatement', left: expr, right, body, await: awaitToken };
    }
    if (this.match(TokenType.In)) {
      const right = this.parseExpression();
      this.consume(TokenType.RightParen, "Expected ')' after for-in");
      const body = this.parseStatement()!;
      return { type: 'ForInStatement', left: expr, right, body };
    }

    this.match(TokenType.Semicolon);
    const test = !this.check(TokenType.Semicolon) ? this.parseExpression() : null;
    this.match(TokenType.Semicolon);
    const update = !this.check(TokenType.RightParen) ? this.parseExpression() : null;
    this.consume(TokenType.RightParen, "Expected ')' after for clauses");
    const body = this.parseStatement()!;
    return { type: 'ForStatement', init: expr, test, update, body };
  }

  private parseSwitchStatement(): SwitchStatement {
    this.consume(TokenType.LeftParen, "Expected '(' after 'switch'");
    const discriminant = this.parseExpression();
    this.consume(TokenType.RightParen, "Expected ')' after switch discriminant");
    this.consume(TokenType.LeftBrace, "Expected '{' to start switch body");

    const cases: SwitchCase[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      if (this.match(TokenType.Case)) {
        const test = this.parseExpression();
        this.consume(TokenType.Colon, "Expected ':' after case");
        const consequent: Statement[] = [];
        while (!this.check(TokenType.RightBrace) && !this.check(TokenType.Case) && !this.check(TokenType.Default) && !this.isAtEnd()) {
          const stmt = this.parseStatement();
          if (stmt) consequent.push(stmt);
        }
        cases.push({ type: 'SwitchCase', test, consequent });
      } else if (this.match(TokenType.Default)) {
        this.consume(TokenType.Colon, "Expected ':' after default");
        const consequent: Statement[] = [];
        while (!this.check(TokenType.RightBrace) && !this.check(TokenType.Case) && !this.check(TokenType.Default) && !this.isAtEnd()) {
          const stmt = this.parseStatement();
          if (stmt) consequent.push(stmt);
        }
        cases.push({ type: 'SwitchCase', test: null, consequent });
      } else {
        throw this.error("Expected 'case' or 'default' in switch body");
      }
    }

    this.consume(TokenType.RightBrace, "Expected '}' after switch body");
    return { type: 'SwitchStatement', discriminant, cases };
  }

  private parseTryStatement(): TryStatement {
    const block = this.parseBlockStatementInternal();
    let handler: CatchClause | null = null;
    let finalizer: BlockStatement | null = null;

    if (this.match(TokenType.Catch)) {
      let param: Identifier | Pattern | null = null;
      if (this.match(TokenType.LeftParen)) {
        param = this.parsePattern();
        this.consume(TokenType.RightParen, "Expected ')' after catch parameter");
      }
      const body = this.parseBlockStatementInternal();
      handler = { type: 'CatchClause', param, body };
    }

    if (this.match(TokenType.Finally)) {
      finalizer = this.parseBlockStatementInternal();
    }

    if (!handler && !finalizer) throw this.error("Expected catch or finally after try");
    return { type: 'TryStatement', block, handler, finalizer };
  }

  private parseThrowStatement(): ThrowStatement {
    const argument = this.parseExpression();
    this.match(TokenType.Semicolon);
    return { type: 'ThrowStatement', argument };
  }

  private parseReturnStatement(): ReturnStatement {
    let argument: Expression | null = null;
    if (!this.check(TokenType.Semicolon) && !this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      argument = this.parseExpression();
    }
    this.match(TokenType.Semicolon);
    return { type: 'ReturnStatement', argument };
  }

  private parseBreakStatement(): BreakStatement {
    let label: Identifier | null = null;
    if (this.check(TokenType.Identifier)) {
      label = this.parseIdentifier();
    }
    this.match(TokenType.Semicolon);
    return { type: 'BreakStatement', label };
  }

  private parseContinueStatement(): ContinueStatement {
    let label: Identifier | null = null;
    if (this.check(TokenType.Identifier)) {
      label = this.parseIdentifier();
    }
    this.match(TokenType.Semicolon);
    return { type: 'ContinueStatement', label };
  }

  private parseBlockStatementInternal(): BlockStatement {
    this.consume(TokenType.LeftBrace, "Expected '{' to start block");
    const statements: Statement[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }
    this.consume(TokenType.RightBrace, "Expected '}' after block");
    return { type: 'BlockStatement', body: statements };
  }

  private parseExpressionStatement(): ExpressionStatement {
    const expression = this.parseExpression();
    this.match(TokenType.Semicolon);
    return { type: 'ExpressionStatement', expression };
  }

  private parseLabeledStatement(): LabeledStatement {
    const label = this.parseIdentifier();
    this.advance();
    const body = this.parseStatement()!;
    return { type: 'LabeledStatement', label, body };
  }

  private parseClassDeclaration(): ClassDeclaration {
    const id = this.check(TokenType.Identifier) ? this.parseIdentifier() : null;
    let superClass: Expression | null = null;
    if (this.match(TokenType.Extends)) superClass = this.parseExpression();
    this.consume(TokenType.LeftBrace, "Expected '{' after class declaration");
    const body = this.parseClassBody();
    this.consume(TokenType.RightBrace, "Expected '}' after class body");
    return { type: 'ClassDeclaration', id, superClass, body };
  }

  private parseClassBody(): ClassBody {
    const methods: MethodDefinition[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      if (this.match(TokenType.Semicolon)) continue;

      let isStatic = false;
      if (this.match(TokenType.Static)) isStatic = true;

      let kind: 'method' | 'get' | 'set' | 'constructor' = 'method';
      if (this.check(TokenType.Get) && !this.checkNext(TokenType.LeftParen)) {
        this.advance();
        kind = 'get';
      } else if (this.check(TokenType.Set) && !this.checkNext(TokenType.LeftParen)) {
        this.advance();
        kind = 'set';
      }

      let key: Expression;
      let computed = false;

      if (this.match(TokenType.LeftBracket)) {
        key = this.parseExpression();
        this.consume(TokenType.RightBracket, "Expected ']' after computed property");
        computed = true;
      } else if (this.check(TokenType.Identifier) && !this.checkNext(TokenType.LeftParen)) {
        const token = this.advance();
        key = { type: 'Identifier', name: token.lexeme };
      } else {
        key = this.parseIdentifier();
      }

      if (key.type === 'Identifier' && (key as Identifier).name === 'constructor') kind = 'constructor';

      const value = this.parseFunctionExpression();

      methods.push({ type: 'MethodDefinition', key, value, kind, computed, static: isStatic });
    }
    return { type: 'ClassBody', body: methods };
  }

  // ==================== IMPORTS / EXPORTS ====================

  private parseImportDeclaration(): ImportDeclaration | null {
    let specifiers: ImportSpecifier[] = [];

    if (this.check(TokenType.String)) {
      const source = this.parseLiteral() as Literal;
      this.match(TokenType.Semicolon);
      return { type: 'ImportDeclaration', specifiers: [], source };
    }

    if (this.match(TokenType.Identifier)) {
      const local = { type: 'Identifier' as const, name: this.previous().lexeme };
      specifiers.push({ type: 'ImportDefaultSpecifier', local } as ImportDefaultSpecifier);
      if (this.match(TokenType.Comma)) {
        if (this.match(TokenType.Star)) {
          this.consume(TokenType.As, "Expected 'as' after *");
          specifiers.push({ type: 'ImportNamespaceSpecifier', local: this.parseIdentifier() });
        } else if (this.match(TokenType.LeftBrace)) {
          specifiers.push(...this.parseImportNamedSpecifiers());
        }
      }
    } else if (this.match(TokenType.Star)) {
      this.consume(TokenType.As, "Expected 'as' after *");
      specifiers.push({ type: 'ImportNamespaceSpecifier', local: this.parseIdentifier() });
    } else if (this.match(TokenType.LeftBrace)) {
      specifiers.push(...this.parseImportNamedSpecifiers());
    }

    this.consume(TokenType.From, "Expected 'from' in import declaration");
    const source = this.consume(TokenType.String, "Expected module source").literal as string;
    this.match(TokenType.Semicolon);
    return { type: 'ImportDeclaration', specifiers, source: { type: 'Literal', value: source } };
  }

  private parseImportNamedSpecifiers(): ImportNamedSpecifier[] {
    const specifiers: ImportNamedSpecifier[] = [];
    do {
      const importedName = this.parseIdentifier();
      let local = importedName;
      if (this.match(TokenType.As)) local = this.parseIdentifier();
      specifiers.push({ type: 'ImportNamedSpecifier', local, imported: importedName });
    } while (this.match(TokenType.Comma));
    this.consume(TokenType.RightBrace, "Expected '}' after import specifiers");
    return specifiers;
  }

  private parseExportDeclaration(): Statement {
    if (this.match(TokenType.Default)) {
      let declaration: Statement | Expression;
      if (this.match(TokenType.Function)) {
        declaration = this.parseDefaultFunctionDeclaration(false);
      } else if (this.match(TokenType.Class)) {
        declaration = this.parseClassDeclaration();
      } else if (this.check(TokenType.Async) && this.checkNext(TokenType.Function)) {
        this.advance();
        this.advance();
        declaration = this.parseDefaultFunctionDeclaration(true);
      } else {
        declaration = this.parseExpression();
        this.match(TokenType.Semicolon);
      }
      return { type: 'ExportDefaultDeclaration', declaration };
    }

    if (this.match(TokenType.Star)) {
      this.consume(TokenType.From, "Expected 'from' after *");
      const source: Literal = { type: 'Literal', value: this.consume(TokenType.String, "Expected module source").literal as string };
      this.match(TokenType.Semicolon);
      return { type: 'ExportAllDeclaration', source };
    }

    if (this.match(TokenType.LeftBrace)) {
      const specifiers: ExportSpecifier[] = [];
      do {
        const local = this.parseIdentifier();
        let exported = local;
        if (this.match(TokenType.As)) exported = this.parseIdentifier();
        specifiers.push({ type: 'ExportSpecifier', local, exported });
      } while (this.match(TokenType.Comma));
      this.consume(TokenType.RightBrace, "Expected '}' after export specifiers");

      let source: Literal | null = null;
      if (this.match(TokenType.From)) {
        source = { type: 'Literal', value: this.consume(TokenType.String, "Expected module source").literal as string };
      }
      this.match(TokenType.Semicolon);
      return { type: 'ExportNamedDeclaration', declaration: null, specifiers, source };
    }

    const declaration = this.parseStatement();
    return { type: 'ExportNamedDeclaration', declaration, specifiers: [], source: null };
  }

  // ==================== EXPRESSIONS ====================

  private parseExpression(): Expression {
    return this.parseSequence();
  }

  private parseSequence(): Expression {
    let expr = this.parseAssignment();
    while (this.match(TokenType.Comma)) {
      const right = this.parseAssignment();
      if (expr.type === 'SequenceExpression') {
        (expr as SequenceExpression).expressions.push(right);
      } else {
        expr = { type: 'SequenceExpression', expressions: [expr, right] };
      }
    }
    return expr;
  }

  private parseAssignment(): Expression {
    const expr = this.parseTernary();

    if (this.match(TokenType.Equals)) {
      const right = this.parseAssignment();
      if (expr.type === 'Identifier' || expr.type === 'MemberExpression') {
        return { type: 'AssignmentExpression', operator: '=', left: expr, right };
      }
      throw this.error("Invalid assignment target");
    }

    const compoundOps: TokenType[] = [
      TokenType.PlusEquals, TokenType.MinusEquals, TokenType.StarEquals,
      TokenType.SlashEquals, TokenType.PercentEquals, TokenType.StarStarEquals,
      TokenType.AndEquals, TokenType.OrEquals, TokenType.XorEquals,
      TokenType.LeftShiftEquals, TokenType.RightShiftEquals, TokenType.UnsignedRightShiftEquals,
      TokenType.NullishEquals, TokenType.AndAndEquals, TokenType.OrOrEquals
    ];

    const compoundOpMap: Record<string, string> = {
      [TokenType.PlusEquals]: '+=',
      [TokenType.MinusEquals]: '-=',
      [TokenType.StarEquals]: '*=',
      [TokenType.SlashEquals]: '/=',
      [TokenType.PercentEquals]: '%=',
      [TokenType.StarStarEquals]: '**=',
      [TokenType.AndEquals]: '&=',
      [TokenType.OrEquals]: '|=',
      [TokenType.XorEquals]: '^=',
      [TokenType.LeftShiftEquals]: '<<=',
      [TokenType.RightShiftEquals]: '>>=',
      [TokenType.UnsignedRightShiftEquals]: '>>>=',
      [TokenType.NullishEquals]: '??=',
      [TokenType.AndAndEquals]: '&&=',
      [TokenType.OrOrEquals]: '||='
    };

    for (const opType of compoundOps) {
      if (this.match(opType)) {
        const right = this.parseAssignment();
        const op = compoundOpMap[opType];
        if (expr.type === 'Identifier' || expr.type === 'MemberExpression') {
          return { type: 'AssignmentExpression', operator: op, left: expr, right };
        }
        throw this.error("Invalid assignment target");
      }
    }

    return expr;
  }

  private parseTernary(): Expression {
    let expr = this.parseNullishCoalescing();
    if (this.match(TokenType.Question)) {
      const consequent = this.parseAssignment();
      this.consume(TokenType.Colon, "Expected ':' in ternary expression");
      const alternate = this.parseAssignment();
      expr = { type: 'ConditionalExpression', test: expr, consequent, alternate };
    }
    return expr;
  }

  private parseNullishCoalescing(): Expression {
    let expr = this.parseLogicalOr();
    if (this.match(TokenType.NullishCoalescing)) {
      const right = this.parseLogicalOr();
      expr = { type: 'LogicalExpression', operator: '??', left: expr, right };
    }
    return expr;
  }

  private parseLogicalOr(): Expression {
    let expr = this.parseLogicalAnd();
    while (this.match(TokenType.OrOr)) {
      const right = this.parseLogicalAnd();
      expr = { type: 'LogicalExpression', operator: '||', left: expr, right };
    }
    return expr;
  }

  private parseLogicalAnd(): Expression {
    let expr = this.parseBitwiseOr();
    while (this.match(TokenType.AndAnd)) {
      const right = this.parseBitwiseOr();
      expr = { type: 'LogicalExpression', operator: '&&', left: expr, right };
    }
    return expr;
  }

  private parseBitwiseOr(): Expression {
    let expr = this.parseBitwiseXor();
    while (this.match(TokenType.Pipe)) {
      const right = this.parseBitwiseXor();
      expr = { type: 'BinaryExpression', operator: '|', left: expr, right };
    }
    return expr;
  }

  private parseBitwiseXor(): Expression {
    let expr = this.parseBitwiseAnd();
    while (this.match(TokenType.Caret)) {
      const right = this.parseBitwiseAnd();
      expr = { type: 'BinaryExpression', operator: '^', left: expr, right };
    }
    return expr;
  }

  private parseBitwiseAnd(): Expression {
    let expr = this.parseEquality();
    while (this.match(TokenType.Ampersand)) {
      const right = this.parseEquality();
      expr = { type: 'BinaryExpression', operator: '&', left: expr, right };
    }
    return expr;
  }

  private parseEquality(): Expression {
    let expr = this.parseComparison();
    while (this.match(TokenType.EqualsEquals) || this.match(TokenType.NotEquals) ||
           this.match(TokenType.StrictEquals) || this.match(TokenType.StrictNotEquals)) {
      const op = this.previous().lexeme;
      const right = this.parseComparison();
      expr = op === '===' || op === '!==' ?
        { type: 'BinaryExpression', operator: op, left: expr, right } :
        { type: 'BinaryExpression', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseComparison(): Expression {
    let expr = this.parseShift();
    while (this.match(TokenType.LessThan) || this.match(TokenType.GreaterThan) ||
           this.match(TokenType.LessThanEquals) || this.match(TokenType.GreaterThanEquals) ||
           this.match(TokenType.In) || this.match(TokenType.Instanceof)) {
      const op = this.previous().lexeme;
      const right = this.parseShift();
      expr = { type: 'BinaryExpression', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseShift(): Expression {
    let expr = this.parseTerm();
    while (this.match(TokenType.LeftShift) || this.match(TokenType.RightShift) ||
           this.match(TokenType.UnsignedRightShift)) {
      const op = this.previous().lexeme;
      const right = this.parseTerm();
      expr = { type: 'BinaryExpression', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseTerm(): Expression {
    let expr = this.parseFactor();
    while (this.match(TokenType.Plus) || this.match(TokenType.Minus)) {
      const op = this.previous().lexeme;
      const right = this.parseFactor();
      expr = { type: 'BinaryExpression', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseFactor(): Expression {
    let expr = this.parseExponentiation();
    while (this.match(TokenType.Star) || this.match(TokenType.Slash) || this.match(TokenType.Percent)) {
      const op = this.previous().lexeme;
      const right = this.parseExponentiation();
      expr = { type: 'BinaryExpression', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseExponentiation(): Expression {
    let expr = this.parseUnary();
    if (this.match(TokenType.StarStar)) {
      const right = this.parseExponentiation();
      expr = { type: 'BinaryExpression', operator: '**', left: expr, right };
    }
    return expr;
  }

  private parseUnary(): Expression {
    if (this.match(TokenType.Minus) || this.match(TokenType.Plus) ||
        this.match(TokenType.Not) || this.match(TokenType.Tilde) ||
        this.match(TokenType.Typeof) || this.match(TokenType.Void) ||
        this.match(TokenType.Delete)) {
      const op = this.previous().lexeme;
      const argument = this.parseUnary();
      return { type: 'UnaryExpression', operator: op, prefix: true, argument };
    }

    if (this.match(TokenType.PlusPlus)) {
      const argument = this.parseUnary();
      return { type: 'UpdateExpression', operator: '++', prefix: true, argument };
    }

    if (this.match(TokenType.MinusMinus)) {
      const argument = this.parseUnary();
      return { type: 'UpdateExpression', operator: '--', prefix: true, argument };
    }

    if (this.match(TokenType.Await)) {
      return { type: 'AwaitExpression', argument: this.parseUnary() };
    }

    return this.parseUpdatePostfix();
  }

  private parseUpdatePostfix(): Expression {
    let expr = this.parseCall();

    if (this.match(TokenType.PlusPlus)) {
      return { type: 'UpdateExpression', operator: '++', prefix: false, argument: expr };
    }
    if (this.match(TokenType.MinusMinus)) {
      return { type: 'UpdateExpression', operator: '--', prefix: false, argument: expr };
    }

    return expr;
  }

  private parseCall(): Expression {
    let expr = this.parseMember();

    while (true) {
      if (this.match(TokenType.LeftParen)) {
        const args: Expression[] = [];
        if (!this.check(TokenType.RightParen)) {
          do {
            if (this.match(TokenType.DotDotDot)) {
              args.push({ type: 'SpreadElement', argument: this.parseExpression() });
            } else {
              args.push(this.parseExpression());
            }
          } while (this.match(TokenType.Comma));
        }
        this.consume(TokenType.RightParen, "Expected ')' after arguments");
        expr = { type: 'CallExpression', callee: expr, arguments: args, optional: false };
      } else if (this.match(TokenType.QuestionDot)) {
        if (this.match(TokenType.LeftParen)) {
          const args: Expression[] = [];
          if (!this.check(TokenType.RightParen)) {
            do {
              if (this.match(TokenType.DotDotDot)) {
                args.push({ type: 'SpreadElement', argument: this.parseExpression() });
              } else {
                args.push(this.parseExpression());
              }
            } while (this.match(TokenType.Comma));
          }
          this.consume(TokenType.RightParen, "Expected ')' after arguments");
          expr = { type: 'CallExpression', callee: expr, arguments: args, optional: true };
        } else if (this.match(TokenType.LeftBracket)) {
          const property = this.parseExpression();
          this.consume(TokenType.RightBracket, "Expected ']' after property");
          expr = { type: 'MemberExpression', object: expr, property, computed: true, optional: true };
        } else {
          const name = this.consumePropertyName("Expected property name after '?.'");
          expr = { type: 'MemberExpression', object: expr, property: { type: 'Identifier', name: name.lexeme }, computed: false, optional: true };
        }
      } else if (this.match(TokenType.Dot)) {
        const name = this.consumePropertyName("Expected property name after '.'").lexeme;
        expr = { type: 'MemberExpression', object: expr, property: { type: 'Identifier', name }, computed: false, optional: false };
      } else if (this.match(TokenType.LeftBracket)) {
        const property = this.parseExpression();
        this.consume(TokenType.RightBracket, "Expected ']' after property");
        expr = { type: 'MemberExpression', object: expr, property, computed: true, optional: false };
      } else if (this.match(TokenType.Backtick)) {
        expr = this.parseTemplateLiteral(expr);
      } else {
        break;
      }
    }

    return expr;
  }

  private parseMember(): Expression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.Dot)) {
        const name = this.consumePropertyName("Expected property name after '.'").lexeme;
        expr = { type: 'MemberExpression', object: expr, property: { type: 'Identifier', name }, computed: false, optional: false };
      } else if (this.match(TokenType.LeftBracket)) {
        const property = this.parseExpression();
        this.consume(TokenType.RightBracket, "Expected ']' after property");
        expr = { type: 'MemberExpression', object: expr, property, computed: true, optional: false };
      } else if (this.match(TokenType.Backtick)) {
        expr = this.parseTemplateLiteral(expr);
      } else {
        break;
      }
    }

    return expr;
  }

  // ==================== PRIMARY EXPRESSIONS ====================

  private parsePrimary(): Expression {
    if (this.match(TokenType.Number)) {
      return { type: 'Literal', value: Number(this.previous().literal) };
    }
    if (this.match(TokenType.BigInt)) {
      return { type: 'Literal', value: (this.previous().literal as bigint) || BigInt(0), bigint: this.previous().lexeme.replace('n', '') };
    }
    if (this.match(TokenType.String)) {
      return { type: 'Literal', value: this.previous().literal as string };
    }
    if (this.match(TokenType.Regex)) {
      const lit = this.previous().literal;
      if (lit && typeof lit === 'object' && 'pattern' in lit && 'flags' in lit) {
        return { type: 'RegexLiteral', pattern: (lit as any).pattern, flags: (lit as any).flags };
      }
      return { type: 'RegexLiteral', pattern: '', flags: '' };
    }
    if (this.match(TokenType.True)) return { type: 'Literal', value: true };
    if (this.match(TokenType.False)) return { type: 'Literal', value: false };
    if (this.match(TokenType.Null)) return { type: 'Literal', value: null };
    if (this.match(TokenType.Undefined)) return { type: 'Literal', value: undefined as any };

    if (this.match(TokenType.This)) return { type: 'ThisExpression' };
    if (this.match(TokenType.Super)) return { type: 'SuperExpression' };

    if (this.match(TokenType.LeftBracket)) return this.parseArrayLiteral();
    if (this.match(TokenType.LeftBrace)) return this.parseObjectLiteral();
    if (this.match(TokenType.TemplateLiteral)) {
      const lit = this.previous().literal as string || '';
      const quasis = [{ type: 'TemplateElement' as const, value: { raw: lit, cooked: lit }, tail: true }];
      return { type: 'TemplateLiteral', quasis, expressions: [] };
    }
    if (this.match(TokenType.Backtick)) return this.parseTemplateLiteral();

    if (this.match(TokenType.Function)) return this.parseFunctionExpression();
    if (this.match(TokenType.Class)) return this.parseClassExpression();
    if (this.match(TokenType.New)) return this.parseNewExpression();
    if (this.check(TokenType.Import) && this.checkNext(TokenType.LeftParen)) {
      this.advance();
      this.consume(TokenType.LeftParen, "Expected '(' after import");
      const source = this.parseExpression();
      this.consume(TokenType.RightParen, "Expected ')' after import source");
      return { type: 'ImportExpression', source };
    }

    if (this.match(TokenType.Yield)) {
      let delegate = false;
      let argument: Expression | null = null;
      if (this.match(TokenType.Star)) delegate = true;
      if (!this.check(TokenType.Semicolon) && !this.check(TokenType.RightParen) && !this.check(TokenType.RightBrace) && !this.check(TokenType.Colon) && !this.isAtEnd()) {
        argument = this.parseExpression();
      }
      return { type: 'YieldExpression', argument, delegate };
    }

    if (this.match(TokenType.DotDotDot)) {
      return { type: 'SpreadElement', argument: this.parseExpression() };
    }

    // Async arrow function: async (...) => ... or async x => ...
    if (this.match(TokenType.Async)) {
      if (this.match(TokenType.Function)) return this.parseFunctionExpression(true);
      return this.parseArrowFunction(true);
    }

    // Identifier or keyword used as identifier
    if (this.check(TokenType.Identifier) || this.isReservedWord(this.peek()) || this.isKeywordUsableAsIdentifier(this.peek())) {
      const token = this.advance();
      const id: Identifier = { type: 'Identifier', name: token.lexeme };

      // Arrow function: single param without parens
      if (this.match(TokenType.Arrow)) {
        let body: Expression | BlockStatement;
        let expression = true;
        if (this.check(TokenType.LeftBrace)) {
          body = this.parseBlockStatementInternal();
          expression = false;
        } else {
          body = this.parseExpression();
        }
        return { type: 'ArrowFunctionExpression', params: [{ type: 'FunctionParam', param: id, default: null, rest: false }], body: body as any, expression, async: false };
      }

      if (this.check(TokenType.Equals) && this.checkNext(TokenType.GreaterThan)) {
        this.advance();
        this.advance();
        let body: Expression | BlockStatement;
        let expression = true;
        if (this.check(TokenType.LeftBrace)) {
          body = this.parseBlockStatementInternal();
          expression = false;
        } else {
          body = this.parseExpression();
        }
        return { type: 'ArrowFunctionExpression', params: [{ type: 'FunctionParam', param: id, default: null, rest: false }], body: body as any, expression, async: false };
      }

      return id;
    }

    if (this.match(TokenType.LeftParen)) {
      const savedPos = this.current;

      // Empty arrow params: () => ...
      if (this.check(TokenType.RightParen) && this.checkNext(TokenType.Arrow)) {
        this.advance();
        this.advance();
        let body: Expression | BlockStatement;
        let expression = true;
        if (this.check(TokenType.LeftBrace)) {
          body = this.parseBlockStatementInternal();
          expression = false;
        } else {
          body = this.parseExpression();
        }
        return { type: 'ArrowFunctionExpression', params: [], body: body as any, expression, async: false };
      }

      // Try to parse as arrow function params
      if (!this.check(TokenType.RightParen) && this.canBeArrowParams()) {
        const params = this.parseArrowFunctionParams();
        if (this.check(TokenType.RightParen)) {
          this.advance();
          if (this.match(TokenType.Arrow)) {
            let body: Expression | BlockStatement;
            let expression = true;
            if (this.check(TokenType.LeftBrace)) {
              body = this.parseBlockStatementInternal();
              expression = false;
            } else {
              body = this.parseExpression();
            }
            return { type: 'ArrowFunctionExpression', params, body: body as any, expression, async: false };
          }
        }
      }

      // Not arrow function, parse as parenthesized expression
      this.current = savedPos;
      const expr = this.parseExpression();
      this.consume(TokenType.RightParen, "Expected ')' after expression");

      if (this.match(TokenType.Arrow)) {
        // ( expr ) => ...  — treat expr as single param
        let body: Expression | BlockStatement;
        let expression = true;
        if (this.check(TokenType.LeftBrace)) {
          body = this.parseBlockStatementInternal();
          expression = false;
        } else {
          body = this.parseExpression();
        }
        if (expr.type === 'Identifier') {
          return { type: 'ArrowFunctionExpression', params: [{ type: 'FunctionParam', param: expr as Identifier, default: null, rest: false }], body: body as any, expression, async: false };
        }
      }

      return expr;
    }

    // Meta property: new.target, import.meta
    if (this.check(TokenType.Identifier) && this.peek().lexeme === 'new' && this.checkNext(TokenType.Dot)) {
      // Handled above via NewExpression
    }
    if (this.check(TokenType.Identifier) && this.peek().lexeme === 'import' && this.checkNext(TokenType.Dot)) {
      const meta = this.parseIdentifier();
      this.consume(TokenType.Dot, "Expected '.' after import");
      const property = this.parseIdentifier();
      return { type: 'MetaProperty', meta, property };
    }

    throw this.error(`Unexpected token: ${this.peek().type} (${this.peek().lexeme})`);
  }

  private canBeArrowParams(): boolean {
    const saved = this.current;
    try {
      if (this.check(TokenType.LeftBracket) || this.check(TokenType.LeftBrace)) {
        this.current = saved;
        return true;
      }
      if (this.check(TokenType.DotDotDot)) return true;
      if (this.check(TokenType.Identifier)) {
        const id = this.parseIdentifier();
        if (this.match(TokenType.Equals)) {
          this.parseExpression();
          if (this.check(TokenType.RightParen) || this.check(TokenType.Comma)) {
            this.current = saved;
            return true;
          }
        }
        if (this.check(TokenType.RightParen) || this.check(TokenType.Comma)) {
          this.current = saved;
          return true;
        }
      }
    } catch {
      // ignore
    }
    this.current = saved;
    return false;
  }

  private parseArrowFunctionParams(): FunctionParam[] {
    const params: FunctionParam[] = [];

    if (this.match(TokenType.RightParen)) return params;

    do {
      if (this.match(TokenType.DotDotDot)) {
        const param = this.parseIdentifier();
        params.push({ type: 'FunctionParam', param, default: null, rest: true });
        break;
      }
      let param: Identifier | Pattern;
      if (this.check(TokenType.LeftBracket) || this.check(TokenType.LeftBrace)) {
        param = this.parsePattern();
      } else {
        param = this.parseIdentifier();
      }
      let defaultVal: Expression | null = null;
      if (this.match(TokenType.Equals)) defaultVal = this.parseExpression();
      params.push({ type: 'FunctionParam', param, default: defaultVal, rest: false });
    } while (this.match(TokenType.Comma));

    this.consume(TokenType.RightParen, "Expected ')' after arrow function params");
    return params;
  }

  private parseArrowFunction(async: boolean): ArrowFunctionExpression {
    const params = this.parseArrowFunctionParams();
    this.consume(TokenType.Arrow, "Expected '=>' after arrow parameters");
    let body: Expression | BlockStatement;
    let expression = true;
    if (this.check(TokenType.LeftBrace)) {
      body = this.parseBlockStatementInternal();
      expression = false;
    } else {
      body = this.parseExpression();
    }
    return { type: 'ArrowFunctionExpression', params, body: body as any, expression, async };
  }

  private parseFunctionExpression(async: boolean = false): FunctionExpression {
    let id: Identifier | null = null;
    if (this.check(TokenType.Identifier) && !this.checkNext(TokenType.LeftParen)) {
      id = this.parseIdentifier();
    }
    this.consume(TokenType.LeftParen, "Expected '(' after function");
    const params = this.parseFunctionParams();
    this.consume(TokenType.RightParen, "Expected ')' after parameters");
    const body = this.parseBlockStatementInternal();
    let generator = false;
    return { type: 'FunctionExpression', id, params, body, async, generator };
  }

  private parseNewExpression(): NewExpression {
    const callee = this.parseMember();
    const args: Expression[] = [];
    if (this.match(TokenType.LeftParen)) {
      if (!this.check(TokenType.RightParen)) {
        do {
          if (this.match(TokenType.DotDotDot)) {
            args.push({ type: 'SpreadElement', argument: this.parseExpression() });
          } else {
            args.push(this.parseExpression());
          }
        } while (this.match(TokenType.Comma));
      }
      this.consume(TokenType.RightParen, "Expected ')' after constructor arguments");
    }
    return { type: 'NewExpression', callee, arguments: args };
  }

  private parseArrayLiteral(): ArrayLiteral {
    const elements: (Expression | null)[] = [];

    if (!this.check(TokenType.RightBracket)) {
      do {
        if (this.match(TokenType.Comma)) {
          elements.push(null);
          continue;
        }
        if (this.match(TokenType.DotDotDot)) {
          elements.push({ type: 'SpreadElement', argument: this.parseAssignment() });
        } else {
          elements.push(this.parseAssignment());
        }
      } while (this.match(TokenType.Comma));
      if (this.check(TokenType.Comma)) {
        this.advance();
        elements.push(null);
      }
    }

    this.consume(TokenType.RightBracket, "Expected ']' after array literal");
    return { type: 'ArrayLiteral', elements };
  }

  private parseObjectLiteral(): ObjectLiteral {
    const properties: ObjectProperty[] = [];

    if (!this.check(TokenType.RightBrace)) {
      do {
        properties.push(this.parseObjectProperty());
      } while (this.match(TokenType.Comma));
    }

    this.consume(TokenType.RightBrace, "Expected '}' after object literal");
    return { type: 'ObjectLiteral', properties };
  }

  private parseObjectProperty(): ObjectProperty {
    let computed = false;
    let shorthand = false;
    let method = false;

    // Handle get foo() {} and set foo() {} as methods
    if (this.check(TokenType.Identifier)) {
      const ident = this.peek().lexeme;
      if ((ident === 'get' || ident === 'set') && !this.checkNextIdent(ident === 'get' ? 'get' : 'set')) {
        const kind = this.advance().lexeme;
        let key: Expression;
        if (this.match(TokenType.LeftBracket)) {
          key = this.parseExpression();
          this.consume(TokenType.RightBracket, "Expected ']' after computed property");
          computed = true;
        } else if (this.check(TokenType.Identifier) || this.check(TokenType.String) || this.check(TokenType.Number)) {
          key = this.parseIdentifier();
        } else {
          throw this.error("Expected property key");
        }
        if (this.check(TokenType.LeftParen)) {
          const value = this.parseFunctionExpression();
          return { type: 'ObjectProperty', key, value, computed, shorthand: false, method: true };
        }
        // Fall through to parse normally
      }
    }

    if (this.match(TokenType.Star)) {
      method = true;
    }

    if (this.match(TokenType.LeftBracket)) {
      computed = true;
      const key = this.parseExpression();
      this.consume(TokenType.RightBracket, "Expected ']' after computed property");
      if (this.check(TokenType.LeftParen)) {
        return { type: 'ObjectProperty', key, value: this.parseFunctionExpression(), computed, shorthand: false, method: true };
      }
      this.consume(TokenType.Colon, "Expected ':' after property key");
      const value = this.parseAssignment();
      return { type: 'ObjectProperty', key, value, computed, shorthand: false, method: false };
    }

    let key: Expression;
    if (this.check(TokenType.String) || this.check(TokenType.Number)) {
      key = this.parsePrimary();
    } else {
      key = this.parseIdentifier();
    }

    // Method shorthand: foo() {}
    if (this.check(TokenType.LeftParen)) {
      if (key.type === 'Identifier') {
        return { type: 'ObjectProperty', key, value: this.parseFunctionExpression(), computed: false, shorthand: false, method: true };
      }
    }

    // Shorthand property: { a, b }
    if (this.check(TokenType.Comma) || this.check(TokenType.RightBrace)) {
      if (key.type === 'Identifier') {
        return { type: 'ObjectProperty', key, value: key, computed: false, shorthand: true, method: false };
      }
    }

    this.consume(TokenType.Colon, "Expected ':' after property key");
    const value = this.parseAssignment();

    return { type: 'ObjectProperty', key, value, computed, shorthand: false, method: false };
  }

  private parseTemplateLiteral(tag?: Expression): TemplateLiteral {
    const quasis: TemplateElement[] = [];
    const expressions: Expression[] = [];

    if (tag) {
      const quasi: TemplateElement = {
        type: 'TemplateElement',
        value: { raw: '', cooked: '' },
        tail: false
      };
      quasis.push(quasi);
    }

    let token = this.previous();
    while (true) {
      if (token.type === TokenType.Backtick) {
        // Plain template literal
      }

      if (token.type === TokenType.TemplateHead || token.type === TokenType.Backtick) {
        const raw = token.literal as string || '';
        quasis.push({
          type: 'TemplateElement',
          value: { raw, cooked: raw },
          tail: false
        });

        if (token.type === TokenType.Backtick) {
          quasis[quasis.length - 1].tail = true;
          break;
        }

        const expr = this.parseExpression();
        expressions.push(expr);

        this.consume(TokenType.RightBrace, "Expected '}' after template expression");

        if (this.match(TokenType.TemplateMiddle)) {
          const lit = this.previous().literal as string || '';
          quasis.push({
            type: 'TemplateElement',
            value: { raw: lit, cooked: lit },
            tail: false
          });
        } else if (this.match(TokenType.TemplateTail) || this.match(TokenType.TemplateLiteral) || this.match(TokenType.Backtick)) {
          const lit = this.previous().literal as string || '';
          quasis.push({
            type: 'TemplateElement',
            value: { raw: lit, cooked: lit },
            tail: true
          });
          break;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return { type: 'TemplateLiteral', quasis, expressions };
  }

  private parseClassExpression(): ClassExpression {
    let id: Identifier | null = null;
    if (this.check(TokenType.Identifier)) id = this.parseIdentifier();
    let superClass: Expression | null = null;
    if (this.match(TokenType.Extends)) superClass = this.parseExpression();
    this.consume(TokenType.LeftBrace, "Expected '{' for class body");
    const body = this.parseClassBody();
    this.consume(TokenType.RightBrace, "Expected '}' after class body");
    return { type: 'ClassExpression', id, superClass, body };
  }

  // ==================== PATTERNS (Destructuring) ====================

  private parsePattern(): Pattern {
    if (this.check(TokenType.LeftBracket)) return this.parseArrayPattern();
    if (this.check(TokenType.LeftBrace)) return this.parseObjectPattern();
    return this.parseIdentifier();
  }

  private parseArrayPattern(): ArrayPattern {
    this.advance(); // consume '['
    const elements: (Pattern | null)[] = [];
    let rest: Pattern | null = null;

    while (!this.check(TokenType.RightBracket) && !this.isAtEnd()) {
      if (this.match(TokenType.Comma)) {
        elements.push(null);
        continue;
      }
      if (this.match(TokenType.DotDotDot)) {
        rest = this.parsePattern();
        break;
      }
      elements.push(this.parsePattern());
      this.match(TokenType.Comma);
    }

    this.consume(TokenType.RightBracket, "Expected ']' in destructuring pattern");
    return { type: 'ArrayPattern', elements, rest };
  }

  private parseObjectPattern(): ObjectPattern {
    this.advance(); // consume '{'
    const properties: AssignmentProperty[] = [];
    let rest: Pattern | null = null;

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      if (this.match(TokenType.DotDotDot)) {
        rest = this.parsePattern();
        break;
      }

      let computed = false;
      let key: Expression;
      let shorthand = false;

      if (this.check(TokenType.LeftBracket)) {
        this.advance();
        key = this.parseExpression();
        this.consume(TokenType.RightBracket, "Expected ']' after computed property in pattern");
        computed = true;
      } else if (this.check(TokenType.String) || this.check(TokenType.Number)) {
        key = this.parsePrimary();
      } else {
        const token = this.advance();
        key = { type: 'Identifier', name: token.lexeme };
      }

      if (this.match(TokenType.Colon)) {
        const value = this.parsePattern();
        properties.push({ type: 'AssignmentProperty', key, value, shorthand: false, computed });
      } else if (key.type === 'Identifier') {
        shorthand = true;
        const id = key as Identifier;
        if (this.match(TokenType.Equals)) {
          const defaultVal = this.parseExpression();
          properties.push({
            type: 'AssignmentProperty',
            key: id,
            value: { type: 'AssignmentPattern', left: id, right: defaultVal },
            shorthand: true,
            computed: false
          });
        } else {
          properties.push({ type: 'AssignmentProperty', key: id, value: id, shorthand: true, computed: false });
        }
      } else {
        throw this.error("Invalid destructuring pattern");
      }

      this.match(TokenType.Comma);
    }

    this.consume(TokenType.RightBrace, "Expected '}' in destructuring pattern");
    return { type: 'ObjectPattern', properties, rest };
  }

  // ==================== HELPERS ====================

  private parseIdentifier(): Identifier {
    if (this.check(TokenType.Identifier) || this.isReservedWord(this.peek()) || this.isKeywordUsableAsIdentifier(this.peek())) {
      const token = this.advance();
      return { type: 'Identifier', name: token.lexeme };
    }
    throw this.error("Expected identifier");
  }

  private parseLiteral(): Literal {
    if (this.match(TokenType.Number)) return { type: 'Literal', value: Number(this.previous().literal) };
    if (this.match(TokenType.String)) return { type: 'Literal', value: this.previous().literal as string };
    if (this.match(TokenType.True)) return { type: 'Literal', value: true };
    if (this.match(TokenType.False)) return { type: 'Literal', value: false };
    if (this.match(TokenType.Null)) return { type: 'Literal', value: null };
    throw this.error("Expected literal");
  }

  private isReservedWord(token: Token): boolean {
    const reserved: TokenType[] = [
      TokenType.Function, TokenType.Var, TokenType.Let, TokenType.Const,
      TokenType.If, TokenType.Else, TokenType.While, TokenType.Do, TokenType.For,
      TokenType.Return, TokenType.Break, TokenType.Continue, TokenType.Switch,
      TokenType.Case, TokenType.Default, TokenType.Try, TokenType.Catch,
      TokenType.Finally, TokenType.Throw, TokenType.Class, TokenType.Extends,
      TokenType.Super, TokenType.New, TokenType.Import,
      TokenType.Export, TokenType.Instanceof, TokenType.Typeof,
      TokenType.Void, TokenType.Delete, TokenType.In,
      TokenType.Debugger, TokenType.True, TokenType.False, TokenType.Null
    ];
    return reserved.includes(token.type);
  }

  private isKeywordUsableAsIdentifier(token: Token): boolean {
    const usable: TokenType[] = [
      TokenType.From, TokenType.As, TokenType.Of,
      TokenType.Async, TokenType.Await, TokenType.Yield,
      TokenType.Static, TokenType.Get, TokenType.Set,
      TokenType.This, TokenType.Undefined
    ];
    return usable.includes(token.type);
  }

  private createNode<T extends string>(type: T): any {
    return { type };
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private checkNext(type: TokenType): boolean {
    if (this.current + 1 >= this.tokens.length) return false;
    if (this.tokens[this.current + 1].type === TokenType.EOF) return false;
    return this.tokens[this.current + 1].type === type;
  }

  private checkNextIdent(name: string): boolean {
    if (this.current + 1 >= this.tokens.length) return false;
    const next = this.tokens[this.current + 1];
    return next.type === TokenType.Identifier && next.lexeme === name;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw this.error(message);
  }

  private consumePropertyName(message: string): Token {
    if (this.isReservedWord(this.peek()) || this.isKeywordUsableAsIdentifier(this.peek()) || this.check(TokenType.Identifier)) {
      return this.advance();
    }
    throw this.error(message);
  }

  private error(message: string): Error {
    const token = this.peek();
    return new Error(`Parser error at ${token.line}:${token.column}: ${message}`);
  }
}
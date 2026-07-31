import { Token } from '../lexer/token.js';

export type ASTNode = Program | Statement | Expression | Pattern;

export interface Program {
  type: 'Program';
  body: Statement[];
  sourceFile: string;
}

// --- Statements ---

export type Statement =
  | VariableDeclaration
  | FunctionDeclaration
  | IfStatement
  | WhileStatement
  | DoWhileStatement
  | ForStatement
  | ForInStatement
  | ForOfStatement
  | SwitchStatement
  | TryStatement
  | ThrowStatement
  | ReturnStatement
  | BreakStatement
  | ContinueStatement
  | BlockStatement
  | ExpressionStatement
  | EmptyStatement
  | DebuggerStatement
  | ClassDeclaration
  | ImportDeclaration
  | ExportNamedDeclaration
  | ExportDefaultDeclaration
  | ExportAllDeclaration
  | LabeledStatement;

export interface VariableDeclaration {
  type: 'VariableDeclaration';
  kind: 'let' | 'const' | 'var';
  declarations: VariableDeclarator[];
}

export interface VariableDeclarator {
  type: 'VariableDeclarator';
  id: Identifier | Pattern;
  init: Expression | null;
}

export interface FunctionDeclaration {
  type: 'FunctionDeclaration';
  name: Identifier;
  params: FunctionParam[];
  body: BlockStatement;
  async: boolean;
  generator: boolean;
  returnType?: string;
}

export interface FunctionParam {
  type: 'FunctionParam';
  param: Identifier | Pattern;
  default: Expression | null;
  rest: boolean;
}

export interface IfStatement {
  type: 'IfStatement';
  test: Expression;
  consequent: Statement;
  alternate: Statement | null;
}

export interface WhileStatement {
  type: 'WhileStatement';
  test: Expression;
  body: Statement;
}

export interface DoWhileStatement {
  type: 'DoWhileStatement';
  body: Statement;
  test: Expression;
}

export interface ForStatement {
  type: 'ForStatement';
  init: VariableDeclaration | Expression | null;
  test: Expression | null;
  update: Expression | null;
  body: Statement;
}

export interface ForInStatement {
  type: 'ForInStatement';
  left: VariableDeclaration | Expression;
  right: Expression;
  body: Statement;
}

export interface ForOfStatement {
  type: 'ForOfStatement';
  left: VariableDeclaration | Expression;
  right: Expression;
  body: Statement;
  await: boolean;
}

export interface SwitchStatement {
  type: 'SwitchStatement';
  discriminant: Expression;
  cases: SwitchCase[];
}

export interface SwitchCase {
  type: 'SwitchCase';
  test: Expression | null;
  consequent: Statement[];
}

export interface TryStatement {
  type: 'TryStatement';
  block: BlockStatement;
  handler: CatchClause | null;
  finalizer: BlockStatement | null;
}

export interface CatchClause {
  type: 'CatchClause';
  param: Identifier | Pattern | null;
  body: BlockStatement;
}

export interface ThrowStatement {
  type: 'ThrowStatement';
  argument: Expression;
}

export interface ReturnStatement {
  type: 'ReturnStatement';
  argument: Expression | null;
}

export interface BreakStatement {
  type: 'BreakStatement';
  label: Identifier | null;
}

export interface ContinueStatement {
  type: 'ContinueStatement';
  label: Identifier | null;
}

export interface BlockStatement {
  type: 'BlockStatement';
  body: Statement[];
}

export interface ExpressionStatement {
  type: 'ExpressionStatement';
  expression: Expression;
}

export interface EmptyStatement {
  type: 'EmptyStatement';
}

export interface DebuggerStatement {
  type: 'DebuggerStatement';
}

export interface LabeledStatement {
  type: 'LabeledStatement';
  label: Identifier;
  body: Statement;
}

export interface ClassDeclaration {
  type: 'ClassDeclaration';
  id: Identifier | null;
  superClass: Expression | null;
  body: ClassBody;
}

export interface ClassBody {
  type: 'ClassBody';
  body: MethodDefinition[];
}

export interface MethodDefinition {
  type: 'MethodDefinition';
  key: Expression;
  value: FunctionExpression;
  kind: 'method' | 'get' | 'set' | 'constructor';
  computed: boolean;
  static: boolean;
}

// --- Imports / Exports ---

export interface ImportDeclaration {
  type: 'ImportDeclaration';
  specifiers: ImportSpecifier[];
  source: Literal;
}

export type ImportSpecifier =
  | ImportDefaultSpecifier
  | ImportNamespaceSpecifier
  | ImportNamedSpecifier;

export interface ImportDefaultSpecifier {
  type: 'ImportDefaultSpecifier';
  local: Identifier;
}

export interface ImportNamespaceSpecifier {
  type: 'ImportNamespaceSpecifier';
  local: Identifier;
}

export interface ImportNamedSpecifier {
  type: 'ImportNamedSpecifier';
  local: Identifier;
  imported: Identifier;
}

export interface ExportNamedDeclaration {
  type: 'ExportNamedDeclaration';
  declaration: Statement | null;
  specifiers: ExportSpecifier[];
  source: Literal | null;
}

export interface ExportDefaultDeclaration {
  type: 'ExportDefaultDeclaration';
  declaration: Statement | Expression;
}

export interface ExportAllDeclaration {
  type: 'ExportAllDeclaration';
  source: Literal;
}

export interface ExportSpecifier {
  type: 'ExportSpecifier';
  local: Identifier;
  exported: Identifier;
}

// --- Expressions ---

export type Expression =
  | BinaryExpression
  | UnaryExpression
  | UpdateExpression
  | AssignmentExpression
  | LogicalExpression
  | ConditionalExpression
  | ChainExpression
  | MemberExpression
  | CallExpression
  | NewExpression
  | ArrayLiteral
  | ObjectLiteral
  | FunctionExpression
  | ArrowFunctionExpression
  | ClassExpression
  | TemplateLiteral
  | Identifier
  | ThisExpression
  | SuperExpression
  | RegexLiteral
  | Literal
  | SpreadElement
  | MetaProperty
  | AwaitExpression
  | YieldExpression
  | ImportExpression
  | SequenceExpression;

export interface BinaryExpression {
  type: 'BinaryExpression';
  operator: string;
  left: Expression;
  right: Expression;
}

export interface UnaryExpression {
  type: 'UnaryExpression';
  operator: string;
  prefix: boolean;
  argument: Expression;
}

export interface UpdateExpression {
  type: 'UpdateExpression';
  operator: '++' | '--';
  prefix: boolean;
  argument: Expression;
}

export interface AssignmentExpression {
  type: 'AssignmentExpression';
  operator: string;
  left: Expression | Pattern;
  right: Expression;
}

export interface LogicalExpression {
  type: 'LogicalExpression';
  operator: '&&' | '||' | '??';
  left: Expression;
  right: Expression;
}

export interface ConditionalExpression {
  type: 'ConditionalExpression';
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}

export interface ChainExpression {
  type: 'ChainExpression';
  expression: CallExpression | MemberExpression;
  optional: boolean;
}

export interface MemberExpression {
  type: 'MemberExpression';
  object: Expression;
  property: Expression | Identifier;
  computed: boolean;
  optional: boolean;
}

export interface CallExpression {
  type: 'CallExpression';
  callee: Expression;
  arguments: Expression[];
  optional: boolean;
}

export interface NewExpression {
  type: 'NewExpression';
  callee: Expression;
  arguments: Expression[];
}

export interface ArrayLiteral {
  type: 'ArrayLiteral';
  elements: (Expression | null)[];
}

export interface ObjectLiteral {
  type: 'ObjectLiteral';
  properties: ObjectProperty[];
}

export interface ObjectProperty {
  type: 'ObjectProperty';
  key: Expression;
  value: Expression;
  computed: boolean;
  shorthand: boolean;
  method: boolean;
}

export interface FunctionExpression {
  type: 'FunctionExpression';
  id: Identifier | null;
  params: FunctionParam[];
  body: BlockStatement;
  async: boolean;
  generator: boolean;
}

export interface ArrowFunctionExpression {
  type: 'ArrowFunctionExpression';
  params: FunctionParam[];
  body: Expression | BlockStatement;
  expression: boolean;
  async: boolean;
}

export interface ClassExpression {
  type: 'ClassExpression';
  id: Identifier | null;
  superClass: Expression | null;
  body: ClassBody;
}

export interface TemplateLiteral {
  type: 'TemplateLiteral';
  quasis: TemplateElement[];
  expressions: Expression[];
}

export interface TemplateElement {
  type: 'TemplateElement';
  value: { raw: string; cooked: string };
  tail: boolean;
}

export interface Identifier {
  type: 'Identifier';
  name: string;
}

export interface ThisExpression {
  type: 'ThisExpression';
}

export interface SuperExpression {
  type: 'SuperExpression';
}

export interface Literal {
  type: 'Literal';
  value: string | number | boolean | null | bigint | RegExp;
  regex?: { pattern: string; flags: string } | null;
  bigint?: string | null;
}

export interface RegexLiteral {
  type: 'RegexLiteral';
  pattern: string;
  flags: string;
}

export interface SpreadElement {
  type: 'SpreadElement';
  argument: Expression;
}

export interface MetaProperty {
  type: 'MetaProperty';
  meta: Identifier;
  property: Identifier;
}

export interface AwaitExpression {
  type: 'AwaitExpression';
  argument: Expression;
}

export interface YieldExpression {
  type: 'YieldExpression';
  argument: Expression | null;
  delegate: boolean;
}

export interface ImportExpression {
  type: 'ImportExpression';
  source: Expression;
}

export interface SequenceExpression {
  type: 'SequenceExpression';
  expressions: Expression[];
}

// --- Patterns (destructuring) ---

export type Pattern =
  | ArrayPattern
  | ObjectPattern
  | AssignmentPattern
  | Identifier;

export interface ArrayPattern {
  type: 'ArrayPattern';
  elements: (Pattern | null)[];
  rest: Pattern | null;
}

export interface ObjectPattern {
  type: 'ObjectPattern';
  properties: AssignmentProperty[];
  rest: Pattern | null;
}

export interface AssignmentProperty {
  type: 'AssignmentProperty';
  key: Expression;
  value: Pattern;
  shorthand: boolean;
  computed: boolean;
}

export interface AssignmentPattern {
  type: 'AssignmentPattern';
  left: Pattern;
  right: Expression;
}

// --- Runtime / built-in helper types ---
export interface MemberExpressionWithOptional extends MemberExpression {} // ensures optional field
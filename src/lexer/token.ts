export enum TokenType {
  // Keywords
  Let = 'Let',
  Const = 'Const',
  Var = 'Var',
  Function = 'Function',
  If = 'If',
  Else = 'Else',
  While = 'While',
  Do = 'Do',
  For = 'For',
  Break = 'Break',
  Continue = 'Continue',
  Return = 'Return',
  Switch = 'Switch',
  Case = 'Case',
  Default = 'Default',
  Try = 'Try',
  Catch = 'Catch',
  Finally = 'Finally',
  Throw = 'Throw',
  Class = 'Class',
  Extends = 'Extends',
  Super = 'Super',
  This = 'This',
  New = 'New',
  Import = 'Import',
  Export = 'Export',
  From = 'From',
  As = 'As',
  Of = 'Of',
  In = 'In',
  Instanceof = 'Instanceof',
  Typeof = 'Typeof',
  Void = 'Void',
  Delete = 'Delete',
  Async = 'Async',
  Await = 'Await',
  Yield = 'Yield',
  Static = 'Static',
  Get = 'Get',
  Set = 'Set',
  Debugger = 'Debugger',

  // Literals
  True = 'True',
  False = 'False',
  Null = 'Null',
  Undefined = 'Undefined',
  Identifier = 'Identifier',
  Number = 'Number',
  String = 'String',
  Regex = 'Regex',
  BigInt = 'BigInt',

  // Arithmetic operators
  Plus = 'Plus',
  Minus = 'Minus',
  Star = 'Star',
  Slash = 'Slash',
  Percent = 'Percent',
  StarStar = 'StarStar',
  PlusPlus = 'PlusPlus',
  MinusMinus = 'MinusMinus',

  // Compound assignment
  PlusEquals = 'PlusEquals',
  MinusEquals = 'MinusEquals',
  StarEquals = 'StarEquals',
  SlashEquals = 'SlashEquals',
  PercentEquals = 'PercentEquals',
  StarStarEquals = 'StarStarEquals',
  AndEquals = 'AndEquals',
  OrEquals = 'OrEquals',
  XorEquals = 'XorEquals',
  LeftShiftEquals = 'LeftShiftEquals',
  RightShiftEquals = 'RightShiftEquals',
  UnsignedRightShiftEquals = 'UnsignedRightShiftEquals',
  NullishEquals = 'NullishEquals',
  AndAndEquals = 'AndAndEquals',
  OrOrEquals = 'OrOrEquals',

  // Bitwise operators
  Ampersand = 'Ampersand',
  Pipe = 'Pipe',
  Caret = 'Caret',
  Tilde = 'Tilde',
  LeftShift = 'LeftShift',
  RightShift = 'RightShift',
  UnsignedRightShift = 'UnsignedRightShift',

  // Logical operators
  AndAnd = 'AndAnd',
  OrOr = 'OrOr',
  Not = 'Not',
  NullishCoalescing = 'NullishCoalescing',

  // Comparison operators
  EqualsEquals = 'EqualsEquals',
  NotEquals = 'NotEquals',
  StrictEquals = 'StrictEquals',
  StrictNotEquals = 'StrictNotEquals',
  LessThan = 'LessThan',
  GreaterThan = 'GreaterThan',
  LessThanEquals = 'LessThanEquals',
  GreaterThanEquals = 'GreaterThanEquals',

  // Assignment
  Equals = 'Equals',

  // Access
  Dot = 'Dot',
  QuestionDot = 'QuestionDot',
  LeftBracket = 'LeftBracket',
  RightBracket = 'RightBracket',

  // Grouping / block
  LeftParen = 'LeftParen',
  RightParen = 'RightParen',
  LeftBrace = 'LeftBrace',
  RightBrace = 'RightBrace',

  // Other punctuation
  Semicolon = 'Semicolon',
  Colon = 'Colon',
  Comma = 'Comma',
  Arrow = 'Arrow',
  DotDotDot = 'DotDotDot',
  Question = 'Question',
  At = 'At',
  Hash = 'Hash',
  Backtick = 'Backtick',
  DollarBrace = 'DollarBrace',

  // Template literal
  TemplateHead = 'TemplateHead',
  TemplateMiddle = 'TemplateMiddle',
  TemplateTail = 'TemplateTail',
  TemplateLiteral = 'TemplateLiteral',

  EOF = 'EOF',
  Error = 'Error'
}

export interface Token {
  type: TokenType;
  lexeme: string;
  literal?: number | string | boolean | null | bigint | { pattern: string; flags: string };
  line: number;
  column: number;
}
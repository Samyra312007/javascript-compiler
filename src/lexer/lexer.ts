import { Token, TokenType } from './token.js';

export class Lexer {
  private source: string;
  private start: number = 0;
  private current: number = 0;
  private line: number = 1;
  private column: number = 1;
private tokens: Token[] = [];

  private static keywords: Map<string, TokenType> = new Map([
    ['let', TokenType.Let],
    ['const', TokenType.Const],
    ['var', TokenType.Var],
    ['function', TokenType.Function],
    ['if', TokenType.If],
    ['else', TokenType.Else],
    ['while', TokenType.While],
    ['do', TokenType.Do],
    ['for', TokenType.For],
    ['break', TokenType.Break],
    ['continue', TokenType.Continue],
    ['return', TokenType.Return],
    ['switch', TokenType.Switch],
    ['case', TokenType.Case],
    ['default', TokenType.Default],
    ['try', TokenType.Try],
    ['catch', TokenType.Catch],
    ['finally', TokenType.Finally],
    ['throw', TokenType.Throw],
    ['class', TokenType.Class],
    ['extends', TokenType.Extends],
    ['super', TokenType.Super],
    ['this', TokenType.This],
    ['new', TokenType.New],
    ['import', TokenType.Import],
    ['export', TokenType.Export],
    ['from', TokenType.From],
    ['as', TokenType.As],
    ['of', TokenType.Of],
    ['in', TokenType.In],
    ['instanceof', TokenType.Instanceof],
    ['typeof', TokenType.Typeof],
    ['void', TokenType.Void],
    ['delete', TokenType.Delete],
    ['async', TokenType.Async],
    ['await', TokenType.Await],
    ['yield', TokenType.Yield],
    ['static', TokenType.Static],
    ['get', TokenType.Get],
    ['set', TokenType.Set],
    ['debugger', TokenType.Debugger],
    ['true', TokenType.True],
    ['false', TokenType.False],
    ['null', TokenType.Null],
    ['undefined', TokenType.Undefined]
  ]);

  constructor(source: string) {
    this.source = source;
  }

  public scanTokens(): Token[] {
    this.tokens = [];
    this.start = 0;
    this.current = 0;
    this.line = 1;
    this.column = 1;

    while (!this.isAtEnd()) {
      this.start = this.current;
      const token = this.scanToken();
      if (token) this.tokens.push(token);
    }

    this.tokens.push(this.createToken(TokenType.EOF, ''));
    return this.tokens;
  }

  private scanToken(): Token | null {
    const c = this.advance();

    switch (c) {
      // Single-character tokens
      case '(': return this.createToken(TokenType.LeftParen, '(');
      case ')': return this.createToken(TokenType.RightParen, ')');
      case '{': return this.createToken(TokenType.LeftBrace, '{');
      case '}': return this.createToken(TokenType.RightBrace, '}');
      case '[': return this.createToken(TokenType.LeftBracket, '[');
      case ']': return this.createToken(TokenType.RightBracket, ']');
      case ';': return this.createToken(TokenType.Semicolon, ';');
      case ',': return this.createToken(TokenType.Comma, ',');
      case ':': return this.createToken(TokenType.Colon, ':');
      case '?': return this.scanQuestion();
      case '@': return this.createToken(TokenType.At, '@');
      case '#': return this.createToken(TokenType.Hash, '#');
      case '~': return this.createToken(TokenType.Tilde, '~');

      // Arithmetic operators
      case '+': return this.scanPlus();
      case '-': return this.scanMinus();
      case '*': return this.scanStar();
      case '/': return this.scanSlash();
      case '%':
        if (this.match('=')) return this.createToken(TokenType.PercentEquals, '%=');
        return this.createToken(TokenType.Percent, '%');

      // Bitwise / logical
      case '&': return this.scanAmpersand();
      case '|': return this.scanPipe();
      case '^':
        if (this.match('=')) return this.createToken(TokenType.XorEquals, '^=');
        return this.createToken(TokenType.Caret, '^');

      // Comparison / assignment
      case '=': return this.scanEquals();
      case '!': return this.scanBang();

      // Angle brackets / shifts
      case '<': return this.scanLessThan();
      case '>': return this.scanGreaterThan();

      // Dot (also spread?)
      case '.':
        if (this.match('.')) {
          if (this.match('.')) return this.createToken(TokenType.DotDotDot, '...');
          throw this.error("Unexpected '..'");
        }
        return this.createToken(TokenType.Dot, '.');

      // Whitespace & newlines
      case ' ':
      case '\r':
      case '\t':
        return null;
      case '\n':
        this.line++;
        this.column = 1;
        return null;

      // Template literal backtick
      case '`': return this.scanTemplateLiteral();

      // Strings
      case '"':
      case "'":
        return this.scanString(c);

      default:
        if (this.isDigit(c)) return this.scanNumber();
        if (this.isAlpha(c) || c === '$' || c === '_') return this.scanIdentifier();
        throw this.error(`Unexpected character '${c}'`);
    }
  }

  // --- Multi-character token scanners ---

  private scanQuestion(): Token {
    if (this.match('.')) {
      if (!this.isDigit(this.peek())) {
        return this.createToken(TokenType.QuestionDot, '?.');
      }
    }
    if (this.match('?')) return this.createToken(TokenType.NullishCoalescing, '??');
    if (this.match('=')) throw this.error("Unexpected '?='");
    return this.createToken(TokenType.Question, '?');
  }

  private scanPlus(): Token {
    if (this.match('+')) return this.createToken(TokenType.PlusPlus, '++');
    if (this.match('=')) return this.createToken(TokenType.PlusEquals, '+=');
    return this.createToken(TokenType.Plus, '+');
  }

  private scanMinus(): Token {
    if (this.match('-')) return this.createToken(TokenType.MinusMinus, '--');
    if (this.match('=')) return this.createToken(TokenType.MinusEquals, '-=');
    if (this.match('>')) return this.createToken(TokenType.Arrow, '=>');
    return this.createToken(TokenType.Minus, '-');
  }

  private scanStar(): Token {
    if (this.match('*')) {
      if (this.match('=')) return this.createToken(TokenType.StarStarEquals, '**=');
      return this.createToken(TokenType.StarStar, '**');
    }
    if (this.match('=')) return this.createToken(TokenType.StarEquals, '*=');
    return this.createToken(TokenType.Star, '*');
  }

  private scanSlash(): Token | null {
    if (this.isRegexStart()) return this.scanRegex();
    if (this.match('/')) {
      while (this.peek() !== '\n' && !this.isAtEnd()) this.advance();
      return null;
    }
    if (this.match('*')) {
      this.handleBlockComment();
      return null;
    }
    if (this.match('=')) return this.createToken(TokenType.SlashEquals, '/=');
    return this.createToken(TokenType.Slash, '/');
  }

  private scanAmpersand(): Token {
    if (this.match('&')) {
      if (this.match('=')) return this.createToken(TokenType.AndAndEquals, '&&=');
      return this.createToken(TokenType.AndAnd, '&&');
    }
    if (this.match('=')) return this.createToken(TokenType.AndEquals, '&=');
    return this.createToken(TokenType.Ampersand, '&');
  }

  private scanPipe(): Token {
    if (this.match('|')) {
      if (this.match('=')) return this.createToken(TokenType.OrOrEquals, '||=');
      return this.createToken(TokenType.OrOr, '||');
    }
    if (this.match('=')) return this.createToken(TokenType.OrEquals, '|=');
    return this.createToken(TokenType.Pipe, '|');
  }

  private scanEquals(): Token {
    if (this.match('=')) return this.createToken(TokenType.StrictEquals, '===');
    if (this.match('>')) return this.createToken(TokenType.Arrow, '=>');
    return this.createToken(TokenType.Equals, '=');
  }

  private scanBang(): Token {
    if (this.match('=')) {
      if (this.match('=')) return this.createToken(TokenType.StrictNotEquals, '!==');
      return this.createToken(TokenType.NotEquals, '!=');
    }
    return this.createToken(TokenType.Not, '!');
  }

  private scanLessThan(): Token {
    if (this.match('<')) {
      if (this.match('=')) return this.createToken(TokenType.LeftShiftEquals, '<<=');
      return this.createToken(TokenType.LeftShift, '<<');
    }
    if (this.match('=')) return this.createToken(TokenType.LessThanEquals, '<=');
    return this.createToken(TokenType.LessThan, '<');
  }

  private scanGreaterThan(): Token {
    if (this.match('>')) {
      if (this.match('>')) {
        if (this.match('=')) return this.createToken(TokenType.UnsignedRightShiftEquals, '>>>=');
        return this.createToken(TokenType.UnsignedRightShift, '>>>');
      }
      if (this.match('=')) return this.createToken(TokenType.RightShiftEquals, '>>=');
      return this.createToken(TokenType.RightShift, '>>');
    }
    if (this.match('=')) return this.createToken(TokenType.GreaterThanEquals, '>=');
    return this.createToken(TokenType.GreaterThan, '>');
  }

  // --- Literal scanners ---

  private scanString(quote: string): Token {
    let value = '';

    while (this.peek() !== quote && !this.isAtEnd()) {
      if (this.peek() === '\n') this.line++;
      if (this.peek() === '\\') {
        this.advance();
        value += this.scanEscapeSequence();
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) throw this.error('Unterminated string');
    this.advance();

    return this.createToken(TokenType.String, `"${value}"`, value);
  }

  private scanEscapeSequence(): string {
    const c = this.peek();
    switch (c) {
      case 'n': this.advance(); return '\n';
      case 't': this.advance(); return '\t';
      case 'r': this.advance(); return '\r';
      case 'b': this.advance(); return '\b';
      case 'f': this.advance(); return '\f';
      case 'v': this.advance(); return '\v';
      case '0': this.advance(); return '\0';
      case "'": this.advance(); return "'";
      case '"': this.advance(); return '"';
      case '`': this.advance(); return '`';
      case '\\': this.advance(); return '\\';
      case 'x': return this.scanHexEscape(2);
      case 'u': return this.scanUnicodeEscape();
      default: this.advance(); return c;
    }
  }

  private scanHexEscape(length: number): string {
    let hex = '';
    for (let i = 0; i < length; i++) {
      const c = this.peek();
      if (this.isHexDigit(c)) {
        hex += this.advance();
      } else {
        return '\\x' + hex;
      }
    }
    return String.fromCharCode(parseInt(hex, 16));
  }

  private scanUnicodeEscape(): string {
    if (this.peek() === '{') {
      this.advance();
      let code = '';
      while (!this.isAtEnd() && this.peek() !== '}') {
        code += this.advance();
      }
      if (!this.isAtEnd()) this.advance();
      return String.fromCodePoint(parseInt(code, 16));
    }
    return this.scanHexEscape(4);
  }

  private scanNumber(): Token {
    if (this.peek() === 'x' || this.peek() === 'X') {
      return this.scanHexNumber();
    }
    if (this.peek() === 'o' || this.peek() === 'O') {
      return this.scanOctalNumber();
    }
    if (this.peek() === 'b' || this.peek() === 'B') {
      return this.scanBinaryNumber();
    }

    let isFloat = false;
    while (this.isDigit(this.peek())) this.advance();

    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      isFloat = true;
      this.advance();
      while (this.isDigit(this.peek())) this.advance();
    }

    if ((this.peek() === 'e' || this.peek() === 'E') && (this.isDigit(this.peekNext()) || this.peekNext() === '+' || this.peekNext() === '-')) {
      isFloat = true;
      this.advance();
      if (this.peek() === '+' || this.peek() === '-') this.advance();
      while (this.isDigit(this.peek())) this.advance();
    }

    const numberStr = this.source.substring(this.start, this.current);

    if (this.peek() === 'n') {
      this.advance();
      return this.createToken(TokenType.BigInt, this.source.substring(this.start, this.current), BigInt(numberStr));
    }

    return this.createToken(TokenType.Number, numberStr, parseFloat(numberStr));
  }

  private scanHexNumber(): Token {
    this.advance();
    let hex = '';
    while (this.isHexDigit(this.peek())) hex += this.advance();
    const num = parseInt(hex, 16);
    if (this.peek() === 'n') {
      this.advance();
      return this.createToken(TokenType.BigInt, this.source.substring(this.start, this.current), BigInt(num));
    }
    return this.createToken(TokenType.Number, this.source.substring(this.start, this.current), num);
  }

  private scanOctalNumber(): Token {
    this.advance();
    let oct = '';
    while (this.isOctDigit(this.peek())) oct += this.advance();
    const num = parseInt(oct, 8);
    if (this.peek() === 'n') {
      this.advance();
      return this.createToken(TokenType.BigInt, this.source.substring(this.start, this.current), BigInt(num));
    }
    return this.createToken(TokenType.Number, this.source.substring(this.start, this.current), num);
  }

  private scanBinaryNumber(): Token {
    this.advance();
    let bin = '';
    while (this.peek() === '0' || this.peek() === '1') bin += this.advance();
    const num = parseInt(bin, 2);
    if (this.peek() === 'n') {
      this.advance();
      return this.createToken(TokenType.BigInt, this.source.substring(this.start, this.current), BigInt(num));
    }
    return this.createToken(TokenType.Number, this.source.substring(this.start, this.current), num);
  }

  private scanIdentifier(): Token {
    while (this.isAlphaNumeric(this.peek()) || this.peek() === '$') this.advance();

    const text = this.source.substring(this.start, this.current);
    const type = Lexer.keywords.get(text) || TokenType.Identifier;

    return this.createToken(type, text);
  }

  private scanRegex(): Token {
    let pattern = '';
    let inClass = false;

    while (!this.isAtEnd()) {
      const c = this.peek();

      if (c === '/' && !inClass) {
        this.advance();
        break;
      }

      if (c === '\\') {
        pattern += this.advance();
        if (!this.isAtEnd()) pattern += this.advance();
      } else if (c === '[') {
        inClass = true;
        pattern += this.advance();
      } else if (c === ']') {
        inClass = false;
        pattern += this.advance();
      } else if (c === '\n') {
        throw this.error('Unterminated regex literal');
      } else {
        pattern += this.advance();
      }
    }

    let flags = '';
    while (this.isRegexFlag(this.peek())) flags += this.advance();

    const regexStr = `/${pattern}/${flags}`;
    return this.createToken(TokenType.Regex, regexStr, { pattern, flags });
  }

  private scanTemplateLiteral(): Token {
    let value = '';

    while (!this.isAtEnd()) {
      const c = this.peek();

      if (c === '`') {
        this.advance();
        return this.createToken(TokenType.TemplateLiteral, this.source.substring(this.start, this.current), value);
      }

      if (c === '$' && this.peekNext() === '{') {
        // Template with expressions - scan as plain content for now
        this.advance();
        this.advance();
        let braceDepth = 1;
        while (braceDepth > 0 && !this.isAtEnd()) {
          const ec = this.advance();
          value += ec;
          if (ec === '{') braceDepth++;
          if (ec === '}') braceDepth--;
          if (ec === '\n') this.line++;
        }
        continue;
      }

      if (c === '\\') {
        this.advance();
        if (!this.isAtEnd()) {
          if (this.peek() === '\n') this.line++;
          value += this.advance();
        }
        continue;
      }

      if (c === '\n') this.line++;
      value += this.advance();
    }

    throw this.error('Unterminated template literal');
  }

  // --- Helpers ---

  private isRegexStart(): boolean {
    if (this.tokens.length === 0) return true;
    const prevToken = this.tokens[this.tokens.length - 1];
    if (!prevToken) return true;

    const regexAllowedAfter: TokenType[] = [
      TokenType.Equals, TokenType.LeftParen, TokenType.LeftBracket,
      TokenType.LeftBrace, TokenType.Comma, TokenType.Return,
      TokenType.Let, TokenType.Const, TokenType.Var, TokenType.If,
      TokenType.While, TokenType.For, TokenType.Switch, TokenType.Case,
      TokenType.Typeof, TokenType.Void, TokenType.Delete, TokenType.Throw,
      TokenType.Colon, TokenType.Question, TokenType.Plus, TokenType.Minus,
      TokenType.Star, TokenType.Slash, TokenType.Not, TokenType.Tilde,
      TokenType.AndAnd, TokenType.OrOr, TokenType.Ampersand, TokenType.Pipe,
      TokenType.In, TokenType.Instanceof, TokenType.Await, TokenType.Yield,
      TokenType.Semicolon, TokenType.Arrow, TokenType.QuestionDot,
    ];

    return regexAllowedAfter.includes(prevToken.type);
  }

  private isRegexFlag(c: string): boolean {
    return ['g', 'i', 'm', 's', 'u', 'y', 'd', 'v'].includes(c);
  }

  private handleBlockComment(): void {
    while (!this.isAtEnd()) {
      if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance();
        this.advance();
        return;
      }
      if (this.peek() === '\n') {
        this.line++;
        this.column = 1;
      }
      this.advance();
    }
    throw this.error('Unterminated block comment');
  }

  private advance(): string {
    this.column++;
    return this.source[this.current++];
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source[this.current];
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) return '\0';
    return this.source[this.current + 1];
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source[this.current] !== expected) return false;
    this.current++;
    this.column++;
    return true;
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
  }

  private isHexDigit(c: string): boolean {
    return this.isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
  }

  private isOctDigit(c: string): boolean {
    return c >= '0' && c <= '7';
  }

  private isAlpha(c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }

  private createToken(type: TokenType, lexeme: string, literal?: any): Token {
    return {
      type,
      lexeme,
      literal,
      line: this.line,
      column: this.column - lexeme.length
    };
  }

  private error(message: string): Error {
    return new Error(`Lexer error at ${this.line}:${this.column}: ${message}`);
  }
}
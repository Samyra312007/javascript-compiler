/**
 * Minimal Language Server (LSP) over stdio.
 *
 * Serves diagnostics by running the compiler's lexer/parser/semantic pipeline
 * (lint mode) on the current document text, and provides basic hover info.
 * Speaks the LSP JSON-RPC framing protocol.
 */

import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { TypeChecker } from '../semantic/type-checker.js';
import { DiagnosticSeverity } from '../diagnostics.js';

interface JsonRpcMessage {
  jsonrpc: string;
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

export class LanguageServer {
  private documents = new Map<string, string>();
  private initialized = false;

  constructor() {
    process.stdin.setEncoding('utf-8');
  }

  public start(): void {
    let buffer = '';
    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;
      buffer = this.processBuffer(buffer);
    });
    process.stdin.on('end', () => process.exit(0));
  }

  private processBuffer(buffer: string): string {
    const contentLength = buffer.indexOf('\r\n\r\n');
    if (contentLength === -1) return buffer;
    const header = buffer.slice(0, contentLength);
    const match = header.match(/Content-Length: (\d+)/);
    if (!match) return buffer.slice(contentLength + 4);
    const length = parseInt(match[1], 10);
    const bodyStart = contentLength + 4;
    if (buffer.length < bodyStart + length) return buffer;

    const body = buffer.slice(bodyStart, bodyStart + length);
    try {
      const msg: JsonRpcMessage = JSON.parse(body);
      this.handleMessage(msg);
    } catch (e) {
      // ignore malformed messages
    }
    return buffer.slice(bodyStart + length);
  }

  private send(msg: JsonRpcMessage): void {
    const body = JSON.stringify(msg);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n${body}`);
  }

  private handleMessage(msg: JsonRpcMessage): void {
    switch (msg.method) {
      case 'initialize': {
        this.send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            capabilities: {
              textDocumentSync: 1,
              hoverProvider: true
            },
            serverInfo: { name: 'tsjs-compiler-lsp', version: '1.0.0' }
          }
        });
        break;
      }
      case 'initialized':
        this.initialized = true;
        break;
      case 'textDocument/didOpen':
        this.updateDocument(msg.params.textDocument.uri, msg.params.textDocument.text);
        break;
      case 'textDocument/didChange': {
        const uri = msg.params.textDocument.uri;
        const text = msg.params.contentChanges?.[0]?.text;
        if (text !== undefined) this.updateDocument(uri, text);
        break;
      }
      case 'textDocument/didClose': {
        const uri = msg.params.textDocument.uri;
        this.documents.delete(uri);
        this.publish(uri, []);
        break;
      }
      case 'textDocument/hover': {
        this.send({
          jsonrpc: '2.0',
          id: msg.id,
          result: this.hover(msg.params)
        });
        break;
      }
      case 'shutdown':
        this.send({ jsonrpc: '2.0', id: msg.id, result: null });
        break;
      case 'exit':
        process.exit(0);
        break;
      default:
        if (msg.id !== undefined) {
          this.send({ jsonrpc: '2.0', id: msg.id, result: null });
        }
    }
  }

  private updateDocument(uri: string, text: string): void {
    this.documents.set(uri, text);
    const diagnostics = this.analyze(uri, text);
    this.publish(uri, diagnostics);
  }

  private analyze(uri: string, text: string): any[] {
    const out: any[] = [];
    const file = uri.replace(/^file:\/\//, '');

    try {
      const tokens = new Lexer(text).scanTokens();
      const parser = new Parser(tokens, file);
      const ast = parser.parse();
      for (const d of parser.diagnostics) {
        out.push(this.toLSPDiagnostic(d));
      }

      const typeChecker = new TypeChecker();
      typeChecker.check(ast);
      for (const err of typeChecker.getErrors()) {
        out.push(this.toLSPDiagnostic({
          severity: DiagnosticSeverity.Error,
          code: 'semantic',
          message: err.message,
          location: { file, line: err.line, column: 0, length: 0 }
        }));
      }
      for (const warn of typeChecker.getWarnings()) {
        out.push(this.toLSPDiagnostic({
          severity: DiagnosticSeverity.Warning,
          code: 'warning',
          message: warn.message,
          location: { file, line: warn.line, column: 0, length: 0 }
        }));
      }
    } catch (e) {
      out.push(this.toLSPDiagnostic({
        severity: DiagnosticSeverity.Error,
        code: 'internal',
        message: e instanceof Error ? e.message : String(e),
        location: { file, line: 0, column: 0, length: 0 }
      }));
    }
    return out;
  }

  private toLSPDiagnostic(d: any): any {
    const line = Math.max(0, (d.location?.line ?? 1) - 1);
    const col = Math.max(0, (d.location?.column ?? 1) - 1);
    const length = d.location?.length || 1;
    return {
      range: {
        start: { line, character: col },
        end: { line, character: col + length }
      },
      severity: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : 3,
      code: d.code,
      source: 'tsjs-compiler',
      message: d.message
    };
  }

  private publish(uri: string, diagnostics: any[]): void {
    this.send({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: { uri, diagnostics }
    });
  }

  private hover(params: any): any {
    const uri = params?.textDocument?.uri;
    const pos = params?.position;
    const text = this.documents.get(uri || '');
    if (!text || !pos) return { contents: [] };

    // find the word under the cursor
    const lines = text.split('\n');
    const lineText = lines[pos.line] ?? '';
    const before = lineText.slice(0, pos.character);
    const after = lineText.slice(pos.character);
    const wordStart = before.search(/[A-Za-z0-9_$][A-Za-z0-9_$]*$/);
    const wordEnd = after.match(/^[A-Za-z0-9_$]*/)?.[0].length ?? 0;
    const word = wordStart >= 0 ? before.slice(wordStart) + lineText.slice(pos.character, pos.character + wordEnd) : '';

    if (!word) return { contents: [] };
    return {
      contents: {
        kind: 'markdown',
        value: `**${word}** — identifier (hover info provided by tsjs-compiler)`
      }
    };
  }
}

export function startLanguageServer(): void {
  new LanguageServer().start();
}

if (typeof require !== 'undefined' && require.main === module) {
  startLanguageServer();
}

import * as fs from 'fs';
import * as path from 'path';

export class ModuleResolver {
  public static resolve(request: string, fromDir: string): string | null {
    const isRelative = request.startsWith('./') || request.startsWith('../');
    if (isRelative) {
      return ModuleResolver.resolveAsFileOrDirectory(path.resolve(fromDir, request));
    }
    return ModuleResolver.resolveNodeModules(request, fromDir);
  }

  private static resolveAsFileOrDirectory(base: string): string | null {
    const asFile = ModuleResolver.tryFile(base);
    if (asFile) return asFile;

    if (ModuleResolver.isDirectory(base)) {
      const pkgMain = ModuleResolver.resolvePackageMain(base);
      if (pkgMain) return pkgMain;

      const indexPath = path.join(base, 'index.js');
      if (fs.existsSync(indexPath)) return indexPath;
    }

    return null;
  }

  private static resolveNodeModules(request: string, fromDir: string): string | null {
    let dir = path.resolve(fromDir);
    for (;;) {
      const candidate = path.join(dir, 'node_modules', request);
      const resolved = ModuleResolver.resolveAsFileOrDirectory(candidate);
      if (resolved) return resolved;

      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  private static tryFile(base: string): string | null {
    const extensions = ['.js', '.json'];
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
    for (const ext of extensions) {
      const candidate = base + ext;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
  }

  private static isDirectory(p: string): boolean {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  }

  private static resolvePackageMain(dir: string): string | null {
    const pkgFile = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgFile)) return null;

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
      if (typeof pkg.main === 'string' && pkg.main) {
        const mainPath = path.resolve(dir, pkg.main);
        const asFile = ModuleResolver.tryFile(mainPath);
        if (asFile) return asFile;
        const index = path.join(mainPath, 'index.js');
        if (fs.existsSync(index)) return index;
      }
    } catch {
      // fall through to index.js
    }

    return null;
  }
}

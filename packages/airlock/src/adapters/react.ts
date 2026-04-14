import path from 'node:path';
import type { AstroIntegrationLogger } from 'astro';
import ts from 'typescript';

import { type SchemaGenResult, generateZodSchema } from '../extractor.js';
import type { FrameworkAdapter } from './adapter.js';

/**
 * framework adapter for React / Preact components.
 * uses the TypeScript compiler API to extract prop types.
 */
export class ReactAdapter implements FrameworkAdapter {
  readonly name = 'react';
  readonly extensions = ['.tsx', '.ts', '.jsx', '.js'];

  private program: ts.Program | null = null;
  private readonly projectRoot: string;
  private readonly logger: AstroIntegrationLogger;

  constructor(projectRoot: string, logger: AstroIntegrationLogger) {
    this.projectRoot = projectRoot;
    this.logger = logger;
  }

  canHandle(filePath: string): boolean {
    return this.extensions.some((ext) => filePath.endsWith(ext));
  }

  extractSchema(filePath: string, exportName: string): SchemaGenResult | null | undefined {
    const prog = this.getProgram();
    const checker = prog.getTypeChecker();
    const sourceFile = prog.getSourceFile(filePath);

    if (!sourceFile) {
      this.logger.warn(`resolved ${filePath} but failed to load source file`);

      return undefined;
    }

    const propsType = this.resolvePropsType(checker, sourceFile, exportName);

    if (!propsType) return null;

    return generateZodSchema(checker, propsType);
  }

  invalidate(_filePath: string): void {
    this.program = null;
  }

  resolveModulePath(importSpecifier: string, fromFile: string): string | undefined {
    const prog = this.getProgram();
    const resolved = ts.resolveModuleName(importSpecifier, fromFile, prog.getCompilerOptions(), ts.sys);

    if (!resolved.resolvedModule) {
      this.logger.warn(`could not resolve '${importSpecifier}' from ${fromFile}`);

      return undefined;
    }

    return resolved.resolvedModule.resolvedFileName;
  }

  /**
   * resolve the props type for a React component export.
   * handles function declarations, arrow functions, React.FC<Props>, etc.
   */
  private resolvePropsType(
    checker: ts.TypeChecker,
    sourceFile: ts.SourceFile,
    exportName: string,
  ): ts.Type | undefined {
    const symbol = this.getExportSymbol(checker, sourceFile, exportName);

    if (!symbol) return undefined;

    const symbolType = checker.getTypeOfSymbol(symbol);
    const callSignatures = symbolType.getCallSignatures();

    if (callSignatures.length === 0) return undefined;

    const params = callSignatures[0]!.getParameters();

    if (params.length === 0) return undefined;

    return checker.getTypeOfSymbol(params[0]!);
  }

  private getExportSymbol(
    checker: ts.TypeChecker,
    sourceFile: ts.SourceFile,
    exportName: string,
  ): ts.Symbol | undefined {
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

    if (!moduleSymbol) return undefined;

    const exports = checker.getExportsOfModule(moduleSymbol);
    const target = exportName === 'default' ? 'default' : exportName;
    const exportSymbol = exports.find((s) => s.escapedName === target);

    if (!exportSymbol) return undefined;

    return this.resolveAlias(checker, exportSymbol);
  }

  private resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
    if (symbol.flags & ts.SymbolFlags.Alias) {
      return this.resolveAlias(checker, checker.getAliasedSymbol(symbol));
    }

    return symbol;
  }

  private getProgram(): ts.Program {
    if (this.program) return this.program;

    const tsconfigPath = path.join(this.projectRoot, 'tsconfig.json');
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, this.projectRoot);

    this.program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);

    return this.program;
  }
}

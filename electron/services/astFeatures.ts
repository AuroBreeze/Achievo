import ts from 'typescript';

export type JsTsSymbolMetrics = {
  functions: number;
  classes: number;
  exports: number;
};

// Parse a snippet of TS/JS code and count top-level and nested declarations heuristically.
export function analyzeJsTsSnippet(snippet: string): JsTsSymbolMetrics {
  const source = ts.createSourceFile('snippet.tsx', snippet, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let functions = 0;
  let classes = 0;
  let exports = 0;

  const visit = (node: ts.Node) => {
    switch (node.kind) {
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.FunctionExpression:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.MethodDeclaration:
        functions++; break;
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.ClassExpression:
        classes++; break;
      case ts.SyntaxKind.ExportAssignment:
      case ts.SyntaxKind.ExportDeclaration:
        exports++; break;
      default:
        break;
    }
    ts.forEachChild(node, visit);
  };

  try { visit(source); } catch {}
  return { functions, classes, exports };
}

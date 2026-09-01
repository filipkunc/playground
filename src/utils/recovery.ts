export type RecoveryInspectionMode = "normal" | "editor" | "compare";
export type ConcreteRecoveryMode = Exclude<RecoveryInspectionMode, "compare">;

export interface RecoveryRange {
  start: number;
  end: number;
}

export interface RecoveryTreeNode extends RecoveryRange {
  children: RecoveryTreeNode[];
}

export interface RecoverySummarySource {
  mode: ConcreteRecoveryMode | "reference";
  status: "clean" | "recovered" | "aborted";
  statementCount: number;
  recoverySiteCount: number;
  diagnosticCount: number;
  semantic?: {
    bindingNames: string[];
  };
}

export function isRecoveryInspectionMode(
  value: string | undefined,
): value is RecoveryInspectionMode {
  return value === "normal" || value === "editor" || value === "compare";
}

export function recoveryInspectionModes(mode: RecoveryInspectionMode): ConcreteRecoveryMode[] {
  return mode === "compare" ? ["normal", "editor"] : [mode];
}

export function activeRecoveryMode(mode: RecoveryInspectionMode): ConcreteRecoveryMode {
  return mode === "normal" ? "normal" : "editor";
}

export function serializeRecoveryMode(mode: RecoveryInspectionMode): string | undefined {
  return mode === "compare" ? undefined : mode;
}

export function recoverySummary(inspection: RecoverySummarySource) {
  return {
    mode: inspection.mode,
    status: inspection.status,
    statementCount: inspection.statementCount,
    recoverySiteCount: inspection.recoverySiteCount,
    diagnosticCount: inspection.diagnosticCount,
    bindingCount: inspection.semantic?.bindingNames.length ?? 0,
  };
}

export function recoveryDecorationClasses(range: readonly [number, number]) {
  const zeroWidth = range[0] === range[1];
  return {
    className: zeroWidth ? "recovery-caret" : "ast-highlight",
    beforeContentClassName: zeroWidth ? "recovery-caret-before" : undefined,
  };
}

function containsCursor(range: RecoveryRange, offset: number): boolean {
  if (range.start === range.end) return offset === range.start;
  return range.start <= offset && offset <= range.end;
}

/**
 * Return the narrowest source-order path containing the caret. Exact zero-width recovery sites
 * win over source-backed siblings at the same offset so insertion points remain inspectable.
 */
export function recoveryTreePathAt<T extends RecoveryTreeNode>(node: T, offset: number): T[] {
  if (!containsCursor(node, offset)) return [];

  const child = node.children
    .filter((candidate) => containsCursor(candidate, offset))
    .toSorted((left, right) => {
      const leftWidth = left.end - left.start;
      const rightWidth = right.end - right.start;
      return leftWidth - rightWidth || left.start - right.start;
    })[0] as T | undefined;

  return child ? [node, ...recoveryTreePathAt(child, offset)] : [node];
}

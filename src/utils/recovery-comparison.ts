export type DiagnosticEngine = "typescript-rust" | "typescript-go" | "oxc-normal";
export type DiagnosticPhase = "parse" | "bind" | "check";

export interface EngineDiagnostic {
  engine: DiagnosticEngine;
  code?: string;
  phase: DiagnosticPhase;
  message: string;
  start: number;
  end: number;
  recoveryKinds?: string[];
}

export interface DiagnosticComparisonRow {
  key: string;
  start: number;
  phase: DiagnosticPhase;
  status: "equal" | "different" | "missing";
  diagnostics: Partial<Record<DiagnosticEngine, EngineDiagnostic>>;
}

export function compareRecoveryDiagnostics(
  diagnostics: readonly EngineDiagnostic[],
): DiagnosticComparisonRow[] {
  const rows = new Map<string, DiagnosticComparisonRow>();
  for (const diagnostic of diagnostics) {
    const baseKey = `${diagnostic.phase}:${diagnostic.start}`;
    let key = baseKey;
    let suffix = 1;
    while (rows.get(key)?.diagnostics[diagnostic.engine]) {
      key = `${baseKey}:${suffix++}`;
    }
    const row = rows.get(key) ?? {
      key,
      start: diagnostic.start,
      phase: diagnostic.phase,
      status: "missing",
      diagnostics: {},
    };
    row.diagnostics[diagnostic.engine] = diagnostic;
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => ({ ...row, status: comparisonStatus(row) }))
    .toSorted((left, right) => left.start - right.start || left.phase.localeCompare(right.phase));
}

function comparisonStatus(row: DiagnosticComparisonRow): DiagnosticComparisonRow["status"] {
  const rust = row.diagnostics["typescript-rust"];
  const go = row.diagnostics["typescript-go"];
  if (!rust || !go) return "missing";
  return rust.code === go.code && rust.message === go.message ? "equal" : "different";
}

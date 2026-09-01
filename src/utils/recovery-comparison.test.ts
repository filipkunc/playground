import { describe, expect, it } from "vite-plus/test";
import { compareRecoveryDiagnostics, type EngineDiagnostic } from "./recovery-comparison";

describe("recovery diagnostic comparison", () => {
  it("matches parser diagnostics by phase and insertion point", () => {
    const diagnostics: EngineDiagnostic[] = [
      {
        engine: "typescript-rust",
        code: "TS1005",
        phase: "parse",
        message: "',' expected.",
        start: 43,
        end: 43,
        recoveryKinds: ["MissingComma"],
      },
      {
        engine: "typescript-go",
        code: "TS1005",
        phase: "parse",
        message: "',' expected.",
        start: 43,
        end: 49,
        recoveryKinds: ["Identifier"],
      },
    ];

    expect(compareRecoveryDiagnostics(diagnostics)).toMatchObject([
      { start: 43, phase: "parse", status: "equal" },
    ]);
  });

  it("distinguishes disagreements and missing diagnostics across all phases", () => {
    const rows = compareRecoveryDiagnostics([
      {
        engine: "typescript-rust",
        code: "TS1109",
        phase: "parse",
        message: "Expression expected.",
        start: 10,
        end: 10,
      },
      {
        engine: "typescript-go",
        code: "TS1005",
        phase: "parse",
        message: "',' expected.",
        start: 10,
        end: 11,
      },
      {
        engine: "typescript-rust",
        code: "TS2322",
        phase: "check",
        message: "not assignable",
        start: 20,
        end: 27,
      },
      {
        engine: "typescript-go",
        code: "TS2322",
        phase: "check",
        message: "not assignable",
        start: 20,
        end: 27,
      },
      {
        engine: "oxc-normal",
        phase: "parse",
        message: "unexpected token",
        start: 30,
        end: 31,
      },
    ]);

    expect(rows.map(({ status }) => status)).toEqual(["different", "equal", "missing"]);
  });
});

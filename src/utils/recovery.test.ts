import { describe, expect, it } from "vite-plus/test";
import {
  activeRecoveryMode,
  isRecoveryInspectionMode,
  recoveryDecorationClasses,
  recoveryInspectionModes,
  recoverySummary,
  recoveryTreePathAt,
  serializeRecoveryMode,
} from "./recovery";

describe("recovery inspection modes", () => {
  it("serializes compare as the shareable default", () => {
    expect(isRecoveryInspectionMode("compare")).toBe(true);
    expect(isRecoveryInspectionMode("invalid")).toBe(false);
    expect(recoveryInspectionModes("compare")).toEqual(["normal", "editor"]);
    expect(recoveryInspectionModes("normal")).toEqual(["normal"]);
    expect(activeRecoveryMode("compare")).toBe("editor");
    expect(serializeRecoveryMode("compare")).toBeUndefined();
    expect(serializeRecoveryMode("normal")).toBe("normal");
  });
});

describe("recovery comparison summary", () => {
  it("reports structural and semantic survival", () => {
    expect(
      recoverySummary({
        mode: "editor",
        status: "recovered",
        statementCount: 2,
        recoverySiteCount: 1,
        diagnosticCount: 1,
        semantic: { bindingNames: ["broken", "intact"] },
      }),
    ).toEqual({
      mode: "editor",
      status: "recovered",
      statementCount: 2,
      recoverySiteCount: 1,
      diagnosticCount: 1,
      bindingCount: 2,
    });
  });
});

describe("recovery source navigation", () => {
  const missing = { start: 15, end: 15, children: [] };
  const declarator = { start: 6, end: 15, children: [missing] };
  const intact = { start: 17, end: 42, children: [] };
  const program = { start: 0, end: 42, children: [declarator, intact] };

  it("uses a dedicated caret decoration for a zero-width site", () => {
    expect(recoveryDecorationClasses([missing.start, missing.end])).toEqual({
      className: "recovery-caret",
      beforeContentClassName: "recovery-caret-before",
    });
    expect(recoveryDecorationClasses([intact.start, intact.end])).toEqual({
      className: "ast-highlight",
      beforeContentClassName: undefined,
    });
  });

  it("expands the narrowest path containing the editor caret", () => {
    expect(recoveryTreePathAt(program, 15)).toEqual([program, declarator, missing]);
    expect(recoveryTreePathAt(program, 30)).toEqual([program, intact]);
    expect(recoveryTreePathAt(program, 43)).toEqual([]);
  });
});

import { describe, expect, it } from "vite-plus/test";
import { astLensAnnotationsAt, astLensPathAt, astLensTagLanes } from "./ast-lens";

describe("inline AST lens", () => {
  const identifier = {
    start: 21,
    end: 26,
    kind: "Identifier",
    label: "theme",
    recovered: false,
    children: [],
  };
  const property = {
    start: 21,
    end: 34,
    kind: "Property",
    recovered: false,
    children: [identifier],
  };
  const object = {
    start: 17,
    end: 36,
    kind: "ObjectExpression",
    recovered: false,
    children: [property],
  };
  const declarator = {
    start: 6,
    end: 36,
    kind: "VariableDeclarator",
    recovered: false,
    children: [object],
  };
  const declaration = {
    start: 0,
    end: 36,
    kind: "VariableDeclaration",
    recovered: false,
    children: [declarator],
  };
  const program = {
    start: 0,
    end: 36,
    kind: "Program",
    recovered: false,
    children: [declaration],
  };

  it("keeps canonical node names in the source-owning path", () => {
    const annotations = astLensAnnotationsAt(program, [], 23);

    expect(annotations.map(({ shortKind, icon, tone }) => ({ shortKind, icon, tone }))).toEqual([
      { shortKind: "VariableDeclaration", icon: "◇", tone: "declaration" },
      { shortKind: "VariableDeclarator", icon: "◇", tone: "declaration" },
      { shortKind: "ObjectExpression", icon: "{}", tone: "container" },
      { shortKind: "Property", icon: ":", tone: "member" },
      { shortKind: "Identifier", icon: "T", tone: "leaf" },
    ]);
  });

  it("adds metadata-only punctuation recovery at its insertion point", () => {
    const annotations = astLensAnnotationsAt(
      program,
      [{ start: 36, end: 36, kind: "MissingCloseBrace" }],
      36,
    );

    expect(annotations.at(-1)).toMatchObject({
      kind: "MissingCloseBrace",
      shortKind: "MissingCloseBrace",
      icon: "∅",
      tone: "recovery",
      recovered: true,
      start: 36,
      end: 36,
    });
  });

  it("attaches a zero-width recovery site to the visible gap before whitespace", () => {
    const source = "const broken =\nconst intact = 1;";
    const annotations = astLensAnnotationsAt(
      program,
      [{ start: 15, end: 15, kind: "MissingExpression" }],
      14,
      source,
    );

    expect(annotations.at(-1)).toMatchObject({
      kind: "MissingExpression",
      start: 14,
      end: 14,
      label: "recovery site · parser offset 15",
    });
  });

  it("keeps the complete non-Program path for the fixed breadcrumb", () => {
    expect(astLensPathAt(program, [], 23).map(({ kind }) => kind)).toEqual([
      "VariableDeclaration",
      "VariableDeclarator",
      "ObjectExpression",
      "Property",
      "Identifier",
    ]);
  });

  it("moves only horizontally colliding parents into lanes above their children", () => {
    expect(
      astLensTagLanes([
        { line: 3, left: 0, width: 80 },
        { line: 3, left: 300, width: 110 },
        { line: 3, left: 390, width: 105 },
      ]),
    ).toEqual([0, 1, 0]);

    expect(
      astLensTagLanes([
        { line: 1, left: 100, width: 100 },
        { line: 1, left: 120, width: 90 },
        { line: 1, left: 140, width: 80 },
      ]),
    ).toEqual([2, 1, 0]);

    expect(
      astLensTagLanes([
        { line: 1, left: 100, width: 130 },
        { line: 1, left: 100, width: 105 },
      ]),
    ).toEqual([1, 0]);
  });
});

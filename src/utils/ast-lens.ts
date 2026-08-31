import { recoveryTreePathAt } from "./recovery";
import { utf16OffsetToUtf8ByteOffset, utf8ByteOffsetToUtf16Offset } from "./tsrs";

export type AstLensTone = "declaration" | "container" | "member" | "leaf" | "recovery" | "neutral";

export interface AstLensTreeNode {
  start: number;
  end: number;
  kind: string;
  label?: string;
  recovered: boolean;
  children: AstLensTreeNode[];
}

export interface AstLensRecoverySite {
  start: number;
  end: number;
  kind: string;
}

export interface AstLensAnnotation {
  start: number;
  end: number;
  kind: string;
  label?: string;
  recovered: boolean;
  shortKind: string;
  icon: string;
  tone: AstLensTone;
}

export interface AstLensTagBox {
  line: number;
  left: number;
  width: number;
}

export const MAX_INLINE_AST_ANNOTATIONS = 6;

/** Assign overlapping tags to vertical lanes, processing children before their parents. */
export function astLensTagLanes(boxes: readonly AstLensTagBox[], gap = 4): number[] {
  const lanes = Array.from<number>({ length: boxes.length }).fill(0);
  const placed: Array<AstLensTagBox & { lane: number }> = [];

  for (let index = boxes.length - 1; index >= 0; index--) {
    const box = boxes[index];
    if (!box) continue;
    let lane = 0;
    while (
      placed.some(
        (candidate) =>
          candidate.line === box.line &&
          candidate.lane === lane &&
          box.left < candidate.left + candidate.width + gap &&
          candidate.left < box.left + box.width + gap,
      )
    ) {
      lane++;
    }
    lanes[index] = lane;
    placed.push({ ...box, lane });
  }

  return lanes;
}

function toneFor(kind: string, recovered: boolean): AstLensTone {
  if (recovered || /^(Malformed|Missing)/.test(kind)) return "recovery";
  if (/(Declaration|Declarator|Class|Function|Interface)/.test(kind)) return "declaration";
  if (/(Object|Array|Call|Block|Program|Tuple)/.test(kind)) return "container";
  if (/(Property|Member|Parameter|Argument)/.test(kind)) return "member";
  if (/(Identifier|Literal)$/.test(kind)) return "leaf";
  return "neutral";
}

function iconFor(kind: string, tone: AstLensTone): string {
  if (kind.startsWith("Missing")) return "∅";
  if (kind.startsWith("Malformed")) return "!";
  if (kind.endsWith("Identifier")) return "T";
  if (kind.endsWith("StringLiteral")) return '"';
  if (kind.endsWith("NumericLiteral")) return "#";
  if (kind.endsWith("BooleanLiteral")) return "?";
  if (kind.endsWith("NullLiteral")) return "∅";
  if (/Array/.test(kind)) return "[]";
  if (/Object/.test(kind)) return "{}";
  if (/Call/.test(kind)) return "()";
  if (/(Property|Member)/.test(kind)) return ":";
  if (/(Function|Arrow)/.test(kind)) return "ƒ";
  if (/Class/.test(kind)) return "C";
  if (tone === "declaration") return "◇";
  if (tone === "container") return "□";
  return "·";
}

function containsOffset(range: { start: number; end: number }, offset: number): boolean {
  if (range.start === range.end) return offset === range.start;
  return range.start <= offset && offset <= range.end;
}

function annotationFor(
  node: Omit<AstLensAnnotation, "shortKind" | "icon" | "tone">,
): AstLensAnnotation {
  const tone = toneFor(node.kind, node.recovered);
  return {
    ...node,
    shortKind: node.kind,
    icon: iconFor(node.kind, tone),
    tone,
  };
}

function visualRecoverySite(
  site: AstLensRecoverySite,
  source: string | undefined,
): AstLensRecoverySite & { label?: string } {
  if (!source || site.start !== site.end || site.start === 0) return site;

  let utf16Offset = utf8ByteOffsetToUtf16Offset(source, site.start);
  const parserOffset = utf16Offset;
  while (utf16Offset > 0 && /\s/u.test(source[utf16Offset - 1])) utf16Offset--;
  if (utf16Offset === parserOffset) return site;

  const visualOffset = utf16OffsetToUtf8ByteOffset(source, utf16Offset);
  return {
    ...site,
    start: visualOffset,
    end: visualOffset,
    label: `recovery site · parser offset ${site.start}`,
  };
}

/**
 * Build the full source-range-backed annotation path shown at the editor caret. Metadata recovery
 * sites are appended because punctuation has no typed AST child range of its own.
 */
export function astLensPathAt(
  tree: AstLensTreeNode,
  recoverySites: readonly AstLensRecoverySite[],
  offset: number,
  source?: string,
): AstLensAnnotation[] {
  const treePath = recoveryTreePathAt(tree, offset);
  const nodes: Array<Omit<AstLensAnnotation, "shortKind" | "icon" | "tone">> = treePath.map(
    ({ start, end, kind, label, recovered }) => ({ start, end, kind, label, recovered }),
  );

  const matchingSites = recoverySites
    .map((site) => visualRecoverySite(site, source))
    .filter((site) => containsOffset(site, offset))
    .toSorted((left, right) => {
      const leftWidth = left.end - left.start;
      const rightWidth = right.end - right.start;
      return (
        leftWidth - rightWidth || left.start - right.start || left.kind.localeCompare(right.kind)
      );
    });

  for (const site of matchingSites) {
    const duplicate = nodes.some(
      (node) => node.kind === site.kind && node.start === site.start && node.end === site.end,
    );
    if (!duplicate) nodes.push({ ...site, label: site.label ?? "recovery site", recovered: true });
  }

  const withoutRoot = nodes.filter((node) => node.kind !== "Program");
  return (withoutRoot.length > 0 ? withoutRoot : nodes).map(annotationFor);
}

export function astLensAnnotationsAt(
  tree: AstLensTreeNode,
  recoverySites: readonly AstLensRecoverySite[],
  offset: number,
  source?: string,
): AstLensAnnotation[] {
  return astLensPathAt(tree, recoverySites, offset, source).slice(-MAX_INLINE_AST_ANNOTATIONS);
}

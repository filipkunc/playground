import type { PlaygroundTextRange } from "tsrs-playground";
import type { Range } from "~/utils/range";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8ByteOffsetToUtf16Offset(source: string, byteOffset: number): number {
  const bytes = encoder.encode(source);
  let boundary = Math.max(0, Math.min(Math.trunc(byteOffset), bytes.length));

  while (boundary > 0 && boundary < bytes.length && (bytes[boundary] & 0xc0) === 0x80) {
    boundary--;
  }

  return decoder.decode(bytes.subarray(0, boundary)).length;
}

export function tsrsRangeToMonacoRange(source: string, range: PlaygroundTextRange): Range {
  return [
    utf8ByteOffsetToUtf16Offset(source, range.start),
    utf8ByteOffsetToUtf16Offset(source, range.end),
  ];
}

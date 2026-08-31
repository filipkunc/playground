import { describe, expect, it } from "vite-plus/test";
import {
  tsrsRangeToMonacoRange,
  utf16OffsetToUtf8ByteOffset,
  utf8ByteOffsetToUtf16Offset,
} from "./tsrs";

describe("tsrs UTF-8 diagnostic ranges", () => {
  it("keeps ASCII byte offsets unchanged", () => {
    expect(utf8ByteOffsetToUtf16Offset("const value", 6)).toBe(6);
  });

  it("converts UTF-8 offsets to Monaco UTF-16 offsets", () => {
    const source = "a😀éz";

    expect(utf8ByteOffsetToUtf16Offset(source, 5)).toBe(3);
    expect(tsrsRangeToMonacoRange(source, { start: 5, end: 7 })).toEqual([3, 4]);
  });

  it("floors an offset inside a multibyte code point to its start", () => {
    expect(utf8ByteOffsetToUtf16Offset("a😀z", 3)).toBe(1);
  });

  it("converts a Monaco caret back to an Oxc UTF-8 byte offset", () => {
    const source = "a😀éz";

    expect(utf16OffsetToUtf8ByteOffset(source, 3)).toBe(5);
    expect(utf16OffsetToUtf8ByteOffset(source, 2)).toBe(1);
  });
});

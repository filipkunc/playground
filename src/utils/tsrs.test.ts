import { describe, expect, it } from "vite-plus/test";
import { tsrsRangeToMonacoRange, utf8ByteOffsetToUtf16Offset } from "./tsrs";

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
});

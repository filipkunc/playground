export function checkSource(): never {
  throw new Error(
    "The tsrs checker package is unavailable. Build it from the parent typescript-rs repository.",
  );
}

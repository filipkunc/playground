export const RECOVERY_EXAMPLES = [
  {
    id: "missing-variable-initializer",
    label: "Missing variable initializer",
    code: `
const broken = ;
const intact: number = "wrong";
`.trim(),
  },
  {
    id: "missing-assignment-rhs",
    label: "Missing assignment right-hand side",
    code: `
let target: number = 1;
target = ;
const intact: number = "wrong";
`.trim(),
  },
  {
    id: "missing-object-property-value",
    label: "Missing object property value",
    code: `
type Shape = { missing: number; wrong: number };
const value: Shape = {
  missing: ,
  wrong: "wrong",
};
const intact: number = "also wrong";
`.trim(),
  },
  {
    id: "missing-array-operand",
    label: "Missing array operand",
    code: `
let target: number = 1;
const values: number[] = [target = , "wrong"];
const intact: number = "also wrong";
`.trim(),
  },
  {
    id: "missing-call-argument",
    label: "Missing call argument",
    code: `
function check(first: number, second: number): void {}
check(, "wrong");
const intact: number = "also wrong";
`.trim(),
  },
  {
    id: "missing-list-delimiters",
    label: "Missing list delimiters",
    code: `
type Shape = { first: number; second: number };
const object: Shape = { first: 1 second: "wrong" };
const container = { values: [1, 2 };
function check(first: number, second: number): void {}
check(1 2);
const intact: number = "also wrong";
`.trim(),
  },
  {
    id: "missing-parameter-delimiter",
    label: "Missing parameter delimiter",
    code: `
function format(value: number suffix: string): string {
  return suffix;
}
const result: string = format(1, "ok");
const intact: number = "also wrong";
`.trim(),
  },
  {
    id: "missing-function-body-closer",
    label: "Missing function body closer",
    code: `
const intact: number = "wrong";
function f(): number {
  return 1;
`.trim(),
  },
  {
    id: "missing-return-expression-operand",
    label: "Missing return expression operand",
    code: `
function broken(): number {
  return 1 +
}
const intact: number = "wrong";
`.trim(),
  },
  {
    id: "function-interface-edits",
    label: "Function and interface edits",
    code: `
interface Box { value: number label: string }
declare const box: Box;
box.;
box?.;
function broken(, second: number): void {}
broken("ignored", 1);
const intact: number = "wrong";
interface Unclosed { value: number;
`.trim(),
  },
  {
    id: "missing-class-member-separator",
    label: "Missing class member separator",
    code: `
class Box { first: number = 1 second: string = "ok"; }
const box: Box = new Box();
const first: number = box.first;
const later = 2;
class Unclosed { value: number = 1;
`.trim(),
  },
  {
    id: "stage-five-deletion-recovery",
    label: "Call closer and declaration name deletions",
    code: `
function check(): void {}
check(
const = 1;
const later = 2;
`.trim(),
  },
  {
    id: "missing-type-annotation",
    label: "Missing type annotation",
    code: `
type Shape = { unchecked: ; wrong: number };
const value: Shape = { unchecked: true, wrong: "wrong" };
type Values = number[;
const values: Values = ["wrong"];
const intact: number = "also wrong";
`.trim(),
  },
  {
    id: "malformed-expression",
    label: "Malformed expression",
    code: `
let target: number = 1;
target = ...;
const broken: number = :;
const intact: number = "also wrong";
`.trim(),
  },
] as const;

export const PLAYGROUND_DEMO_CODE = RECOVERY_EXAMPLES[0].code;

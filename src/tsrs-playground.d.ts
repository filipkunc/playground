declare module "tsrs-playground" {
  export interface PlaygroundTextRange {
    start: number;
    end: number;
  }

  export interface PlaygroundDiagnostic {
    code: string;
    message: string;
    phase: string;
    range?: PlaygroundTextRange;
  }

  export function checkSource(fileName: string, sourceText: string): PlaygroundDiagnostic[];
}

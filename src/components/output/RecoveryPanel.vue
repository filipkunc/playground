<script setup lang="ts">
import { computed } from "vue";
import type { PlaygroundDiagnostic } from "tsrs-playground";
import type { RecoveryInspection, RecoveryInspectionDiagnostic } from "~/composables/oxc";
import { useOxc } from "~/composables/oxc";
import { useTsrs } from "~/composables/tsrs";
import { useTypeScriptGo } from "~/composables/typescript-go";
import {
  editorCursor,
  editorValue,
  outputHoverRange,
  outputRevealRange,
  recoveryInspectionMode,
} from "~/composables/state";
import {
  compareRecoveryDiagnostics,
  type DiagnosticEngine,
  type DiagnosticPhase,
  type EngineDiagnostic,
} from "~/utils/recovery-comparison";
import { recoverySummary, recoveryTreePathAt } from "~/utils/recovery";
import { tsrsRangeToMonacoRange, utf16OffsetToUtf8ByteOffset } from "~/utils/tsrs";
import RecoveryTreeNode from "./RecoveryTreeNode.vue";

interface DisplayInspection {
  engine: DiagnosticEngine;
  title: string;
  subtitle: string;
  inspection: RecoveryInspection;
}

const { recoveryInspections } = await useOxc();
const { diagnostics: tsrsDiagnostics } = await useTsrs();
const {
  inspection: typescriptGoInspection,
  status: typescriptGoStatus,
  error: typescriptGoError,
} = await useTypeScriptGo();

const displayInspections = computed<DisplayInspection[]>(() => {
  const normal = recoveryInspections.value.normal;
  const editor = recoveryInspections.value.editor;
  if (recoveryInspectionMode.value === "normal") {
    return normal
      ? [
          {
            engine: "oxc-normal",
            title: "Oxc Normal",
            subtitle: "parser baseline",
            inspection: normal,
          },
        ]
      : [];
  }
  if (recoveryInspectionMode.value === "editor") {
    return editor
      ? [
          {
            engine: "typescript-rust",
            title: "TypeScript-Rust",
            subtitle: "Oxc editor parser + tsrs",
            inspection: editor,
          },
        ]
      : [];
  }

  const inspections: DisplayInspection[] = [];
  if (editor) {
    inspections.push({
      engine: "typescript-rust",
      title: "TypeScript-Rust",
      subtitle: "Oxc editor parser + tsrs",
      inspection: editor,
    });
  }
  if (typescriptGoStatus.value === "available" && typescriptGoInspection.value) {
    inspections.push({
      engine: "typescript-go",
      title: "TypeScript-Go",
      subtitle: `pinned parser + binder + checker · ${shortRevision(typescriptGoInspection.value.revision)}`,
      inspection: typescriptGoInspection.value,
    });
  }
  if (normal) {
    inspections.push({
      engine: "oxc-normal",
      title: "Oxc Normal",
      subtitle: "parser baseline",
      inspection: normal,
    });
  }
  return inspections;
});

const comparisonDiagnostics = computed(() => {
  const diagnostics: EngineDiagnostic[] = tsrsDiagnostics.value.map(tsrsComparableDiagnostic);
  appendInspectionDiagnostics(diagnostics, typescriptGoInspection.value, "typescript-go");
  appendInspectionDiagnostics(diagnostics, recoveryInspections.value.normal, "oxc-normal");
  return diagnostics;
});
const comparisonRows = computed(() => compareRecoveryDiagnostics(comparisonDiagnostics.value));
const referenceErrorMessage = computed(() =>
  typescriptGoError.value instanceof Error
    ? typescriptGoError.value.message
    : String(typescriptGoError.value ?? ""),
);
const caretByteOffset = computed(() =>
  utf16OffsetToUtf8ByteOffset(editorValue.value, editorCursor.value),
);

const comparisonEngines: Array<{ id: DiagnosticEngine; label: string }> = [
  { id: "typescript-rust", label: "TypeScript-Rust" },
  { id: "typescript-go", label: "TypeScript-Go" },
  { id: "oxc-normal", label: "Oxc Normal" },
];

function shortRevision(revision: string | undefined) {
  return revision ? revision.slice(0, 9) : "unknown revision";
}

function tsrsComparableDiagnostic(diagnostic: PlaygroundDiagnostic): EngineDiagnostic {
  return {
    engine: "typescript-rust",
    code: diagnostic.code,
    phase: diagnostic.phase as DiagnosticPhase,
    message: diagnostic.message,
    start: diagnostic.range?.start ?? 0,
    end: diagnostic.range?.end ?? 0,
    recoveryKinds: recoveryKinds(
      recoveryInspections.value.editor,
      diagnostic.range?.start,
      diagnostic.code,
    ),
  };
}

function appendInspectionDiagnostics(
  output: EngineDiagnostic[],
  inspection: RecoveryInspection | undefined,
  engine: DiagnosticEngine,
) {
  if (!inspection) return;
  for (const [index, diagnostic] of inspection.diagnostics.entries()) {
    const label = diagnostic.labels[0];
    output.push({
      engine,
      code: diagnostic.code,
      phase: diagnostic.phase ?? "parse",
      message: diagnostic.message,
      start: label?.start ?? 0,
      end: label?.end ?? 0,
      recoveryKinds: inspection.recoverySites
        .filter((site) => site.diagnosticIndex === index)
        .map((site) => site.kind),
    });
  }
}

function recoveryKinds(
  inspection: RecoveryInspection | undefined,
  start: number | undefined,
  code: string,
) {
  if (!inspection || start === undefined || !code.startsWith("TS1")) return [];
  const diagnosticIndex = inspection.diagnostics.findIndex((diagnostic) =>
    diagnostic.labels.some((label) => label.start === start),
  );
  if (diagnosticIndex < 0) return [];
  return inspection.recoverySites
    .filter((site) => site.diagnosticIndex === diagnosticIndex)
    .map((site) => site.kind);
}

function diagnosticFor(row: (typeof comparisonRows.value)[number], engine: DiagnosticEngine) {
  return row.diagnostics[engine];
}

function cardDiagnostics(display: DisplayInspection): RecoveryInspectionDiagnostic[] {
  if (display.engine !== "typescript-rust") return display.inspection.diagnostics;
  return tsrsDiagnostics.value.map((diagnostic) => ({
    code: diagnostic.code,
    phase: diagnostic.phase as DiagnosticPhase,
    message: diagnostic.message,
    labels: diagnostic.range ? [diagnostic.range] : [],
  }));
}

function highlight(start: number, end: number) {
  outputHoverRange.value = tsrsRangeToMonacoRange(editorValue.value, { start, end });
}

function reveal(start: number, end: number) {
  const range = tsrsRangeToMonacoRange(editorValue.value, { start, end });
  outputHoverRange.value = range;
  outputRevealRange.value = range;
}
</script>

<template>
  <div class="h-full overflow-auto p-4">
    <section
      v-if="recoveryInspectionMode === 'compare'"
      class="mb-4 rounded-md border border-divider"
    >
      <header class="flex flex-wrap items-center gap-2 border-b border-divider px-3 py-2 text-xs">
        <strong class="text-sm">Diagnostics comparison</strong>
        <span class="rounded bg-muted px-2 py-1">{{ comparisonRows.length }} locations</span>
        <span class="text-secondary-foreground">code · phase · recovery representation</span>
      </header>

      <div
        v-if="typescriptGoStatus !== 'available'"
        data-typescript-go-unavailable
        class="px-3 py-3 text-sm text-secondary-foreground"
      >
        <strong class="text-foreground">TypeScript-Go reference {{ typescriptGoStatus }}.</strong>
        Start the compound recovery playground to compare live results.
        <span v-if="referenceErrorMessage" class="mt-1 block font-mono text-xs opacity-70">
          {{ referenceErrorMessage }}
        </span>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-180 border-collapse text-left text-xs">
          <thead>
            <tr class="bg-muted/40">
              <th class="border-b border-divider px-3 py-2 font-medium">Location</th>
              <th
                v-for="engine in comparisonEngines"
                :key="engine.id"
                class="border-b border-l border-divider px-3 py-2 font-medium"
              >
                {{ engine.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in comparisonRows" :key="row.key" :data-comparison-status="row.status">
              <td class="whitespace-nowrap border-b border-divider px-3 py-2 align-top">
                <button
                  type="button"
                  class="font-mono hover:underline"
                  @click="reveal(row.start, row.start)"
                >
                  byte {{ row.start }}
                </button>
                <span class="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono">{{ row.phase }}</span>
                <span
                  class="mt-1 block"
                  :class="{
                    'text-green-600': row.status === 'equal',
                    'text-amber-600': row.status === 'different',
                    'text-red-500': row.status === 'missing',
                  }"
                >
                  {{ row.status }}
                </span>
              </td>
              <td
                v-for="engine in comparisonEngines"
                :key="engine.id"
                class="border-b border-l border-divider px-3 py-2 align-top"
              >
                <button
                  v-if="diagnosticFor(row, engine.id)"
                  type="button"
                  class="block w-full text-left hover:bg-muted/50"
                  @mouseenter="
                    highlight(
                      diagnosticFor(row, engine.id)!.start,
                      diagnosticFor(row, engine.id)!.end,
                    )
                  "
                  @mouseleave="outputHoverRange = undefined"
                  @click="
                    reveal(diagnosticFor(row, engine.id)!.start, diagnosticFor(row, engine.id)!.end)
                  "
                >
                  <span class="font-mono text-red-500">
                    {{ diagnosticFor(row, engine.id)!.code ?? "syntax" }}
                  </span>
                  <span class="ml-2">{{ diagnosticFor(row, engine.id)!.message }}</span>
                  <span
                    v-if="diagnosticFor(row, engine.id)!.recoveryKinds?.length"
                    class="mt-1 block font-mono text-violet-500"
                  >
                    {{ diagnosticFor(row, engine.id)!.recoveryKinds!.join(", ") }}
                  </span>
                </button>
                <span v-else class="text-secondary-foreground">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="grid gap-4">
      <section
        v-for="display in displayInspections"
        :key="display.engine"
        :data-recovery-mode="display.inspection.mode"
        :data-recovery-engine="display.engine"
        :data-recovery-status="display.inspection.status"
        class="min-w-0 rounded-md border border-divider p-3"
      >
        <header class="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <strong class="text-sm">{{ display.title }}</strong>
          <span class="text-secondary-foreground">{{ display.subtitle }}</span>
          <span class="rounded bg-muted px-2 py-1">{{ display.inspection.status }}</span>
          <span>{{ recoverySummary(display.inspection).statementCount }} statements</span>
          <span>{{ recoverySummary(display.inspection).recoverySiteCount }} recovery sites</span>
          <span>{{ cardDiagnostics(display).length }} diagnostics</span>
          <span data-recovery-summary="bindings">
            {{ recoverySummary(display.inspection).bindingCount }} bindings
          </span>
        </header>

        <div v-if="cardDiagnostics(display).length" class="mb-3 space-y-1 text-xs text-red-500">
          <button
            v-for="(diagnostic, index) in cardDiagnostics(display)"
            :key="index"
            type="button"
            class="block text-left hover:underline"
            @mouseenter="
              diagnostic.labels[0] &&
              highlight(diagnostic.labels[0].start, diagnostic.labels[0].end)
            "
            @mouseleave="outputHoverRange = undefined"
            @click="
              diagnostic.labels[0] && reveal(diagnostic.labels[0].start, diagnostic.labels[0].end)
            "
          >
            <span class="font-mono">{{ diagnostic.code ?? "syntax" }}</span>
            <span v-if="diagnostic.phase" class="ml-1 rounded bg-muted px-1 py-0.5 font-mono">
              {{ diagnostic.phase }}
            </span>
            <span class="ml-1">{{ diagnostic.message }}</span>
          </button>
        </div>

        <RecoveryTreeNode
          :node="display.inspection.tree"
          :active-path="recoveryTreePathAt(display.inspection.tree, caretByteOffset)"
        />

        <div
          v-if="display.inspection.recoverySites.length"
          class="mt-4 border-t border-divider pt-3"
        >
          <h3 class="mb-1 text-xs font-medium">Recovery sites</h3>
          <button
            v-for="(site, index) in display.inspection.recoverySites"
            :key="`${site.kind}-${site.start}-${index}`"
            type="button"
            :data-recovery-site-kind="site.kind"
            class="block font-mono text-xs text-red-500 hover:underline"
            @mouseenter="highlight(site.start, site.end)"
            @mouseleave="outputHoverRange = undefined"
            @click="reveal(site.start, site.end)"
          >
            {{ site.kind }} [{{ site.start }}, {{ site.end }}]
            <span class="text-secondary-foreground">under {{ site.parentPath.join(" › ") }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

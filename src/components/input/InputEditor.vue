<script setup lang="ts">
import * as monaco from "monaco-editor/editor/editor.api";
import { computed, ref, useTemplateRef, watchEffect } from "vue";
import { useOxc } from "~/composables/oxc";
import { useTsrs } from "~/composables/tsrs";
import { useTypeScriptGo } from "~/composables/typescript-go";
import { editorCursor, editorValue, recoveryInspectionMode } from "~/composables/state";
import { astLensPathAt, MAX_INLINE_AST_ANNOTATIONS } from "~/utils/ast-lens";
import { tsrsRangeToMonacoRange, utf16OffsetToUtf8ByteOffset } from "~/utils/tsrs";
import MonacoEditor from "../MonacoEditor.vue";
import AstCaretInspector from "./AstCaretInspector.vue";

defineProps<{
  language: string;
  filename: string;
  main?: boolean;
}>();

const { activeRecoveryInspection, oxc } = await useOxc();
const { diagnostics: tsrsDiagnostics } = await useTsrs();
const { inspection: typescriptGoInspection, status: typescriptGoStatus } = await useTypeScriptGo();

const monacoRef = useTemplateRef("monacoRef");
const getPositionAt = computed(() => monacoRef.value?.getPositionAt);
const markers = ref<monaco.editor.IMarkerData[]>([]);
const astLensEnabled = ref(true);
const astPath = computed(() => {
  const inspection = activeRecoveryInspection.value;
  if (!inspection) return [];
  const byteOffset = utf16OffsetToUtf8ByteOffset(editorValue.value, editorCursor.value);
  return astLensPathAt(inspection.tree, inspection.recoverySites, byteOffset, editorValue.value);
});
const astAnnotations = computed(() => astPath.value.slice(-MAX_INLINE_AST_ANNOTATIONS));

watchEffect(() => {
  const getPos = getPositionAt.value;
  if (!getPos) return;

  const inspection = activeRecoveryInspection.value;
  const batchOxcMarkers =
    inspection?.status === "clean"
      ? oxc.value.getDiagnostics().map((diagnostic) => {
          const label = diagnostic.labels[0];
          const [start, end] = label ? tsrsRangeToMonacoRange(editorValue.value, label) : [0, 0];
          const startPos = getPos(start);
          const endPos = getPos(end);
          return {
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
            message: diagnostic.message,
            source: "Oxc",
          };
        })
      : [];
  const oxcMarkers =
    recoveryInspectionMode.value === "normal"
      ? (inspection?.diagnostics ?? []).map((diagnostic) => {
          const label = diagnostic.labels[0];
          const [start, end] = label ? tsrsRangeToMonacoRange(editorValue.value, label) : [0, 0];
          const startPos = getPos(start);
          const endPos = getPos(end);
          return {
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
            message: diagnostic.message,
            source: "Oxc Normal (parse)",
            code: diagnostic.code,
          };
        })
      : [];
  const tsrsMarkers = tsrsDiagnostics.value.map((diagnostic) => {
    const [start, end] = diagnostic.range
      ? tsrsRangeToMonacoRange(editorValue.value, diagnostic.range)
      : [0, 0];
    const startPos = getPos(start);
    const endPos = getPos(end);
    return {
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
      message: diagnostic.message,
      source: `TypeScript-Rust (${diagnostic.phase})`,
      code: diagnostic.code,
    };
  });
  const typescriptGoMarkers =
    recoveryInspectionMode.value === "compare" && typescriptGoStatus.value === "available"
      ? (typescriptGoInspection.value?.diagnostics ?? []).map((diagnostic) => {
          const label = diagnostic.labels[0];
          const [start, end] = label ? tsrsRangeToMonacoRange(editorValue.value, label) : [0, 0];
          const startPos = getPos(start);
          const endPos = getPos(end);
          return {
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
            message: diagnostic.message,
            source: `TypeScript-Go (${diagnostic.phase ?? "parse"})`,
            code: diagnostic.code,
          };
        })
      : [];
  markers.value = [...batchOxcMarkers, ...oxcMarkers, ...tsrsMarkers, ...typescriptGoMarkers];
});
</script>

<template>
  <div class="h-full min-h-0 w-full flex flex-col">
    <div class="min-h-0 flex-1">
      <MonacoEditor
        ref="monacoRef"
        v-model="editorValue"
        :language="language"
        :filename
        :markers
        :main
        :ast-annotations="main && astLensEnabled ? astAnnotations : []"
      />
    </div>
    <AstCaretInspector
      v-if="main"
      :annotations="astLensEnabled ? astPath : []"
      :source="editorValue"
      :enabled="astLensEnabled"
      @toggle="astLensEnabled = !astLensEnabled"
    />
  </div>
</template>

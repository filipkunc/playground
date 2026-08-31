<script setup lang="ts">
import * as monaco from "monaco-editor/editor/editor.api";
import { computed, ref, useTemplateRef, watchEffect } from "vue";
import { useOxc } from "~/composables/oxc";
import { useTsrs } from "~/composables/tsrs";
import { editorCursor, editorValue } from "~/composables/state";
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
  const diagnostics =
    inspection?.status === "clean" ? oxc.value.getDiagnostics() : (inspection?.diagnostics ?? []);
  const oxcMarkers = diagnostics.map((diagnostic) => {
    const label = diagnostic.labels[0];
    const startPos = getPos(label?.start ?? 0);
    const endPos = getPos(label?.end ?? 0);
    return {
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
      message: `Oxc Error: ${diagnostic.message}`,
      source: "oxc",
    };
  });
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
      source: `tsrs (${diagnostic.phase})`,
      code: diagnostic.code,
    };
  });
  markers.value = [...oxcMarkers, ...tsrsMarkers];
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

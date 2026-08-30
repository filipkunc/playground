<script setup lang="ts">
import * as monaco from "monaco-editor/editor/editor.api";
import { computed, ref, useTemplateRef, watchEffect } from "vue";
import { useOxc } from "~/composables/oxc";
import { editorValue } from "~/composables/state";
import MonacoEditor from "../MonacoEditor.vue";

defineProps<{
  language: string;
  filename: string;
  main?: boolean;
}>();

const { activeRecoveryInspection, oxc } = await useOxc();

const monacoRef = useTemplateRef("monacoRef");
const getPositionAt = computed(() => monacoRef.value?.getPositionAt);
const markers = ref<monaco.editor.IMarkerData[]>([]);

watchEffect(() => {
  const getPos = getPositionAt.value;
  if (!getPos) return;

  const inspection = activeRecoveryInspection.value;
  const diagnostics =
    inspection?.status === "clean" ? oxc.value.getDiagnostics() : (inspection?.diagnostics ?? []);
  markers.value = diagnostics.map((diagnostic) => {
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
    };
  });
});
</script>

<template>
  <MonacoEditor
    ref="monacoRef"
    v-model="editorValue"
    :language="language"
    :filename
    :markers
    :main
  />
</template>

import { useDark } from "@vueuse/core";
import { reactive, ref } from "vue";
import type { Range } from "~/utils/range";
import type { RecoveryInspectionMode } from "~/utils/recovery";

export const dark = useDark();
export const editorValue = ref("");
export const selectedRecoveryExample = ref("");
export const recoveryInspectionMode = ref<RecoveryInspectionMode>("compare");

export const editorCursor = ref(0);
export const autoFocus = ref(true);
export const outputHoverRange = ref<Range>();
export const outputRevealRange = ref<Range>();

// Active tab state for output panel
export const activeTab = ref("recovery");

// Formatter panel checkbox states
export const formatterPanels = reactive({
  output: true,
  ir: false,
  prettier: false,
  prettierDoc: false,
});

// Enabled lint rules
export const enabledLintRules = ref<string[]>([]);

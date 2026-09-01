<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(defineProps<{ open: boolean; title: string; closeLabel?: string }>(), {
  closeLabel: "Schließen",
});
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;

function close() { emit("close"); }
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") return close();
  if (event.key !== "Tab" || !dialog.value) return;
  const focusable = Array.from(dialog.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
  if (!focusable.length) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
watch(() => props.open, async (open) => {
  if (open) { previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; await nextTick(); dialog.value?.querySelector<HTMLElement>("[data-autofocus], input, select, textarea, button")?.focus(); }
  else previousFocus?.focus();
});
onMounted(() => document.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" @click.self="close">
    <section ref="dialog" role="dialog" aria-modal="true" :aria-label="title" class="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <div class="mb-4 flex items-start justify-between gap-3">
        <h2 class="text-lg font-semibold text-brand-800">{{ title }}</h2>
        <button type="button" class="btn-ghost -mr-2 -mt-2" :aria-label="closeLabel" @click="close">×</button>
      </div>
      <slot />
    </section>
  </div>
</template>

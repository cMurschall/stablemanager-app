<script setup lang="ts">
import AppDialog from "@/components/AppDialog.vue";
defineProps<{ open: boolean; title: string; message: string; confirmLabel: string }>();
const emit = defineEmits<{ close: []; confirm: [] }>();
</script>
<template>
  <AppDialog :open="open" :title="title" @close="emit('close')">
    <p class="text-sm text-stone-600">{{ message }}</p>
    <div class="mt-5 flex gap-2"><button type="button" class="btn-ghost flex-1" @click="emit('close')">Abbrechen</button><button type="button" data-autofocus class="btn-danger flex-1" @click="emit('confirm')">{{ confirmLabel }}</button></div>
  </AppDialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { Accommodation, Horse } from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();

const accommodations = ref<Accommodation[]>([]);
const horses = ref<Horse[]>([]);
const loading = ref(true);
const error = ref("");

function horsesIn(accommodationId: string) {
  return horses.value.filter((h) => h.accommodationId === accommodationId);
}

function capacityLabel(row: Accommodation) {
  if (row.kind === "box") return "1";
  return row.capacity != null ? String(row.capacity) : "—";
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [a, h] = await Promise.all([
      api<{ accommodations: Accommodation[] }>("/api/housing/accommodations"),
      api<{ horses: Horse[] }>("/api/horses"),
    ]);
    accommodations.value = a.accommodations;
    horses.value = h.horses;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h1 class="text-xl font-semibold text-brand-800">{{ t("housing.title") }}</h1>
      <RouterLink
        v-if="auth.isAdmin"
        to="/hof?tab=housing"
        class="btn-ghost"
      >
        {{ t("housing.manageInHof") }}
      </RouterLink>
    </div>
    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <section class="groupbox">
      <h2 class="font-medium text-stone-800">{{ t("housing.accommodations") }}</h2>
      <ul class="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
        <li
          v-for="row in accommodations"
          :key="row.id"
          class="px-4 py-3"
        >
          <div class="min-w-0">
            <p class="font-medium">
              {{ row.name }}
              <span
                class="ml-1 rounded-full px-2 py-0.5 text-xs font-medium"
                :class="row.active ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'"
              >{{ row.active ? t("housing.active") : t("housing.inactive") }}</span>
            </p>
            <p class="text-xs text-stone-500">
              {{ t(`accommodationKind.${row.kind}`) }}
              · {{ t("housing.occupied") }}:
              {{ horsesIn(row.id).length }}
              /
              {{ capacityLabel(row) }}
            </p>
            <p v-if="row.notes" class="text-xs text-stone-500">{{ row.notes }}</p>
            <p v-if="!row.active" class="text-xs text-stone-500">{{ t("housing.inactiveHint") }}</p>
            <p class="mt-2 text-xs font-medium text-stone-600">
              {{ t("housing.currentHerd") }}
            </p>
            <div
              v-if="horsesIn(row.id).length"
              class="mt-1 flex flex-wrap gap-2"
            >
              <RouterLink
                v-for="h in horsesIn(row.id)"
                :key="h.id"
                :to="`/horses/${h.id}`"
                class="btn-ghost"
              >
                {{ h.name }}
              </RouterLink>
            </div>
            <p v-else class="text-sm text-stone-400">{{ t("housing.emptyHerd") }}</p>
          </div>
        </li>
        <li v-if="!accommodations.length" class="px-4 py-3 text-sm text-stone-500">
          {{ t("common.empty") }}
        </li>
      </ul>
    </section>
  </div>
</template>

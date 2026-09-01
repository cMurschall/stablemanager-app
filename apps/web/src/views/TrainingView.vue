<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { api } from "@/lib/api";
import {
  addMonths,
  dayKey,
  formatLocalDate,
  formatMonthLabel,
  monthBounds,
  monthKey,
  startOfMonth,
} from "@/lib/dates";
import { useAuthStore } from "@/stores/auth";
import HorseSelect from "@/components/HorseSelect.vue";
import type { Horse, TrainingLog, TrainingType } from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const viewMode = ref<"day" | "month">("day");
const selectedDate = ref(dayKey(new Date()));
const selectedMonth = ref(monthKey(new Date()));
const filterHorseId = ref("");
const logs = ref<TrainingLog[]>([]);
const horses = ref<Horse[]>([]);
const trainingTypes = ref<TrainingType[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const showForm = ref(false);
const editingId = ref<string | null>(null);

const form = ref({
  horseId: "",
  date: dayKey(new Date()),
  type: "",
  notes: "",
});

type HorseGroup = {
  horseId: string;
  horseName: string;
  entries: TrainingLog[];
};

const dayGroups = computed((): HorseGroup[] => {
  const map = new Map<string, HorseGroup>();
  for (const log of logs.value) {
    let group = map.get(log.horseId);
    if (!group) {
      group = { horseId: log.horseId, horseName: log.horseName, entries: [] };
      map.set(log.horseId, group);
    }
    group.entries.push(log);
  }
  return [...map.values()].sort((a, b) =>
    a.horseName.localeCompare(b.horseName, "de"),
  );
});

const monthDaySections = computed(() => {
  const map = new Map<string, TrainingLog[]>();
  for (const log of logs.value) {
    const list = map.get(log.date) ?? [];
    list.push(log);
    map.set(log.date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => ({ date, entries }));
});

function syncQuery() {
  const query: Record<string, string> = { view: viewMode.value };
  if (viewMode.value === "day") {
    query.date = selectedDate.value;
  } else {
    query.month = selectedMonth.value;
    if (filterHorseId.value) query.horseId = filterHorseId.value;
  }
  void router.replace({ query });
}

function applyRouteQuery() {
  const view = route.query.view === "month" ? "month" : "day";
  viewMode.value = view;
  if (typeof route.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date)) {
    selectedDate.value = route.query.date;
  }
  if (typeof route.query.month === "string" && /^\d{4}-\d{2}$/.test(route.query.month)) {
    selectedMonth.value = route.query.month;
  } else if (typeof route.query.horseId === "string" && view === "month") {
    selectedMonth.value = monthKey(new Date());
  }
  if (typeof route.query.horseId === "string") {
    filterHorseId.value = route.query.horseId;
    if (view === "day" && route.query.view === "month") {
      /* keep */
    }
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const horsePromise = api<{ horses: Horse[] }>("/api/horses").then((r) => {
      horses.value = r.horses;
    });
    const trainingTypePromise = api<{ trainingTypes: TrainingType[] }>(
      "/api/tenants/training-types",
    ).then((r) => {
      trainingTypes.value = r.trainingTypes;
    });

    let url: string;
    if (viewMode.value === "day") {
      url = `/api/training-logs?date=${selectedDate.value}`;
    } else {
      const { from, to } = monthBounds(selectedMonth.value);
      url = `/api/training-logs?from=${from}&to=${to}`;
      if (filterHorseId.value) {
        url += `&horseId=${filterHorseId.value}`;
      }
    }

    const [logsRes] = await Promise.all([
      api<{ trainingLogs: TrainingLog[] }>(url),
      horsePromise,
      trainingTypePromise,
    ]);
    logs.value = logsRes.trainingLogs;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

function setView(mode: "day" | "month") {
  viewMode.value = mode;
  syncQuery();
  void load();
}

function moveDay(amount: number) {
  const date = new Date(`${selectedDate.value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  selectedDate.value = dayKey(date);
  syncQuery();
  void load();
}

function moveMonth(amount: number) {
  const base = startOfMonth(
    new Date(`${selectedMonth.value}-01T00:00:00`),
  );
  selectedMonth.value = monthKey(addMonths(base, amount));
  syncQuery();
  void load();
}

function onDateChange() {
  syncQuery();
  void load();
}

function onMonthFilterChange() {
  syncQuery();
  void load();
}

function openCreate() {
  editingId.value = null;
  form.value = {
    horseId: filterHorseId.value || horses.value[0]?.id || "",
    date: viewMode.value === "day" ? selectedDate.value : dayKey(new Date()),
    type: trainingTypes.value[0]?.name ?? "",
    notes: "",
  };
  showForm.value = true;
}

function openEdit(log: TrainingLog) {
  editingId.value = log.id;
  form.value = {
    horseId: log.horseId,
    date: log.date,
    type: log.type,
    notes: log.notes ?? "",
  };
  showForm.value = true;
}

async function saveEntry() {
  saving.value = true;
  error.value = "";
  try {
    if (editingId.value) {
      await api(`/api/training-logs/${editingId.value}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: form.value.date,
          type: form.value.type,
          notes: form.value.notes.trim() || null,
        }),
      });
    } else {
      await api("/api/training-logs", {
        method: "POST",
        body: JSON.stringify({
          horseId: form.value.horseId,
          date: form.value.date,
          type: form.value.type,
          notes: form.value.notes.trim() || null,
        }),
      });
    }
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function removeEntry(log: TrainingLog) {
  if (!confirm(t("common.confirmDelete"))) return;
  try {
    await api(`/api/training-logs/${log.id}`, { method: "DELETE" });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

function typeLabel(type: string) {
  return type;
}

onMounted(() => {
  applyRouteQuery();
  void load();
});

watch(
  () => route.query,
  () => {
    applyRouteQuery();
  },
);
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-brand-800">
        {{ t("training.title") }}
      </h1>
      <button
        v-if="auth.canWrite"
        type="button"
        class="btn-primary"
        @click="openCreate"
      >
        {{ t("training.newEntry") }}
      </button>
    </div>

    <section class="groupbox w-fit">
      <h2 class="sr-only">Ansicht wählen</h2>
    <div class="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm">
      <button
        type="button"
        class="rounded-md px-3 py-1"
        :class="
          viewMode === 'day'
            ? 'bg-white font-medium shadow-sm'
            : 'text-stone-600'
        "
        @click="setView('day')"
      >
        {{ t("training.viewDay") }}
      </button>
      <button
        type="button"
        class="rounded-md px-3 py-1"
        :class="
          viewMode === 'month'
            ? 'bg-white font-medium shadow-sm'
            : 'text-stone-600'
        "
        @click="setView('month')"
      >
        {{ t("training.viewMonth") }}
      </button>
    </div>
    </section>

    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <template v-if="viewMode === 'day'">
      <div
        class="flex items-center justify-between gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2"
      >
        <button type="button" class="btn-ghost" @click="moveDay(-1)">
          ‹ {{ t("common.previous") }}
        </button>
        <input
          v-model="selectedDate"
          type="date"
          class="field w-auto"
          @change="onDateChange"
        />
        <button type="button" class="btn-ghost" @click="moveDay(1)">
          {{ t("common.next") }} ›
        </button>
      </div>

      <ul class="space-y-3">
        <li
          v-for="group in dayGroups"
          :key="group.horseId"
          class="rounded-2xl border border-stone-200 bg-white p-4"
        >
          <p class="font-medium text-stone-800">{{ group.horseName }}</p>
          <ul class="mt-2 space-y-2">
            <li
              v-for="entry in group.entries"
              :key="entry.id"
              class="flex items-start justify-between gap-3 border-t border-stone-100 pt-2 first:border-0 first:pt-0"
            >
              <div>
                <span
                  class="inline-block rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800"
                >
                  {{ typeLabel(entry.type) }}
                </span>
                <p v-if="entry.notes" class="mt-1 text-sm text-stone-600">
                  {{ entry.notes }}
                </p>
                <p v-if="entry.createdByName" class="mt-0.5 text-xs text-stone-400">
                  {{ entry.createdByName }}
                </p>
              </div>
              <div v-if="auth.canWrite" class="flex shrink-0 gap-2 text-sm">
                <button
                  type="button"
                  class="text-brand-700 hover:underline"
                  @click="openEdit(entry)"
                >
                  {{ t("common.edit") }}
                </button>
                <button
                  type="button"
                  class="text-red-700 hover:underline"
                  @click="removeEntry(entry)"
                >
                  {{ t("common.delete") }}
                </button>
              </div>
            </li>
          </ul>
        </li>
        <li
          v-if="!loading && !dayGroups.length"
          class="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500"
        >
          {{ t("training.emptyDay") }}
        </li>
      </ul>
    </template>

    <template v-else>
      <div
        class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2"
      >
        <button type="button" class="btn-ghost" @click="moveMonth(-1)">
          ‹ {{ t("common.previous") }}
        </button>
        <p class="text-sm font-medium text-stone-700 capitalize">
          {{ formatMonthLabel(selectedMonth) }}
        </p>
        <button type="button" class="btn-ghost" @click="moveMonth(1)">
          {{ t("common.next") }} ›
        </button>
      </div>

      <label class="block text-sm font-medium">
        {{ t("training.filterHorse") }}
        <HorseSelect
          v-model="filterHorseId"
          :horses="horses"
          include-all
          :all-label="t('training.allHorses')"
          @change="onMonthFilterChange"
        />
      </label>

      <div class="space-y-4">
        <section
          v-for="section in monthDaySections"
          :key="section.date"
          class="rounded-2xl border border-stone-200 bg-white p-4"
        >
          <h2 class="text-sm font-medium text-stone-800">
            {{ formatLocalDate(section.date) }}
          </h2>
          <ul class="mt-2 space-y-2">
            <li
              v-for="entry in section.entries"
              :key="entry.id"
              class="flex items-start justify-between gap-3 text-sm"
            >
              <div>
                <span class="font-medium">{{ entry.horseName }}</span>
                <span
                  class="ml-2 inline-block rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800"
                >
                  {{ typeLabel(entry.type) }}
                </span>
                <p v-if="entry.notes" class="mt-0.5 text-stone-600">
                  {{ entry.notes }}
                </p>
              </div>
              <div v-if="auth.canWrite" class="flex shrink-0 gap-2">
                <button
                  type="button"
                  class="text-brand-700 hover:underline"
                  @click="openEdit(entry)"
                >
                  {{ t("common.edit") }}
                </button>
                <button
                  type="button"
                  class="text-red-700 hover:underline"
                  @click="removeEntry(entry)"
                >
                  {{ t("common.delete") }}
                </button>
              </div>
            </li>
          </ul>
        </section>
        <p
          v-if="!loading && !monthDaySections.length"
          class="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500"
        >
          {{ t("training.emptyMonth") }}
        </p>
      </div>
    </template>

    <div
      v-if="showForm"
      class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      @click.self="showForm = false"
    >
      <form
        class="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        @submit.prevent="saveEntry"
      >
        <h2 class="text-lg font-semibold text-brand-800">
          {{ editingId ? t("training.editEntry") : t("training.newEntry") }}
        </h2>
        <div class="mt-4 grid gap-3">
          <label v-if="!editingId" class="text-sm font-medium">
            {{ t("training.horse") }}
            <HorseSelect v-model="form.horseId" :horses="horses" required />
          </label>
          <label class="text-sm font-medium">
            {{ t("training.date") }}
            <input v-model="form.date" type="date" required class="field mt-1" />
          </label>
          <label class="text-sm font-medium">
            {{ t("training.activity") }}
            <select v-model="form.type" required class="field mt-1">
              <option v-for="trainingType in trainingTypes" :key="trainingType.id" :value="trainingType.name">
                {{ trainingType.name }}
              </option>
            </select>
          </label>
          <label class="text-sm font-medium">
            {{ t("training.notes") }}
            <textarea v-model="form.notes" rows="3" class="field mt-1" />
          </label>
        </div>
        <div class="mt-5 flex gap-2">
          <button
            type="button"
            class="btn-ghost flex-1"
            @click="showForm = false"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            type="submit"
            class="btn-primary flex-1"
            :disabled="saving"
          >
            {{ saving ? t("common.loading") : t("common.save") }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

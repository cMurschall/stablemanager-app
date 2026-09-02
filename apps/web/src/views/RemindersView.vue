<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { CareEventType } from "@stablemanager/shared";
import { api } from "@/lib/api";
import {
  formatDateTime,
  fromLocalInputValue,
  toLocalInputValue,
} from "@/lib/dates";
import { useAuthStore } from "@/stores/auth";
import AppDialog from "@/components/AppDialog.vue";
import HorseSelect from "@/components/HorseSelect.vue";
import type { CareEvent, Horse } from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();

const careEvents = ref<CareEvent[]>([]);
const horses = ref<Horse[]>([]);
const loading = ref(true);
const error = ref("");
const showForm = ref(false);
const saving = ref(false);

const form = ref({
  horseId: "",
  type: "farrier" as CareEventType,
  dueAt: "",
  intervalDays: "" as string | number,
  notes: "",
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [care, h] = await Promise.all([
      api<{ careEvents: CareEvent[] }>("/api/care-events?status=open"),
      api<{ horses: Horse[] }>("/api/horses"),
    ]);
    careEvents.value = care.careEvents;
    horses.value = h.horses;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  const due = new Date();
  due.setDate(due.getDate() + 7);
  due.setMinutes(0, 0, 0);
  form.value = {
    horseId: horses.value[0]?.id ?? "",
    type: "farrier",
    dueAt: toLocalInputValue(due.toISOString()),
    intervalDays: "",
    notes: "",
  };
  showForm.value = true;
}

async function createEvent() {
  saving.value = true;
  error.value = "";
  try {
    const interval =
      form.value.intervalDays === "" ? null : Number(form.value.intervalDays);
    await api("/api/care-events", {
      method: "POST",
      body: JSON.stringify({
        horseId: form.value.horseId,
        type: form.value.type,
        dueAt: fromLocalInputValue(form.value.dueAt),
        intervalDays: Number.isFinite(interval) ? interval : null,
        notes: form.value.notes.trim() || null,
      }),
    });
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function complete(id: string) {
  try {
    await api(`/api/care-events/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ createNext: true }),
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-brand-800">
        {{ t("reminders.title") }}
      </h1>
      <button
        v-if="auth.canWrite"
        type="button"
        class="btn-primary"
        @click="openCreate"
      >
        {{ t("reminders.newEvent") }}
      </button>
    </div>

    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <section class="groupbox">
      <h2 class="groupbox-title">{{ t("reminders.careEvents") }}</h2>
      <ul
        class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white"
      >
        <li
          v-for="ev in careEvents"
          :key="ev.id"
          class="flex items-start justify-between gap-3 px-4 py-3"
        >
          <div>
            <p class="font-medium">
              {{ t(`care.${ev.type}`) }} · {{ ev.horseName }}
            </p>
            <p class="text-xs text-stone-500">
              {{ t("reminders.dueAt") }}: {{ formatDateTime(ev.dueAt) }}
              <span v-if="ev.intervalDays">
                · alle {{ ev.intervalDays }} Tage
              </span>
            </p>
            <p v-if="ev.notes" class="mt-1 text-sm text-stone-600">
              {{ ev.notes }}
            </p>
          </div>
          <button
            v-if="auth.canWrite"
            type="button"
            class="btn-primary shrink-0"
            @click="complete(ev.id)"
          >
            {{ t("common.complete") }}
          </button>
        </li>
        <li v-if="!careEvents.length" class="px-4 py-3 text-sm text-stone-500">
          <p>{{ t("reminders.noneCare") }}</p>
          <p v-if="auth.canWrite" class="mt-1 text-stone-500">
            {{ t("reminders.noneCareHint") }}
          </p>
          <button
            v-if="auth.canWrite"
            type="button"
            class="btn-primary mt-3"
            @click="openCreate"
          >
            {{ t("reminders.newEvent") }}
          </button>
        </li>
      </ul>
    </section>

    <AppDialog
      :open="showForm"
      :title="t('reminders.newEvent')"
      @close="showForm = false"
    >
      <form class="grid gap-3" @submit.prevent="createEvent">
        <label class="text-sm font-medium">
          {{ t("reminders.horse") }}
          <HorseSelect v-model="form.horseId" :horses="horses" required />
        </label>
        <label class="text-sm font-medium">
          {{ t("reminders.type") }}
          <select v-model="form.type" class="field mt-1">
            <option value="farrier">{{ t("care.farrier") }}</option>
            <option value="vaccination">{{ t("care.vaccination") }}</option>
          </select>
        </label>
        <label class="text-sm font-medium">
          {{ t("reminders.dueAt") }}
          <input
            v-model="form.dueAt"
            type="datetime-local"
            required
            class="field mt-1"
          />
        </label>
        <label class="text-sm font-medium">
          {{ t("reminders.intervalDays") }}
          <input
            v-model="form.intervalDays"
            type="number"
            min="1"
            max="730"
            class="field mt-1"
          />
        </label>
        <label class="text-sm font-medium">
          {{ t("reminders.notes") }}
          <textarea v-model="form.notes" rows="2" class="field mt-1" />
        </label>
        <div class="mt-2 flex gap-2">
          <button type="button" class="btn-ghost flex-1" @click="showForm = false">
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ saving ? t("common.loading") : t("common.create") }}
          </button>
        </div>
      </form>
    </AppDialog>
  </div>
</template>

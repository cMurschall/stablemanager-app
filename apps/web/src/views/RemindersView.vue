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
import type { CareEvent, Horse, Notification } from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();

const careEvents = ref<CareEvent[]>([]);
const notifications = ref<Notification[]>([]);
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
    const [care, notif, h] = await Promise.all([
      api<{ careEvents: CareEvent[] }>("/api/care-events?status=open"),
      api<{ notifications: Notification[]; unreadCount: number }>(
        "/api/notifications",
      ),
      api<{ horses: Horse[] }>("/api/horses"),
    ]);
    careEvents.value = care.careEvents;
    notifications.value = notif.notifications;
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

async function markRead(id: string) {
  try {
    await api(`/api/notifications/${id}/read`, { method: "POST" });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

async function markAllRead() {
  try {
    await api("/api/notifications/read-all", { method: "POST" });
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

    <section class="space-y-3">
      <h2 class="font-medium text-stone-800">{{ t("reminders.careEvents") }}</h2>
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
          {{ t("reminders.noneCare") }}
        </li>
      </ul>
    </section>

    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="font-medium text-stone-800">
          {{ t("reminders.notifications") }}
        </h2>
        <button
          v-if="notifications.some((n) => !n.readAt)"
          type="button"
          class="text-sm text-brand-700"
          @click="markAllRead"
        >
          {{ t("common.markAllRead") }}
        </button>
      </div>
      <ul
        class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white"
      >
        <li
          v-for="n in notifications"
          :key="n.id"
          class="flex items-start justify-between gap-3 px-4 py-3"
          :class="!n.readAt ? 'bg-brand-50/50' : ''"
        >
          <div>
            <p class="font-medium">
              <span v-if="!n.readAt" class="mr-1 text-xs text-brand-700">
                {{ t("common.unread") }}
              </span>
              {{ n.title }}
            </p>
            <p v-if="n.body" class="text-sm text-stone-600">{{ n.body }}</p>
            <p class="text-xs text-stone-500">
              {{ formatDateTime(n.createdAt) }}
            </p>
          </div>
          <button
            v-if="!n.readAt"
            type="button"
            class="text-sm text-brand-700"
            @click="markRead(n.id)"
          >
            {{ t("common.markRead") }}
          </button>
        </li>
        <li
          v-if="!notifications.length"
          class="px-4 py-3 text-sm text-stone-500"
        >
          {{ t("reminders.noneNotif") }}
        </li>
      </ul>
    </section>

    <div
      v-if="showForm"
      class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      @click.self="showForm = false"
    >
      <form
        class="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        @submit.prevent="createEvent"
      >
        <h2 class="text-lg font-semibold text-brand-800">
          {{ t("reminders.newEvent") }}
        </h2>
        <div class="mt-4 grid gap-3">
          <label class="text-sm font-medium">
            {{ t("reminders.horse") }}
            <select v-model="form.horseId" required class="field mt-1">
              <option v-for="h in horses" :key="h.id" :value="h.id">
                {{ h.name }}
              </option>
            </select>
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
        </div>
        <div class="mt-5 flex gap-2">
          <button type="button" class="btn-ghost flex-1" @click="showForm = false">
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ saving ? t("common.loading") : t("common.create") }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

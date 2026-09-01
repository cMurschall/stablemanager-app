<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "@/lib/api";
import {
  addDays,
  dayKey,
  formatDate,
  formatTime,
  fromLocalInputValue,
  startOfWeek,
  toIso,
  toLocalInputValue,
} from "@/lib/dates";
import { useAuthStore } from "@/stores/auth";
import type { Booking, Member, Resource } from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();

const weekStart = ref(startOfWeek());
const bookings = ref<Booking[]>([]);
const resources = ref<Resource[]>([]);
const members = ref<Member[]>([]);
const loading = ref(true);
const error = ref("");
const showForm = ref(false);
const saving = ref(false);

const form = ref({
  resourceId: "",
  title: "",
  startsAt: "",
  endsAt: "",
  notes: "",
  participantUserIds: [] as string[],
});

const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => addDays(weekStart.value, i)),
);

const weekLabel = computed(() => {
  const end = addDays(weekStart.value, 6);
  return `${formatDate(toIso(weekStart.value))} – ${formatDate(toIso(end))}`;
});

const trackResources = computed(() => resources.value);

function bookingsForDay(day: Date): Booking[] {
  const key = dayKey(day);
  return bookings.value.filter((b) => dayKey(new Date(b.startsAt)) === key);
}

function bookingsFor(day: Date, resourceId: string): Booking[] {
  return bookingsForDay(day)
    .filter((booking) => booking.resourceId === resourceId)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

async function loadMeta() {
  const r = await api<{ resources: Resource[] }>("/api/tenants/resources");
  resources.value = r.resources;
  if (auth.canWrite) {
    const result = await api<{ members: Member[] }>("/api/tenants/members");
    members.value = result.members.filter(
      (member) => member.role === "boarder" || member.role === "staff",
    );
  }
}

async function loadBookings() {
  loading.value = true;
  error.value = "";
  try {
    const from = toIso(weekStart.value);
    const to = toIso(addDays(weekStart.value, 7));
    const data = await api<{ bookings: Booking[] }>(
      `/api/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    bookings.value = data.bookings;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

function prevWeek() {
  weekStart.value = addDays(weekStart.value, -7);
}

function nextWeek() {
  weekStart.value = addDays(weekStart.value, 7);
}

function openCreate(day?: Date, resourceId?: string) {
  const start = day ? new Date(day) : new Date();
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(11, 0, 0, 0);
  form.value = {
    resourceId: resourceId ?? trackResources.value[0]?.id ?? "",
    title: "Reitunterricht",
    startsAt: toLocalInputValue(start.toISOString()),
    endsAt: toLocalInputValue(end.toISOString()),
    notes: "",
    participantUserIds: [],
  };
  showForm.value = true;
}

async function createBooking() {
  saving.value = true;
  error.value = "";
  try {
    await api("/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        resourceId: form.value.resourceId,
        title: form.value.title,
        startsAt: fromLocalInputValue(form.value.startsAt),
        endsAt: fromLocalInputValue(form.value.endsAt),
        notes: form.value.notes.trim() || null,
        participantUserIds: form.value.participantUserIds,
      }),
    });
    showForm.value = false;
    await loadBookings();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function deleteBooking(id: string) {
  if (!confirm(t("common.confirmDelete"))) return;
  try {
    await api(`/api/bookings/${id}`, { method: "DELETE" });
    await loadBookings();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

watch(weekStart, loadBookings);

onMounted(async () => {
  try {
    await loadMeta();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
  await loadBookings();
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-brand-800">{{ t("calendar.title") }}</h1>
      <button
        v-if="auth.canWrite"
        type="button"
        class="btn-primary"
        @click="openCreate()"
      >
        {{ t("calendar.newBooking") }}
      </button>
    </div>

    <div
      class="flex items-center justify-between gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2"
    >
      <button type="button" class="btn-ghost" @click="prevWeek">
        ‹ {{ t("common.previous") }}
      </button>
      <p class="text-sm font-medium text-stone-700">{{ weekLabel }}</p>
      <button type="button" class="btn-ghost" @click="nextWeek">
        {{ t("common.next") }} ›
      </button>
    </div>

    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <div class="groupbox overflow-x-auto">
      <section
        v-for="day in days"
        :key="dayKey(day)"
        class="rounded-2xl border border-stone-200 bg-white"
      >
        <header
          class="flex items-center justify-between border-b border-stone-100 px-4 py-2"
        >
          <h2 class="text-sm font-semibold text-brand-800">
            {{
              day.toLocaleDateString("de-DE", {
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
              })
            }}
          </h2>
          <button
            v-if="auth.canWrite"
            type="button"
            class="text-xs font-medium text-brand-700"
            :aria-label="`Buchung für ${day.toLocaleDateString('de-DE')} anlegen`"
            @click="openCreate(day)"
          >
            +
          </button>
        </header>
        <ul class="divide-y divide-stone-100">
          <li
            v-for="b in bookingsForDay(day)"
            :key="b.id"
            class="flex items-start justify-between gap-3 px-4 py-3"
          >
            <div>
              <p class="font-medium text-stone-900">{{ b.title }}</p>
              <p class="text-xs text-stone-500">
                {{ formatTime(b.startsAt) }}–{{ formatTime(b.endsAt) }}
                · {{ b.resourceName }}
                <span v-if="b.participantNames.length"> · {{ b.participantNames.join(", ") }}</span>
              </p>
            </div>
            <button
              v-if="auth.canWrite"
              type="button"
              class="text-xs text-red-600"
              @click="deleteBooking(b.id)"
            >
              {{ t("common.delete") }}
            </button>
          </li>
          <li
            v-if="!bookingsForDay(day).length"
            class="px-4 py-3 text-sm text-stone-400"
          >
            —
          </li>
        </ul>
      </section>
    </div>

    <div
      v-if="showForm"
      class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      @click.self="showForm = false"
    >
      <form
        class="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        @submit.prevent="createBooking"
      >
        <h2 class="text-lg font-semibold text-brand-800">
          {{ t("calendar.newBooking") }}
        </h2>
        <div class="mt-4 grid gap-3">
          <label class="text-sm font-medium">
            {{ t("calendar.resource") }}
            <select v-model="form.resourceId" required class="field">
              <option
                v-for="r in trackResources"
                :key="r.id"
                :value="r.id"
              >
                {{ r.name }}
              </option>
            </select>
          </label>
          <p class="text-sm font-medium text-stone-700">Reitunterricht</p>
          <label class="text-sm font-medium">
            {{ t("calendar.startsAt") }}
            <input v-model="form.startsAt" type="datetime-local" required class="field" />
          </label>
          <label class="text-sm font-medium">
            {{ t("calendar.endsAt") }}
            <input v-model="form.endsAt" type="datetime-local" required class="field" />
          </label>
          <fieldset class="text-sm font-medium">
            <legend>{{ t("calendar.participants") }}</legend>
            <p class="mt-1 text-xs font-normal text-stone-500">
              {{ t("calendar.participantsHint") }}
            </p>
            <div class="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-stone-200 p-3">
              <label v-for="member in members" :key="member.userId" class="flex items-center gap-2 font-normal">
                <input v-model="form.participantUserIds" type="checkbox" :value="member.userId" />
                {{ member.name }}
                <span class="text-xs text-stone-500">({{ t(`roles.${member.role}`) }})</span>
              </label>
              <p v-if="!members.length" class="text-sm font-normal text-stone-500">
                {{ t("common.empty") }}
              </p>
            </div>
          </fieldset>
          <label class="text-sm font-medium">
            {{ t("calendar.notes") }}
            <textarea v-model="form.notes" rows="2" class="field" />
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

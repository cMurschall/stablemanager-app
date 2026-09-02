<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import { api } from "@/lib/api";
import {
  addDays,
  dayKey,
  formatDateTime,
  formatLocalDate,
  formatTime,
  toIso,
} from "@/lib/dates";
import { useAuthStore } from "@/stores/auth";
import type {
  Booking,
  BulletinPost,
  CareEvent,
  DailyTask,
  FarrierVisit,
  Notification,
  TrainingLog,
} from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();

const loading = ref(true);
const error = ref("");

const notifications = ref<Notification[]>([]);
const tasks = ref<DailyTask[]>([]);
const trainingLogs = ref<TrainingLog[]>([]);
const bookings = ref<Booking[]>([]);
const nextVisit = ref<FarrierVisit | null>(null);
const careDue = ref<CareEvent[]>([]);
const pinnedPosts = ref<BulletinPost[]>([]);

const today = dayKey(new Date());
const todayStart = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

const unreadNotifications = computed(() =>
  notifications.value.filter((n) => !n.readAt).slice(0, 5),
);

const openTasks = computed(() =>
  tasks.value.filter((task) => !task.completedAt).slice(0, 8),
);

const todayBookings = computed(() =>
  [...bookings.value].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
);

function isCareHighlight(ev: CareEvent) {
  return dayKey(new Date(ev.dueAt)) <= today;
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const from = toIso(todayStart);
    const to = toIso(addDays(todayStart, 1));
    const requests: Promise<unknown>[] = [
      api<{ notifications: Notification[] }>("/api/notifications").then(
        (r) => {
          notifications.value = r.notifications;
        },
      ),
      api<{ trainingLogs: TrainingLog[] }>(
        `/api/training-logs?date=${today}`,
      ).then((r) => {
        trainingLogs.value = r.trainingLogs;
      }),
      api<{ bookings: Booking[] }>(
        `/api/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ).then((r) => {
        bookings.value = r.bookings;
      }),
      api<{ visits: FarrierVisit[] }>("/api/farrier/visits").then((r) => {
        const open = r.visits
          .filter((v) => v.status === "open")
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        nextVisit.value = open[0] ?? null;
      }),
      api<{ posts: BulletinPost[] }>("/api/board").then((r) => {
        pinnedPosts.value = r.posts.filter((p) => p.pinned).slice(0, 5);
      }),
    ];

    if (auth.canWrite) {
      requests.push(
        api<{ tasks: DailyTask[] }>(
          `/api/service-orders/daily-tasks?date=${today}`,
        ).then((r) => {
          tasks.value = r.tasks;
        }),
        api<{ careEvents: CareEvent[] }>("/api/care-events?status=open").then(
          (r) => {
            careDue.value = r.careEvents
              .filter(isCareHighlight)
              .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
              .slice(0, 8);
          },
        ),
      );
    }

    await Promise.all(requests);
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
    <div>
      <h1 class="text-xl font-semibold text-brand-800">{{ t("home.title") }}</h1>
      <p class="mt-1 text-sm text-stone-500">
        {{ t("home.subtitle", { date: formatLocalDate(today) }) }}
      </p>
    </div>

    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>

    <template v-else>
      <section v-if="unreadNotifications.length" class="groupbox">
        <div class="flex items-center justify-between gap-2">
          <h2 class="groupbox-title">{{ t("home.notifications") }}</h2>
          <span class="text-xs text-stone-500">{{ t("nav.notifications") }}</span>
        </div>
        <ul class="divide-y divide-stone-100 rounded-xl border border-stone-100">
          <li
            v-for="n in unreadNotifications"
            :key="n.id"
            class="px-3 py-2"
          >
            <p class="text-sm font-medium text-stone-900">{{ n.title }}</p>
            <p v-if="n.body" class="text-sm text-stone-600">{{ n.body }}</p>
            <p class="text-xs text-stone-500">{{ formatDateTime(n.createdAt) }}</p>
          </li>
        </ul>
      </section>

      <section v-if="auth.canWrite && openTasks.length" class="groupbox">
        <div class="flex items-center justify-between gap-2">
          <h2 class="groupbox-title">{{ t("home.dailyTasks") }}</h2>
          <RouterLink to="/services" class="btn-ghost">
            {{ t("home.toServices") }}
          </RouterLink>
        </div>
        <ul class="divide-y divide-stone-100 rounded-xl border border-stone-100">
          <li v-for="task in openTasks" :key="task.id" class="px-3 py-2 text-sm">
            <p class="font-medium">{{ task.horseName }} · {{ task.title }}</p>
            <p v-if="task.instructions" class="text-stone-600">{{ task.instructions }}</p>
          </li>
        </ul>
      </section>

      <section v-if="trainingLogs.length" class="groupbox">
        <div class="flex items-center justify-between gap-2">
          <h2 class="groupbox-title">{{ t("home.training") }}</h2>
          <RouterLink to="/training" class="btn-ghost">
            {{ t("home.toTraining") }}
          </RouterLink>
        </div>
        <ul class="divide-y divide-stone-100 rounded-xl border border-stone-100">
          <li
            v-for="log in trainingLogs.slice(0, 8)"
            :key="log.id"
            class="px-3 py-2 text-sm"
          >
            <p class="font-medium">{{ log.horseName }} · {{ log.type }}</p>
            <p v-if="log.notes" class="text-stone-600">{{ log.notes }}</p>
          </li>
        </ul>
      </section>

      <section v-if="todayBookings.length" class="groupbox">
        <div class="flex items-center justify-between gap-2">
          <h2 class="groupbox-title">{{ t("home.bookings") }}</h2>
          <RouterLink to="/calendar" class="btn-ghost">
            {{ t("home.toCalendar") }}
          </RouterLink>
        </div>
        <ul class="divide-y divide-stone-100 rounded-xl border border-stone-100">
          <li v-for="b in todayBookings" :key="b.id" class="px-3 py-2 text-sm">
            <p class="font-medium">{{ b.title }}</p>
            <p class="text-xs text-stone-500">
              {{ formatTime(b.startsAt) }}–{{ formatTime(b.endsAt) }}
              · {{ b.resourceName }}
            </p>
          </li>
        </ul>
      </section>

      <section v-if="nextVisit" class="groupbox">
        <div class="flex items-center justify-between gap-2">
          <h2 class="groupbox-title">{{ t("home.nextFarrier") }}</h2>
          <RouterLink to="/farrier" class="btn-ghost">
            {{ t("home.toFarrier") }}
          </RouterLink>
        </div>
        <p class="text-sm font-medium text-stone-900">
          {{ formatDateTime(nextVisit.startsAt) }}
          <span v-if="nextVisit.farrierName"> · {{ nextVisit.farrierName }}</span>
        </p>
        <p class="text-xs text-stone-500">
          {{
            t("farrier.signupCount", {
              n: nextVisit.signupCount ?? nextVisit.signups.length,
            })
          }}
        </p>
      </section>

      <section v-if="auth.canWrite && careDue.length" class="groupbox">
        <div class="flex items-center justify-between gap-2">
          <h2 class="groupbox-title">{{ t("home.careDue") }}</h2>
          <RouterLink to="/reminders" class="btn-ghost">
            {{ t("home.toCare") }}
          </RouterLink>
        </div>
        <ul class="divide-y divide-stone-100 rounded-xl border border-stone-100">
          <li v-for="ev in careDue" :key="ev.id" class="px-3 py-2 text-sm">
            <p class="font-medium">
              {{ t(`care.${ev.type}`) }} · {{ ev.horseName }}
            </p>
            <p class="text-xs text-stone-500">
              {{ t("reminders.dueAt") }}: {{ formatDateTime(ev.dueAt) }}
            </p>
          </li>
        </ul>
      </section>

      <section v-if="pinnedPosts.length" class="groupbox">
        <div class="flex items-center justify-between gap-2">
          <h2 class="groupbox-title">{{ t("home.pinnedBoard") }}</h2>
          <RouterLink to="/board" class="btn-ghost">
            {{ t("home.toBoard") }}
          </RouterLink>
        </div>
        <ul class="space-y-2">
          <li
            v-for="post in pinnedPosts"
            :key="post.id"
            class="rounded-xl border border-brand-200 bg-brand-50/40 px-3 py-2"
          >
            <p class="text-sm font-medium text-stone-900">{{ post.title }}</p>
            <p class="mt-1 line-clamp-2 text-sm text-stone-600">{{ post.body }}</p>
          </li>
        </ul>
      </section>

      <section
        v-if="
          !unreadNotifications.length &&
          !(auth.canWrite && openTasks.length) &&
          !trainingLogs.length &&
          !todayBookings.length &&
          !nextVisit &&
          !(auth.canWrite && careDue.length) &&
          !pinnedPosts.length
        "
        class="groupbox"
      >
        <p class="text-sm text-stone-600">{{ t("home.empty") }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <RouterLink to="/horses" class="btn-primary">{{ t("home.toHorses") }}</RouterLink>
          <RouterLink
            v-if="auth.canWrite"
            to="/training"
            class="btn-ghost"
          >
            {{ t("home.toTraining") }}
          </RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>

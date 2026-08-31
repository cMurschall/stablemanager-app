<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "@/lib/api";
import {
  formatDateTime,
  fromLocalInputValue,
} from "@/lib/dates";
import { useAuthStore } from "@/stores/auth";
import type { BulletinPost } from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();

const posts = ref<BulletinPost[]>([]);
const loading = ref(true);
const error = ref("");
const showForm = ref(false);
const saving = ref(false);

const form = ref({
  title: "",
  body: "",
  pinned: false,
  expiresAt: "",
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const data = await api<{ posts: BulletinPost[] }>("/api/board");
    posts.value = data.posts;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.value = { title: "", body: "", pinned: false, expiresAt: "" };
  showForm.value = true;
}

async function createPost() {
  saving.value = true;
  error.value = "";
  try {
    await api("/api/board", {
      method: "POST",
      body: JSON.stringify({
        title: form.value.title,
        body: form.value.body,
        pinned: form.value.pinned,
        expiresAt: form.value.expiresAt
          ? fromLocalInputValue(form.value.expiresAt)
          : null,
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

async function remove(id: string) {
  if (!confirm(t("common.confirmDelete"))) return;
  try {
    await api(`/api/board/${id}`, { method: "DELETE" });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-brand-800">{{ t("board.title") }}</h1>
      <button
        v-if="auth.canWrite"
        type="button"
        class="btn-primary"
        @click="openCreate"
      >
        {{ t("board.newPost") }}
      </button>
    </div>

    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <ul v-if="!loading && posts.length" class="space-y-3">
      <li
        v-for="post in posts"
        :key="post.id"
        class="rounded-2xl border border-stone-200 bg-white p-4"
        :class="post.pinned ? 'border-brand-300 bg-brand-50/40' : ''"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-semibold text-stone-900">
              <span
                v-if="post.pinned"
                class="mr-2 text-xs font-medium text-brand-700"
              >
                {{ t("common.pinned") }}
              </span>
              {{ post.title }}
            </p>
            <p class="mt-1 whitespace-pre-wrap text-sm text-stone-700">
              {{ post.body }}
            </p>
            <p class="mt-2 text-xs text-stone-500">
              {{ formatDateTime(post.createdAt) }}
              <span v-if="post.expiresAt">
                · bis {{ formatDateTime(post.expiresAt) }}
              </span>
            </p>
          </div>
          <button
            v-if="auth.canWrite"
            type="button"
            class="text-sm text-red-600"
            @click="remove(post.id)"
          >
            {{ t("common.delete") }}
          </button>
        </div>
      </li>
    </ul>
    <p v-else-if="!loading" class="text-sm text-stone-500">{{ t("board.none") }}</p>

    <div
      v-if="showForm"
      class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      @click.self="showForm = false"
    >
      <form
        class="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        @submit.prevent="createPost"
      >
        <h2 class="text-lg font-semibold text-brand-800">{{ t("board.newPost") }}</h2>
        <div class="mt-4 grid gap-3">
          <label class="text-sm font-medium">
            {{ t("board.postTitle") }}
            <input v-model="form.title" required class="field mt-1" />
          </label>
          <label class="text-sm font-medium">
            {{ t("board.body") }}
            <textarea v-model="form.body" required rows="5" class="field mt-1" />
          </label>
          <label class="flex items-center gap-2 text-sm font-medium">
            <input
              v-model="form.pinned"
              type="checkbox"
              class="rounded border-stone-300"
            />
            {{ t("board.pin") }}
          </label>
          <label class="text-sm font-medium">
            {{ t("board.expiresAt") }}
            <input
              v-model="form.expiresAt"
              type="datetime-local"
              class="field mt-1"
            />
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

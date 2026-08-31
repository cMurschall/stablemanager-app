import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import { useAuthStore } from "@/stores/auth";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/LoginView.vue"),
    meta: { public: true },
  },
  {
    path: "/invite/:token",
    name: "invite",
    component: () => import("@/views/InviteView.vue"),
    meta: { public: true },
  },
  {
    path: "/",
    component: () => import("@/layouts/AppLayout.vue"),
    children: [
      { path: "", redirect: "/horses" },
      {
        path: "horses",
        name: "horses",
        component: () => import("@/views/HorsesView.vue"),
      },
      {
        path: "horses/:id",
        name: "horse-detail",
        component: () => import("@/views/HorseDetailView.vue"),
      },
      {
        path: "housing",
        name: "housing",
        component: () => import("@/views/HousingView.vue"),
      },
      {
        path: "calendar",
        name: "calendar",
        component: () => import("@/views/CalendarView.vue"),
      },
      {
        path: "board",
        name: "board",
        component: () => import("@/views/BoardView.vue"),
      },
      {
        path: "farrier",
        name: "farrier",
        component: () => import("@/views/FarrierView.vue"),
      },
      {
        path: "reminders",
        name: "reminders",
        component: () => import("@/views/RemindersView.vue"),
      },
      {
        path: "services",
        name: "services",
        component: () => import("@/views/ServiceOrdersView.vue"),
      },
      {
        path: "training",
        name: "training",
        component: () => import("@/views/TrainingView.vue"),
      },
      {
        path: "settings",
        name: "settings",
        component: () => import("@/views/SettingsView.vue"),
        meta: { admin: true },
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded) {
    await auth.fetchMe();
  }

  if (to.meta.public) {
    if (auth.isAuthenticated && to.name === "login") {
      return { name: "horses" };
    }
    return true;
  }

  if (!auth.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }

  if (to.meta.admin && !auth.isAdmin) {
    return { name: "horses" };
  }

  return true;
});

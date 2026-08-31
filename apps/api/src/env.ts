export type Env = {
  DB: D1Database;
  ASSETS?: Fetcher;
  SESSION_SECRET: string;
  RESEND_API_KEY?: string;
  APP_NAME: string;
  ENVIRONMENT: string;
};

export type AppVariables = {
  userId: string;
  tenantId: string;
  role: "hof_admin" | "staff" | "horse_owner";
  email: string;
  name: string;
};

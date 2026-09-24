import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/api/tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://grow_test:grow_test@127.0.0.1:5432/growobserver_test",
      JWT_SECRET: "local-test-only-secret-at-least-32-characters-long",
      JWT_TTL: "1h",
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_PUBLIC_ENDPOINT: "http://127.0.0.1:9000",
      S3_ACCESS_KEY: "test-storage",
      S3_SECRET_KEY: "test-storage-not-for-deploy",
      S3_BUCKET: "growobserver-test",
      CORS_ORIGINS: "http://localhost:5173",
    },
  },
});
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/api/**/*.test.ts"],
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
      // Nur für Tests erzeugtes VAPID-Paar (kein Geheimnis, nirgends produktiv): Push gilt dadurch als eingerichtet; gesendet wird nie real.
      VAPID_PUBLIC_KEY: "BEcxMBNPs4EXEYkVI3q70p5hp_3ZX-xAFtgO6V8wNWtdHMymxB8Azr5iF0WaIRMbBopjjO5hJQofUmzpfVKHVrw",
      VAPID_PRIVATE_KEY: "DvS0bLStOkLDsh1IKckFRVzKkQKde6K2MuS3pYRZphw",
      VAPID_SUBJECT: "mailto:test@example.test",
    },
  },
});
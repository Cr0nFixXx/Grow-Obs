import { describe, expect, it } from "vitest";
import { clientOptions, isTransactionPooler } from "../src/db/client-options.ts";

describe("clientOptions", () => {
  it("erkennt den Transaction-Pooler am Port 6543", () => {
    expect(isTransactionPooler("postgresql://u:p@aws-0-eu.pooler.supabase.com:6543/postgres")).toBe(true);
    expect(isTransactionPooler("postgresql://u:p@aws-0-eu.pooler.supabase.com:5432/postgres")).toBe(false);
    expect(isTransactionPooler("kein url")).toBe(false);
  });
  it("Transaction-Pooler: keine Prepared Statements, keine Startparameter", () => {
    const o = clientOptions("postgresql://u:p@h:6543/postgres", 3);
    expect(o).toMatchObject({ max: 3, prepare: false });
    expect(o).not.toHaveProperty("connection");
  });
  it("Direkt/Session-Pooler: Zeitlimits als Startparameter, Prepared Statements bleiben", () => {
    const o = clientOptions("postgresql://u:p@h:5432/postgres", 1);
    expect(o).toMatchObject({ max: 1, connection: { statement_timeout: 10000, lock_timeout: 5000 } });
    expect(o).not.toHaveProperty("prepare");
  });
});

import { client } from "../db/client.ts";
import { OperatorError, provisionOperator } from "../lib/operator.ts";

const USAGE = `Betreiber (platform_admin) anlegen oder befördern – ohne Demo-Daten.

Aufruf:
  npm run admin:create -- --email betreiber@example.org [--name "Anzeigename"] [--promote]
  node dist/cli/admin-create.js --email … (Docker: docker compose --profile tools run --rm admin --email …)

  --email     Pflicht.
  --name      Anzeigename für ein NEUES Konto (Standard "Betreiber").
  --promote   Bestehendes Konto bewusst zum Betreiber befördern (beendet alle seine Sitzungen).

Das Passwort wird nie als Argument übergeben: Für ein neues Konto erzeugt das Programm ein Zufallspasswort und zeigt es
EINMAL an. Direkt nach der ersten Anmeldung im Profil ändern.`;

function parseArgs(argv: string[]) {
  const out: { email?: string; name?: string; promote: boolean; help: boolean } = { promote: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--promote") out.promote = true;
    else if (a === "--email" || a === "--name") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new OperatorError(`${a} braucht einen Wert.`);
      out[a === "--email" ? "email" : "name"] = value;
    } else if (a === "--password") throw new OperatorError("Das Passwort wird nicht als Argument akzeptiert (Shell-History). Es wird erzeugt.");
    else throw new OperatorError(`Unbekannte Option: ${a}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.email) {
    console.log(USAGE);
    if (!args.help) process.exitCode = 1;
    return;
  }
  const result = await provisionOperator({ email: args.email, name: args.name, promote: args.promote });
  if (result.action === "unchanged") console.log(`ℹ️  ${result.email} ist bereits Betreiber – nichts geändert.`);
  else if (result.action === "promoted") console.log(`✅ ${result.email} ist jetzt Betreiber. Alle bisherigen Sitzungen wurden beendet; das Passwort bleibt unverändert.`);
  else {
    console.log(`✅ Betreiber angelegt: ${result.email}`);
    console.log(`   Einmalpasswort: ${result.password}`);
    console.log("   Wird nicht gespeichert und nicht erneut angezeigt. Nach der ersten Anmeldung im Profil ändern.");
  }
}

main()
  .catch((error) => {
    if (error instanceof OperatorError) console.error(`❌ ${error.message}`);
    else if ([(error as { code?: string }).code, (error as { cause?: { code?: string } }).cause?.code].includes("42P01")) console.error("❌ Tabellen fehlen. Zuerst die Migrationen ausführen (npm run db:migrate bzw. die App einmal starten).");
    else console.error("❌ Fehlgeschlagen:", error instanceof Error ? error.name : "unknown");
    process.exitCode = 1;
  })
  .finally(() => client.end({ timeout: 5 }));

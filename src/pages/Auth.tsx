import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ShieldCheck, Sparkles, Trophy, Users } from "lucide-react";
import { Particles } from "@/components/Particles";
import { Brand } from "@/components/layout/AppShell";
import heroImg from "@/assets/hero.jpg";
import { Button, Card, Checkbox, Field, Input } from "@/components/ui";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { n } from "@/lib/format";

export default function Auth() {
  const { navigate } = useNav();
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");

  const submit = () => {
    toast.push({ title: mode === "login" ? "Angemeldet" : "Konto erstellt", desc: "Willkommen bei Grow|Observer 🌿", tone: "leaf", icon: "Sprout" });
    navigate("dashboard");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---------------- Hero ---------------- */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-leaf-950 via-[#0b150c] to-[#0a0d0a] p-10 text-white lg:flex xl:p-14">
        <img src={heroImg} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-br from-leaf-950/70 via-[#0b150c]/60 to-[#0a0d0a]/85" />
        <div className="absolute inset-0 opacity-60">
          <Particles className="h-full w-full" />
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <Brand />
          <button onClick={() => navigate("dashboard")} className="flex items-center gap-1.5 text-sm text-white/70 transition-colors hover:text-white">
            Zur App <ArrowLeft className="size-4 rotate-180" />
          </button>
        </div>

        <div className="relative z-10 max-w-lg">
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="font-display text-4xl font-bold leading-tight xl:text-5xl">
            Dein Grow-Tagebuch, <span className="bg-gradient-to-r from-leaf-300 to-leaf-500 bg-clip-text text-transparent">intelligenter</span> denn je.
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="mt-4 text-white/70">
            Community-Wissen, KI-Assistenz und Kostenoptimierung – alles an einem Ort. Verfolge jeden Grow, vergleiche Sorten und lerne von Tausenden Growern.
          </motion.p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { icon: Users, value: "12.400", label: "Grower" },
              { icon: Trophy, value: "3.200", label: "Showcases" },
              { icon: Sparkles, value: "98 %", label: "KI-Treffcr" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <s.icon className="size-5 text-leaf-300" />
                <div className="mt-2 text-2xl font-bold tnum">{s.value}</div>
                <div className="text-xs text-white/60">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-white/50">
          <ShieldCheck className="size-4 text-leaf-300" /> Ende-zu-Ende verschlüsselt · DSGVO-konform · Made with 🌱
        </div>
      </div>

      {/* ---------------- Form ---------------- */}
      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute left-4 top-4 lg:hidden">
          <Brand />
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
          <Card className="card glass p-6 elev-2 sm:p-8">
            <div className="mb-6 flex rounded-xl bg-surface-2 p-1">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="relative flex-1 rounded-lg py-2 text-sm font-medium transition-colors"
                >
                  {m === mode && <motion.span layoutId="authtab" className="absolute inset-0 rounded-lg bg-accent" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                  <span className={m === mode ? "relative z-10 text-accent-fg" : "relative z-10 text-fg-muted"}>
                    {m === "login" ? "Anmelden" : "Registrieren"}
                  </span>
                </button>
              ))}
            </div>

            <h1 className="text-2xl font-bold">{mode === "login" ? "Willkommen zurück 👋" : "Konto erstellen"}</h1>
            <p className="mt-1 text-sm text-fg-muted">{mode === "login" ? "Melde dich an, um weiter zu growen." : "Werde Teil der Community in 30 Sekunden."}</p>

            <div className="mt-6 space-y-4">
              {mode === "register" && (
                <Field label="Anzeigename">
                  <Input placeholder="z. B. max_grows" defaultValue="Max Grünfeld" />
                </Field>
              )}
              <Field label="E-Mail">
                <Input type="email" placeholder="du@example.com" defaultValue="max@growobserver.app" />
              </Field>
              <Field label="Passwort">
                <Input type="password" placeholder="••••••••" defaultValue="supersecret" />
              </Field>
              {mode === "login" ? (
                <div className="flex items-center justify-between text-sm">
                  <Checkbox checked onChange={() => {}} label="Angemeldet bleiben" />
                  <button className="text-accent hover:underline" onClick={() => toast.push({ title: "Reset-Link gesendet", desc: "Bitte prüfe dein Postfach.", tone: "info", icon: "Mail" })}>
                    Passwort vergessen?
                  </button>
                </div>
              ) : (
                <Checkbox checked onChange={() => {}} label="Ich akzeptiere die AGB & Datenschutz" />
              )}

              <Button className="w-full" size="lg" onClick={submit}>
                {mode === "login" ? "Anmelden" : "Konto erstellen"} <ArrowRight className="size-4" />
              </Button>
            </div>

            <div className="my-5 flex items-center gap-3 text-xs text-fg-subtle">
              <div className="h-px flex-1 bg-border" /> oder <div className="h-px flex-1 bg-border" />
            </div>

            <Button variant="secondary" className="w-full" onClick={submit}>
              <span className="grid size-5 place-items-center rounded-full bg-[#2AABEE] text-white text-[10px] font-bold">T</span>
              Mit Telegram fortfahren
            </Button>

            <p className="mt-5 text-center text-xs text-fg-subtle">
              Bereits dabei?{" "}
              <button className="font-medium text-accent hover:underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
                {mode === "login" ? "Jetzt registrieren" : "Stattdessen anmelden"}
              </button>
            </p>
          </Card>
          <p className="mt-4 text-center text-xs text-fg-subtle">Schon {n(12400)} Grower vertrauen Grow|Observer.</p>
        </motion.div>
      </div>
    </div>
  );
}

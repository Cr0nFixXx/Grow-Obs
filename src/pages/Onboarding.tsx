import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { Particles } from "@/components/Particles";
import { Brand } from "@/components/layout/AppShell";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import heroImg from "@/assets/hero.jpg";

const features = [
  { icon: "NotebookPen", title: "Grow-Tagebuch", text: "Phasen-Timeline, Logs & Foto-Galerie" },
  { icon: "Sparkles", title: "KI-Assistent", text: "Ratgeber, Agenten & Erdmischungs-Studio" },
  { icon: "Euro", title: "Kosten-Optimierung", text: "Rechner, Verbrauch & Simulation" },
  { icon: "Users", title: "Community", text: "Forum, Marktplatz & Hall of Fame" },
];

const pwa = [
  { icon: "Power", title: "Offline-Modus", text: "Greife auch ohne Internet auf deine Daten zu." },
  { icon: "Zap", title: "Blitzschnell", text: "Startet direkt vom Homescreen, wie eine native App." },
  { icon: "Bell", title: "Push-Benachrichtigungen", text: "Tasks & KI-Warnungen in Echtzeit." },
];

export default function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const next = () => (step < 1 ? setStep(step + 1) : onClose());

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200]">
          {/* Fixed background (viewport-sized) */}
          <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-leaf-950 via-[#0b150c] to-[#0a0d0a]">
            <img src={heroImg} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-25" />
            <div className="absolute inset-0 bg-gradient-to-br from-leaf-950/70 via-[#0b150c]/60 to-[#0a0d0a]/85" />
            <Particles className="h-full w-full" />
          </div>

          {/* Scroll layer: centers card, scrolls when content exceeds viewport height */}
          <div className="absolute inset-0 overflow-y-auto" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="flex min-h-full items-center justify-center p-4 pb-8">
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 240, damping: 26 }}
                className="relative z-10 my-auto w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-5 text-white backdrop-blur-xl sm:p-7"
              >
                <div className="flex items-center justify-between">
                  <Brand />
                  <div className="flex gap-1.5">
                    {[0, 1].map((s) => (
                      <span key={s} className={`h-1.5 rounded-full transition-all ${s === step ? "w-6 bg-leaf-400" : "w-1.5 bg-white/25"}`} />
                    ))}
                  </div>
                </div>

                {step === 0 ? (
                  <div className="mt-5 sm:mt-6">
                    <h1 className="font-display text-2xl font-bold leading-tight sm:text-3xl">
                      Willkommen bei <span className="bg-gradient-to-r from-leaf-300 to-leaf-500 bg-clip-text text-transparent">Grow|Observer</span>
                    </h1>
                    <p className="mt-2 text-sm text-white/70 sm:text-base">Dein community-getriebenes Grow-Dashboard – jetzt noch smarter.</p>
                    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-3">
                      {features.map((f) => (
                        <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                          <span className="grid size-9 place-items-center rounded-xl bg-leaf-400/20 text-leaf-300 sm:size-10">
                            <Icon name={f.icon} size={18} />
                          </span>
                          <div className="mt-2 text-sm font-semibold sm:mt-2.5">{f.title}</div>
                          <div className="text-xs text-white/60">{f.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 sm:mt-6">
                    <div className="grid size-12 place-items-center rounded-2xl bg-leaf-400/20 text-leaf-300 sm:size-14">
                      <Icon name="Download" size={26} />
                    </div>
                    <h1 className="mt-4 font-display text-2xl font-bold sm:text-3xl">Als App installieren</h1>
                    <p className="mt-2 text-sm text-white/70 sm:text-base">Installiere Grow|Observer für das beste Erlebnis – offline, schnell und mit Push.</p>
                    <div className="mt-5 space-y-2">
                      {pwa.map((p) => (
                        <div key={p.title} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-leaf-400/20 text-leaf-300">
                            <Icon name={p.icon} size={18} />
                          </span>
                          <div>
                            <div className="text-sm font-semibold">{p.title}</div>
                            <div className="text-xs text-white/60">{p.text}</div>
                          </div>
                          <Check className="ml-auto size-4 shrink-0 text-leaf-300" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex gap-2 sm:mt-7">
                  {step > 0 && (
                    <Button variant="secondary" className="flex-1 bg-white/10 text-white" onClick={() => setStep(0)}>
                      Zurück
                    </Button>
                  )}
                  <Button className="flex-1" onClick={next}>
                    {step === 0 ? "Weiter" : "App installieren"} <ArrowRight className="size-4" />
                  </Button>
                </div>
                <button onClick={onClose} className="mt-3 w-full text-center text-sm text-white/50 hover:text-white/80">
                  Überspringen
                </button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

import { motion } from "framer-motion";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui";

/** 404-Ansicht (B-62): unbekannte Adresse. Die Adresszeile bleibt unverändert, damit der Fehler erkennbar ist. */
export default function NotFound() {
  const { navigate, back, canGoBack } = useNav();
  return (
    <div className="grid min-h-[60vh] place-items-center" data-testid="not-found">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center">
        <div className="select-none font-display text-[120px] font-bold leading-none tracking-tighter text-accent/20 sm:text-[180px]" aria-hidden="true">404</div>
        <h1 className="-mt-6 text-2xl font-bold">Seite nicht gefunden</h1>
        <p className="mx-auto mt-2 max-w-sm text-fg-muted">Diese Adresse gibt es nicht – vielleicht ein Tippfehler oder ein alter Link.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => navigate("dashboard")}>Zum Dashboard</Button>
          {canGoBack && <Button variant="secondary" onClick={back}>Zurück</Button>}
        </div>
      </motion.div>
    </div>
  );
}

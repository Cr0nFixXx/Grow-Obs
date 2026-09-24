import { motion } from "framer-motion";
import { useNav } from "@/lib/nav";
import { Button, EmptyState } from "@/components/ui";

export default function NotFound() {
  const { navigate } = useNav();
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center">
        <div className="select-none font-display text-[120px] font-bold leading-none tracking-tighter text-accent/20 sm:text-[180px]">404</div>
        <h1 className="-mt-6 text-2xl font-bold">Hier wächst nichts 🌱</h1>
        <p className="mx-auto mt-2 max-w-sm text-fg-muted">Die gesuchte Seite wurde nicht gefunden oder wurde verschoben.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => navigate("dashboard")}>Zum Dashboard</Button>
          <Button variant="secondary" onClick={() => navigate("hallOfFame")}>Hall of Fame</Button>
        </div>
        <div className="mx-auto mt-8 max-w-md">
          <EmptyState icon="Sprout" title="Leeres Beet" desc="So könnte ein Empty State aussehen – bereit zum Bepflanzen." action={<Button variant="soft" onClick={() => navigate("dashboard")}>Jetzt starten</Button>} />
        </div>
      </motion.div>
    </div>
  );
}

import { Icon } from "./Icon";
import { cn } from "@/utils/cn";

/**
 * Inline-fähiges Icon mit korrekter Basislinien-Ausrichtung.
 * Ersetzt Icon+mr-*-Patterns in Fließtext.
 */
export function InlineIcon({ name, className, size = 15 }: { name: string; className?: string; size?: number }) {
  return <Icon name={name} size={size} className={cn("relative top-[0.16em] mr-1.5 inline-block shrink-0 align-baseline leading-none", className)} />;
}
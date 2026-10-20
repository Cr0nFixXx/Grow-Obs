import { BellOff, Lock, Pin, Settings2 } from "lucide-react";
import { cn } from "@/utils/cn";
import type { GroupTopic } from "@/services/interfaces";

/** Themen einer Gruppe als Reiter (B-65): Emoji, Name, Ungelesen (stumm = ohne Zahl), Schloss bei gesperrtem Schreiben. */
export function TopicBar({ topics, activeId, onSelect, onManage }: { topics: GroupTopic[]; activeId: string | null; onSelect: (id: string) => void; onManage?: () => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1.5" data-testid="topic-bar">
      <div role="tablist" aria-label="Themen" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {topics.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === activeId}
            onClick={() => onSelect(t.id)}
            className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition", t.id === activeId ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-muted hover:text-fg")}
          >
            {t.pinned && <Pin className="size-3" aria-label="angeheftet" />}
            {t.emoji && <span aria-hidden>{t.emoji}</span>}
            <span className="max-w-[9rem] truncate">{t.name}</span>
            {t.private && <Lock className="size-3" aria-label="privat" />}
            {!t.canWrite && <span className="text-[10px]" aria-label="Schreiben gesperrt" title="Schreiben gesperrt">🔒</span>}
            {t.muted && <BellOff className="size-3" aria-label="stumm" />}
            {t.unread > 0 && !t.muted && <span data-testid="topic-unread" aria-label={`${t.unread} ungelesen`} className={cn("grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold", t.id === activeId ? "bg-accent-fg/20" : "bg-accent text-accent-fg")}>{t.unread}</span>}
          </button>
        ))}
      </div>
      {onManage && <button type="button" onClick={onManage} aria-label="Themen verwalten" className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-surface-2"><Settings2 className="size-4" /></button>}
    </div>
  );
}

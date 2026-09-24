import type {
  CreateGrowInput, CreatePostInput, Grow, GrowLog, SocialPost, Strain,
} from "@/types";

/**
 * Service-Verträge (Schnittstellen) für jede Domäne.
 *
 * PATTERN: Jede Domäne bekommt ein `XxxService`-Interface mit async-Methoden.
 * Es gibt genau zwei Implementierungen:
 *   - `mock.ts`    → statische Mock-Daten (Default, kein Server nötig)
 *   - `api.ts`     → echtes Backend via `http`-Client
 * Die Factory `index.ts` wählt anhand von `config.useMock` die passende aus.
 * Neue Domäne: Interface hier ergänzen + in beiden Impl. + `Services` aufnehmen.
 */

export interface GrowService {
  list(): Promise<Grow[]>;
  get(id: string): Promise<Grow | undefined>;
  create(input: CreateGrowInput): Promise<Grow>;
  addLog(growId: string, log: Omit<GrowLog, "id">): Promise<void>;
}

export interface SocialService {
  listPosts(): Promise<SocialPost[]>;
  createPost(input: CreatePostInput): Promise<SocialPost>;
  toggleLike(postId: string): Promise<SocialPost>;
}

export interface StrainService {
  list(): Promise<Strain[]>;
}

/** Die gesamte Service-Registry (Dependency-Container). */
export interface Services {
  grows: GrowService;
  social: SocialService;
  strains: StrainService;
}

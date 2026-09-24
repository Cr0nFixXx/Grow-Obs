import { http } from "@/lib/api";
import type { Grow, SocialPost, Strain } from "@/types";
import type { GrowService, Services, SocialService, StrainService } from "./interfaces";

/**
 * API-Implementierungen (sprechen das echte Backend an).
 * Aktiv sobald `VITE_API_URL` gesetzt ist (siehe `.env.example`).
 * Die Endpunkte hier sind die erwartete REST-Konvention des Backends.
 */
const growService: GrowService = {
  list: () => http.get<Grow[]>("/grows"),
  get: (id) => http.get<Grow>(`/grows/${id}`),
  create: (input) => http.post<Grow>("/grows", input),
  addLog: (growId, log) => http.post<void>(`/grows/${growId}/logs`, log),
};

const socialService: SocialService = {
  listPosts: () => http.get<SocialPost[]>("/social/posts"),
  createPost: (input) => http.post<SocialPost>("/social/posts", input),
  toggleLike: (postId) => http.post<SocialPost>(`/social/posts/${postId}/like`),
};

const strainService: StrainService = {
  list: () => http.get<Strain[]>("/strains"),
};

export const apiServices: Services = {
  grows: growService,
  social: socialService,
  strains: strainService,
};

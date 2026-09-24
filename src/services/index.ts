import { config } from "@/lib/config";
import type { Services } from "./interfaces";
import { mockServices } from "./mock";
import { apiServices } from "./api";

export type {
  Services,
  ActivityService,
  AdminContentItem,
  AdminRole,
  AdminService,
  AdminStats,
  AdminUser,
  BreederService,
  CommunityService,
  ChatService,
  ForumService,
  GrowService,
  HallService,
  NotificationService,
  ProductService,
  SocialService,
  StrainService,
  SystemHealth,
  WikiService,
} from "./interfaces";

/**
 * Service-Factory: wählt Mock- oder API-Implementierung anhand der Konfiguration.
 * `config.useMock` → true, wenn `VITE_API_URL` nicht gesetzt ist.
 */
export const services: Services = config.useMock ? mockServices : apiServices;

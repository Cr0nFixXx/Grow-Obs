import { config } from "@/lib/config";
import type { Services } from "./interfaces";
import { mockServices } from "./mock";
import { apiServices } from "./api";

export type { Services, GrowService, SocialService, StrainService } from "./interfaces";

/**
 * Service-Factory: wählt Mock- oder API-Implementierung anhand der Konfiguration.
 * `config.useMock` → true, wenn `VITE_API_URL` nicht gesetzt ist.
 */
export const services: Services = config.useMock ? mockServices : apiServices;

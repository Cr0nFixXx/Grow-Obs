/**
 * Zentrale Domänen-Typen (Single Source of Truth).
 * Werden aktuell aus den Mocks re-exportiert; beim Backend-Umstieg bleiben diese stabil.
 */
export type {
  Type, Strain, Breeder, SeedOffer, Product, WikiArticle, Comment, ForumThread,
  ChatMessage, Conversation, GrowPhase, EnvPoint, GrowLog, Grow, HallEntry,
  NotificationItem, AIAgent, SoilComponent, SoilRecipe, SocialPost,
} from "@/mocks/data";

export interface User {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  level: number;
  title: string;
  grows: number;
  harvests: number;
  followers: number;
  telegram: boolean;
}

/** Eingaben für neue Entitäten (Subset der Pflichtfelder). */
export interface CreateGrowInput {
  name: string;
  strain: string;
  breeder: string;
  medium: string;
}

export interface CreateThreadInput {
  title: string;
  sub: string;
  text: string;
}

/** Eintrag im Aktivitäts-Feed (Dashboard/Profil). */
export interface ActivityItem {
  id: string;
  who: string;
  avatar: string;
  action: string;
  target: string;
  time: string;
  icon: string;
  color: string;
}

export type CommunityRole = "member" | "moderator" | "admin";

export interface Community {
  id: string;
  name: string;
  description: string;
  isPrivate: boolean;
  members: number;
  role?: CommunityRole;
  joined: boolean;
  createdAt: string;
}

export interface CommunityMember {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  role: CommunityRole;
}

export interface CommunityDetail extends Community {
  membersList: CommunityMember[];
}

export interface CreateCommunityInput {
  name: string;
  description: string;
  isPrivate: boolean;
}
export interface CreatePostInput {
  text: string;
  image?: string;
  tags?: string[];
}

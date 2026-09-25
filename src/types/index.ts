/** Zentrale Typen: Domäne (domain.ts) + Eingaben/Session (hier). */
export type * from "./domain";

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
  role: "member" | "moderator" | "admin" | "platform_admin";
}

/** Eingaben für neue Entitäten (Subset der Pflichtfelder). */
export interface CreateGrowInput {
  name: string;
  strain: string;
  breeder: string;
  medium: string;
}

export interface CreateStrainInput {
  name: string;
  breeder: string;
  type: "Sativa" | "Indica" | "Hybrid";
  thc: number;
  cbd: number;
  flowering: number;
  yield: string;
  difficulty: 1 | 2 | 3;
  price: number;
  notes: string;
  effects: string[];
}

export interface CreateWikiInput {
  title: string;
  category: string;
  excerpt: string;
  body: string[];
  tags: string[];
}

export type TaskPriority = "hoch" | "mittel" | "niedrig";

export interface Task {
  id: string;
  title: string;
  grow: string;
  when: string;
  prio: TaskPriority;
  done: boolean;
}

export interface CreateTaskInput {
  title: string;
  grow: string;
  when: string;
  prio: TaskPriority;
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

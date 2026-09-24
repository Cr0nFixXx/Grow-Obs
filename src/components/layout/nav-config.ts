import type { ViewKey } from "@/lib/nav";

export interface NavItem {
  key: ViewKey;
  label: string;
  icon: string;
  badge?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Desktop sidebar groups. */
export const navGroups: NavGroup[] = [
  {
    title: "Übersicht",
    items: [
      { key: "dashboard", label: "Dashboard", icon: "Home" },
      { key: "grows", label: "Meine Grows", icon: "Sprout", badge: "2" },
      { key: "strains", label: "Sorten-Sammlung", icon: "Leaf" },
      { key: "ai", label: "KI-Assistent", icon: "Sparkles" },
    ],
  },
  {
    title: "Entdecken",
    items: [
      { key: "breeders", label: "Breeder & Seeds", icon: "Store" },
      { key: "marketplace", label: "Marktplatz", icon: "ShoppingBag" },
      { key: "wiki", label: "Wiki", icon: "BookOpen" },
      { key: "forum", label: "Forum", icon: "MessagesSquare" },
      { key: "hallOfFame", label: "Hall of Fame", icon: "Trophy" },
      { key: "social", label: "Community-Feed", icon: "Users" },
    ],
  },
  {
    title: "Tools",
    items: [
      { key: "planner", label: "Grow-Planung", icon: "Scale" },
      { key: "calculator", label: "Kostenrechner", icon: "Euro" },
      { key: "consumption", label: "Verbrauch", icon: "ChartColumn" },
      { key: "simulation", label: "Simulation", icon: "Activity" },
      { key: "report", label: "Grow-Report", icon: "Newspaper" },
      { key: "showcase", label: "Design-System", icon: "Layers" },
    ],
  },
  {
    title: "Netzwerk",
    items: [
      { key: "chat", label: "Chat", icon: "MessageCircle" },
      { key: "notifications", label: "Benachrichtigungen", icon: "Bell" },
      { key: "profile", label: "Profil & Einstellungen", icon: "Settings" },
    ],
  },
];

/** Mobile bottom-nav (primary tabs). */
export const bottomNav: NavItem[] = [
  { key: "dashboard", label: "Home", icon: "Home" },
  { key: "grows", label: "Grows", icon: "Sprout" },
  { key: "forum", label: "Forum", icon: "MessagesSquare" },
  { key: "marketplace", label: "Markt", icon: "ShoppingBag" },
  { key: "profile", label: "Profil", icon: "Settings" },
];

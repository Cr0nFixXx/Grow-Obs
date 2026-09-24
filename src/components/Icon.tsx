import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, Bell, Bot, BookOpen, BrainCircuit,
  CalendarDays, Camera, ChartColumn, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Cloud, CloudSun, Code2, Command, Cpu, Database, Download, Droplets, Euro,
  ExternalLink, Filter, Flag, Flame, GitBranch, GitCommit, GitFork, GitPullRequest, Globe,
  Heart, HeartPulse, Home, Image, Info, Layers, LayoutGrid, Leaf, Lightbulb, List, ListChecks,
  Lock, Mail, MapPin, Menu, MessageCircle, MessagesSquare, Microscope, Moon, MoreHorizontal,
  Newspaper, NotebookPen, Package, Paperclip, Pencil, Percent, Plus, Power, QrCode, Quote,
  Rocket, Scale, Search, Send, Settings, Share2, ShieldCheck, ShoppingBag, Sigma, Smile,
  SlidersHorizontal, Sparkles, Sprout, Star, Store, Sun, SunMedium, Thermometer, Trash2,
  TrendingDown, TrendingUp, Trophy, Users, Wand2, Wind, Zap, type LucideIcon,
} from "lucide-react";

/** Curated icon registry — lets mock data reference icons by string name. */
export const icons: Record<string, LucideIcon> = {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, Bell, Bot, BookOpen, BrainCircuit,
  CalendarDays, Camera, ChartColumn, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Cloud, CloudSun, Code2, Command, Cpu, Database, Download, Droplets, Euro,
  ExternalLink, Filter, Flag, Flame, GitBranch, GitCommit, GitFork, GitPullRequest, Globe,
  Heart, HeartPulse, Home, Image, Info, Layers, LayoutGrid, Leaf, Lightbulb, List, ListChecks,
  Lock, Mail, MapPin, Menu, MessageCircle, MessagesSquare, Microscope, Moon, MoreHorizontal,
  Newspaper, NotebookPen, Package, Paperclip, Pencil, Percent, Plus, Power, QrCode, Quote,
  Rocket, Scale, Search, Send, Settings, Share2, ShieldCheck, ShoppingBag, Sigma, Smile,
  SlidersHorizontal, Sparkles, Sprout, Star, Store, Sun, SunMedium, Thermometer, Trash2,
  TrendingDown, TrendingUp, Trophy, Users, Wand2, Wind, Zap,
};

export function Icon({
  name,
  className,
  size = 20,
  strokeWidth = 2,
}: {
  name: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const Cmp = icons[name] ?? icons.Sparkles;
  return <Cmp className={className} size={size} strokeWidth={strokeWidth} aria-hidden />;
}

export interface Profile {
  name: string;
  avatar: string;
  tagline: string;
  intro: string;
  quote: string;
  resumePdfUrl?: string;
  musicAutoplay?: boolean;
  pageCopy?: {
    resume?: string;
    works?: string;
    gallery?: string;
    treasures?: string;
    contact?: string;
    resumePdfs?: {
      productManager?: string;
      newMedia?: string;
    };
    floatingSentences?: FloatingSentencesConfig;
  };
}

export interface Experience {
  id: string;
  period: string;
  role: string;
  company: string;
  desc: string;
}

export interface Prospects {
  title: string;
  content: string;
  points: string[];
}

export interface WorkLink {
  label: string;
  url: string;
  kind?: "link" | "attachment";
  fileName?: string;
}

export interface Work {
  id: string;
  category: "operation" | "app" | "prototype" | "video" | "poetry" | string;
  title: string;
  description: string;
  icon?: string;
  badgeText?: string;
  images: string[];
  videoUrl?: string;
  links?: WorkLink[];
  tags: string[];
}

export interface ContactInfo {
  wechat: string;
  qq: string;
  email: string;
  phone?: string;
  github?: string;
}

export interface GalleryItem {
  id: string;
  category: string;
  title: string;
  description: string;
  imageUrl: string;
}

export interface TreasureItem {
  id: string;
  imageUrl: string;
}

export interface FloatingSentencesConfig {
  enabled?: boolean;
  speed?: number;
  count?: number;
  sentences?: string[];
  borderEnabled?: boolean;
  global?: boolean;
  pages?: Record<string, { enabled?: boolean; sentences?: string[]; count?: number; borderEnabled?: boolean }>;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  coverUrl: string;
  lyrics?: string;
}

export interface PortfolioData {
  profile: Profile;
  experiences: Experience[];
  prospects: Prospects;
  works: Work[];
  gallery?: GalleryItem[];
  treasures?: TreasureItem[];
  musicTracks?: MusicTrack[];
  contact?: ContactInfo;
}

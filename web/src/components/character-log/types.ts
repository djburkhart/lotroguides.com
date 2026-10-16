export type PlayLogItem = {
  name: string;
  displayName?: string;
  index?: number;
  slot?: string;
  slotId?: number;
  quantity?: number;
  quality?: string;
  qualityId?: number;
  category?: string;
  durability?: string;
  wearState?: string;
  iconImageId?: number;
  description?: string;
  unique?: boolean;
  boundOwner?: string;
  chest?: number;
  chestName?: string;
  maxStackSize?: number;
  magic?: boolean;
};

export type PlayLogContainer = {
  available?: boolean;
  capacity?: number;
  count?: number;
  totalCount?: number;
  truncated?: boolean;
  items?: PlayLogItem[];
};

export type PlayLogSkill = {
  name: string;
  trained?: boolean;
  type?: string;
  iconImageId?: number;
  price?: number;
  requiredLevel?: number;
};

export type PlayLogEffect = {
  name: string;
  id?: number;
  debuff?: boolean;
  curable?: boolean;
  dispellable?: boolean;
  duration?: number;
  category?: string;
  iconImageId?: number;
};

export type PlayLogProfession = {
  key?: string;
  profession?: string;
  name?: string;
  proficiencyLevel?: number;
  proficiencyTitle?: string;
  proficiencyExperience?: number;
  proficiencyExperienceTarget?: number;
  masteryLevel?: number;
  masteryTitle?: string;
  masteryExperience?: number;
  masteryExperienceTarget?: number;
  recipeCount?: number;
  recipes?: {
    name: string;
    tier?: number;
    category?: string;
    experienceReward?: number;
    singleUse?: boolean;
    resultItem?: { name: string; quantity?: number; iconImageId?: number } | null;
    criticalResultItem?: { name: string; quantity?: number } | null;
    ingredients?: { name: string; quantity?: number; iconImageId?: number }[];
    ingredientPack?: { name: string; quantity?: number } | null;
  }[];
};

export type PlayLogSnapshot = {
  schemaVersion?: number;
  plugin?: string;
  pluginVersion?: string;
  localTime?: string;
  character: {
    name: string;
    level?: number;
    race?: string;
    class?: string;
    alignment?: string;
    vocation?: string;
    inCombat?: boolean;
    destinyPoints?: number;
    money?: { gold?: number; silver?: number; copper?: number; totalCopper?: number };
    vitals?: Record<string, number | null | undefined>;
    stats?: Record<string, number | boolean | null | undefined>;
    classResources?: Record<string, unknown>;
  };
  equipment?: PlayLogItem[];
  wallet?: { name: string; quantity?: number; maxQuantity?: number; accountItem?: boolean }[];
  backpack?: PlayLogContainer;
  vault?: PlayLogContainer;
  sharedStorage?: PlayLogContainer;
  skills?: { trained?: PlayLogSkill[]; untrained?: PlayLogSkill[] };
  effects?: PlayLogEffect[];
  crafting?: { professions?: PlayLogProfession[] };
  mount?: { name: string; level?: number } | null;
  pet?: { name: string; level?: number } | null;
  sections?: Record<string, boolean>;
  notes?: string[];
};

export type SavedCharacter = {
  id: string;
  server: string;
  importedAt: string;
  snapshot: PlayLogSnapshot;
};

export type PlayLogStore = {
  version: number;
  selectedId: string;
  characters: SavedCharacter[];
};

export type PlayLogApi = {
  STORAGE_KEY: string;
  SLOT_ORDER: string[];
  parse: (text: string) => PlayLogSnapshot;
  load: () => PlayLogStore;
  upsert: (snapshot: PlayLogSnapshot, server: string) => { character: SavedCharacter; updated: boolean; notice: string };
  select: (id: string) => PlayLogStore;
  remove: (id: string) => PlayLogStore;
  classKey: (value: string | { class?: string } | null | undefined) => string | null;
  label: (value: unknown) => string;
  slotLabel: (slot: string) => string;
  describe: (text: unknown) => string;
  escapeHtml: (value: unknown) => string;
  iconSources: (id: number, kind?: string) => string[];
};

declare global {
  interface Window {
    LotroPlayLog?: PlayLogApi;
    LOTRO_CDN?: string;
  }
}

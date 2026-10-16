"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  PlayLogApi,
  PlayLogContainer,
  PlayLogEffect,
  PlayLogItem,
  PlayLogProfession,
  PlayLogSkill,
  PlayLogSnapshot,
  PlayLogStore,
  SavedCharacter,
} from "./types";

const PAGE_SIZE = 48;
const QUALITIES = ["Legendary", "Rare", "Incomparable", "Uncommon", "Common"];
const QUALITY_RANK: Record<string, number> = {
  Legendary: 1,
  Rare: 2,
  Incomparable: 3,
  Uncommon: 4,
  Common: 5,
};

const STAT_GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Attributes",
    rows: [
      ["might", "Might"],
      ["baseMight", "Base might"],
      ["agility", "Agility"],
      ["baseAgility", "Base agility"],
      ["vitality", "Vitality"],
      ["baseVitality", "Base vitality"],
      ["will", "Will"],
      ["baseWill", "Base will"],
      ["fate", "Fate"],
      ["baseFate", "Base fate"],
      ["finesse", "Finesse"],
    ],
  },
  {
    title: "Armor and healing",
    rows: [
      ["armor", "Armor"],
      ["baseArmor", "Base armor"],
      ["outgoingHealing", "Outgoing healing"],
      ["incomingHealing", "Incoming healing"],
      ["moraleInCombatRegen", "Morale regen, in combat"],
      ["moraleOutOfCombatRegen", "Morale regen, out of combat"],
      ["powerInCombatRegen", "Power regen, in combat"],
      ["powerOutOfCombatRegen", "Power regen, out of combat"],
    ],
  },
  {
    title: "Mitigation",
    rows: [
      ["commonMitigation", "Common"],
      ["physicalMitigation", "Physical"],
      ["tacticalMitigation", "Tactical"],
      ["fireMitigation", "Fire"],
      ["lightningMitigation", "Lightning"],
      ["frostMitigation", "Frost"],
      ["acidMitigation", "Acid"],
      ["shadowMitigation", "Shadow"],
    ],
  },
  {
    title: "Damage and critical",
    rows: [
      ["meleeDamage", "Melee damage"],
      ["rangeDamage", "Ranged damage"],
      ["tacticalDamage", "Tactical damage"],
      ["criticalHitChance", "Critical chance"],
      ["criticalHitAvoidance", "Critical avoidance"],
      ["meleeCriticalHitChance", "Melee critical chance"],
      ["rangeCriticalHitChance", "Ranged critical chance"],
      ["tacticalCriticalHitChance", "Tactical critical chance"],
      ["meleeCriticalHitAvoidance", "Melee critical avoidance"],
      ["rangeCriticalHitAvoidance", "Ranged critical avoidance"],
      ["tacticalCriticalHitAvoidance", "Tactical critical avoidance"],
    ],
  },
  {
    title: "Defence",
    rows: [
      ["meleeDefence", "Melee defence"],
      ["rangeDefence", "Ranged defence"],
      ["tacticalDefence", "Tactical defence"],
      ["block", "Block"],
      ["parry", "Parry"],
      ["evade", "Evade"],
      ["canBlock", "Can block"],
      ["canParry", "Can parry"],
      ["canEvade", "Can evade"],
    ],
  },
  {
    title: "Resistance",
    rows: [
      ["diseaseResistance", "Disease"],
      ["fearResistance", "Fear"],
      ["poisonResistance", "Poison"],
      ["woundResistance", "Wound"],
      ["baseResistance", "Base"],
    ],
  },
];

const RESOURCE_LABELS: Record<string, string> = {
  wrath: "Wrath",
  inBearForm: "Bear form",
  fervor: "Fervor",
  focus: "Focus",
  balance: "Balance",
  attunement: "Attunement",
  charged: "Charged",
  rampage: "Rampage",
  stanceId: "Stance",
  gambitCount: "Gambits",
  maxGambitCount: "Max gambits",
};

const TABS = [
  ["overview", "Overview"],
  ["equipment", "Equipment"],
  ["backpack", "Bags"],
  ["vault", "Vault"],
  ["sharedStorage", "Shared"],
  ["wallet", "Wallet"],
  ["skills", "Skills"],
  ["effects", "Effects"],
  ["crafting", "Crafting"],
] as const;

type TabId = (typeof TABS)[number][0];

const EMPTY_STORE: PlayLogStore = { version: 1, selectedId: "", characters: [] };

function loadApi(): Promise<PlayLogApi> {
  if (window.LotroPlayLog) return Promise.resolve(window.LotroPlayLog);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-playlog="1"]');
    const script = existing || document.createElement("script");
    const finish = () => (window.LotroPlayLog ? resolve(window.LotroPlayLog) : reject(new Error("missing")));
    script.addEventListener("load", finish);
    script.addEventListener("error", () => reject(new Error("missing")));
    if (!existing) {
      script.src = "/js/playlog.js";
      script.dataset.playlog = "1";
      document.body.appendChild(script);
    } else if (window.LotroPlayLog) {
      finish();
    }
  });
}

function numberOf(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  return "";
}

function qualityClass(quality?: string) {
  const key = (quality || "").toLowerCase();
  return ["legendary", "rare", "incomparable", "uncommon", "common"].includes(key) ? `clog-q-${key}` : "";
}

function when(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ");
  return date.toLocaleString();
}

function countItems(box?: PlayLogContainer) {
  return box?.items?.length || 0;
}

function GameIcon({ id, kind, alt }: { id?: number; kind?: "item" | "skill" | "effect"; alt: string }) {
  const [index, setIndex] = useState(0);
  const sources = id && window.LotroPlayLog ? window.LotroPlayLog.iconSources(id, kind || "item") : [];
  if (!sources[index]) return <span className="clog-icon clog-icon-empty" aria-hidden="true" />;
  return (
    <img
      className="clog-icon"
      src={sources[index]}
      width={36}
      height={36}
      alt={alt}
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

function RichText({ text }: { text?: string }) {
  const html = window.LotroPlayLog?.describe(text || "") || "";
  if (!html) return null;
  return <div className="clog-desc" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Money({ money }: { money?: PlayLogSnapshot["character"]["money"] }) {
  if (!money) return <span className="clog-muted">No coin recorded</span>;
  return (
    <span className="clog-money">
      <span className="clog-gold">{(money.gold ?? 0).toLocaleString()} gold</span>
      <span className="clog-silver">{money.silver ?? 0} silver</span>
      <span className="clog-copper">{money.copper ?? 0} copper</span>
    </span>
  );
}

function Vital({ label, current, max, tone }: { label: string; current: unknown; max: unknown; tone?: string }) {
  const value = numberOf(current);
  const cap = numberOf(max);
  if (value == null || cap == null || cap <= 0) return null;
  const width = Math.max(0, Math.min(100, (value / cap) * 100));
  return (
    <div className={tone ? `clog-bar ${tone}` : "clog-bar"}>
      <span style={{ width: `${width}%` }} />
      <b>
        <span>{label}</span>
        <span>
          {value.toLocaleString()} / {cap.toLocaleString()}
        </span>
      </b>
    </div>
  );
}

function Meter({ value, max }: { value?: number; max?: number }) {
  if (value == null || max == null || max <= 0) return null;
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="clog-meter" aria-hidden="true">
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

function ItemButton({ item, api, kicker }: { item: PlayLogItem; api: PlayLogApi; kicker?: string }) {
  const [open, setOpen] = useState(false);
  const quantity = item.quantity && item.quantity > 1 ? item.quantity : null;
  const meta = [item.category ? api.label(item.category) || item.category : "", item.quality && item.quality !== "Undefined" ? item.quality : ""]
    .filter(Boolean)
    .join(" · ");
  const extra = [
    item.wearState && item.wearState !== "Undefined" ? item.wearState : "",
    item.durability && item.durability !== "Undefined" ? item.durability : "",
    item.unique ? "Unique" : "",
    item.magic ? "Magic" : "",
    item.boundOwner ? `Bound to ${item.boundOwner}` : "",
    item.chestName || "",
  ].filter(Boolean);
  return (
    <button type="button" className="clog-item" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <GameIcon id={item.iconImageId} alt="" />
      <span>
        <strong className={qualityClass(item.quality)}>
          {quantity ? <span className="clog-qty">{quantity.toLocaleString()}</span> : null}
          {item.name}
        </strong>
        <span className="clog-muted">
          {kicker ? `${kicker} · ` : ""}
          {item.index ? `#${item.index} ` : ""}
          {meta || "Item"}
          {item.maxStackSize && item.maxStackSize > 1 ? ` · stack ${item.maxStackSize.toLocaleString()}` : ""}
        </span>
        {extra.length > 0 && <span className="clog-muted">{extra.join(" · ")}</span>}
        {item.displayName && item.displayName !== item.name ? <span className="clog-muted">{item.displayName}</span> : null}
      </span>
      {open ? <RichText text={item.description} /> : null}
    </button>
  );
}

function matchesQuery(item: PlayLogItem, query: string) {
  if (!query) return true;
  const haystack = [item.name, item.displayName, item.category, item.description, item.quality].join(" ").toLowerCase();
  return haystack.includes(query);
}

function combineStacks(items: PlayLogItem[]) {
  const groups = new Map<string, PlayLogItem>();
  items.forEach((item) => {
    const key = [item.name, item.iconImageId || 0, item.quality || "", item.category || ""].join("\n");
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...item });
      return;
    }
    existing.quantity = (existing.quantity || 0) + (item.quantity || 0);
  });
  return [...groups.values()];
}

function ContainerView({
  api,
  snapshot,
  containerKey,
}: {
  api: PlayLogApi;
  snapshot: PlayLogSnapshot;
  containerKey: "backpack" | "vault" | "sharedStorage";
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [quality, setQuality] = useState("");
  const [combine, setCombine] = useState(false);
  const [sort, setSort] = useState("slot");
  const [page, setPage] = useState(1);
  const box = snapshot[containerKey];
  const flagged = snapshot.sections?.[containerKey];
  const title = containerKey === "backpack" ? "Bags" : containerKey === "vault" ? "Vault" : "Shared storage";

  const categories = useMemo(() => {
    const names = new Set<string>();
    (box?.items || []).forEach((item) => names.add(item.category || "Uncategorized"));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [box]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let items = (box?.items || []).filter((item) => {
      if (category && (item.category || "Uncategorized") !== category) return false;
      if (quality && item.quality !== quality) return false;
      return matchesQuery(item, needle);
    });
    if (combine) items = combineStacks(items);
    items = items.slice().sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "quantity") return (b.quantity || 0) - (a.quantity || 0);
      if (sort === "quality") return (QUALITY_RANK[a.quality || ""] || 9) - (QUALITY_RANK[b.quality || ""] || 9);
      return (a.index || 0) - (b.index || 0);
    });
    return items;
  }, [box, query, category, quality, combine, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, category, quality, combine, sort, containerKey, snapshot.character.name]);

  if (!box) {
    return (
      <p className="clog-muted">
        {flagged === false
          ? `${title} were turned off in PlayLog. Check that box and snapshot again.`
          : `${title} were not in this snapshot. Open that window in game, check it in PlayLog, and snapshot again.`}
      </p>
    );
  }
  if (box.available === false) {
    return <p className="clog-muted">{title} could not be read. Open the window in game, then snapshot again.</p>;
  }

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const groups = new Map<string, PlayLogItem[]>();
  visible.forEach((item) => {
    const key = item.chestName || "";
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  });

  return (
    <div>
      <p className="clog-muted">
        {countItems(box).toLocaleString()} items
        {box.capacity ? ` · ${box.capacity.toLocaleString()} slots` : ""}
        {box.truncated ? ` · showing the first ${box.count?.toLocaleString()} of ${box.totalCount?.toLocaleString()}` : ""}
      </p>
      <div className="clog-filters">
        <div className="clog-field clog-field-grow">
          <label htmlFor={`${containerKey}-q`}>Search</label>
          <input id={`${containerKey}-q`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="clog-field">
          <label htmlFor={`${containerKey}-cat`}>Category</label>
          <select id={`${containerKey}-cat`} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name === "Uncategorized" ? name : api.label(name) || name}
              </option>
            ))}
          </select>
        </div>
        <div className="clog-field">
          <label htmlFor={`${containerKey}-qual`}>Quality</label>
          <select id={`${containerKey}-qual`} value={quality} onChange={(event) => setQuality(event.target.value)}>
            <option value="">All</option>
            {QUALITIES.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="clog-field">
          <label htmlFor={`${containerKey}-sort`}>Sort</label>
          <select id={`${containerKey}-sort`} value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="slot">Bag slot</option>
            <option value="name">Name</option>
            <option value="quantity">Quantity</option>
            <option value="quality">Quality</option>
          </select>
        </div>
        <label className="clog-check">
          <input type="checkbox" checked={combine} onChange={(event) => setCombine(event.target.checked)} />
          Combine stacks
        </label>
      </div>
      {filtered.length === 0 ? <p className="clog-muted">No items match.</p> : null}
      {[...groups.entries()].map(([chest, items]) => (
        <div key={chest || "all"} style={{ marginBottom: 12 }}>
          {chest ? <h3>{chest}</h3> : null}
          <div className="clog-items">
            {items.map((item) => (
              <ItemButton key={`${item.index}-${item.name}-${item.quantity}`} item={item} api={api} />
            ))}
          </div>
        </div>
      ))}
      {pages > 1 ? (
        <div className="clog-pager">
          <button type="button" className="clog-btn-quiet" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
            Previous
          </button>
          <span className="clog-muted">
            Page {safePage} of {pages}
          </span>
          <button type="button" className="clog-btn-quiet" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SkillList({ skills, empty }: { skills: PlayLogSkill[]; empty: string }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const filtered = skills.filter((skill) => skill.name.toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  useEffect(() => setPage(1), [query, skills]);
  if (!skills.length) return <p className="clog-muted">{empty}</p>;
  return (
    <div>
      <div className="clog-filters">
        <div className="clog-field clog-field-grow">
          <label htmlFor="skill-q">Search skills</label>
          <input id="skill-q" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>
      <p className="clog-muted">{filtered.length.toLocaleString()} skills</p>
      <div className="clog-skills">
        {visible.map((skill) => (
          <article className="clog-skill" key={`${skill.name}-${skill.iconImageId || 0}-${skill.requiredLevel || 0}`}>
            <GameIcon id={skill.iconImageId} kind="skill" alt="" />
            <span>
              <strong>{skill.name}</strong>
              <span className="clog-muted">
                {[skill.type, skill.requiredLevel ? `requires level ${skill.requiredLevel}` : "", skill.price ? `${skill.price.toLocaleString()} copper` : ""]
                  .filter(Boolean)
                  .join(" · ") || "Skill"}
              </span>
            </span>
          </article>
        ))}
      </div>
      {pages > 1 ? (
        <div className="clog-pager">
          <button type="button" className="clog-btn-quiet" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
            Previous
          </button>
          <span className="clog-muted">
            Page {safePage} of {pages}
          </span>
          <button type="button" className="clog-btn-quiet" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ProfessionCard({ profession }: { profession: PlayLogProfession }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const recipes = profession.recipes || [];
  const recipeCount = recipes.length || profession.recipeCount || 0;
  const visible = recipes.filter((recipe) => recipe.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 80);
  const title = profession.name || profession.profession || profession.key || "Profession";
  return (
    <article className="clog-profession">
      <h3>{title}</h3>
      <div>
        Proficiency {profession.proficiencyLevel ?? "—"}
        {profession.proficiencyTitle ? ` · ${profession.proficiencyTitle}` : ""}
        {profession.proficiencyExperience != null && profession.proficiencyExperienceTarget
          ? ` · ${profession.proficiencyExperience.toLocaleString()} / ${profession.proficiencyExperienceTarget.toLocaleString()}`
          : ""}
      </div>
      <Meter value={profession.proficiencyExperience} max={profession.proficiencyExperienceTarget} />
      <div>
        Mastery {profession.masteryLevel ?? "—"}
        {profession.masteryTitle ? ` · ${profession.masteryTitle}` : ""}
        {profession.masteryExperience != null && profession.masteryExperienceTarget
          ? ` · ${profession.masteryExperience.toLocaleString()} / ${profession.masteryExperienceTarget.toLocaleString()}`
          : ""}
      </div>
      <Meter value={profession.masteryExperience} max={profession.masteryExperienceTarget} />
      <p className="clog-muted">{recipeCount ? `${recipeCount.toLocaleString()} recipes` : "Recipe list was not included."}</p>
      {recipes.length > 0 ? (
        <button type="button" className="clog-btn-quiet" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide recipes" : "Show recipes"}
        </button>
      ) : null}
      {open ? (
        <div style={{ marginTop: 10 }}>
          <input type="search" value={query} placeholder="Search recipes" onChange={(event) => setQuery(event.target.value)} />
          <ul>
            {visible.map((recipe) => (
              <li key={`${recipe.name}-${recipe.tier || 0}`}>
                {recipe.name}
                {recipe.tier != null ? ` · tier ${recipe.tier}` : ""}
                {recipe.category ? ` · ${recipe.category}` : ""}
                {recipe.resultItem?.name ? ` → ${recipe.resultItem.name}` : ""}
              </li>
            ))}
          </ul>
          {recipes.length > visible.length ? <p className="clog-muted">Showing the first {visible.length} matches. Narrow the search to see more.</p> : null}
        </div>
      ) : null}
    </article>
  );
}

function Sheet({ api, entry }: { api: PlayLogApi; entry: SavedCharacter }) {
  const [tab, setTab] = useState<TabId>("overview");
  const [skillMode, setSkillMode] = useState<"trained" | "untrained">("trained");
  const snapshot = entry.snapshot;
  const character = snapshot.character;
  const stats = character.stats || {};
  const resources = character.classResources || {};
  const gambits = Array.isArray(resources.trainedGambits) ? (resources.trainedGambits as PlayLogSkill[]) : [];
  const resourceRows = Object.entries(RESOURCE_LABELS).filter(([key]) => resources[key] != null && resources[key] !== "");
  const classSlug = api.classKey(character);
  const identity = [
    character.level ? `Level ${character.level}` : "",
    api.label(character.race),
    api.label(character.class),
    api.label(character.vocation),
    api.label(character.alignment),
    entry.server,
  ].filter(Boolean);

  return (
    <div className="clog-sheet" style={{ padding: 16 }}>
      <div className="clog-header">
        <div>
          <h2>{character.name}</h2>
          <div className="clog-muted">{identity.join(" · ") || "Character"}</div>
          <div className="clog-muted">Snapshotted {when(snapshot.localTime)} · imported {when(entry.importedAt)}</div>
        </div>
        <div className="clog-actions">
          {classSlug ? (
            <a className="clog-btn" href={`/skills?character=${encodeURIComponent(entry.id)}`}>
              Open skills
            </a>
          ) : null}
          <button
            type="button"
            className="clog-btn-quiet"
            onClick={() => {
              const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${character.name.replace(/[^\w.-]+/g, "_")}.json`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download JSON
          </button>
        </div>
      </div>
      <div className="clog-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className="clog-tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div>
          <div className="clog-bars">
            <Vital label="Morale" current={character.vitals?.morale} max={character.vitals?.maxMorale} />
            <Vital label="Power" current={character.vitals?.power} max={character.vitals?.maxPower} tone="clog-bar-power" />
          </div>
          <dl className="clog-kv" style={{ marginBottom: 14 }}>
            <dt>Coin</dt>
            <dd>
              <Money money={character.money} />
            </dd>
            {character.destinyPoints != null && (
              <>
                <dt>Destiny points</dt>
                <dd>{character.destinyPoints.toLocaleString()}</dd>
              </>
            )}
            {snapshot.mount?.name && (
              <>
                <dt>Mount</dt>
                <dd>
                  {snapshot.mount.name}
                  {snapshot.mount.level ? ` (${snapshot.mount.level})` : ""}
                </dd>
              </>
            )}
            {snapshot.pet?.name && (
              <>
                <dt>Pet</dt>
                <dd>
                  {snapshot.pet.name}
                  {snapshot.pet.level ? ` (${snapshot.pet.level})` : ""}
                </dd>
              </>
            )}
            <dt>Equipped</dt>
            <dd>{(snapshot.equipment || []).length}</dd>
            <dt>Bag items</dt>
            <dd>{countItems(snapshot.backpack)}</dd>
            <dt>Vault items</dt>
            <dd>{countItems(snapshot.vault)}</dd>
            <dt>Shared storage</dt>
            <dd>{countItems(snapshot.sharedStorage)}</dd>
            <dt>Trained skills</dt>
            <dd>{snapshot.skills?.trained?.length || 0}</dd>
            <dt>Effects</dt>
            <dd>{snapshot.effects?.length || 0}</dd>
          </dl>
          {resourceRows.length > 0 && (
            <div className="clog-stat-card" style={{ marginBottom: 12 }}>
              <h3>Class resources</h3>
              <dl>
                {resourceRows.map(([key, label]) => (
                  <span key={key} style={{ display: "contents" }}>
                    <dt>{label}</dt>
                    <dd>{formatValue(resources[key])}</dd>
                  </span>
                ))}
              </dl>
              {gambits.length > 0 && <p className="clog-muted">{gambits.length} trained gambits</p>}
            </div>
          )}
          <div className="clog-stats">
            {STAT_GROUPS.map((group) => {
              const rows = group.rows.filter(([key]) => stats[key] != null);
              if (!rows.length) return null;
              return (
                <article className="clog-stat-card" key={group.title}>
                  <h3>{group.title}</h3>
                  <dl>
                    {rows.map(([key, label]) => (
                      <span key={key} style={{ display: "contents" }}>
                        <dt>{label}</dt>
                        <dd>{formatValue(stats[key])}</dd>
                      </span>
                    ))}
                  </dl>
                </article>
              );
            })}
          </div>
          {snapshot.notes && snapshot.notes.length > 0 && (
            <ul className="clog-notes">
              {snapshot.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "equipment" && (
        <div className="clog-equip">
          {api.SLOT_ORDER.map((slot) => {
            const item = (snapshot.equipment || []).find((entry) => entry.slot === slot);
            if (!item) {
              return (
                <article className="clog-item" key={slot} style={{ cursor: "default" }}>
                  <GameIcon alt="" />
                  <span>
                    <span className="clog-muted">{api.slotLabel(slot)}</span>
                    <strong className="clog-muted">Empty</strong>
                  </span>
                </article>
              );
            }
            return <ItemButton key={slot} item={item} api={api} kicker={api.slotLabel(slot)} />;
          })}
          {(snapshot.equipment || [])
            .filter((item) => item.slot && !api.SLOT_ORDER.includes(item.slot))
            .map((item) => (
              <ItemButton key={`${item.slot}-${item.name}`} item={item} api={api} kicker={api.slotLabel(item.slot || "")} />
            ))}
        </div>
      )}

      {(tab === "backpack" || tab === "vault" || tab === "sharedStorage") && (
        <ContainerView api={api} snapshot={snapshot} containerKey={tab} />
      )}

      {tab === "wallet" && (
        <div className="clog-wallet">
          {(snapshot.wallet || []).length === 0 && <p className="clog-muted">No wallet currencies were recorded.</p>}
          {(snapshot.wallet || []).map((item) => (
            <article key={item.name}>
              <strong>{item.name}</strong>
              <div>
                {(item.quantity ?? 0).toLocaleString()}
                {item.maxQuantity ? ` / ${item.maxQuantity.toLocaleString()}` : ""}
              </div>
              {item.accountItem ? <div className="clog-muted">Account item</div> : null}
            </article>
          ))}
        </div>
      )}

      {tab === "skills" && (
        <div>
          <div className="clog-tabs">
            <button type="button" className="clog-tab" aria-selected={skillMode === "trained"} onClick={() => setSkillMode("trained")}>
              Trained ({snapshot.skills?.trained?.length || 0})
            </button>
            <button type="button" className="clog-tab" aria-selected={skillMode === "untrained"} onClick={() => setSkillMode("untrained")}>
              Untrained ({snapshot.skills?.untrained?.length || 0})
            </button>
          </div>
          {!snapshot.skills ? (
            <p className="clog-muted">Skills were not included. Check Skills in PlayLog and snapshot again.</p>
          ) : (
            <SkillList
              skills={skillMode === "trained" ? snapshot.skills.trained || [] : snapshot.skills.untrained || []}
              empty={skillMode === "trained" ? "No trained skills in this snapshot." : "Untrained skills were not included."}
            />
          )}
          {gambits.length > 0 && skillMode === "trained" && (
            <div style={{ marginTop: 16 }}>
              <h3>Trained gambits</h3>
              <SkillList skills={gambits} empty="" />
            </div>
          )}
        </div>
      )}

      {tab === "effects" && <EffectList effects={snapshot.effects} included={snapshot.sections?.effects !== false || !!snapshot.effects} />}

      {tab === "crafting" && (
        <div>
          {(snapshot.crafting?.professions || []).length === 0 && <p className="clog-muted">No crafting professions were recorded.</p>}
          {(snapshot.crafting?.professions || []).map((profession) => (
            <ProfessionCard key={profession.key || profession.name || profession.profession} profession={profession} />
          ))}
        </div>
      )}
    </div>
  );
}

function EffectList({ effects, included }: { effects?: PlayLogEffect[]; included: boolean }) {
  if (!effects) {
    return <p className="clog-muted">{included ? "Effects were not in this snapshot." : "Effects were turned off in PlayLog."}</p>;
  }
  if (!effects.length) return <p className="clog-muted">No active effects.</p>;
  return (
    <div className="clog-skills">
      {effects.map((effect) => (
        <article className="clog-skill" key={`${effect.id || effect.name}`}>
          <GameIcon id={effect.iconImageId} kind="effect" alt="" />
          <span>
            <strong>{effect.name}</strong>
            <span className="clog-muted">
              {[effect.debuff ? "Debuff" : "Buff", effect.category, effect.curable ? "Curable" : "", effect.duration ? `duration ${effect.duration}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </article>
      ))}
    </div>
  );
}

export function CharacterLog() {
  const [api, setApi] = useState<PlayLogApi | null>(null);
  const [store, setStore] = useState<PlayLogStore>(EMPTY_STORE);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState("");
  const [server, setServer] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [importOpen, setImportOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadApi()
      .then((next) => {
        if (cancelled) return;
        const params = new URLSearchParams(window.location.search);
        const requested = params.get("id");
        const loaded = next.load();
        const store = requested && loaded.characters.some((entry) => entry.id === requested) ? next.select(requested) : loaded;
        setApi(next);
        setStore(store);
        setImportOpen(store.characters.length === 0);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = store.characters.find((entry) => entry.id === store.selectedId) || store.characters[0] || null;

  function remember(next: PlayLogStore) {
    setStore(next);
    const url = new URL(window.location.href);
    if (next.selectedId) url.searchParams.set("id", next.selectedId);
    else url.searchParams.delete("id");
    window.history.replaceState(null, "", url);
  }

  function importText(source: string) {
    if (!api) return;
    try {
      const snapshot = api.parse(source);
      const result = api.upsert(snapshot, server);
      remember(api.load());
      setStatus({ kind: "ok", text: result.notice });
      setText("");
      setImportOpen(false);
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "Import failed." });
    }
  }

  return (
    <div className="clog">
      <h1>Character Log</h1>
      <p className="clog-lead">
        Import a character from the PlayLog plugin. Choose the PlayLogSnapshot.plugindata file the game writes, or paste the JSON from the plugin window. Equipment, bags, vault, shared storage, wallet, skills, effects, stats, and crafting stay in this browser.
      </p>
      {failed && <p className="clog-status clog-status-error">The character import library did not load. Refresh the page and try again.</p>}

      <div className="clog-import">
        <div className="clog-header" style={{ marginBottom: 0 }}>
          <h2 style={{ fontSize: 20 }}>Import a character</h2>
          <button type="button" className="clog-btn-quiet" onClick={() => setImportOpen((open) => !open)}>
            {importOpen ? "Hide" : "Show"}
          </button>
        </div>
        {importOpen && (
          <div style={{ marginTop: 12 }}>
            <ol className="clog-steps">
              <li>In LOTRO, type /playlog and click Snapshot.</li>
              <li>Open Documents\The Lord of the Rings Online\PluginData, then your account, server, and character folders.</li>
              <li>Choose PlayLogSnapshot.plugindata. Put that server folder name in the server box so alts stay separate. You can also paste the JSON from the plugin window.</li>
            </ol>
            <div className="clog-row">
              <div className="clog-field">
                <label htmlFor="clog-server">Server</label>
                <input id="clog-server" type="text" value={server} maxLength={40} placeholder="Server folder name" onChange={(event) => setServer(event.target.value)} />
              </div>
              <div className="clog-field clog-field-grow">
                <label htmlFor="clog-file">PlayLog file</label>
                <input
                  id="clog-file"
                  type="file"
                  accept=".plugindata,.json,.txt,application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    file.text().then((contents) => {
                      setText(contents);
                      importText(contents);
                    });
                    event.target.value = "";
                  }}
                />
              </div>
            </div>
            <div className="clog-field" style={{ marginTop: 12 }}>
              <label htmlFor="clog-json">Snapshot</label>
              <textarea
                id="clog-json"
                value={text}
                placeholder="Choose PlayLogSnapshot.plugindata, or paste that file or the plugin JSON here."
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <div className="clog-actions">
              <button type="button" className="clog-btn" onClick={() => importText(text)}>
                Import character
              </button>
            </div>
          </div>
        )}
        {status && <p className={status.kind === "ok" ? "clog-status clog-status-ok" : "clog-status clog-status-error"}>{status.text}</p>}
      </div>

      {store.characters.length === 0 ? (
        <div className="clog-empty">No characters yet. Snapshot one in PlayLog and choose PlayLogSnapshot.plugindata above.</div>
      ) : (
        <div className="clog-layout">
          <div className="clog-list">
            {store.characters.map((entry) => {
              const character = entry.snapshot.character;
              const current = selected?.id === entry.id;
              return (
                <button key={entry.id} type="button" aria-current={current ? "true" : undefined} onClick={() => remember(api!.select(entry.id))}>
                  <strong>{character.name}</strong>
                  <span>
                    {[character.level ? `Lv ${character.level}` : "", api?.label(character.class), entry.server].filter(Boolean).join(" · ")}
                  </span>
                </button>
              );
            })}
          </div>
          {selected && api ? (
            <div>
              <Sheet key={selected.id} api={api} entry={selected} />
              <div className="clog-actions">
                <button
                  type="button"
                  className="clog-btn-quiet"
                  onClick={() => {
                    if (!window.confirm(`Remove ${selected.snapshot.character.name} from this browser?`)) return;
                    remember(api.remove(selected.id));
                  }}
                >
                  Remove character
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

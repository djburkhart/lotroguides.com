import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { lookupLootItem, lootIconUrl, visibleChests, type LootBoss, type LootItem } from "@/lib/instance-loot";
import { repoRoot } from "@/lib/paths";

export const dynamic = "force-dynamic";

type Ability = { name?: string };
type Mob = { name?: string; abilities?: Ability[] };
type Instance = {
  slug: string;
  name: string;
  groupType?: string;
  groupSize?: string;
  tiers?: string | number;
  scaling?: string;
  category?: string;
  mobCount?: number;
  mobs?: Mob[];
};
type LootFile = Record<string, { bosses?: LootBoss[] }>;

function itemName(item: LootItem) {
  return item.name || item.n || "Item";
}

function LootIcon({ item }: { item: LootItem }) {
  const name = itemName(item);
  const known = lookupLootItem(name);
  const quality = (known?.quality || "").toLowerCase();
  const stats = (item.stats || []).filter((stat) => stat.stat && stat.value);
  return (
    <a className="loot-icon-wrap" href={`/items?q=${encodeURIComponent(name)}`} aria-label={name}>
      {known?.icon ? (
        <img src={lootIconUrl(known.icon)} alt="" width={40} height={40} loading="lazy" />
      ) : (
        <span className="loot-icon-fallback" aria-hidden="true">
          <i className="fa fa-cube" />
        </span>
      )}
      <span className={`loot-tip${quality ? ` loot-tip-${quality}` : ""}`}>
        <span className={`tt-name${quality ? ` lotro-${quality}` : ""}`}>{name}</span>
        {quality ? <span className="tt-line tt-binding">{quality}</span> : null}
        {item.drop ? <span className="tt-line">Drop: {item.drop}</span> : null}
        {item.slot ? (
          <span className="tt-line tt-slot">{item.slot.charAt(0).toUpperCase() + item.slot.slice(1)}</span>
        ) : null}
        {item.level ? <span className="tt-line tt-ilvl">Item Level: {item.level}</span> : null}
        {stats.length > 0 ? (
          <span className="tt-stats">
            {stats.map((stat) => (
              <span className="tt-stat-row" key={`${stat.stat}-${stat.value}`}>
                {Number(stat.value) > 0 ? "+" : ""}
                {Number(stat.value).toLocaleString()} {stat.stat}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </a>
  );
}

function loadInstances() {
  const file = path.join(repoRoot(), "data", "instances-db.json");
  if (!fs.existsSync(file)) return [] as Instance[];
  return JSON.parse(fs.readFileSync(file, "utf8")) as Instance[];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const instance = loadInstances().find((entry) => entry.slug === slug);
  return { title: instance ? `${instance.name} - LOTRO Guides` : "Instance - LOTRO Guides" };
}

export default async function InstancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const instance = loadInstances().find((entry) => entry.slug === slug);
  if (!instance) notFound();

  let bosses: LootBoss[] = [];
  const lootFile = path.join(repoRoot(), "data", "instance-loot.json");
  if (fs.existsSync(lootFile)) {
    try {
      const loot = JSON.parse(fs.readFileSync(lootFile, "utf8")) as LootFile;
      bosses = loot[slug]?.bosses || [];
    } catch {
      bosses = [];
    }
  }

  return (
    <>
      <section className="breadcrumbs">
        <div className="container">
          <ol className="breadcrumb">
            <li>
              <a href="/">Home</a>
            </li>
            <li>
              <a href="/instances">Instances</a>
            </li>
            <li className="active">{instance.name}</li>
          </ol>
        </div>
      </section>
      <section className="p-y-80">
        <div className="container">
          <div className="heading">
            <i className="fa fa-fort-awesome" />
            <h2>{instance.name}</h2>
          </div>
          <table className="table table-striped">
            <tbody>
              <tr>
                <th>Group</th>
                <td>{instance.groupType || instance.groupSize || "—"}</td>
              </tr>
              {instance.category && (
                <tr>
                  <th>Category</th>
                  <td>{instance.category}</td>
                </tr>
              )}
              <tr>
                <th>Tiers</th>
                <td>{String(instance.tiers || "—")}</td>
              </tr>
              {instance.scaling && (
                <tr>
                  <th>Scaling</th>
                  <td>{instance.scaling}</td>
                </tr>
              )}
              <tr>
                <th>Mobs</th>
                <td>{instance.mobCount || instance.mobs?.length || 0}</td>
              </tr>
            </tbody>
          </table>

          <h3>Mobs</h3>
          <div className="panel-group" id="instance-mobs">
            {(instance.mobs || []).map((mob, index) => (
              <div className="panel panel-default" key={`${mob.name}-${index}`}>
                <div className="panel-heading">
                  <h4 className="panel-title">
                    <a data-toggle="collapse" href={`#mob-${index}`}>
                      {mob.name || "Mob"}{" "}
                      <span className="text-muted">({mob.abilities?.length || 0} abilities)</span>
                    </a>
                  </h4>
                </div>
                <div id={`mob-${index}`} className="panel-collapse collapse">
                  <div className="panel-body">
                    <ul>
                      {(mob.abilities || []).map((ability) => (
                        <li key={ability.name}>{ability.name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {bosses.some((boss) => visibleChests(boss).length > 0) && (
            <div id="loot">
              <h3>Loot</h3>
              {bosses.map((boss) => {
                const chests = visibleChests(boss);
                if (!chests.length) return null;
                return (
                  <div key={boss.name} className="m-b-20">
                    <h4>{boss.name}</h4>
                    {chests.map((chest, index) => (
                      <div key={`${chest.label || chest.name}-${index}`} className="instance-loot-chest-block">
                        <strong>{chest.label || chest.name || "Chest"}</strong>
                        <div className="instance-loot-grid">
                          {(chest.items || []).map((item, itemIndex) => (
                            <LootIcon item={item} key={`${itemName(item)}-${itemIndex}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { repoRoot } from "@/lib/paths";

export const dynamic = "force-dynamic";

type Ability = { name?: string };
type Mob = { name?: string; abilities?: Ability[] };
type Chest = { name?: string; label?: string; tier?: string | number; items?: { name?: string; n?: string }[] };
type Boss = { name?: string; chests?: Chest[] };
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
type LootFile = Record<string, { bosses?: Boss[] }>;

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

  let bosses: Boss[] = [];
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

          {bosses.length > 0 && (
            <div id="loot">
              <h3>Loot</h3>
              {bosses.map((boss) => (
                <div key={boss.name} className="m-b-20">
                  <h4>{boss.name}</h4>
                  {(boss.chests || []).map((chest, index) => (
                    <div key={`${chest.name}-${index}`}>
                      <strong>
                        {chest.label || chest.name || "Chest"}
                        {chest.tier ? ` — Tier ${chest.tier}` : ""}
                      </strong>
                      <ul>
                        {(chest.items || []).map((item, itemIndex) => (
                          <li key={`${item.name || item.n}-${itemIndex}`}>{item.name || item.n}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

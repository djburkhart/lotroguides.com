import type { Metadata } from "next";
import { CharacterLog } from "@/components/character-log/CharacterLog";
import "./character-log.css";

export const metadata: Metadata = {
  title: "Character Log - LOTRO Guides",
  description: "Import a PlayLog character snapshot and review equipment, bags, vault, skills, and crafting.",
};

export default function CharactersPage() {
  return (
    <>
      <section className="breadcrumbs">
        <div className="container">
          <ol className="breadcrumb">
            <li>
              <a href="/">Home</a>
            </li>
            <li className="active">Character Log</li>
          </ol>
        </div>
      </section>
      <section className="p-y-40">
        <div className="container">
          <CharacterLog />
        </div>
      </section>
    </>
  );
}

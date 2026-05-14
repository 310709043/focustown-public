import { notFound } from "next/navigation";

import { AnimatedSprite } from "@/components/pixel/AnimatedSprite";
import { PixelSprite } from "@/components/pixel/PixelSprite";
import { PixelWord } from "@/components/pixel/PixelWord";
import { AVATARS } from "@/lib/pixel/sprites/avatars";
import {
  BENCH,
  buildCar,
  CAT_WALK,
  COFFEE,
  LAMP,
  MOON,
  NOTE,
  STAR,
  SUN,
  TOMATO,
  TREE,
  TROPHY,
  WALKERS,
} from "@/lib/pixel/sprites/world";

// Dev-only verification surface for the Tier 1 pixel sprite engine. The
// route group `(dev)` is a folder convention; the env gate below is what
// actually hides the page from production builds.
export default function SpriteGalleryPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="min-h-screen bg-bg text-text p-8 space-y-12 overflow-y-auto">
      <header className="space-y-2">
        <PixelWord text="FocusTown" color="var(--a2)" glow="var(--a3)" scale={5} />
        <p className="font-pixel-en text-muted text-sm">PIXEL SPRITE GALLERY · TIER 1</p>
      </header>

      <Section title="Wordmark scales">
        <div className="flex items-end gap-8 flex-wrap">
          {[2, 3, 4, 6, 8].map((s) => (
            <div key={s} className="flex flex-col items-start gap-2">
              <PixelWord text="FOCUSTOWN" color="var(--a2)" glow="var(--a3)" scale={s} />
              <span className="font-pixel-en text-xs text-muted">scale={s}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`Avatars (${AVATARS.length})`}>
        <div className="grid grid-cols-6 gap-4">
          {AVATARS.map((a) => (
            <div
              key={a.id}
              className="pixel-panel p-3 flex flex-col items-center gap-2"
            >
              <PixelSprite sprite={a.sprite} palette={a.palette} scale={3} />
              <div className="font-pixel-en text-xs text-muted">{a.id}</div>
              <div className="text-sm">{a.name}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`Walkers (${WALKERS.length} variants, 2-frame walk)`}>
        <div className="flex flex-wrap gap-6 items-end">
          {WALKERS.map((w, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <AnimatedSprite frames={w.frames} palette={w.palette} fps={3} scale={4} />
              <span className="font-pixel-en text-xs text-muted">walker {i}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Companion cat">
        <AnimatedSprite frames={CAT_WALK.frames} palette={CAT_WALK.palette} fps={3} scale={5} />
      </Section>

      <Section title="Street props">
        <div className="flex items-end gap-8">
          <PixelSprite sprite={TREE.sprite} palette={TREE.palette} scale={4} />
          <PixelSprite sprite={BENCH.sprite} palette={BENCH.palette} scale={4} />
          <PixelSprite sprite={LAMP.sprite} palette={LAMP.palette} scale={4} />
        </div>
      </Section>

      <Section title="Cars (animated body, neon glow)">
        <div className="flex items-end gap-8">
          {["#22d3ee", "#ec4899", "#fcd34d", "#a78bfa"].map((c) => {
            const car = buildCar(c);
            return (
              <AnimatedSprite
                key={c}
                frames={car.frames}
                palette={car.palette}
                fps={5}
                scale={3}
                glow={c}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Celestial & icons">
        <div className="flex items-end gap-8 flex-wrap">
          <PixelSprite sprite={MOON.sprite} palette={MOON.palette} scale={4} glow="#fcd34d" />
          <PixelSprite sprite={SUN.sprite} palette={SUN.palette} scale={4} glow="#fcd34d" />
          <PixelSprite sprite={TOMATO.sprite} palette={TOMATO.palette} scale={4} />
          <PixelSprite sprite={COFFEE.sprite} palette={COFFEE.palette} scale={4} />
          <PixelSprite sprite={STAR.sprite} palette={STAR.palette} scale={5} glow="#fcd34d" />
          <PixelSprite sprite={TROPHY.sprite} palette={TROPHY.palette} scale={4} />
          <PixelSprite sprite={NOTE.sprite} palette={NOTE.palette} scale={5} glow="#22d3ee" />
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-pixel-en text-sm tracking-widest text-accent-2">{title}</h2>
      <div className="pixel-panel p-6">{children}</div>
    </section>
  );
}

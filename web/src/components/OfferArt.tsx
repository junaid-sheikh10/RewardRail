// The seed data has no images, so each game gets generated "box art": a gradient,
// a big emoji and a genre. Unknown offers get a stable gradient from their id.
const ART: Record<string, { emoji: string; genre: string; from: string; to: string }> = {
  offer_dragon: { emoji: '🐉', genre: 'RPG', from: '#7b2ff7', to: '#f107a3' },
  offer_farm: { emoji: '🌾', genre: 'Simulation', from: '#0f9b6e', to: '#9be15d' },
  offer_gems: { emoji: '💎', genre: 'Puzzle', from: '#0061ff', to: '#60efff' },
};

export function offerArt(id: string) {
  if (ART[id]) return ART[id];
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return { emoji: '🎮', genre: 'Game', from: `hsl(${hash} 70% 45%)`, to: `hsl(${(hash + 60) % 360} 80% 55%)` };
}

export function OfferArt({ id, size = 'large' }: { id: string; size?: 'large' | 'small' }) {
  const art = offerArt(id);
  return (
    <div
      className={`offer-art ${size}`}
      style={{ background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}
      aria-hidden
    >
      <span>{art.emoji}</span>
    </div>
  );
}

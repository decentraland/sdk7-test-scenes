export function getRandomPastelColor() {
  const r = 0.6 + Math.random() * 0.35;
  const g = 0.6 + Math.random() * 0.35;
  const b = 0.6 + Math.random() * 0.35;
  return { r, g, b, a: 1 };
}

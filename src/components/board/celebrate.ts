// A tiny, dependency-free confetti burst for the "task completed" moment.
// Honors prefers-reduced-motion and cleans up after itself.

const COLORS = ["#7c8bff", "#f77ba4", "#f6bd5b", "#40d8a3", "#62aef7", "#b494ff"];

export function celebrate(originX?: number, originY?: number): void {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  layer.style.left = `${originX ?? window.innerWidth / 2}px`;
  layer.style.top = `${originY ?? window.innerHeight / 3}px`;

  for (let i = 0; i < 26; i++) {
    const bit = document.createElement("i");
    bit.className = "confetti-bit";
    const angle = Math.random() * Math.PI * 2;
    const dist = 55 + Math.random() * 130;
    bit.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    bit.style.setProperty("--dy", `${Math.sin(angle) * dist - 40}px`);
    bit.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    bit.style.background = COLORS[i % COLORS.length];
    bit.style.animationDelay = `${Math.random() * 40}ms`;
    layer.appendChild(bit);
  }

  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1100);
}

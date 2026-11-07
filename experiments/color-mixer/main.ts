import './style.css';

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const a = input('a');
const b = input('b');
const mix = input('mix');
const swatch = document.getElementById('swatch')!;
const out = document.getElementById('out')!;

function update() {
  const colorA = `oklch(70% 0.17 ${a.value})`;
  const colorB = `oklch(55% 0.2 ${b.value})`;
  const mixed = `color-mix(in oklch, ${colorA}, ${colorB} ${mix.value}%)`;
  swatch.style.background = `linear-gradient(90deg, ${colorA}, ${mixed} 50%, ${colorB})`;
  out.textContent = mixed;
}

for (const el of [a, b, mix]) el.addEventListener('input', update);
update();

import { degrees, LineCapStyle, PDFPage, rgb, RGB } from 'pdf-lib';

/**
 * Dibujos compartidos por los PDF (tarjetas de acceso, reporte del aula e informes para la familia).
 * Las fuentes estándar del PDF no tienen emojis: los avatares se dibujan aquí con figuras simples
 * (círculos, elipses y trazos), en una caja de 100 × 100 con el eje y hacia abajo, como un SVG.
 */

export function hex(color: string): RGB {
  const n = parseInt(color.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Las fuentes estándar del PDF usan WinAnsi: se conservan tildes y ñ, se reemplaza lo demás. */
export function textoPdf(valor: string): string {
  return valor.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

/** Un rectángulo de esquinas redondeadas como trazo SVG (origen arriba a la izquierda). */
export function rectanguloRedondeado(ancho: number, alto: number, radio: number): string {
  const r = Math.min(radio, ancho / 2, alto / 2);
  return `M ${r} 0 L ${ancho - r} 0 Q ${ancho} 0 ${ancho} ${r} L ${ancho} ${alto - r} Q ${ancho} ${alto} ${ancho - r} ${alto} L ${r} ${alto} Q 0 ${alto} 0 ${alto - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
}

/** Dibuja un rectángulo redondeado con su esquina inferior izquierda en (x, y), como drawRectangle. */
export function cajaRedondeada(
  p: PDFPage,
  caja: { x: number; y: number; ancho: number; alto: number; radio: number },
  estilo: { color?: RGB; borde?: RGB; grosor?: number; opacidad?: number },
): void {
  p.drawSvgPath(rectanguloRedondeado(caja.ancho, caja.alto, caja.radio), {
    x: caja.x,
    y: caja.y + caja.alto,
    color: estilo.color,
    borderColor: estilo.borde,
    borderWidth: estilo.borde ? (estilo.grosor ?? 1) : undefined,
    opacity: estilo.opacidad,
  });
}

/** Un destello de cuatro puntas (✦) centrado en (cx, cy). */
export function destello(p: PDFPage, cx: number, cy: number, radio: number, color: RGB, opacidad = 1): void {
  const r = radio;
  p.drawSvgPath(`M 0 ${-r} Q 0 0 ${r} 0 Q 0 0 0 ${r} Q 0 0 ${-r} 0 Q 0 0 0 ${-r} Z`, { x: cx, y: cy, color, opacity: opacidad });
}

/** Una estrella de cinco puntas centrada en (cx, cy). */
export function estrella(p: PDFPage, cx: number, cy: number, radio: number, color: RGB, borde?: RGB): void {
  const puntos: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radio : radio * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    puntos.push(`${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`);
  }
  p.drawSvgPath(`M ${puntos.join(' L ')} Z`, { x: cx, y: cy, color, borderColor: borde, borderWidth: borde ? 0.8 : undefined });
}

// ── Avatares ─────────────────────────────────────────────────────────────────────────────────────

type Figura =
  | { c: [number, number, number]; f: string; o?: number; b?: [string, number] }
  | { e: [number, number, number, number, number?]; f: string; o?: number; b?: [string, number] }
  | { d: string; f?: string; o?: number; b?: [string, number] };

const TINTA = '#2b2440';
const BRILLO = '#ffffff';
const MEJILLA = '#ff8fab';

/** Dos ojos oscuros con su brillito. */
const ojos = (x1: number, x2: number, y: number, r = 3.8): Figura[] => [
  { c: [x1, y, r], f: TINTA },
  { c: [x2, y, r], f: TINTA },
  { c: [x1 + r * 0.35, y - r * 0.35, r * 0.35], f: BRILLO },
  { c: [x2 + r * 0.35, y - r * 0.35, r * 0.35], f: BRILLO },
];
const mejillas = (x1: number, x2: number, y: number): Figura[] => [
  { e: [x1, y, 5, 3.4], f: MEJILLA, o: 0.55 },
  { e: [x2, y, 5, 3.4], f: MEJILLA, o: 0.55 },
];
const sonrisa = (x: number, y: number, ancho = 6, color = TINTA): Figura => ({ d: `M ${x - ancho} ${y} Q ${x} ${y + ancho * 0.8} ${x + ancho} ${y}`, b: [color, 2] });

/** Los 12 avatares de la web (@lectoaventura/ui), dibujados con figuras simples. */
export const ARTE_AVATAR: Record<string, Figura[]> = {
  zorro: [
    { d: 'M 18 16 L 44 34 L 20 48 Z', f: '#f07f2a' },
    { d: 'M 82 16 L 56 34 L 80 48 Z', f: '#f07f2a' },
    { d: 'M 23 25 L 37 35 L 24 42 Z', f: '#7a3b12' },
    { d: 'M 77 25 L 63 35 L 76 42 Z', f: '#7a3b12' },
    { d: 'M 15 46 Q 17 29 50 29 Q 83 29 85 46 Q 84 66 50 86 Q 16 66 15 46 Z', f: '#f58b2f' },
    { d: 'M 17 52 Q 35 56 50 86 Q 21 72 17 52 Z', f: '#fff4ea' },
    { d: 'M 83 52 Q 65 56 50 86 Q 79 72 83 52 Z', f: '#fff4ea' },
    ...ojos(38, 62, 51),
    { c: [50, 80, 4.2], f: TINTA },
  ],
  panda: [
    { c: [25, 28, 12], f: TINTA },
    { c: [75, 28, 12], f: TINTA },
    { c: [50, 56, 33], f: '#ffffff', b: ['#d6d9e6', 1.5] },
    { e: [36, 53, 8.5, 11.5, 30], f: TINTA },
    { e: [64, 53, 8.5, 11.5, -30], f: TINTA },
    { c: [37, 52, 3.6], f: BRILLO },
    { c: [63, 52, 3.6], f: BRILLO },
    { c: [37.6, 52.6, 2], f: TINTA },
    { c: [62.4, 52.6, 2], f: TINTA },
    { e: [50, 66, 5.5, 4], f: TINTA },
    sonrisa(50, 72, 5),
    ...mejillas(28, 72, 67),
  ],
  leon: [
    ...[0, 45, 90, 135, 180, 225, 270, 315].map(
      (g): Figura => ({ c: [50 + 36 * Math.cos((g * Math.PI) / 180), 54 + 36 * Math.sin((g * Math.PI) / 180), 11], f: '#e0852c' }),
    ),
    { c: [50, 54, 38], f: '#e0852c' },
    { c: [30, 32, 8], f: '#f9cf5f' },
    { c: [70, 32, 8], f: '#f9cf5f' },
    { c: [30, 32, 4], f: '#e8a33a' },
    { c: [70, 32, 4], f: '#e8a33a' },
    { c: [50, 56, 28], f: '#f9cf5f' },
    ...ojos(40, 60, 51),
    { e: [50, 66, 12, 8.5], f: '#fff1cf' },
    { d: 'M 45 60.5 L 55 60.5 L 50 66 Z', f: '#8a4b1f' },
    { d: 'M 50 66 L 50 69 M 44 69.5 Q 50 74 56 69.5', b: ['#8a4b1f', 1.8] },
  ],
  rana: [
    { c: [30, 34, 14], f: '#5cbf5c' },
    { c: [70, 34, 14], f: '#5cbf5c' },
    { e: [50, 60, 40, 26], f: '#5cbf5c' },
    { c: [30, 34, 9.5], f: '#ffffff' },
    { c: [70, 34, 9.5], f: '#ffffff' },
    ...ojos(31, 69, 35, 5),
    { c: [46, 53, 1.4], f: TINTA },
    { c: [54, 53, 1.4], f: TINTA },
    { d: 'M 28 63 Q 50 80 72 63', b: [TINTA, 2.6] },
    ...mejillas(22, 78, 62),
  ],
  pulpo: [
    { c: [21, 74, 9], f: '#f2709c' },
    { c: [35, 81, 9], f: '#f2709c' },
    { c: [50, 84, 9], f: '#f2709c' },
    { c: [65, 81, 9], f: '#f2709c' },
    { c: [79, 74, 9], f: '#f2709c' },
    { c: [50, 48, 32], f: '#ff8db4' },
    { c: [38, 28, 3], f: '#ffb3cc' },
    { c: [61, 24, 2.4], f: '#ffb3cc' },
    { c: [67, 34, 2], f: '#ffb3cc' },
    { c: [40, 49, 7.5], f: '#ffffff' },
    { c: [60, 49, 7.5], f: '#ffffff' },
    ...ojos(41, 61, 50),
    sonrisa(50, 62, 6),
    ...mejillas(30, 70, 60),
  ],
  buho: [
    { d: 'M 21 20 L 37 34 L 19 40 Z', f: '#8a5a3b' },
    { d: 'M 79 20 L 63 34 L 81 40 Z', f: '#8a5a3b' },
    { e: [50, 58, 32, 34], f: '#9c6b47' },
    { e: [50, 73, 18, 15], f: '#ecd1ab' },
    { d: 'M 43 72 Q 46 75 49 72 M 51 72 Q 54 75 57 72 M 47 78 Q 50 81 53 78', b: ['#c9a27a', 1.6] },
    { c: [37, 48, 12.5], f: '#f5e6d0' },
    { c: [63, 48, 12.5], f: '#f5e6d0' },
    { c: [37, 48, 8], f: '#ffb703' },
    { c: [63, 48, 8], f: '#ffb703' },
    ...ojos(37, 63, 48, 4.4),
    { d: 'M 46 57 L 54 57 L 50 65 Z', f: '#f08a24' },
  ],
  tortuga: [
    { d: 'M 10 70 Q 12 32 50 30 Q 88 32 90 70 Z', f: '#3e9e63' },
    { d: 'M 50 38 L 61 45 L 61 58 L 50 64 L 39 58 L 39 45 Z', f: '#6cc48c' },
    { d: 'M 17 67 Q 19 50 31 45 L 35 58 L 29 67 Z', f: '#6cc48c' },
    { d: 'M 83 67 Q 81 50 69 45 L 65 58 L 71 67 Z', f: '#6cc48c' },
    { d: 'M 7 69 L 93 69 Q 93 76 86 76 L 14 76 Q 7 76 7 69 Z', f: '#2f7d4d' },
    { e: [22, 82, 8, 5], f: '#8ed39a' },
    { e: [78, 82, 8, 5], f: '#8ed39a' },
    { c: [50, 75, 15], f: '#8ed39a' },
    ...ojos(44, 56, 73, 2.8),
    sonrisa(50, 80, 4.5),
  ],
  unicornio: [
    { c: [29, 40, 13], f: '#c38cf0' },
    { c: [25, 56, 12], f: '#ff9fd0' },
    { c: [31, 71, 10], f: '#8fd0ff' },
    { d: 'M 36 22 L 44 36 L 31 37 Z', f: '#ffffff', b: ['#e6d6f5', 1.2] },
    { d: 'M 70 22 L 62 36 L 75 37 Z', f: '#ffffff', b: ['#e6d6f5', 1.2] },
    { c: [53, 56, 28], f: '#ffffff', b: ['#e6d6f5', 1.5] },
    { d: 'M 47 30 L 59 30 L 53 5 Z', f: '#ffc83d' },
    { d: 'M 49.5 23.5 L 56.5 21.5 M 51 16 L 55 14.6', b: ['#dda200', 1.3] },
    { c: [45, 34, 7], f: '#ff9fd0' },
    { c: [55, 32, 5.5], f: '#c38cf0' },
    ...ojos(44, 63, 54, 3.6),
    sonrisa(54, 67, 5),
    ...mejillas(38, 69, 63),
  ],
  abeja: [
    { e: [30, 26, 13, 9, -20], f: '#dff2ff', b: ['#9fd3f5', 1.2] },
    { e: [70, 26, 13, 9, 20], f: '#dff2ff', b: ['#9fd3f5', 1.2] },
    { d: 'M 42 30 Q 38 16 32 12 M 58 30 Q 62 16 68 12', b: [TINTA, 2.2] },
    { c: [32, 12, 3.4], f: TINTA },
    { c: [68, 12, 3.4], f: TINTA },
    { c: [50, 56, 30], f: '#ffd23f' },
    { d: 'M 21.1 62 Q 50 68 78.9 62 L 75.4 72 Q 50 78 24.6 72 Z', f: TINTA },
    { d: 'M 32 78 Q 50 82 68 78 L 60.8 84 Q 50 86.5 39.2 84 Z', f: TINTA },
    ...ojos(40, 60, 47),
    sonrisa(50, 54, 5),
    ...mejillas(33, 67, 54),
  ],
  delfin: [
    { d: 'M 22 66 Q 12 70 6 82 Q 16 80 22 76 Q 24 84 30 88 Q 30 76 28 68 Z', f: '#3f8bcb' },
    { d: 'M 44 33 Q 48 18 60 14 Q 56 24 58 32 Z', f: '#3f8bcb' },
    { d: 'M 14 64 Q 18 36 50 32 Q 74 30 84 44 Q 90 46 94 50 Q 88 54 80 52 Q 72 64 52 68 Q 34 72 20 68 Z', f: '#4f9fe0' },
    { d: 'M 30 64 Q 50 66 76 54 Q 70 64 52 68 Q 38 70 30 64 Z', f: '#bfe1fa' },
    { d: 'M 48 62 Q 46 72 38 76 Q 50 74 56 64 Z', f: '#3f8bcb' },
    { c: [70, 42, 3.4], f: TINTA },
    { c: [71.2, 40.8, 1.2], f: BRILLO },
    { d: 'M 80 50.5 Q 84 53 89 51', b: [TINTA, 1.6] },
    { c: [86, 22, 3.2], f: '#ffffff', b: ['#9fd3f5', 1] },
    { c: [93, 12, 2.2], f: '#ffffff', b: ['#9fd3f5', 1] },
  ],
  tigre: [
    { c: [26, 30, 10], f: '#ff9a3c' },
    { c: [74, 30, 10], f: '#ff9a3c' },
    { c: [26, 30, 5], f: '#ffd9b0' },
    { c: [74, 30, 5], f: '#ffd9b0' },
    { c: [50, 56, 31], f: '#ff9a3c' },
    { d: 'M 46 26 L 54 26 L 50 36 Z', f: TINTA },
    { d: 'M 38 30 L 41 39 M 62 30 L 59 39 M 20 53 L 30 55 M 20 61 L 30 60.5 M 80 53 L 70 55 M 80 61 L 70 60.5', b: [TINTA, 2.4] },
    { e: [50, 67, 14, 10], f: '#fff4e8' },
    ...ojos(40, 60, 51),
    { d: 'M 46 62 L 54 62 L 50 66 Z', f: '#ff6f91' },
    { d: 'M 50 66 L 50 69 M 45 70 Q 50 73 55 70', b: [TINTA, 1.8] },
  ],
  koala: [
    { c: [22, 36, 16], f: '#9ea3b5' },
    { c: [78, 36, 16], f: '#9ea3b5' },
    { c: [22, 36, 9], f: '#f3c6d3' },
    { c: [78, 36, 9], f: '#f3c6d3' },
    { c: [50, 58, 30], f: '#b3b7c7' },
    ...ojos(39, 61, 53, 3.6),
    { e: [50, 65, 8, 10], f: '#3b3550' },
    ...mejillas(33, 67, 69),
    sonrisa(50, 77, 4),
  ],
};

/** Fondo, nombre y dibujo de cada avatar (los mismos colores de la web). */
export const AVATARES_PDF: Record<string, { nombre: string; fondo: string }> = {
  zorro: { nombre: 'Zorro', fondo: '#ffe2c2' },
  panda: { nombre: 'Panda', fondo: '#e4e9f2' },
  leon: { nombre: 'León', fondo: '#ffefb8' },
  rana: { nombre: 'Rana', fondo: '#d9f5d0' },
  pulpo: { nombre: 'Pulpo', fondo: '#ffdde8' },
  buho: { nombre: 'Búho', fondo: '#ede3ff' },
  tortuga: { nombre: 'Tortuga', fondo: '#ddf3e4' },
  unicornio: { nombre: 'Unicornio', fondo: '#f6ddff' },
  abeja: { nombre: 'Abeja', fondo: '#fff4b8' },
  delfin: { nombre: 'Delfín', fondo: '#d6ecff' },
  tigre: { nombre: 'Tigre', fondo: '#ffe0b3' },
  koala: { nombre: 'Koala', fondo: '#e8e6f0' },
};

/**
 * Dibuja el avatar dentro de un círculo de radio `radio` centrado en (cx, cy): su fondo de color y el
 * animalito. Devuelve false si el avatar no tiene dibujo (quien llama pone, por ejemplo, la inicial).
 */
export function dibujarAvatar(p: PDFPage, codigo: string, cx: number, cy: number, radio: number): boolean {
  const fondo = AVATARES_PDF[codigo]?.fondo ?? '#ede8ff';
  p.drawCircle({ x: cx, y: cy, size: radio, color: hex(fondo) });
  const arte = ARTE_AVATAR[codigo];
  if (!arte) return false;
  // El dibujo ocupa un poco menos que el círculo para que no toque el borde.
  const s = (radio * 1.7) / 100;
  const ox = cx - 50 * s;
  const oy = cy + 50 * s;
  const px = (x: number) => ox + x * s;
  const py = (y: number) => oy - y * s;
  for (const fig of arte) {
    const opacity = fig.o;
    const borde = 'b' in fig && fig.b ? { borderColor: hex(fig.b[0]), borderWidth: fig.b[1] * s } : {};
    if ('c' in fig) {
      p.drawCircle({ x: px(fig.c[0]), y: py(fig.c[1]), size: fig.c[2] * s, color: hex(fig.f), opacity, ...borde });
    } else if ('e' in fig) {
      const [x, y, rx, ry, giro = 0] = fig.e;
      p.drawEllipse({ x: px(x), y: py(y), xScale: rx * s, yScale: ry * s, color: hex(fig.f), opacity, rotate: degrees(-giro), ...borde });
    } else {
      p.drawSvgPath(fig.d, {
        x: ox,
        y: oy,
        scale: s,
        color: fig.f ? hex(fig.f) : undefined,
        opacity,
        ...(fig.b ? { borderColor: hex(fig.b[0]), borderWidth: fig.b[1], borderLineCap: LineCapStyle.Round } : {}),
      });
    }
  }
  return true;
}

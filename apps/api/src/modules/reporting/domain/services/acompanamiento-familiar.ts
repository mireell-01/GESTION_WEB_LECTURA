import { fechaLocalLima, Habilidad, HABILIDADES, lunesDeLaSemana, RangoEdad } from '../../../shared-kernel/public-api';
import { Celda } from './mapa-calor';

/** RF-068: por debajo de "Logrado" (A, desde 65) la habilidad se refuerza en casa. */
export const UMBRAL_LOGRADO = 65;
/** Para no abrumar a la familia: las 3 que más lo necesitan. */
export const MAXIMO_A_REFORZAR = 3;
/** RF-069: consejos por habilidad que se muestran. */
export const CONSEJOS_POR_HABILIDAD = 2;

/**
 * RF-068: las habilidades medidas por debajo de "Logrado", de la más baja a la más alta. Se usa el
 * valor medido aunque aún no haya 5 ítems (RN-08 solo condiciona el nivel que se declara): así la
 * familia puede ayudar desde el reto inicial.
 */
export function habilidadesAReforzar(celdas: Celda[]): { habilidad: Habilidad; valor: number }[] {
  return celdas
    .filter((c): c is Celda & { valor: number } => c.valor !== null && c.valor < UMBRAL_LOGRADO)
    .sort((a, b) => a.valor - b.valor || HABILIDADES.indexOf(a.habilidad) - HABILIDADES.indexOf(b.habilidad))
    .slice(0, MAXIMO_A_REFORZAR)
    .map((c) => ({ habilidad: c.habilidad, valor: c.valor }));
}

interface Consejo {
  texto: string;
  /** Sin indicar, sirve para todas las edades. */
  edades?: RangoEdad[];
}

/**
 * RF-069: acompañamiento en casa, redactado para no especialistas: actividades de 5 a 10 minutos con
 * lo que hay en casa, sin tecnicismos. Revisables por el líder pedagógico (informe del Módulo 10).
 */
export const CONSEJOS_FAMILIA: Record<Habilidad, Consejo[]> = {
  LIT: [
    { texto: 'Después de leer un cuento juntos, pregúntale quién aparece, dónde pasa y qué ocurrió. Si no lo recuerda, busquen la respuesta en el libro.' },
    { texto: 'Lean juntos una receta, una lista de compras o un recibo y pídele que encuentre un dato: cuántos huevos, qué fruta o cuánto costó.' },
    { texto: 'Al terminar una lectura, pídele que te cuente en tres frases qué pasó al inicio, en el medio y al final.', edades: ['R2', 'R3'] },
    { texto: 'Cuando responda, pídele que te muestre con el dedo la parte del texto donde lo dice: así aprende a volver a leer.', edades: ['R2', 'R3'] },
  ],
  INF: [
    { texto: 'Mientras leen, detente y pregúntale: ¿cómo crees que se siente el personaje? ¿Por qué lo piensas?' },
    { texto: 'Antes de pasar la página, jueguen a adivinar qué pasará. Luego comprueben si acertaron y qué pista los ayudó.' },
    { texto: 'Miren juntos una imagen, un afiche o una escena de la calle y pregúntale qué está pasando y qué detalles lo indican.' },
    { texto: 'Cuando un personaje haga algo sin explicar por qué, pregúntale qué razones podría tener.', edades: ['R2', 'R3'] },
  ],
  VOC: [
    { texto: 'Cuando aparezca una palabra nueva, pregúntale qué cree que significa por lo que dice la oración, antes de explicársela.' },
    { texto: 'Elijan una "palabra de la semana" y úsenla en las conversaciones de la casa: gana quien la use bien más veces.' },
    { texto: 'Jueguen a decir palabras parecidas y contrarias: grande, enorme, pequeño; alegre, contento, triste.' },
    { texto: 'Si una palabra tiene varios significados (como "banco" o "planta"), conversen sobre cuál corresponde en lo que leyeron.', edades: ['R2', 'R3'] },
  ],
  CRI: [
    { texto: 'Pregúntale si le pareció bien lo que hizo un personaje y por qué. Escucha sus razones antes de dar tu opinión.' },
    { texto: 'Comparen dos cuentos o dos finales: ¿cuál le gustó más y por qué?' },
    { texto: 'Al ver un anuncio o una noticia, conversen: ¿quién lo escribió?, ¿qué quiere que pensemos?, ¿todo lo que dice es cierto?', edades: ['R2', 'R3'] },
    { texto: 'Pregúntale qué habría hecho él o ella en el lugar del personaje.', edades: ['R1', 'R2'] },
  ],
  ARG: [
    { texto: 'Cuando quiera algo, invítale a darte dos razones: "Quiero ir al parque porque…".' },
    { texto: 'Hagan pequeños debates en familia (¿perro o gato?, ¿playa o sierra?): cada uno da una razón y escucha la del otro.' },
    { texto: 'Después de leer, pídele que defienda su opinión con una parte del texto: "¿Qué parte del cuento te hace pensar eso?".', edades: ['R2', 'R3'] },
    { texto: 'Cuando opine, pregúntale "¿cómo lo sabes?" con curiosidad, no como examen.', edades: ['R1'] },
  ],
};

/** Para mantener el hábito cuando no hay nada por reforzar (o aún no hay datos). */
export const CONSEJOS_HABITO = [
  'Lean juntos unos 10 minutos al día, de preferencia a la misma hora: el hábito importa más que la duración.',
  'Deja que elija qué leer y celebra su esfuerzo, no solo los aciertos.',
  'Conversen sobre lo que leyó en LectoAventura: pregúntale qué fue lo que más le gustó.',
];

/** RF-069: los consejos de una habilidad para su edad. */
export function consejosPara(habilidad: Habilidad, rangoEdad: RangoEdad, cuantos = CONSEJOS_POR_HABILIDAD): string[] {
  return CONSEJOS_FAMILIA[habilidad]
    .filter((c) => !c.edades || c.edades.includes(rangoEdad))
    .slice(0, cuantos)
    .map((c) => c.texto);
}

/** RF-070: el resumen de la familia sale los domingos a las 18:00 de Lima. */
export const DIA_RESUMEN_FAMILIA = 0;
export const HORA_RESUMEN_FAMILIA = 18;

/**
 * RF-070: la semana (su lunes) cuyo domingo a las 18:00 de Lima ya pasó más recientemente. El domingo
 * desde las 18:00 es la semana en curso; antes, y de lunes a sábado, la anterior.
 */
export function semanaFamiliarPorResumir(ahora: Date): string {
  const lima = new Date(ahora.getTime() - 5 * 3_600_000);
  const lunes = lunesDeLaSemana(fechaLocalLima(ahora));
  const yaSalio = lima.getUTCDay() === DIA_RESUMEN_FAMILIA && lima.getUTCHours() >= HORA_RESUMEN_FAMILIA;
  return yaSalio ? lunes : new Date(Date.parse(`${lunes}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
}

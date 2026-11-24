/** Un valor para el Inicio: su dibujito, una frase que el niño puede decir y una acción para practicarlo hoy. */
export interface ValorDelDia {
  emoji: string;
  nombre: string;
  frase: string;
  practica: string;
}

/**
 * Los 20 valores de los cuentos (los mismos de prisma/contenido-inicial/valores.mjs, formación en valores
 * del Currículo Nacional), en un orden que alterna temas para que dos días seguidos no se parezcan.
 */
export const VALORES_DEL_DIA: readonly ValorDelDia[] = [
  { emoji: '🤝', nombre: 'Amistad', frase: 'Un buen amigo escucha, comparte y ayuda.', practica: 'Invita a jugar a alguien que esté solo en el recreo.' },
  { emoji: '🎒', nombre: 'Responsabilidad', frase: 'Cumplo lo que me toca, aunque nadie me vea.', practica: 'Ordena tus útiles sin que nadie te lo pida.' },
  { emoji: '🙏', nombre: 'Gratitud', frase: 'Doy las gracias por lo que recibo cada día.', practica: 'Di «gracias» a tres personas hoy.' },
  { emoji: '🕊️', nombre: 'Respeto', frase: 'Escucho a los demás, aunque piensen distinto.', practica: 'Escucha a alguien hasta que termine de hablar.' },
  { emoji: '🏔️', nombre: 'Perseverancia', frase: 'Si algo no me sale, lo vuelvo a intentar.', practica: 'Vuelve a intentar algo que ayer te costó.' },
  { emoji: '🌳', nombre: 'Cuidado del ambiente', frase: 'Cuido el agua, las plantas y los animales.', practica: 'Cierra bien el caño y apaga la luz que no uses.' },
  { emoji: '💬', nombre: 'Honestidad', frase: 'Digo la verdad, aunque a veces cueste.', practica: 'Si te equivocas, dilo con calma y busca arreglarlo.' },
  { emoji: '🤗', nombre: 'Empatía', frase: 'Me pongo en el lugar de los demás.', practica: 'Pregunta a un amigo cómo se siente y escúchalo.' },
  { emoji: '🎁', nombre: 'Generosidad', frase: 'Compartir lo que tengo me hace feliz.', practica: 'Comparte tus colores o tu refrigerio con un compañero.' },
  { emoji: '🦙', nombre: 'Identidad cultural', frase: 'Me siento orgulloso de mi tierra y sus costumbres.', practica: 'Pregunta a tus abuelos una palabra en quechua.' },
  { emoji: '🐢', nombre: 'Paciencia', frase: 'Sé esperar mi turno con calma.', practica: 'Espera tu turno para hablar sin interrumpir.' },
  { emoji: '🦁', nombre: 'Valentía', frase: 'Hago lo correcto, aunque sienta miedo.', practica: 'Levanta la mano y comparte tu idea en clase.' },
  { emoji: '🤲', nombre: 'Solidaridad', frase: 'Ayudo con lo que tengo a quien lo necesita.', practica: 'Ayuda a un compañero que tenga una dificultad.' },
  { emoji: '💪', nombre: 'Esfuerzo', frase: 'Pongo todo de mí, aunque la tarea sea difícil.', practica: 'Termina tu tarea con calma y con tu mejor letra.' },
  { emoji: '🧩', nombre: 'Trabajo en equipo', frase: 'Juntos logramos más que cada uno solo.', practica: 'En tu grupo, escucha las ideas de todos.' },
  { emoji: '💗', nombre: 'Bondad', frase: 'Trato a todos con cariño.', practica: 'Haz algo amable por alguien sin que te lo pida.' },
  { emoji: '⚖️', nombre: 'Justicia', frase: 'Trato a todos por igual y busco lo correcto.', practica: 'En el juego, deja que todos tengan su turno.' },
  { emoji: '🌻', nombre: 'Autoestima', frase: 'Soy valioso tal como soy.', practica: 'Di en voz alta algo que haces muy bien.' },
  { emoji: '🌾', nombre: 'Humildad', frase: 'Aprendo de todos y no me creo más que nadie.', practica: 'Pide ayuda cuando no sepas algo y da las gracias.' },
  { emoji: '🚦', nombre: 'Prudencia', frase: 'Pienso antes de actuar para cuidarme.', practica: 'Antes de cruzar la pista, mira a los dos lados.' },
];

const UN_DIA = 86_400_000;
const HORA_PERU = -5 * 3_600_000; // Perú no cambia de hora en el año: siempre UTC−5.

/** El día de hoy en el Perú, contado desde 1970: cambia a medianoche de Lima, sea cual sea el reloj del equipo. */
export function diaEnPeru(fecha: Date): number {
  return Math.floor((fecha.getTime() + HORA_PERU) / UN_DIA);
}

/** El valor que toca hoy: uno distinto cada día, y el mismo para todo el aula. */
export function valorDelDia(fecha: Date): ValorDelDia {
  return VALORES_DEL_DIA[diaEnPeru(fecha) % VALORES_DEL_DIA.length]!;
}

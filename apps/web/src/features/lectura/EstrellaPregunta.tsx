/**
 * La estrellita de LectoAventura se asoma por la esquina de cada pregunta con su lápiz: salta suavecito,
 * parpadea, mueve el lápiz como si escribiera y le brilla una chispita. Es decorativa (los lectores de
 * pantalla la saltan) y se queda quieta para quien prefiere menos movimiento.
 */
const ESTRELLA = 'M50 8 62.3 35 93.8 37.8 70 58.5 77 89.2 50 73 23 89.2 30 58.5 6.2 37.8 37.7 35z';

export function EstrellaPregunta() {
  return (
    <svg viewBox="0 0 120 110" className="estrella-pregunta" aria-hidden="true" focusable="false">
      <g className="estrella-pregunta__cuerpo">
        <path d={ESTRELLA} transform="translate(10 6)" fill="#ffc83d" stroke="#ffc83d" strokeWidth="8" strokeLinejoin="round" />
        <path d="M50 22 58 40 78 42 63 55 67 75 50 64z" transform="translate(10 6)" fill="#ffdb6e" />
        <g className="estrella-pregunta__ojos">
          <ellipse cx="51" cy="56" rx="5" ry="6.5" fill="#1e1a4d" />
          <ellipse cx="69" cy="56" rx="5" ry="6.5" fill="#1e1a4d" />
          <circle cx="52.6" cy="53.6" r="1.9" fill="#fff" />
          <circle cx="70.6" cy="53.6" r="1.9" fill="#fff" />
        </g>
        <path d="M52 66q8 8 16 0" fill="none" stroke="#1e1a4d" strokeWidth="3.6" strokeLinecap="round" />
        <circle cx="43" cy="65" r="4.6" fill="#ff8fb1" opacity=".75" />
        <circle cx="77" cy="65" r="4.6" fill="#ff8fb1" opacity=".75" />
        <g className="estrella-pregunta__lapiz">
          <g transform="rotate(28 92 61)">
            <rect x="88" y="44" width="8" height="34" rx="2" fill="#5b3fd9" />
            <rect x="88" y="44" width="8" height="5" rx="2" fill="#ff8fb1" />
            <path d="M88 77 l8 0 l-4 8z" fill="#ffd9a8" />
            <path d="M90.6 82 l2.8 0 l-1.4 3z" fill="#1e1a4d" />
          </g>
        </g>
      </g>
      <path className="estrella-pregunta__brillo" d="M14 18 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3z" fill="#ffd23f" />
    </svg>
  );
}

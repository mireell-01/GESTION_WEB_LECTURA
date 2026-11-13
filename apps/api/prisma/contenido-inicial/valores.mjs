// Los valores de los cuentos: cada lectura deja un mensaje para la vida, no solo práctica de comprensión.
// - `valor`: el valor que trabaja el cuento (uno de VALORES).
// - `moraleja`: una sola oración; se agrega al final del texto («Moraleja: …» en los cuentos y «Para
//   reflexionar: …» en los textos informativos), así el niño la lee y la escucha con el resto.
// - `vida`: la pregunta que lleva el valor a su vida. De 6 a 7 años elige qué haría ([pregunta, lo mejor,
//   otras dos]); desde los 8 escribe con sus palabras (y su profe lee la respuesta, RF-051).

/** Los valores que recorren el contenido (formación en valores del Currículo Nacional). */
export const VALORES = [
  'Amistad', 'Autoestima', 'Bondad', 'Cuidado del ambiente', 'Empatía', 'Esfuerzo', 'Generosidad', 'Gratitud', 'Honestidad',
  'Humildad', 'Identidad cultural', 'Justicia', 'Paciencia', 'Perseverancia', 'Prudencia', 'Respeto', 'Responsabilidad',
  'Solidaridad', 'Trabajo en equipo', 'Valentía',
];

/** Los mensajes de los 45 cuentos del contenido inicial, por su clave. */
export const MENSAJES = {
  // ── 6 a 7 años ────────────────────────────────────────────────────────────────────────────────
  'r1-m1-1': {
    valor: 'Responsabilidad',
    moraleja: 'Cuidar nuestras cosas es una forma de ser responsables.',
    vida: ['¿Qué puedes hacer para cuidar tus cosas, como Pancha?', 'Guardarlas en su lugar', ['Dejarlas tiradas en el patio', 'Tirarlas al suelo']],
  },
  'r1-m1-2': {
    valor: 'Generosidad',
    moraleja: 'Compartir lo que tenemos hace felices a todos.',
    vida: ['Tienes tres galletas y tu amigo no tiene ninguna. ¿Qué haces?', 'Le invito una galleta', ['Me las como a escondidas', 'Le digo que se vaya']],
  },
  'r1-m1-3': {
    valor: 'Cuidado del ambiente',
    moraleja: 'La lluvia da vida a las lagunas, y por eso debemos cuidar el agua.',
    vida: ['¿Cómo puedes cuidar el agua en tu casa?', 'Cerrando bien el caño', ['Dejando el caño abierto', 'Jugando con el agua todo el día']],
  },
  'r1-m2-1': {
    valor: 'Paciencia',
    moraleja: 'Cuando algo sale mal, lo mejor es arreglarlo con calma y con cariño.',
    vida: ['Tu hermanito ensucia el piso sin querer. ¿Qué haces?', 'Le ayudo a limpiar con calma', ['Le grito muy fuerte', 'Me voy sin decir nada']],
  },
  'r1-m2-2': {
    valor: 'Justicia',
    moraleja: 'Antes de culpar a alguien, hay que observar con atención y buscar pistas.',
    vida: ['Se pierde un lápiz en tu salón. ¿Qué es lo mejor?', 'Buscar pistas antes de culpar a alguien', ['Culpar al primero que veo', 'Gritar que alguien lo robó']],
  },
  'r1-m2-3': {
    valor: 'Amistad',
    moraleja: 'Todos necesitamos un amigo para compartir los momentos bonitos.',
    vida: ['Ves a un niño solo en el recreo. ¿Qué puedes hacer?', 'Invitarlo a jugar', ['No mirarlo', 'Burlarme de él']],
  },
  'r1-m3-1': {
    valor: 'Identidad cultural',
    moraleja: 'La vicuña es parte de nuestro país, y cuidarla es tarea de todos.',
    vida: ['¿Cómo podemos cuidar a las vicuñas?', 'Respetando el lugar donde viven', ['Persiguiéndolas en el cerro', 'Llevándolas a la ciudad']],
  },
  'r1-m3-2': {
    valor: 'Cuidado del ambiente',
    moraleja: 'Si cuidamos los lagos, siempre habrá vida en ellos.',
    vida: ['Vas de paseo a un lago. ¿Qué haces con tu basura?', 'La guardo y la boto en un tacho', ['La tiro al agua', 'La dejo en la orilla']],
  },
  'r1-m3-3': {
    valor: 'Paciencia',
    moraleja: 'Crecer toma tiempo, y cada paso nos ayuda a ser mejores.',
    vida: ['Algo te sale difícil al comienzo. ¿Qué haces?', 'Sigo practicando con paciencia', ['Me rindo enseguida', 'Me enojo y lo dejo']],
  },
  'r1-m4-1': {
    valor: 'Prudencia',
    moraleja: 'Antes de confiar en una promesa, hay que pensar y pedir pruebas.',
    vida: ['Un desconocido te ofrece un regalo si le das tu mochila. ¿Qué haces?', 'Digo que no y aviso a un adulto', ['Le doy mi mochila', 'Me voy con él']],
  },
  'r1-m4-2': {
    valor: 'Gratitud',
    moraleja: 'Quien valora lo que tiene no lo pierde por querer siempre más.',
    vida: ['Tu amigo tiene un juguete nuevo. ¿Qué haces?', 'Me alegro por él y juego con el mío', ['Le quito su juguete', 'Rompo mi juguete']],
  },
  'r1-m4-3': {
    valor: 'Trabajo en equipo',
    moraleja: 'Cuando todos ayudamos, todos podemos disfrutar del resultado.',
    vida: ['Tu familia está limpiando la casa. ¿Qué haces?', 'Ayudo en lo que puedo', ['Me escondo para no ayudar', 'Solo miro la tele']],
  },
  'r1-m5-1': {
    valor: 'Solidaridad',
    moraleja: 'Ayudar a quien lo necesita es el mejor regalo que podemos dar.',
    vida: ['Un niño pequeño se pierde en el parque. ¿Qué haces?', 'Lo acompaño a buscar a un adulto', ['Me río de él', 'Sigo jugando']],
  },
  'r1-m5-2': {
    valor: 'Cuidado del ambiente',
    moraleja: 'Hasta el animal más pequeño hace un trabajo importante en la naturaleza.',
    vida: ['Ves una abeja en una flor. ¿Qué haces?', 'La dejo trabajar tranquila', ['La espanto con una rama', 'Arranco la flor']],
  },
  'r1-m5-3': {
    valor: 'Perseverancia',
    moraleja: 'Los sueños se cumplen cuando seguimos adelante paso a paso.',
    vida: ['Quieres aprender algo difícil, como montar bicicleta. ¿Qué haces?', 'Lo intento un poquito cada día', ['Me quedo sentado esperando', 'Digo que es imposible']],
  },

  // ── 8 a 9 años ────────────────────────────────────────────────────────────────────────────────
  'r2-m1-1': {
    valor: 'Respeto',
    moraleja: 'Cuidar con cariño lo que la naturaleza nos regala nos ayuda a conocerla y respetarla.',
    vida: '¿Qué cosa de la naturaleza encontraste alguna vez y cómo la cuidaste? Cuéntalo.',
  },
  'r2-m1-2': {
    valor: 'Identidad cultural',
    moraleja: 'Los saberes de nuestros abuelos son un tesoro que vale la pena aprender y conservar.',
    vida: '¿Qué te ha enseñado alguien mayor de tu familia? Cuenta qué aprendiste.',
  },
  'r2-m1-3': {
    valor: 'Valentía',
    moraleja: 'Cuando enfrentamos lo que nos da miedo, crecemos y nos volvemos más fuertes.',
    vida: '¿Qué cosa te daba miedo y ahora ya no? Cuenta cómo lo lograste.',
  },
  'r2-m2-1': {
    valor: 'Empatía',
    moraleja: 'Podemos resolver los problemas sin hacer daño, pensando también en lo que necesita el otro.',
    vida: '¿Cómo resolverías un problema con un compañero sin pelear? Da un ejemplo.',
  },
  'r2-m2-2': {
    valor: 'Generosidad',
    moraleja: 'Ser generosos con quien lo necesita, aunque nos cueste algo, nos hace mejores personas.',
    vida: '¿Alguna vez compartiste algo tuyo para ayudar a otro? Cuenta qué pasó.',
  },
  'r2-m2-3': {
    valor: 'Gratitud',
    moraleja: 'Debemos agradecer a quienes nos cuidan, aunque al principio no entendamos lo que hacen.',
    vida: '¿A quién quieres agradecer porque te cuida? Escribe lo que le dirías.',
  },
  'r2-m3-1': {
    valor: 'Trabajo en equipo',
    moraleja: 'Cuando una comunidad trabaja unida, puede mantener vivas sus costumbres por siglos.',
    vida: '¿Qué costumbre de tu familia o de tu comunidad te gustaría conservar? ¿Por qué?',
  },
  'r2-m3-2': {
    valor: 'Paciencia',
    moraleja: 'Todos cambiamos y crecemos poco a poco, y cada etapa es importante.',
    vida: '¿En qué has cambiado desde que eras más pequeño? Cuenta dos cosas.',
  },
  'r2-m3-3': {
    valor: 'Cuidado del ambiente',
    moraleja: 'Si sembramos flores y cuidamos los jardines, ayudamos a muchos seres vivos.',
    vida: '¿Qué podrías hacer en tu casa o en tu escuela para ayudar a los picaflores?',
  },
  'r2-m4-1': {
    valor: 'Trabajo en equipo',
    moraleja: 'Escuchar todas las ideas y decidir juntos nos ayuda a encontrar la mejor solución.',
    vida: '¿Recuerdas una vez en que tu grupo decidió algo entre todos? Cuenta cómo lo hicieron.',
  },
  'r2-m4-2': {
    valor: 'Solidaridad',
    moraleja: 'Ayudar a otros en los momentos difíciles nos hace una comunidad más fuerte.',
    vida: '¿Cómo ayudas tú a los demás cuando lo necesitan? Da un ejemplo.',
  },
  'r2-m4-3': {
    valor: 'Humildad',
    moraleja: 'Presumir no nos hace mejores, y es más sabio conocer nuestros límites.',
    vida: '¿Por qué crees que no es bueno presumir? Cuenta un ejemplo.',
  },
  'r2-m5-1': {
    valor: 'Identidad cultural',
    moraleja: 'Conocer otros lugares es maravilloso, y también nos ayuda a valorar el lugar de donde venimos.',
    vida: '¿Qué es lo que más te gusta del lugar donde vives? ¿Por qué?',
  },
  'r2-m5-2': {
    valor: 'Respeto',
    moraleja: 'Cada uno tiene talentos diferentes, y todos merecen ser valorados.',
    vida: '¿Qué talento especial tiene uno de tus compañeros? ¿Cómo se lo dirías?',
  },
  'r2-m5-3': {
    valor: 'Identidad cultural',
    moraleja: 'Las historias de nuestros abuelos nos enseñan a mirar el cielo y la naturaleza con respeto.',
    vida: '¿Qué historia te contaron tus abuelos o tus papás? Cuéntala en pocas palabras.',
  },

  // ── 10 a 12 años ──────────────────────────────────────────────────────────────────────────────
  'r3-m1-1': {
    valor: 'Responsabilidad',
    moraleja: 'Hacer bien nuestras tareas, aunque parezcan pequeñas, protege a nuestra familia y a nuestra comunidad.',
    vida: '¿Qué tarea haces en tu casa o en tu escuela que ayuda a los demás? Explica por qué es importante.',
  },
  'r3-m1-2': {
    valor: 'Identidad cultural',
    moraleja: 'Las tradiciones que respetan a la naturaleza son un orgullo que debemos conservar.',
    vida: '¿Qué tradición de tu comunidad o de tu país te hace sentir orgullo? Explica por qué.',
  },
  'r3-m1-3': {
    valor: 'Cuidado del ambiente',
    moraleja: 'La naturaleza guarda muchos secretos, y conocerla es el primer paso para protegerla.',
    vida: 'Si pudieras investigar un lugar de la naturaleza, ¿cuál elegirías y qué te gustaría descubrir? Explica.',
  },
  'r3-m2-1': {
    valor: 'Justicia',
    moraleja: 'Antes de culpar a alguien debemos buscar pruebas, porque las apariencias pueden engañar.',
    vida: '¿Alguna vez culparon a alguien sin pruebas? Cuenta qué pasó y qué se debió hacer.',
  },
  'r3-m2-2': {
    valor: 'Prudencia',
    moraleja: 'Ser prudentes y escuchar a quienes nos cuidan nos protege de peligros que no siempre vemos.',
    vida: '¿Recuerdas una vez en que esperar o tener cuidado te evitó un problema? Cuéntalo.',
  },
  'r3-m2-3': {
    valor: 'Empatía',
    moraleja: 'Ayudar con inteligencia, pidiendo apoyo a quienes saben, es la mejor forma de cuidar a los demás.',
    vida: 'Si encuentras un animal herido, ¿qué harías y por qué? Explica tus pasos.',
  },
  'r3-m3-1': {
    valor: 'Identidad cultural',
    moraleja: 'Los camélidos son parte de nuestra historia, y valorarlos es valorar el trabajo de las familias andinas.',
    vida: '¿Por qué crees que es importante valorar el trabajo de las familias que crían llamas y alpacas? Explica.',
  },
  'r3-m3-2': {
    valor: 'Responsabilidad',
    moraleja: 'El agua que usamos viene de muy lejos, y cuidarla es responsabilidad de todos.',
    vida: 'Escribe dos acciones que puedes hacer cada día para no desperdiciar el agua y explica por qué ayudan.',
  },
  'r3-m3-3': {
    valor: 'Cuidado del ambiente',
    moraleja: 'Los seres más pequeños sostienen la vida del planeta, y protegerlos también nos protege a nosotros.',
    vida: '¿Qué podría hacer tu escuela para ayudar a las abejas? Propón una idea y explica por qué funcionaría.',
  },
  'r3-m4-1': {
    valor: 'Respeto',
    moraleja: 'Escuchar con respeto las razones de todos nos ayuda a tomar decisiones justas para la comunidad.',
    vida: '¿Por qué es importante escuchar a quienes piensan distinto antes de decidir? Da un ejemplo de tu vida.',
  },
  'r3-m4-2': {
    valor: 'Responsabilidad',
    moraleja: 'Los niños también pueden mejorar su comunidad cuando se organizan y proponen soluciones.',
    vida: '¿Qué problema de tu barrio o de tu escuela te gustaría resolver? Escribe qué propondrías y por qué.',
  },
  'r3-m4-3': {
    valor: 'Honestidad',
    moraleja: 'Ganar con trampa no es ganar de verdad, y el orgullo nos hace descuidar lo importante.',
    vida: '¿Crees que vale la pena ganar haciendo trampa? Explica tu respuesta con un ejemplo.',
  },
  'r3-m5-1': {
    valor: 'Cuidado del ambiente',
    moraleja: 'Los cambios del planeta nos afectan a todos, y cada uno puede hacer algo para cuidarlo.',
    vida: 'Ana se preguntó qué podía hacer para cuidar el agua de los nevados. ¿Qué harías tú? Explica tu idea.',
  },
  'r3-m5-2': {
    valor: 'Identidad cultural',
    moraleja: 'Cuidar una tradición es un trabajo de todos los días que nos une con nuestros abuelos.',
    vida: '¿Qué podemos hacer los niños para que las tradiciones de nuestra comunidad no se pierdan? Explica.',
  },
  'r3-m5-3': {
    valor: 'Solidaridad',
    moraleja: 'Lo que hacemos río arriba llega a otros río abajo, por eso cuidar el agua es cuidar a todos.',
    vida: '¿Cómo puede una acción tuya ayudar a personas que viven lejos de ti? Da un ejemplo.',
  },
};

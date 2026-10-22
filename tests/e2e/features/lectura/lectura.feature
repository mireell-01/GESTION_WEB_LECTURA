# language: es
@lectura
Característica: Lectura interactiva con actividades antes, durante y después
  Como estudiante de LectoAventura
  Quiero leer con preguntas, pistas y decisiones
  Para comprender mejor lo que leo y aprender de mis errores

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  # La maestría ya la recalcula Progreso (Módulo 7). Los 6 puntos por corregir tras una pista (RN-11)
  # los otorgará Gamificación (Módulo 8) con el mismo evento ItemRespondido.
  @RF-045 @RN-06 @RN-07 @UAT-02 @camino-feliz @smoke
  Escenario: El estudiante corrige su respuesta después de una pista
    Dado un estudiante en una lectura del mundo "Detective"
    Y un ítem de inferencia con dificultad 3 y tres pistas definidas
    Cuando responde incorrectamente
    Entonces ve la pista P1 que le indica a qué parte del texto volver
    Y no se muestra la respuesta correcta
    Cuando responde correctamente en el segundo intento
    Entonces su maestría en INF se actualiza con un puntaje de ítem de 0,75

  # El avance hacia la insignia "Detective de Evidencias" lo llevará Gamificación (Módulo 8).
  @RF-043 @UAT-03
  Escenario: El estudiante respalda su respuesta con la oración correcta
    Dado un ítem "Encuentra la evidencia" cuya clave son las oraciones "Un día Pancho no quiso comer." y "Killa vio que tenía una espina en la pata."
    Cuando el estudiante selecciona la oración "Killa vio que tenía una espina en la pata."
    Entonces la evidencia se considera correcta

  @RF-043 @RN-06 @UAT-03 @negativo
  Escenario: El estudiante selecciona oraciones no relacionadas
    Dado un ítem "Encuentra la evidencia" cuya clave son las oraciones "Un día Pancho no quiso comer." y "Killa vio que tenía una espina en la pata."
    Cuando el estudiante selecciona las oraciones "Killa vivía en Puno." y "Cada mañana cuidaba a su llama Pancho."
    Entonces la evidencia se considera incorrecta
    Y recibe la pista P1 resaltando el párrafo donde buscar

  @RF-038 @RF-047
  Escenario: El estudiante contrasta su predicción con el final y reflexiona
    Dado un estudiante que predijo "Creo que la llama se enfermará" y terminó las actividades de su lectura
    Cuando llega al cierre
    Entonces ve lo que predijo junto a lo que pasó
    Y al escribir su reflexión la lectura queda terminada

  @RF-051
  Escenario: La docente valora una respuesta abierta con la rúbrica
    Dado un estudiante que escribió una respuesta abierta en su lectura
    Cuando su docente la valora como "Logrado"
    Entonces la respuesta queda valorada con el nivel 3

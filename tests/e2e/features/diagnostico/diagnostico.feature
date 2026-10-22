# language: es
@diagnostico
Característica: Diagnóstico inicial gamificado
  Como estudiante de LectoAventura
  Quiero resolver un reto inicial corto
  Para empezar mi aventura en el mundo que me corresponde

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-034 @RF-035 @RF-033 @UAT-01 @camino-feliz @smoke
  Escenario: Un estudiante nuevo completa su reto inicial y es ubicado en su mundo
    Dado un niño de 9 años sin reto inicial, con la tablet del aula activada
    Y entró con su avatar y su PIN
    Cuando completa las 15 preguntas de su reto acertando en comprensión literal y vocabulario
    Entonces ve lo que ya sabe hacer en cada una de las 5 habilidades
    Y el mapa de aventuras lo ubica en el mundo "Detective"
    Y el mundo "Explorador" aparece como completado

  @RN-05 @negativo
  Escenario: Sin el reto inicial no se abre el mapa
    Dado un niño de 9 años sin reto inicial, con la tablet del aula activada
    Y entró con su avatar y su PIN
    Cuando abre sus mundos
    Entonces le pide primero su reto inicial y no le deja entrar a ningún mundo

  @RF-036
  Escenario: El niño pausa su reto y sigue donde se quedó
    Dado un niño de 9 años sin reto inicial, con la tablet del aula activada
    Y entró con su avatar y su PIN
    Cuando responde 3 preguntas de su reto y lo pausa
    Entonces su inicio le dice que va en la pregunta 4 de 15
    Y al continuar, el reto sigue en la pregunta 4

  @RF-037
  Escenario: La docente asigna un reto de repaso y compara el avance
    Dado un niño de 9 años que terminó su reto inicial sin acertar
    Cuando su docente le asigna un reto de repaso
    Y el niño lo termina acertando todo
    Entonces la docente ve que avanzó en comprensión literal

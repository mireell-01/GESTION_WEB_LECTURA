# language: es
@seguimiento
Característica: Seguimiento docente por habilidad
  Como docente de un aula de LectoAventura
  Quiero ver cómo lee cada estudiante en cada habilidad y a quién debo acompañar
  Para reforzar a tiempo lo que más le cuesta a mi aula

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @UAT-04 @RF-063 @RF-064 @RNF-003 @camino-feliz @smoke @slow
  Escenario: La docente identifica a quién reforzar en inferencias
    Dado un aula de 3.er grado con 30 estudiantes y actividad en las últimas 2 semanas
    Y 12 estudiantes tienen inferencias en nivel "C"
    Cuando la docente abre el panel del aula
    Entonces ve un mapa de calor de estudiantes por habilidad en menos de 1,5 segundos
    Y puede filtrar a los 12 estudiantes con inferencias en nivel "C"
    Y al abrir a un estudiante ve sus evidencias seleccionadas y las pistas que usó

  @RF-065
  Escenario: El panel avisa a quién acompañar
    Dado un aula donde "Sofía" tiene inferencias y argumentación en inicio y "Teo" no lee hace 8 días
    Cuando la docente abre el panel del aula
    Entonces ve a "Sofía" para acompañar por "2 habilidades en inicio: inferencias, argumentación"
    Y ve a "Teo" para acompañar por "8 días sin actividad"

  @RF-066
  Escenario: Asigna con un clic el refuerzo que necesita parte del aula
    Dado un aula donde 2 de sus 4 estudiantes tienen inferencias en inicio
    Cuando la docente abre el panel del aula
    Y asigna con un clic la lectura sugerida para reforzar inferencias
    Entonces la lectura queda asignada solo a esos 2 estudiantes

  @RF-067 @slow
  Escenario: Descarga el reporte de un aula de 40 estudiantes en CSV y PDF
    Dado un aula de 3.er grado con 40 estudiantes
    Cuando la docente abre el panel del aula
    Entonces descarga el reporte en CSV en menos de 30 segundos con una fila por estudiante
    Y descarga el reporte en PDF en menos de 30 segundos

  @RN-17 @negativo
  Escenario: Otra docente no puede ver el seguimiento de un aula ajena
    Dado un aula de 3.er grado con 5 estudiantes
    Cuando otra docente intenta abrir el seguimiento de esa aula
    Entonces ve "No encontramos esta aula entre las tuyas." y ningún dato de sus estudiantes

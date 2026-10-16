# language: es
@diagnostico @docente
Funcionalidad: Diagnóstico inicial de nivel CNEB
  Como docente
  Quiero aplicar una prueba diagnóstica
  Para asignar el nivel inicial de lectura a mis estudiantes

  Responsable: (firma) ______________________  Fecha: ____

  Antecedentes:
    Dado que soy un docente autenticado
    Y que tengo un curso creado

  @happy-path
  Escenario: Asignar nivel tras aplicar la prueba
    Dado que seleccioné a un estudiante de mi curso
    Cuando aplico la prueba diagnóstica y el estudiante la completa
    Entonces el sistema calcula su banda de desempeño
    Y le asigna un nivel CNEB inicial

  @ya-aplicada
  Escenario: No repetir la prueba diagnóstica
    Dado que un estudiante ya tiene una prueba diagnóstica aplicada
    Cuando intento aplicar la prueba de nuevo
    Entonces el sistema responde con el error PruebaYaAplicada

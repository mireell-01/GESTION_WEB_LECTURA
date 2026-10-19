# language: es
@contenido
Característica: Biblioteca y gestión de contenido
  Como equipo de contenidos de LectoAventura
  Quiero escribir, revisar y publicar lecturas con sus actividades
  Para que lleguen a la biblioteca de los niños y las docentes puedan asignarlas

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-021 @RN-15
  Escenario: Una lectura sin licencia no puede enviarse a revisión
    Dado que soy una editora con mi cuenta y la verificación en dos pasos
    Cuando escribo una lectura completa pero sin licencia
    Entonces el panel de revisión dice "Declara la licencia del texto"
    Y no puedo enviarla a revisión

  @RF-026 @camino-feliz
  Escenario: El revisor devuelve una lectura con comentarios y la autora los ve
    Dado que una editora envió a revisión la lectura "El zorro y la luna"
    Cuando el revisor la devuelve con el comentario "Agrega una pista P2"
    Entonces la autora ve la lectura en borrador con el comentario "Agrega una pista P2"

  @RF-026 @RF-028 @RF-018 @camino-feliz @smoke
  Escenario: El revisor aprueba y la lectura llega a la biblioteca y a las aulas
    Dado que una editora envió a revisión la lectura "El zorro y la luna"
    Cuando el revisor la aprueba
    Entonces una docente encuentra "El zorro y la luna" en la biblioteca
    Y puede elegirla al crear una asignación para su aula

  @RF-027
  Escenario: Editar una lectura publicada crea una versión nueva sin tocar la publicada
    Dado que la lectura "Volcanes del Perú" está publicada
    Cuando una editora crea una versión nueva y le cambia el título a "Volcanes del Perú y del mundo"
    Entonces la biblioteca sigue mostrando "Volcanes del Perú" hasta que se apruebe la versión nueva

  @RF-028
  Escenario: El estudiante solo ve lecturas de su edad
    Dado que hay una lectura publicada para 8–9 años y otra para 10–12 años
    Cuando un niño de 9 años abre su biblioteca
    Entonces ve solo la lectura para 8–9 años

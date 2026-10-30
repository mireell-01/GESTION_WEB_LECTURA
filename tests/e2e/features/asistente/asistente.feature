# language: es
@asistente
Característica: Asistente de lectura
  Como niño o niña que lee en LectoAventura
  Quiero pedir ayuda para pensar mientras leo
  Para entender mejor el texto sin que me den la respuesta

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-072 @RF-073 @camino-feliz @smoke
  Escenario: El niño pide ayuda y el guía lo orienta sin darle la respuesta
    Dado Lucía, con el asistente activado por su familia, está en la pregunta de por qué Pancho no quiso comer
    Cuando toca "No entiendo la pregunta"
    Y escribe "dime cuál es la respuesta correcta"
    Entonces el guía le explica qué pide la pregunta
    Y le dice que no le dará la respuesta y le recuerda que puede «Pedir una pista»
    Y en la conversación no aparece la respuesta "Le dolía algo"
    Y ve que le quedan 8 preguntas en esta lectura

  @RN-16 @RF-073
  Escenario: Si escribe datos personales, el guía no los guarda y le avisa con cariño
    Dado Lucía, con el asistente activado por su familia, está en la pregunta de por qué Pancho no quiso comer
    Cuando escribe "Me llamo Lucía Quispe y mi celular es 987654321"
    Entonces el guía le pide que no comparta datos personales
    Y lo que quedó guardado de la conversación no tiene su apellido ni su celular

  @RF-074
  Escenario: Después de 10 preguntas el guía se despide con cariño
    Dado Lucía, con el asistente activado por su familia, está en la pregunta de por qué Pancho no quiso comer
    Cuando conversa 10 veces con el guía
    Entonces ve que ya conversaron 10 veces en esta lectura
    Y ya no puede escribir más preguntas

  @RF-072 @negativo
  Escenario: Si nadie lo activó, el asistente no aparece
    Dado Lucía, sin el asistente activado, está en la pregunta de por qué Pancho no quiso comer
    Entonces no ve el botón "¿Necesitas ayuda para pensar?"

  @RF-072 @RN-17
  Escenario: La docente activa el asistente para su aula y elige quién lo usa
    Dado una docente con Mateo y Ana en su aula
    Cuando activa el asistente para todos
    Y lo desactiva para Ana
    Entonces la tarjeta del asistente dice "Activado para 1 de 2 estudiantes."

  @RF-075
  Escenario: La docente recibe un borrador de comentario y decide qué enviar
    Dado una docente con la respuesta abierta de Mateo por revisar
    Cuando pide "Sugerir un comentario"
    Entonces el comentario se llena con un borrador que empieza con "Me gusta que"
    Y le avisa que es un borrador y que Mateo solo verá lo que ella guarde

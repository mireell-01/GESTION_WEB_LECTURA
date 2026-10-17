# language: es
@escuela
Característica: Modo escuela de la docente
  Como docente de primaria
  Quiero organizar mi aula en LectoAventura
  Para que mis estudiantes lean lo que les asigno y sus familias les acompañen desde casa

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-014 @RF-015 @RF-016 @camino-feliz @smoke
  Escenario: La docente crea su aula y matricula a sus estudiantes
    Dado que soy una docente con mi cuenta verificada
    Cuando creo el aula "3.° B" declarando el consentimiento de la institución
    Y matriculo a "Mateo" con el avatar "León"
    Y matriculo con un archivo CSV a "Ana" y una fila con el mes 13
    Entonces veo a "Ana" y a "Mateo" en la lista de estudiantes
    Y la fila con el mes 13 aparece rechazada con el motivo "El mes de nacimiento debe estar entre 1 y 12"

  @RF-017 @CR-01 @camino-feliz
  Escenario: El niño entra con el PIN de su tarjeta impresa
    Dado que soy una docente con el aula "3.° B" y la estudiante "Lucía"
    Cuando descargo las tarjetas de acceso de mis estudiantes
    Entonces la tarjeta de "Lucía" trae su PIN y ningún código de aula
    Y con la tablet del aula activada, "Lucía" entra con el PIN de su tarjeta

  @RF-018 @camino-feliz
  Escenario: La docente deja una lectura y el niño la ve como misión del docente
    Dado que hay una lectura publicada en la biblioteca
    Y que soy una docente con el aula "3.° B" y la estudiante "Lucía"
    Cuando asigno esa lectura a toda el aula con fecha límite dentro de una semana
    Entonces la asignación aparece "En curso" en mi aula
    Y "Lucía" la ve en su inicio como "Misión del docente"

  @RF-019 @seguridad
  Escenario: La familia acompaña al niño con el código de un solo uso de la docente
    Dado que soy una docente con el aula "3.° B" y la estudiante "Lucía"
    Cuando genero un código de invitación para la familia de "Lucía"
    Y su familia escribe ese código en su panel
    Entonces la familia ve a "Lucía" en "Desde su aula"
    Y el mismo código ya no sirve para otra familia

  @RF-020
  Escenario: Al cierre del año la docente archiva su aula
    Dado que soy una docente con el aula "3.° B" y la estudiante "Lucía"
    Cuando archivo el aula "3.° B"
    Entonces el aula queda "Archivada" y solo se puede consultar

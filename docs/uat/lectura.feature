# language: es
@lectura @estudiante @smoke
Funcionalidad: Sesión de lectura guiada
  Como estudiante
  Quiero leer un texto y recibir pistas progresivas
  Para comprender mejor lo que leo

  Responsable: (firma) ______________________  Fecha: ____

  Antecedentes:
    Dado que soy un estudiante autenticado
    Y que existe un texto publicado suitable para mi nivel CNEB

  @happy-path
  Escenario: Responder un ítem correctamente
    Dado que inicié una sesión de lectura
    Cuando respondo un ítem con la evidencia correcta
    Entonces el sistema marca la respuesta como correcta
    Y acumula puntos de progreso

  @pistas
  Escenario: Solicitar una pista cuando no sé la respuesta
    Dado que inicié una sesión de lectura
    Cuando solicito una pista
    Entonces el sistema muestra la pista del siguiente nivel
    Y registra el uso de la pista

  @invalida
  Esquema del escenario: Respuestas inválidas
    Dado que inicié una sesión de lectura
    Cuando respondo un ítem con "<evidencia>"
    Entonces el sistema responde con "<resultado>"

    Ejemplos:
      | evidencia        | resultado                    |
      | vacía            | evidencia_requerida          |
      | fuera de rango   | evidencia_fuera_de_rango     |

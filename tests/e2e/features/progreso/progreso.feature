# language: es
@progreso
Característica: Perfil lector y recomendaciones
  Como estudiante de LectoAventura
  Quiero ver cómo voy en cada habilidad y qué leer después
  Para seguir creciendo como lector

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-052 @RF-054 @RF-055 @UAT-01 @camino-feliz @smoke
  Escenario: El perfil lector muestra el nivel de cada habilidad y qué practicar
    Dado un niño de 9 años que hizo su reto inicial y leyó dos lecturas, fallando en las inferencias
    Cuando abre su perfil lector
    Entonces su perfil lector muestra el nivel de cada una de las 5 habilidades
    Y "Descubrir lo que no se dice" aparece para reforzar
    Y le recomienda una lectura para practicarla

  @RF-053 @RN-07
  Escenario: Cada respuesta mueve la maestría de su habilidad
    Dado un niño de 9 años que hizo su reto inicial y está leyendo
    Cuando responde bien la pregunta de inferencia sin pistas
    Entonces su maestría en inferencias sube con el promedio móvil de RN-07

  @RN-09 @RF-031 @camino-feliz
  Escenario: Con sus lecturas, la maestría abre el mundo siguiente
    Dado un niño en el mundo "Detective" con 3 misiones de una lectura cada una
    Cuando termina las 3 lecturas respondiendo bien las inferencias
    Entonces su maestría en inferencias llega a 65
    Cuando vuelve a su mapa
    Entonces ve la celebración "¡Desbloqueaste el mundo Investigador!"

  @RF-055 @RN-20
  Escenario: Lo que deja su docente va primero en sus próximas lecturas
    Dado un niño de 9 años con una lectura asignada por su docente
    Cuando abre su perfil lector
    Entonces la primera recomendación es "Misión de tu profe"

# language: es
@iam @estudiante @CR-01
Característica: Tablet del aula sin códigos
  Como docente de primaria
  Quiero activar una sola vez la tablet de mi aula
  Para que mis estudiantes entren solo con su avatar y su PIN, sin escribir códigos

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  @RF-007 @RN-04 @camino-feliz @smoke
  Escenario: La docente activa la tablet y una estudiante entra sin escribir códigos
    Dado que soy docente del aula "3.° B" con la estudiante "Sofía"
    Cuando activo esta tablet para el aula "3.° B" y la dejo lista para los niños
    Entonces la tablet muestra los avatares del "Aula 3.° B" sin pedir ningún código
    Cuando toco mi avatar "Sofía"
    Y escribo el PIN de su tarjeta
    Entonces llego a mi área de lectura con el saludo "Hola, Sofía"

  @RN-04 @seguridad
  Escenario: Una tablet que nadie activó no muestra avatares ni pide códigos
    Dado que abro la app en una tablet que nadie activó
    Entonces veo el título "Esta tablet aún no está activada"
    Y no aparece ningún avatar ni campo para escribir códigos

# language: es
@iam @familia
Característica: Perfil del niño protegido por el consentimiento del adulto
  Como adulto responsable
  Quiero autorizar y crear el perfil de mi hijo con los datos mínimos
  Para que use la plataforma sin exponer su identidad

  Responsable de aprobación (Product Owner): ______________________  Fecha: ____

  Antecedentes:
    Dado que ingresé con mi cuenta familiar verificada

  @RF-005 @RN-01
  Escenario: Sin consentimiento no se puede crear ningún perfil
    Entonces se me pide dar mi consentimiento antes de agregar perfiles
    Y no puedo agregar perfiles todavía

  @RF-006 @RN-02 @camino-feliz
  Escenario: Con consentimiento creo el perfil pidiendo solo datos mínimos
    Cuando doy mi consentimiento como adulto responsable
    Y abro el formulario para agregar un perfil
    Entonces el formulario solo pide alias, mes y año de nacimiento, avatar y PIN
    Cuando creo el perfil de "Mateo" con el avatar "León" y el PIN "2580"
    Entonces veo la tarjeta de "Mateo" con la edad "8–9 años"

  @RF-006 @negativo
  Escenario: Un PIN fácil de adivinar no se acepta
    Cuando doy mi consentimiento como adulto responsable
    Y abro el formulario para agregar un perfil
    Y creo el perfil de "Mateo" con el avatar "León" y el PIN "1234"
    Entonces veo el mensaje "muy fácil de adivinar"

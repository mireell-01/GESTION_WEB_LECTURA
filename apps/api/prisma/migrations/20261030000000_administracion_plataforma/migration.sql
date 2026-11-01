-- Módulo 12: Administración de la plataforma (RF-076 a RF-078).

-- RF-077: la auditoría sigue siendo inmutable (nunca se modifica), pero se conserva 2 años: solo se
-- pueden borrar los registros que superaron esa retención. Las otras tablas append-only (libro de
-- puntos e insignias otorgadas) mantienen su regla sin excepciones.
CREATE OR REPLACE FUNCTION "admin"."auditoria_solo_vencidos"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."ocurrido_en" < CURRENT_TIMESTAMP - INTERVAL '2 years' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'La auditoría solo admite agregar registros; se borran solo los de más de 2 años (%)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER "tr_auditoria_append_only" ON "admin"."auditoria";
CREATE TRIGGER "tr_auditoria_append_only" BEFORE UPDATE OR DELETE ON "admin"."auditoria"
  FOR EACH ROW EXECUTE FUNCTION "admin"."auditoria_solo_vencidos"();

-- Filtros de la consulta de auditoría (por acción y por recurso), de lo más reciente a lo más antiguo.
CREATE INDEX "auditoria_accion_ocurrido_en_idx" ON "admin"."auditoria"("accion", "ocurrido_en");
CREATE INDEX "auditoria_recurso_tipo_recurso_id_idx" ON "admin"."auditoria"("recurso_tipo", "recurso_id");

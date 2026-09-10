-- 131 · Limpieza HubSpot en la base (10-sep-2026). HubSpot está suspendido
-- definitivamente; nada operativo depende de él. Se retira lo que sólo existía
-- para espejarlo o para medirlo. Las columnas hubspot_id / id_hubspot / hs_* se
-- QUEDAN como dato histórico (atribución y auditoría de oportunidades).

-- Trigger que copiaba hubspot_id al legacy y redespachaba pendientes.
drop trigger if exists persona_hubspot on trol3.personas;
drop function if exists trol3.tg_persona_hubspot();

-- Sync de nombres a HubSpot (workflow n8n ya apagado).
drop function if exists public.get_hubspot_name_sync_batch(integer);
drop function if exists public.mark_hubspot_name_synced(uuid[]);

-- Fotos de funnels tomadas el día de la decomisión (23-ago), ya explotadas en claude/12.
drop view if exists trol3.v_hs_funnels_20260823;
drop table if exists trol3.hs_funnels_20260823;
drop table if exists trol3.hs_map_20260823;
drop table if exists trol3.hs_map_final_20260823;

-- Campaña Mod 40 de la era HubSpot (campanas/CAMPANA_MOD40_HOY.md); la vista
-- vista_campania_mod40 sólo servía para exportar a HubSpot.
drop view if exists public.vista_campania_mod40;
drop table if exists public.en_funnel_hubspot;
drop table if exists public.mod40_horizonte_hubspot;

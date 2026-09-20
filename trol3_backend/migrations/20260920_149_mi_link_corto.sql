-- 149: el link que le mandamos al cliente tiene que verse como algo de Trol.
--
-- Ahora que el link va escrito DENTRO del mensaje de WhatsApp (y no escondido
-- detrás de un botón), el cliente lo lee entero. Esto:
--   https://app.trol.mx/m/b78b46750a07...4de6a8d1?d=mi&c=react
-- no se lee como una invitación, se lee como algo que no hay que abrir. Le
-- estábamos pidiendo confianza con una cadena que parece spam.
--
-- Queda así:
--   https://app.trol.mx/c/AB7K9QX2PMRT
--
-- - /c/ de cuenta: el destino lo decide la ruta, no un ?d=mi a la vista.
-- - 12 caracteres en base32 SIN los ambiguos (0/O, 1/I/L): ~60 bits. Con
--   caducidad de 7 días y tope de 25 usos alcanza de sobra, y encima se puede
--   dictar por teléfono cuando alguien llama porque "no le abre".
-- - La campaña se guarda en la fila del token, no se arrastra en la URL.
--
-- Los tokens largos ya repartidos siguen vivos: /m/ no se toca.

-- Alfabeto sin caracteres que se confunden al leer o al dictar.
create or replace function trol3.codigo_amistoso(p_largo int default 12)
returns text
language plpgsql
security definer
set search_path to 'trol3','public','extensions'
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 símbolos: sin 0 O 1 I L
  n constant int := length(alfabeto);
  bytes bytea;
  salida text := '';
  i int;
begin
  bytes := extensions.gen_random_bytes(p_largo);
  for i in 0..p_largo - 1 loop
    salida := salida || substr(alfabeto, (get_byte(bytes, i) % n) + 1, 1);
  end loop;
  return salida;
end $$;

-- Mismo contrato de antes: devuelve el link listo para mandar. Cambia la forma.
create or replace function trol3.generar_mi_link(p_persona uuid, p_campania text default 'alta')
returns text
language plpgsql
security definer
set search_path to 'trol3','public','extensions'
as $$
declare cid uuid; tok text; base text; intentos int := 0;
begin
  cid := trol3.enlazar_legacy(p_persona);
  if cid is null then return null; end if;

  -- 60 bits en 12 caracteres: la colisión es improbable, pero un choque aquí le
  -- daría a alguien la cuenta de otro, así que se comprueba en vez de confiar.
  loop
    tok := trol3.codigo_amistoso(12);
    exit when not exists (
      select 1 from public.b2c_magic_tokens
      where token_hash = encode(extensions.digest(tok, 'sha256'), 'hex')
    );
    intentos := intentos + 1;
    if intentos > 5 then raise exception 'no se pudo generar un código único'; end if;
  end loop;

  insert into public.b2c_magic_tokens (token_hash, cliente_id, campania, expira_at)
  values (encode(extensions.digest(tok, 'sha256'), 'hex'), cid, left(coalesce(p_campania,'alta'), 40), now() + interval '7 days');

  select coalesce((select valor from trol3.config where clave = 'app_base_url'), 'https://app.trol.mx') into base;
  return base || '/c/' || tok;
end $$;

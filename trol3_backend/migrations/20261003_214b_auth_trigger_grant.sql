-- 214b · El trigger de auth.users (on_auth_user_created_link_partner) corre como
-- supabase_auth_admin y necesita EXECUTE en la función; al quitar PUBLIC se lo llevamos.
-- Sin esto, cada alta de usuario (OTP / magic link) fallaría.
do $$ begin
  execute 'grant execute on function public.handle_new_user_link_partner() to supabase_auth_admin';
  execute 'grant usage on schema public to supabase_auth_admin';
end $$;

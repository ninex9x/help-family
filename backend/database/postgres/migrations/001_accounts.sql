-- Identidades de acesso não se confundem com os familiares acompanhados.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE TABLE users (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 254),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE family_memberships (
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'caregiver', 'reader')),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (family_id, user_id)
);
CREATE INDEX family_memberships_user_idx ON family_memberships(user_id, family_id) WHERE active;

CREATE FUNCTION request_user_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog, public
AS $$ SELECT nullif(current_setting('help_family.user_id', true), '')::uuid $$;

ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_read ON family_memberships FOR SELECT
USING (user_id = request_user_id() AND active);
CREATE POLICY family_read ON families FOR SELECT
USING (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = families.id AND m.user_id = request_user_id() AND m.active));
CREATE POLICY family_update ON families FOR UPDATE
USING (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = families.id AND m.user_id = request_user_id() AND m.active AND m.role = 'owner'))
WITH CHECK (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = families.id AND m.user_id = request_user_id() AND m.active AND m.role = 'owner'));

-- Única criação privilegiada: família nova + vínculo de proprietário na mesma transação.
-- Sem esta função, a política de leitura impediria retornar uma família ainda sem vínculo.
-- O papel da aplicação NÃO é dono das tabelas e não pode criar vínculos diretamente.
CREATE FUNCTION create_owned_family(family_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE actor uuid := public.request_user_id(); family uuid;
BEGIN
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = actor) THEN
    RAISE EXCEPTION 'Authenticated user required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.families(name) VALUES (family_name) RETURNING id INTO family;
  INSERT INTO public.family_memberships(family_id, user_id, role) VALUES (family, actor, 'owner');
  RETURN family;
END;
$$;
REVOKE ALL ON FUNCTION create_owned_family(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION request_user_id() FROM PUBLIC;

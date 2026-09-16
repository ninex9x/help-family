-- Pessoas acompanhadas não são contas de acesso. O conteúdo clínico é cifrado pela aplicação.
CREATE TABLE members (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id),
  profile_ciphertext text NOT NULL,
  photo_ciphertext text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, id)
);
CREATE INDEX members_family_created_idx ON members(family_id, created_at, id);
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_read ON members FOR SELECT
USING (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = members.family_id AND m.user_id = request_user_id() AND m.active));
CREATE POLICY member_insert ON members FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = members.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')));
CREATE POLICY member_update ON members FOR UPDATE
USING (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = members.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')))
WITH CHECK (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = members.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')));
-- Sem DELETE nesta etapa. IDs e família também não recebem permissão de UPDATE.

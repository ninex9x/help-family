-- Vínculos fixos preservam o significado da rotina para o futuro histórico de doses.
CREATE TABLE routines (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id),
  member_id uuid NOT NULL,
  medicine_id uuid NOT NULL,
  presentation_id uuid NOT NULL,
  content_ciphertext text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (family_id, member_id) REFERENCES members(family_id, id),
  FOREIGN KEY (family_id, medicine_id, presentation_id) REFERENCES medicine_presentations(family_id, medicine_id, id),
  UNIQUE (family_id, id)
);
CREATE INDEX routines_family_member_idx ON routines(family_id, member_id, created_at, id);
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;
CREATE POLICY routines_read ON routines FOR SELECT USING (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = routines.family_id AND m.user_id = request_user_id() AND m.active));
CREATE POLICY routines_insert ON routines FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = routines.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')));
CREATE POLICY routines_update ON routines FOR UPDATE
USING (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = routines.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')))
WITH CHECK (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = routines.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')));
-- Sem DELETE e sem UPDATE de IDs/vínculos no papel de execução.

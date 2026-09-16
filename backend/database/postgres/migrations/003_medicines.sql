-- Catálogo clínico por família. Conteúdo cifrado, relações SQL explícitas e imutáveis.
CREATE TABLE medicines (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id),
  content_ciphertext text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, id)
);
CREATE TABLE medicine_presentations (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id),
  medicine_id uuid NOT NULL,
  content_ciphertext text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (family_id, medicine_id) REFERENCES medicines(family_id, id),
  UNIQUE (family_id, medicine_id, id)
);
CREATE INDEX medicines_family_created_idx ON medicines(family_id, created_at, id);
CREATE INDEX presentations_medicine_created_idx ON medicine_presentations(family_id, medicine_id, created_at, id);

ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
CREATE POLICY medicines_read ON medicines FOR SELECT
USING (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = medicines.family_id AND m.user_id = request_user_id() AND m.active));
CREATE POLICY medicines_insert ON medicines FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = medicines.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')));
CREATE POLICY medicines_update ON medicines FOR UPDATE
USING (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = medicines.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')))
WITH CHECK (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = medicines.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')));

ALTER TABLE medicine_presentations ENABLE ROW LEVEL SECURITY;
CREATE POLICY medicine_presentations_read ON medicine_presentations FOR SELECT
USING (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = medicine_presentations.family_id AND m.user_id = request_user_id() AND m.active));
CREATE POLICY medicine_presentations_insert ON medicine_presentations FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = medicine_presentations.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')));
CREATE POLICY medicine_presentations_update ON medicine_presentations FOR UPDATE
USING (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = medicine_presentations.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')))
WITH CHECK (EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id = medicine_presentations.family_id AND m.user_id = request_user_id() AND m.active AND m.role IN ('owner', 'caregiver')));

-- Sem DELETE e sem UPDATE de IDs/vínculos no papel da aplicação.

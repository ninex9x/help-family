-- Histórico imutável; a chave composta impede atribuir a dose a outro familiar.
ALTER TABLE routines ADD CONSTRAINT routines_family_member_unique UNIQUE (family_id,id,member_id);
CREATE TABLE dose_logs (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id),
  routine_id uuid NOT NULL,
  member_id uuid NOT NULL,
  scheduled_date date NOT NULL,
  occurrence_key text NOT NULL CHECK (length(occurrence_key)=64),
  recorded_by uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL,
  content_ciphertext text NOT NULL,
  FOREIGN KEY (family_id,routine_id,member_id) REFERENCES routines(family_id,id,member_id),
  UNIQUE (family_id,occurrence_key)
);
CREATE INDEX dose_logs_history_idx ON dose_logs(family_id,recorded_at DESC,id DESC);
CREATE INDEX dose_logs_date_member_idx ON dose_logs(family_id,scheduled_date,member_id);
ALTER TABLE dose_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY doses_read ON dose_logs FOR SELECT USING
(EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id=dose_logs.family_id AND m.user_id=request_user_id() AND m.active));
CREATE POLICY doses_insert ON dose_logs FOR INSERT WITH CHECK
(recorded_by=request_user_id() AND EXISTS (SELECT 1 FROM family_memberships m WHERE m.family_id=dose_logs.family_id AND m.user_id=request_user_id() AND m.active AND m.role IN ('owner','caregiver')));
-- O papel da aplicação recebe apenas SELECT/INSERT, sem UPDATE ou DELETE.

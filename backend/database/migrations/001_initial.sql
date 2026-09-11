-- Schema version 1. Content columns contain authenticated ciphertext.
-- IDs, foreign keys, revision, ordering and active flags are SQL metadata.
CREATE TABLE metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL DEFAULT 0,
    imported INTEGER NOT NULL DEFAULT 0
);
INSERT INTO metadata (id) VALUES (1);

CREATE TABLE members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    initials TEXT NOT NULL,
    color TEXT NOT NULL,
    photo TEXT,
    medical_notes TEXT
);

CREATE TABLE medicines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL
);

CREATE TABLE presentations (
    id TEXT PRIMARY KEY,
    medicine_id TEXT NOT NULL REFERENCES medicines(id),
    strength TEXT NOT NULL,
    form TEXT NOT NULL,
    UNIQUE (id, medicine_id)
);

CREATE TABLE routines (
    id TEXT PRIMARY KEY,
    medicine_id TEXT NOT NULL REFERENCES medicines(id),
    presentation_id TEXT NOT NULL,
    member_id TEXT NOT NULL REFERENCES members(id),
    quantity TEXT NOT NULL,
    instruction TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    FOREIGN KEY (presentation_id, medicine_id)
        REFERENCES presentations(id, medicine_id),
    UNIQUE (id, member_id)
);

CREATE TABLE routine_times (
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    time TEXT NOT NULL,
    PRIMARY KEY (routine_id, position)
);

CREATE TABLE dose_logs (
    id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL,
    member_id TEXT NOT NULL REFERENCES members(id),
    date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    status TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    -- HMAC index enforces a single occurrence without exposing dates and times.
    occurrence_key TEXT NOT NULL UNIQUE,
    FOREIGN KEY (routine_id, member_id) REFERENCES routines(id, member_id)
);

CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    data_url TEXT,
    native_document_id TEXT,
    file_size TEXT
);

CREATE INDEX routines_member ON routines(member_id);
CREATE INDEX logs_member ON dose_logs(member_id);
CREATE INDEX documents_member ON documents(member_id);
PRAGMA user_version = 1;

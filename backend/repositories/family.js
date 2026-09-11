/** Traduz entidades JavaScript em registros SQL; cifra conteúdo nas fronteiras de persistência. */
// Table and column names are fixed here; all user values use bound parameters.
export const resources = {
  members: {
    key: 'members',
    table: 'members',
    fields: {
      name: 'name',
      relationship: 'relationship',
      initials: 'initials',
      color: 'color',
      photo: 'photo',
      medicalNotes: 'medical_notes',
    },
  },
  medicines: { key: 'drugs', table: 'medicines', fields: { name: 'name', color: 'color' } },
  presentations: {
    key: 'presentations',
    table: 'presentations',
    refs: { drugId: 'medicine_id' },
    fields: { strength: 'strength', form: 'form' },
  },
  routines: {
    key: 'routines',
    table: 'routines',
    refs: { drugId: 'medicine_id', presentationId: 'presentation_id', memberId: 'member_id' },
    fields: { quantity: 'quantity', instruction: 'instruction' },
  },
  'dose-logs': {
    key: 'logs',
    table: 'dose_logs',
    refs: { routineId: 'routine_id', memberId: 'member_id' },
    fields: {
      date: 'date',
      scheduledTime: 'scheduled_time',
      status: 'status',
      recordedAt: 'recorded_at',
    },
  },
  documents: {
    key: 'documents',
    table: 'documents',
    refs: { memberId: 'member_id' },
    fields: {
      title: 'title',
      category: 'category',
      date: 'date',
      fileName: 'file_name',
      mimeType: 'mime_type',
      dataUrl: 'data_url',
      nativeDocumentId: 'native_document_id',
      fileSize: 'file_size',
    },
  },
};

export function createRepository(db, vault) {
  function list(resource) {
    const spec = resources[resource];
    return db
      .prepare(`SELECT * FROM ${spec.table} ORDER BY rowid`)
      .all()
      .map((row) => {
        const item = { id: row.id };
        for (const [name, column] of Object.entries(spec.refs ?? {})) item[name] = row[column];
        for (const [name, column] of Object.entries(spec.fields)) {
          const value = vault.open(row[column], `${spec.table}:${row.id}:${column}`);
          if (value !== undefined) item[name] = value;
        }
        if (resource === 'routines') {
          item.active = Boolean(row.active);
          item.times = db
            .prepare(
              'SELECT position, time FROM routine_times WHERE routine_id = ? ORDER BY position',
            )
            .all(row.id)
            .map((time) => vault.open(time.time, `routine_times:${row.id}:${time.position}`));
        }
        return item;
      });
  }
  /** Grava só esta entidade; o serviço externo fornece a transação. */
  function put(resource, item) {
    const spec = resources[resource];
    const row = { id: item.id };
    for (const [name, column] of Object.entries(spec.refs ?? {})) row[column] = item[name];
    for (const [name, column] of Object.entries(spec.fields))
      row[column] = vault.seal(item[name], `${spec.table}:${item.id}:${column}`);
    if (resource === 'routines') row.active = item.active === false ? 0 : 1;
    if (resource === 'dose-logs')
      row.occurrence_key = vault.index(
        JSON.stringify([item.routineId, item.date, item.scheduledTime]),
      );
    const columns = Object.keys(row);
    db.prepare(
      `INSERT INTO ${spec.table} (${columns.join(',')}) VALUES (${columns.map((c) => `@${c}`).join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns
        .filter((c) => c !== 'id')
        .map((c) => `${c}=excluded.${c}`)
        .join(',')}`,
    ).run(row);
    if (resource === 'routines') {
      db.prepare('DELETE FROM routine_times WHERE routine_id = ?').run(item.id);
      const insert = db.prepare(
        'INSERT INTO routine_times(routine_id, position, time) VALUES (?, ?, ?)',
      );
      item.times.forEach((time, i) =>
        insert.run(item.id, i, vault.seal(time, `routine_times:${item.id}:${i}`)),
      );
    }
  }
  return {
    list,
    put,
    snapshot: db.transaction(() => ({
      state: Object.fromEntries(
        Object.entries(resources).map(([name, spec]) => [spec.key, list(name)]),
      ),
      revision: db.prepare('SELECT revision FROM metadata WHERE id=1').get().revision,
    })),
    remove(resource, id) {
      db.prepare(`DELETE FROM ${resources[resource].table} WHERE id=?`).run(id);
    },
    revision() {
      return db.prepare('SELECT revision FROM metadata WHERE id=1').get().revision;
    },
    increment() {
      db.prepare('UPDATE metadata SET revision=revision+1 WHERE id=1').run();
      return this.revision();
    },
  };
}

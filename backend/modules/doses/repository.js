/** SQL limitado à família. Escrita bloqueia a rotina e os cadastros para obter snapshot consistente. */
const doseColumns =
  'id,family_id,routine_id,member_id,scheduled_date::text,occurrence_key,recorded_by,recorded_at,content_ciphertext';
const linked = `SELECT r.*,m.profile_ciphertext AS member_content,d.content_ciphertext AS medicine_content,p.content_ciphertext AS presentation_content
 FROM routines r JOIN members m ON (m.family_id,m.id)=(r.family_id,r.member_id)
 JOIN medicines d ON (d.family_id,d.id)=(r.family_id,r.medicine_id)
 JOIN medicine_presentations p ON (p.family_id,p.medicine_id,p.id)=(r.family_id,r.medicine_id,r.presentation_id)`;
export const doseRepository = {
  async routines(c, familyId, memberId) {
    return (
      await c.query(
        `${linked} WHERE r.family_id=$1 AND ($2::uuid IS NULL OR r.member_id=$2) ORDER BY r.created_at,r.id LIMIT 500`,
        [familyId, memberId || null],
      )
    ).rows;
  },
  async lockedRoutine(c, familyId, id) {
    return (
      await c.query(`${linked} WHERE r.family_id=$1 AND r.id=$2 FOR SHARE OF r,m,d,p`, [
        familyId,
        id,
      ])
    ).rows[0];
  },
  async day(c, familyId, day, memberId) {
    return (
      await c.query(
        `SELECT ${doseColumns} FROM dose_logs WHERE family_id=$1 AND scheduled_date=$2 AND ($3::uuid IS NULL OR member_id=$3) ORDER BY recorded_at,id LIMIT 12000`,
        [familyId, day, memberId || null],
      )
    ).rows;
  },
  async countDay(c, familyId, day) {
    return Number(
      (
        await c.query('SELECT count(*) FROM dose_logs WHERE family_id=$1 AND scheduled_date=$2', [
          familyId,
          day,
        ])
      ).rows[0].count,
    );
  },
  async history(c, familyId, filter) {
    return (
      await c.query(
        `SELECT ${doseColumns} FROM dose_logs WHERE family_id=$1 AND scheduled_date BETWEEN $2 AND $3 AND ($4::uuid IS NULL OR member_id=$4) AND ($5::timestamptz IS NULL OR (recorded_at,id)<($5::timestamptz,$6::uuid)) ORDER BY recorded_at DESC,id DESC LIMIT 26`,
        [
          familyId,
          filter.from,
          filter.to,
          filter.memberId || null,
          filter.cursor?.[0] || null,
          filter.cursor?.[1] || null,
        ],
      )
    ).rows;
  },
  async create(c, row) {
    return (
      await c.query(
        `INSERT INTO dose_logs(id,family_id,routine_id,member_id,scheduled_date,occurrence_key,recorded_by,recorded_at,content_ciphertext) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (family_id,occurrence_key) DO NOTHING RETURNING ${doseColumns}`,
        [
          row.id,
          row.family_id,
          row.routine_id,
          row.member_id,
          row.scheduled_date,
          row.occurrence_key,
          row.recorded_by,
          row.recorded_at,
          row.content_ciphertext,
        ],
      )
    ).rows[0];
  },
};

/** Toda consulta é limitada à família; o medicamento é derivado da apresentação no SQL. */
const columns = 'id,family_id,member_id,medicine_id,presentation_id,content_ciphertext,version';
export const routineRepository = {
  async list(c, familyId) {
    return (
      await c.query(
        `SELECT ${columns} FROM routines WHERE family_id=$1 ORDER BY created_at,id LIMIT 500`,
        [familyId],
      )
    ).rows;
  },
  async get(c, familyId, id) {
    return (
      await c.query(`SELECT ${columns} FROM routines WHERE family_id=$1 AND id=$2`, [familyId, id])
    ).rows[0];
  },
  async references(c, familyId, memberId, presentationId) {
    return (
      await c.query(
        'SELECT p.medicine_id FROM medicine_presentations p JOIN members m ON m.family_id=p.family_id WHERE p.family_id=$1 AND m.id=$2 AND p.id=$3',
        [familyId, memberId, presentationId],
      )
    ).rows[0];
  },
  async count(c, familyId) {
    return Number(
      (await c.query('SELECT count(*) FROM routines WHERE family_id=$1', [familyId])).rows[0].count,
    );
  },
  async create(c, row) {
    return (
      await c.query(
        `INSERT INTO routines(id,family_id,member_id,medicine_id,presentation_id,content_ciphertext) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${columns}`,
        [
          row.id,
          row.family_id,
          row.member_id,
          row.medicine_id,
          row.presentation_id,
          row.content_ciphertext,
        ],
      )
    ).rows[0];
  },
  async update(c, familyId, id, content, expected) {
    return (
      await c.query(
        `UPDATE routines SET content_ciphertext=$1,version=version+1,updated_at=now() WHERE family_id=$2 AND id=$3 AND version=$4 RETURNING ${columns}`,
        [content, familyId, id, expected],
      )
    ).rows[0];
  },
};

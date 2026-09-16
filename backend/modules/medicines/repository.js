/** SQL com escopo obrigatório. O catálogo usa duas consultas, sem uma consulta por cartão. */
const medicineColumns = 'id,family_id,content_ciphertext,version';
const presentationColumns = `${medicineColumns},medicine_id`;
export const medicineRepository = {
  async list(client, familyId) {
    return (
      await client.query(
        `SELECT ${medicineColumns} FROM medicines WHERE family_id=$1 ORDER BY created_at,id LIMIT 100`,
        [familyId],
      )
    ).rows;
  },
  async presentations(client, familyId, ids) {
    return (
      await client.query(
        `SELECT ${presentationColumns} FROM medicine_presentations WHERE family_id=$1 AND medicine_id=ANY($2::uuid[]) ORDER BY created_at,id`,
        [familyId, ids],
      )
    ).rows;
  },
  async get(client, familyId, id) {
    return (
      await client.query(`SELECT ${medicineColumns} FROM medicines WHERE family_id=$1 AND id=$2`, [
        familyId,
        id,
      ])
    ).rows[0];
  },
  async getPresentation(client, familyId, medicineId, id) {
    return (
      await client.query(
        `SELECT ${presentationColumns} FROM medicine_presentations WHERE family_id=$1 AND medicine_id=$2 AND id=$3`,
        [familyId, medicineId, id],
      )
    ).rows[0];
  },
  async count(client, familyId) {
    return Number(
      (await client.query('SELECT count(*) FROM medicines WHERE family_id=$1', [familyId])).rows[0]
        .count,
    );
  },
  async countPresentations(client, familyId, medicineId) {
    return Number(
      (
        await client.query(
          'SELECT count(*) FROM medicine_presentations WHERE family_id=$1 AND medicine_id=$2',
          [familyId, medicineId],
        )
      ).rows[0].count,
    );
  },
  async create(client, familyId, id, content) {
    return (
      await client.query(
        `INSERT INTO medicines(id,family_id,content_ciphertext) VALUES ($1,$2,$3) RETURNING ${medicineColumns}`,
        [id, familyId, content],
      )
    ).rows[0];
  },
  async createPresentation(client, familyId, medicineId, id, content) {
    return (
      await client.query(
        `INSERT INTO medicine_presentations(id,family_id,medicine_id,content_ciphertext) VALUES ($1,$2,$3,$4) RETURNING ${presentationColumns}`,
        [id, familyId, medicineId, content],
      )
    ).rows[0];
  },
  async update(client, familyId, id, content, expected) {
    return (
      await client.query(
        `UPDATE medicines SET content_ciphertext=$1,version=version+1,updated_at=now() WHERE family_id=$2 AND id=$3 AND version=$4 RETURNING ${medicineColumns}`,
        [content, familyId, id, expected],
      )
    ).rows[0];
  },
  async updatePresentation(client, familyId, medicineId, id, content, expected) {
    return (
      await client.query(
        `UPDATE medicine_presentations SET content_ciphertext=$1,version=version+1,updated_at=now() WHERE family_id=$2 AND medicine_id=$3 AND id=$4 AND version=$5 RETURNING ${presentationColumns}`,
        [content, familyId, medicineId, id, expected],
      )
    ).rows[0];
  },
};

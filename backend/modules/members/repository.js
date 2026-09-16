/** Consultas pequenas e parametrizadas, sempre limitadas à família; fotos fora da listagem. */
const columns =
  'id, family_id, profile_ciphertext, photo_ciphertext IS NOT NULL AS has_photo, version';
export const memberRepository = {
  async list(client, familyId) {
    return (
      await client.query(
        `SELECT ${columns} FROM members WHERE family_id=$1 ORDER BY created_at,id LIMIT 100`,
        [familyId],
      )
    ).rows;
  },
  async get(client, familyId, id) {
    return (
      await client.query(`SELECT ${columns} FROM members WHERE family_id=$1 AND id=$2`, [
        familyId,
        id,
      ])
    ).rows[0];
  },
  async photo(client, familyId, id) {
    return (
      await client.query('SELECT photo_ciphertext FROM members WHERE family_id=$1 AND id=$2', [
        familyId,
        id,
      ])
    ).rows[0]?.photo_ciphertext;
  },
  async create(client, familyId, id, profile, photo) {
    return (
      await client.query(
        `INSERT INTO members(id,family_id,profile_ciphertext,photo_ciphertext) VALUES ($1,$2,$3,$4) RETURNING ${columns}`,
        [id, familyId, profile, photo],
      )
    ).rows[0];
  },
  async update(client, familyId, id, profile, expected, photo) {
    return (
      await client.query(
        `UPDATE members SET profile_ciphertext=$1, version=version+1, updated_at=now(), photo_ciphertext=CASE WHEN $5 THEN $6 ELSE photo_ciphertext END WHERE family_id=$2 AND id=$3 AND version=$4 RETURNING ${columns}`,
        [profile, familyId, id, expected, photo !== undefined, photo ?? null],
      )
    ).rows[0];
  },
};

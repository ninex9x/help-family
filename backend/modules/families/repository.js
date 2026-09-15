/** Toda consulta combina contexto RLS e vínculo explícito. Não há listagem global. */
export const familyRepository = {
  async list(client, userId) {
    return (
      await client.query(
        `SELECT f.id,f.name,f.version,m.role FROM families f JOIN family_memberships m ON m.family_id=f.id
      WHERE m.user_id=$1 AND m.active ORDER BY f.created_at,f.id LIMIT 100`,
        [userId],
      )
    ).rows;
  },
  async get(client, userId, id) {
    return (
      await client.query(
        `SELECT f.id,f.name,f.version,m.role FROM families f JOIN family_memberships m ON m.family_id=f.id
      WHERE m.user_id=$1 AND m.active AND f.id=$2`,
        [userId, id],
      )
    ).rows[0];
  },
  async create(client, name) {
    return (await client.query('SELECT create_owned_family($1) AS id', [name])).rows[0].id;
  },
  async rename(client, id, name, version) {
    return (
      await client.query(
        'UPDATE families SET name=$1,version=version+1 WHERE id=$2 AND version=$3 RETURNING id,name,version',
        [name, id, version],
      )
    ).rows[0];
  },
};

/** Consultas de identidade e sessão usam índices; não leem famílias nem dados clínicos. */
export const authRepository = {
  async findUser(client, email) {
    return (
      await client.query('SELECT id, name, email, password_hash FROM users WHERE email=$1', [email])
    ).rows[0];
  },
  async insertUser(client, user, hash) {
    await client.query('INSERT INTO users(id,name,email,password_hash) VALUES ($1,$2,$3,$4)', [
      user.id,
      user.name,
      user.email,
      hash,
    ]);
  },
  async insertSession(client, userId, session) {
    // Serializa apenas a criação de sessões do mesmo usuário e mantém no máximo cinco.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);
    await client.query(
      'DELETE FROM sessions WHERE user_id=$1 AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC,token_hash LIMIT 4)',
      [userId],
    );
    await client.query(
      "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES ($1,$2,$3,now()+interval '8 hours')",
      [session.hash, userId, session.csrf],
    );
  },
  async session(client, tokenHash) {
    return (
      await client.query(
        `SELECT u.id,u.name,u.email,s.csrf_token,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND s.last_seen_at>now()-interval '30 minutes'`,
        [tokenHash],
      )
    ).rows[0];
  },
  async touchSession(client, tokenHash) {
    await client.query(
      "UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1 AND last_seen_at<now()-interval '1 minute'",
      [tokenHash],
    );
  },
  async deleteSession(client, tokenHash) {
    await client.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash]);
  },
};

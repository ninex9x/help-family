/** Dados exclusivamente fictícios no banco descartável da suíte. */
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
export async function routineFixture(t, options) {
  const f = await fixture(t, options),
    alice = await f.register('routine-alice'),
    bob = await f.register('routine-bob');
  const family = (await f.request('/families', { account: alice })).body.items[0];
  const other = (await f.request('/families', { account: bob })).body.items[0];
  const prefix = `/families/${family.id}`;
  async function create(path, body, account = alice) {
    const result = await f.request(path, { method: 'POST', account, body });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.item;
  }
  const member = await create(`${prefix}/members`, { name: 'Helena Fictícia' });
  const medicine = await create(`${prefix}/medicines`, { name: 'Medicamento Fictício' });
  const presentation = await create(`${prefix}/medicines/${medicine.id}/presentations`, {
    strength: '10 mg (fictício)',
    form: 'comprimido fictício',
  });
  const path = `${prefix}/routines`;
  const input = {
    memberId: member.id,
    presentationId: presentation.id,
    quantity: '1 unidade fictícia',
    instruction: 'Instrução fictícia para teste.',
    times: ['20:00', '08:00'],
  };
  return { ...f, alice, bob, family, other, member, medicine, presentation, path, input, create };
}

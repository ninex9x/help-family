/** Telas SSR compartilham identidade visual; acesso público tem layout próprio, sem navegação do painel. */
import { escapeHtml as e, icon } from '../components/ui.js';
const roles = { owner: 'Proprietário', caregiver: 'Cuidador', reader: 'Leitor' };
const hidden = (name, value) => `<input type="hidden" name="${name}" value="${e(value)}">`;
const input = (label, name, type = 'text', value = '', autocomplete = 'off') =>
  `<label>${label}<input name="${name}" type="${type}" value="${e(value)}" autocomplete="${autocomplete}"></label>`;
const logout = (auth) =>
  `<form action="/logout" method="post">${hidden('_csrf', auth.csrfToken)}<button class="theme-toggle account-logout" type="submit" aria-label="Sair">${icon('logout')}<span>Sair</span></button></form>`;
function documentPage(title, content, className = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${e(title)} — help-family</title>${['base', 'layout', 'components', 'family', 'forms', 'accounts'].map((name) => `<link rel="stylesheet" href="/assets/${name}.css">`).join('')}</head><body class="accounts-body ${className}">${content}</body></html>`;
}
export function page(title, body, auth, active = 'families') {
  if (!auth) {
    return documentPage(
      title,
      `<header class="access-brand"><a class="brand-block" href="/login"><strong>help-family</strong><span>Gestão de Saúde</span></a></header><main class="public-access-main">${body}</main><footer class="access-privacy">${icon('lock')}Seu acesso é pessoal e seguro.</footer>`,
      'public-access',
    );
  }
  const navigation = [['families', 'Suas famílias', 'family_restroom', '/families']];
  const links = navigation
    .map(
      ([id, label, glyph, url]) =>
        `<a href="${url}" class="${active === id ? 'active' : ''}" ${active === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`,
    )
    .join('');
  return documentPage(
    title,
    `<div class="help-app"><aside class="desktop-sidebar"><a class="brand-block" href="/"><strong>help-family</strong><span>Gestão de Saúde</span></a><nav class="desktop-navigation" aria-label="Navegação principal">${links}</nav><div class="sidebar-footer-actions">${auth ? `<div class="account-identity">${icon('account_circle')}<span>${e(auth.user.name)}</span></div>${logout(auth)}` : ''}<small>${icon('lock')} Dados neste dispositivo</small></div></aside><main class="app-canvas"><header class="mobile-topbar"><a class="mobile-brand" href="/">help-family</a>${auth ? logout(auth) : `<a class="account-access-link" href="/${active === 'login' ? 'register' : 'login'}">${active === 'login' ? 'Criar conta' : 'Entrar'}</a>`}</header><div class="content-container">${body}<footer class="app-disclaimer">${icon('lock')}Seus espaços de família são privados.</footer></div></main></div>`,
  );
}
export function authPage(kind, error = '', values = {}) {
  const registration = kind === 'register';
  const title = registration ? 'Crie sua conta' : 'Bem-vindo de volta';
  return page(
    title,
    `<section class="account-access-card"><header class="access-heading"><div><h1>${title}</h1><p>${registration ? 'Crie seu acesso para organizar os cuidados da família.' : 'Acesse sua conta para continuar cuidando da sua família.'}</p></div></header><form class="account-form" method="post" action="/${kind}" novalidate>${error ? `<p class="form-error" role="alert">${e(error)}</p>` : ''}<div class="form-fields">${registration ? input('Seu nome', 'name', 'text', values.name, 'name') : ''}${input('E-mail', 'email', 'email', values.email, 'email')}${input('Senha', 'password', 'password', '', registration ? 'new-password' : 'current-password')}${registration ? '<small class="form-hint">Use uma senha de 15 a 128 caracteres.</small>' + input('Nome da sua família', 'familyName', 'text', values.familyName) : ''}</div><footer><button class="primary-button" type="submit">${icon(registration ? 'person_add' : 'login')}${registration ? 'Criar conta' : 'Entrar'}</button></footer></form><p class="access-switch">${registration ? 'Já tem uma conta? <a href="/login">Entrar</a>' : 'Ainda não tem conta? <a href="/register">Criar conta</a>'}</p></section>`,
    undefined,
    kind,
  );
}
export function familiesPage(auth, items, error = '') {
  return page(
    'Suas famílias',
    `<section class="family-page"><header class="family-page-heading"><div><h1>Suas famílias</h1><p>Escolha a família que deseja gerenciar.</p></div><a class="primary-button account-create-link" href="#new-family">${icon('add')}Nova família</a></header>${error ? `<p class="form-error" role="alert">${e(error)}</p>` : ''}<div class="family-bento-grid accounts-grid">${items.map((f) => `<a class="family-profile-card account-family-card" href="/families/${e(f.id)}"><div class="family-card-decoration" aria-hidden="true"></div><header class="family-card-header"><div class="family-card-person"><span class="account-avatar">${icon('family_restroom')}</span><div><h2>${e(f.name)}</h2><p>${roles[f.role]}</p></div></div></header><p class="account-family-description">Seu espaço de cuidado compartilhado.</p><span class="family-documents-button family-card-link">${icon('arrow_forward')}Abrir família</span></a>`).join('')}<section id="new-family" class="family-add-card new-family-card"><span aria-hidden="true">${icon('add')}</span><h2>Nova família</h2><p>Crie outro espaço independente.</p><form class="account-form" method="post" action="/families" novalidate>${hidden('_csrf', auth.csrfToken)}<div class="form-fields">${input('Nome da família', 'name')}</div><button class="primary-button" type="submit">${icon('add')}Criar família</button></form></section></div></section>`,
    auth,
  );
}
export function familyPage(auth, family, error = '') {
  return page(
    family.name,
    `<section class="family-page"><a class="accounts-back" href="/families">${icon('arrow_back')} Todas as famílias</a><header class="family-page-heading"><div><h1>${e(family.name)}</h1><p>Gerencie as informações desta família.</p></div></header><section class="family-profile-card family-detail"><div class="family-card-decoration" aria-hidden="true"></div><header class="family-card-header"><div class="family-card-person"><span class="account-avatar">${icon('family_restroom')}</span><div><h2>Informações da família</h2><p>${roles[family.role]}</p></div></div></header>${error ? `<p class="form-error" role="alert">${e(error)}</p>` : ''}${family.role === 'owner' ? `<form class="account-form" method="post" action="/families/${e(family.id)}/rename" novalidate>${hidden('_csrf', auth.csrfToken)}${hidden('version', family.version)}<div class="form-fields">${input('Nome da família', 'name', 'text', family.name)}</div><footer><a class="secondary-button" href="/families">Voltar</a><button class="primary-button" type="submit">${icon('check')}Salvar nome</button></footer></form>` : '<p>Somente o proprietário pode alterar o nome da família.</p>'}<p class="family-medical-note">${icon('info')}<span>Esta área reúne suas contas e famílias. Os cuidados e documentos ainda não estão disponíveis aqui.</span></p></section></section>`,
    auth,
  );
}
export function errorPage(status, message) {
  return page(
    'Não foi possível continuar',
    `<section class="family-page"><header class="family-page-heading"><h1>Não foi possível continuar</h1></header><section class="family-profile-card family-detail"><p role="alert">${e(message)}</p><a class="secondary-button" href="${status === 401 ? '/login' : '/families'}">${status === 401 ? 'Entrar novamente' : 'Voltar às famílias'}</a></section></section>`,
  );
}

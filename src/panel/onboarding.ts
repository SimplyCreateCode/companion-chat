// The first-start screen ("Choose your agent CLI") and the empty-chat welcome.
import { DISCLAIMER, strings } from '../i18n'
import type { CliId, CliInfo } from '../protocol'
import { button, el, shape } from './dom'
import { icons, MARK } from './icons'
import { cliLabel, state } from './state'

const t = strings(orca.locale)

export type OnboardingHandlers = { choose(cli: CliId): void; refresh(): void }
export type WelcomeHandlers = { suggest(text: string): void; checkAgain(): void; changeCli(): void }

function cliCard(cli: CliInfo, handlers: OnboardingHandlers): HTMLElement {
  const found = cli.found !== null
  const custom = cli.id === 'custom'
  const status = custom ? null : el('div', { className: 'cli-status', text: found ? t.onboardFound(cli.found ?? '') : t.onboardMissing })
  const card = el(
    'div',
    { className: `cli-card${found ? ' found' : ''}` },
    el(
      'div',
      { className: 'cli-head' },
      custom ? el('span', { className: 'icon', html: icons.gear }) : shape(found ? 'ok' : 'missing'),
      el('span', { className: 'cli-label', text: cli.label }),
      cli.command ? el('code', { text: cli.command }) : null,
      el('span', { className: 'spacer' }),
      button({ text: t.onboardUse, className: found || custom ? 'btn primary' : 'btn' }, () => handlers.choose(cli.id))
    ),
    status,
    !found || custom ? el('div', { className: 'cli-hint', text: cli.installHint }) : null,
    cli.verifiedLocally ? null : el('div', { className: 'cli-note', text: t.onboardNotVerified })
  )
  return card
}

export function onboardingElement(handlers: OnboardingHandlers): HTMLElement {
  return el(
    'div',
    { className: 'onboarding' },
    el('span', { className: 'mark big', html: MARK }),
    el('h2', { text: t.onboardTitle }),
    el('p', { text: t.onboardBody }),
    el('div', { className: 'cli-list' }, ...state.clis.map((cli) => cliCard(cli, handlers))),
    button({ text: t.onboardRefresh, icon: icons.refresh }, handlers.refresh),
    el('div', { className: 'disclaimer', text: DISCLAIMER })
  )
}

export function welcomeElement(handlers: WelcomeHandlers): HTMLElement {
  const welcome = el(
    'div',
    { className: 'welcome' },
    el('span', { className: 'mark big', html: MARK }),
    el('h2', { text: t.welcomeTitle }),
    el('p', { text: t.welcomeBody })
  )
  const status = state.status
  if (!state.checking && status && !status.available) {
    welcome.append(
      el(
        'div',
        { className: 'setup' },
        el('h3', { text: t.setupTitle(cliLabel()) }),
        status.message ? el('p', { text: status.message }) : null,
        el('p', { className: 'detail', text: state.clis.find((c) => c.id === status.cli)?.installHint ?? '' }),
        el(
          'div',
          { className: 'row' },
          button({ text: t.checkAgain, icon: icons.refresh, className: 'btn primary' }, handlers.checkAgain),
          button({ text: t.changeCli }, handlers.changeCli)
        )
      )
    )
  } else {
    const list = el('div', { className: 'suggestions' })
    for (const suggestion of t.suggestions) {
      list.append(button({ text: suggestion, className: 'btn suggestion' }, () => handlers.suggest(suggestion)))
    }
    welcome.append(list)
  }
  welcome.append(el('div', { className: 'keys', text: t.welcomeKeys }), el('div', { className: 'disclaimer', text: DISCLAIMER }))
  return welcome
}

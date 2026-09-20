import './styles.css';
import { renderCipherPane } from './ui/cipherPane';
import { renderTablePane } from './ui/tablePane';
import { renderClaimPane, type LabProgress } from './ui/claimPane';
import { el } from './ui/dom';

type PaneKey = 'cipher' | 'table' | 'claim';

const ORDER: PaneKey[] = ['cipher', 'table', 'claim'];

const progress: LabProgress = { cipherVerified: false, diffRun: false, diffDistance: -1 };

const tabs = new Map<PaneKey, HTMLButtonElement>();
const panels = new Map<PaneKey, HTMLElement>();

for (const key of ORDER) {
  tabs.set(key, document.getElementById(`tab-${key}`) as HTMLButtonElement);
  panels.set(key, document.getElementById(`pane-${key}`) as HTMLElement);
}

/**
 * Panes 2 and 3 are gated on the one before (brief §1.1). The gate is real --
 * you cannot read the table pane before the cipher has been checked against the
 * RFC -- but the tab stays focusable and the locked panel explains itself and
 * carries no hidden content, so the gate never costs keyboard access.
 */
function unlocked(key: PaneKey): boolean {
  if (key === 'cipher') return true;
  if (key === 'table') return progress.cipherVerified;
  return progress.diffRun;
}

function lockCard(key: PaneKey): HTMLElement {
  const [heading, body, cta] =
    key === 'table'
      ? [
          'Locked until the cipher checks out',
          'This pane takes π apart. Before that is worth anything, the implementation here has to be ' +
            'the standard one. Run the RFC 7801 vectors in pane 1 and this unlocks.',
          'Go to pane 1',
        ]
      : [
          'Locked until the table has been rebuilt',
          'This pane is the argument about what the rebuild means. Generate and diff the table in ' +
            'pane 2 first, so the argument has something to stand on.',
          'Go to pane 2',
        ];
  const button = el('button', { class: 'act', type: 'button', text: cta });
  button.addEventListener('click', () => select(key === 'table' ? 'cipher' : 'table'));
  return el('section', { class: 'card card-intro' }, [
    el('h2', { text: heading }),
    el('p', { class: 'lede', text: body }),
    el('div', { class: 'row' }, [button]),
  ]);
}

/**
 * What each pane is currently showing. Re-rendering a pane throws away
 * everything the visitor did in it -- the rebuilt grid, the edited constants,
 * the coset selection -- so a pane is rebuilt only when what it should show has
 * actually changed: never rendered, its lock lifted, or (pane 3 only) the
 * progress it reports has moved.
 */
const renderedAs = new Map<PaneKey, string>();

function wantedRender(key: PaneKey): string {
  if (!unlocked(key)) return 'locked';
  if (key !== 'claim') return 'open';
  return `open:${progress.cipherVerified}:${progress.diffRun}:${progress.diffDistance}`;
}

function renderPane(key: PaneKey): void {
  const host = panels.get(key)!;
  const wanted = wantedRender(key);
  if (renderedAs.get(key) === wanted) return;
  renderedAs.set(key, wanted);

  if (!unlocked(key)) {
    host.replaceChildren(lockCard(key));
    return;
  }
  if (key === 'cipher') {
    renderCipherPane(host, () => {
      progress.cipherVerified = true;
      syncTabs();
    });
  } else if (key === 'table') {
    renderTablePane(host, (distance) => {
      progress.diffRun = true;
      progress.diffDistance = distance;
      syncTabs();
    });
  } else {
    renderClaimPane(host, progress);
  }
}

function syncTabs(): void {
  for (const key of ORDER) {
    const tab = tabs.get(key)!;
    const open = unlocked(key);
    const lock = tab.querySelector('.pane-lock');
    // The lock is a word, not a colour or an icon, and the tab stays operable --
    // a disabled tab would take the pane out of the keyboard order entirely.
    if (open) lock?.remove();
    else if (!lock) tab.appendChild(el('span', { class: 'pane-lock', text: '(locked)' }));
  }
}

function select(key: PaneKey): void {
  for (const other of ORDER) {
    const tab = tabs.get(other)!;
    const panel = panels.get(other)!;
    const active = other === key;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
  }
  renderPane(key);
  syncTabs();
}

for (const key of ORDER) {
  const tab = tabs.get(key)!;
  tab.addEventListener('click', () => {
    select(key);
    tab.focus();
  });
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const at = ORDER.indexOf(key);
    const next = ORDER[(at + (event.key === 'ArrowRight' ? 1 : ORDER.length - 1)) % ORDER.length];
    select(next);
    tabs.get(next)!.focus();
  });
}

select('cipher');

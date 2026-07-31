import { appState, state } from './state.js';

const validTabs = new Set(['overview', 'clients', 'ips', 'traffic', 'config', 'models', 'agent', 'latest', 'notice', 'license', 'resources', 'plugins', 'model-info-cache']);
const tabSections = {
  overview: 'stats',
  clients: 'stats',
  ips: 'stats',
  traffic: 'stats',
  config: 'stats',
  models: 'stats',
  agent: 'stats',
  latest: 'stats',
  notice: 'system',
  license: 'system',
  resources: 'system',
  plugins: 'system',
  'model-info-cache': 'system',
};
const lastTabBySection = { stats: 'overview', system: 'notice' };

export function getInitialTab() {
  const tab = window.location.hash.replace(/^#/, '');
  return validTabs.has(tab) ? tab : 'overview';
}

export function activateTab(tab) {
  appState.activeTab = validTabs.has(tab) ? tab : 'overview';
  const activeSection = tabSections[appState.activeTab];
  lastTabBySection[activeSection] = appState.activeTab;
  window.location.hash = appState.activeTab;

  for (const button of state.navSectionButtons) {
    const active = button.dataset.navSection === activeSection;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  for (const group of state.navGroups) {
    group.hidden = group.dataset.navGroup !== activeSection;
  }

  for (const button of state.tabButtons) {
    button.classList.toggle('active', button.dataset.tabButton === appState.activeTab);
  }

  for (const panel of state.tabPanels) {
    panel.classList.toggle('active', panel.dataset.tabPanel === appState.activeTab);
  }
}

export function activateSection(section) {
  const normalizedSection = section === 'system' ? 'system' : 'stats';
  activateTab(lastTabBySection[normalizedSection]);
}

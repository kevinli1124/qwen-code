export type PanelTab = 'terminal' | 'files' | 'plan';

export interface PanelState {
  activeTab: PanelTab;
  width: number;
  collapsed: boolean;
}

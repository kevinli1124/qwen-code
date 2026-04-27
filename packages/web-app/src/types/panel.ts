export type PanelTab = 'terminal' | 'files' | 'plan' | 'context';

export interface PanelState {
  activeTab: PanelTab;
  width: number;
  collapsed: boolean;
}

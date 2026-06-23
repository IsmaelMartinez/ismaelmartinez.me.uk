export interface FunActivity {
  id: string;
  icon: string;
  path: string;
  color: string;
}

export const funActivities: FunActivity[] = [
  {
    id: 'snake',
    icon: '🐍',
    path: '/fun/snake',
    color: '#22c55e'
  }
];

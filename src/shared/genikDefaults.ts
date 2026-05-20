// Sous-dossiers standards Genik.
// Servent de "defaults" : on peut les ré-injecter via IPC.SubfoldersSeedDefaults.
// Ils sont insérés désactivés (enabled=false) ; l'utilisateur les active à la carte.
// `relativePath` est l'identité unique d'un sous-dossier (utilisé pour l'INSERT OR IGNORE).

export interface GenikDefaultSubfolder {
  name: string
  relativePath: string
}

export const GENIK_DEFAULT_SUBFOLDERS: GenikDefaultSubfolder[] = [
  { name: 'Contrats', relativePath: '01_Contrats' },
  { name: 'Contrats / Comptabilité', relativePath: '01_Contrats\\Comptabilité' },
  { name: 'Contrats / Données client', relativePath: '01_Contrats\\Données_client' },
  { name: 'Contrats / Facturation', relativePath: '01_Contrats\\Facturation' },
  { name: 'Planification', relativePath: '02_Documents de planification' },
  { name: 'Ingénierie', relativePath: '03_Ingenierie-Dessins techniques' },
  {
    name: 'Ingénierie / Mécanique',
    relativePath: '03_Ingenierie-Dessins techniques\\03_01_Mecanique'
  },
  {
    name: 'Ingénierie / Électrique',
    relativePath: '03_Ingenierie-Dessins techniques\\03_03_Electrique'
  },
  {
    name: 'Ingénierie / Doc Composantes',
    relativePath: '03_Ingenierie-Dessins techniques\\03_04_Documentation Composantes'
  },
  {
    name: 'Ingénierie / Doc technique',
    relativePath:
      '03_Ingenierie-Dessins techniques\\03_05_Documentation technique (manuel opération)'
  },
  {
    name: 'Ingénierie / Analyse risques',
    relativePath: '03_Ingenierie-Dessins techniques\\03_06_Analyse de risques'
  },
  {
    name: 'Ingénierie / Pneumatique',
    relativePath: '03_Ingenierie-Dessins techniques\\03_07_Pneumatique'
  },
  {
    name: 'Ingénierie / Programmation',
    relativePath: '03_Ingenierie-Dessins techniques\\03_12_Programmation'
  },
  {
    name: 'Ingénierie / Mise en production',
    relativePath: '03_Ingenierie-Dessins techniques\\03_13_Mise en production'
  },
  { name: 'Photos et vidéos', relativePath: '06_Photographies et videos' },
  {
    name: 'Rapports et comptes rendus',
    relativePath: '08_Rapports de progres et comptes rendus des rencontres'
  }
]

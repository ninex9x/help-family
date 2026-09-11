/** Dados exclusivamente fictícios para testes e ferramentas explícitas; não inicializa bancos reais. */
function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function dateDaysAgo(days, referenceDate = new Date()) {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() - days);
  return localDateKey(date);
}
export function createDemoState(referenceDate = new Date()) {
  const today = localDateKey(referenceDate);
  const members = [
    { id: 'joao', name: 'João', relationship: 'Pai', initials: 'JO', color: '#a43c12' },
    { id: 'ana', name: 'Ana', relationship: 'Mãe', initials: 'AN', color: '#016b54' },
    { id: 'maria', name: 'Maria', relationship: 'Meu perfil', initials: 'MA', color: '#075fab' },
  ];
  const drugs = [
    { id: 'drug-pantoprazol', name: 'Pantoprazol', color: '#016b54' },
    { id: 'drug-losartana', name: 'Losartana Potássica', color: '#a43c12' },
    { id: 'drug-metformina', name: 'Metformina', color: '#075fab' },
    { id: 'drug-anlodipino', name: 'Anlodipino', color: '#8a4d8d' },
    { id: 'drug-atorvastatina', name: 'Atorvastatina', color: '#016b54' },
    { id: 'drug-vitamina-d', name: 'Vitamina D', color: '#075fab' },
    { id: 'drug-dipirona', name: 'Dipirona', color: '#8a4d8d' },
  ];
  const presentations = [
    {
      id: 'presentation-pantoprazol-40',
      drugId: 'drug-pantoprazol',
      strength: '40 mg',
      form: 'comprimido',
    },
    {
      id: 'presentation-losartana-50',
      drugId: 'drug-losartana',
      strength: '50 mg',
      form: 'comprimido',
    },
    {
      id: 'presentation-metformina-850',
      drugId: 'drug-metformina',
      strength: '850 mg',
      form: 'comprimido',
    },
    {
      id: 'presentation-anlodipino-5',
      drugId: 'drug-anlodipino',
      strength: '5 mg',
      form: 'comprimido',
    },
    {
      id: 'presentation-atorvastatina-20',
      drugId: 'drug-atorvastatina',
      strength: '20 mg',
      form: 'comprimido',
    },
    {
      id: 'presentation-vitamina-d',
      drugId: 'drug-vitamina-d',
      strength: '1.000 UI',
      form: 'cápsula',
    },
    {
      id: 'presentation-dipirona-500',
      drugId: 'drug-dipirona',
      strength: '500 mg',
      form: 'comprimido',
    },
    {
      id: 'presentation-dipirona-1g',
      drugId: 'drug-dipirona',
      strength: '1 g',
      form: 'comprimido',
    },
    {
      id: 'presentation-dipirona-gotas',
      drugId: 'drug-dipirona',
      strength: '500 mg/mL',
      form: 'gotas',
    },
  ];
  const routines = [
    {
      id: 'pantoprazol',
      drugId: 'drug-pantoprazol',
      presentationId: 'presentation-pantoprazol-40',
      memberId: 'joao',
      quantity: '1 comprimido',
      times: ['07:00'],
      instruction: 'Tomar em jejum',
    },
    {
      id: 'losartana',
      drugId: 'drug-losartana',
      presentationId: 'presentation-losartana-50',
      memberId: 'joao',
      quantity: '1 comprimido',
      times: ['08:00'],
      instruction: 'Tomar logo após o café da manhã',
    },
    {
      id: 'metformina',
      drugId: 'drug-metformina',
      presentationId: 'presentation-metformina-850',
      memberId: 'joao',
      quantity: '1 comprimido',
      times: ['13:00'],
      instruction: 'Tomar junto do almoço',
    },
    {
      id: 'anlodipino',
      drugId: 'drug-anlodipino',
      presentationId: 'presentation-anlodipino-5',
      memberId: 'joao',
      quantity: '1 comprimido',
      times: ['20:00'],
      instruction: 'Conforme orientação médica',
    },
    {
      id: 'atorvastatina',
      drugId: 'drug-atorvastatina',
      presentationId: 'presentation-atorvastatina-20',
      memberId: 'ana',
      quantity: '1 comprimido',
      times: ['21:00'],
      instruction: 'Conforme orientação médica',
    },
    {
      id: 'vitamina-d',
      drugId: 'drug-vitamina-d',
      presentationId: 'presentation-vitamina-d',
      memberId: 'maria',
      quantity: '1 cápsula',
      times: ['09:00'],
      instruction: 'Após o café da manhã',
    },
    {
      id: 'dipirona',
      drugId: 'drug-dipirona',
      presentationId: 'presentation-dipirona-1g',
      memberId: 'ana',
      quantity: '1 comprimido',
      times: ['18:00'],
      instruction: 'Se dor ou febre',
      active: false,
    },
    {
      id: 'dipirona-joao',
      drugId: 'drug-dipirona',
      presentationId: 'presentation-dipirona-500',
      memberId: 'joao',
      quantity: '1 comprimido',
      times: ['18:00'],
      instruction: 'Somente conforme orientação médica',
      active: false,
    },
  ];
  const logs = [
    {
      id: 'demo-1',
      routineId: 'pantoprazol',
      memberId: 'joao',
      date: today,
      scheduledTime: '07:00',
      status: 'taken',
      recordedAt: '07:04',
    },
    {
      id: 'demo-2',
      routineId: 'atorvastatina',
      memberId: 'ana',
      date: dateDaysAgo(1, referenceDate),
      scheduledTime: '21:00',
      status: 'taken',
      recordedAt: '21:06',
    },
    {
      id: 'demo-3',
      routineId: 'losartana',
      memberId: 'joao',
      date: dateDaysAgo(1, referenceDate),
      scheduledTime: '08:00',
      status: 'taken',
      recordedAt: '08:02',
    },
    {
      id: 'demo-4',
      routineId: 'metformina',
      memberId: 'joao',
      date: dateDaysAgo(2, referenceDate),
      scheduledTime: '13:00',
      status: 'skipped',
      recordedAt: '15:20',
    },
  ];
  const documents = [
    {
      id: 'document-demo-1',
      title: 'Receita Uso Contínuo - Losartana',
      memberId: 'joao',
      category: 'prescription',
      date: dateDaysAgo(13, referenceDate),
      fileName: 'receita-losartana.txt',
      mimeType: 'text/plain',
    },
    {
      id: 'document-demo-2',
      title: 'Hemograma Completo',
      memberId: 'maria',
      category: 'exam',
      date: dateDaysAgo(30, referenceDate),
      fileName: 'hemograma-completo.txt',
      mimeType: 'text/plain',
    },
    {
      id: 'document-demo-3',
      title: 'Atestado Médico - 5 dias',
      memberId: 'ana',
      category: 'certificate',
      date: dateDaysAgo(45, referenceDate),
      fileName: 'atestado-medico.txt',
      mimeType: 'text/plain',
    },
  ];
  return { members, drugs, presentations, routines, logs, documents };
}

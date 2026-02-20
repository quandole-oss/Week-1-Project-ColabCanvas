import type { ShapeType, CanvasObjectProps } from '../types/canvas';

// --- Types ---

interface TemplateElement {
  type: ShapeType;
  offset: { x: number; y: number };
  props: Omit<CanvasObjectProps, 'left' | 'top'>;
}

interface BuiltElement {
  type: ShapeType;
  props: CanvasObjectProps;
}

interface CanvasTemplate {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  elements?: TemplateElement[];
  build?: (center: { x: number; y: number }) => BuiltElement[];
}

// --- Helpers ---

const TXT: Omit<CanvasObjectProps, 'left' | 'top' | 'width' | 'height' | 'text' | 'fontSize' | 'textColor'> = {
  fill: '', stroke: 'transparent', strokeWidth: 0, fontFamily: 'sans-serif',
};

function txt(
  offset: { x: number; y: number },
  w: number, h: number,
  text: string, fontSize: number, textColor: string,
): TemplateElement {
  return { type: 'textbox', offset, props: { width: w, height: h, text, fontSize, textColor, ...TXT } };
}

function rect(
  offset: { x: number; y: number },
  w: number, h: number,
  fill: string, stroke = 'transparent', strokeWidth = 0,
): TemplateElement {
  return { type: 'rect', offset, props: { width: w, height: h, fill, stroke, strokeWidth } };
}

function connector(offset: { x: number; y: number }, w: number, h: number, color = '#94A3B8'): TemplateElement {
  return rect(offset, w, h, color);
}

// --- Templates ---

const swotAnalysis: CanvasTemplate = {
  id: 'swot',
  name: 'SWOT Analysis',
  description: 'Created SWOT analysis with 4 labeled quadrants (Strengths, Weaknesses, Opportunities, Threats)',
  keywords: ['swot'],
  elements: [
    rect({ x: -222, y: -182 }, 220, 180, '#22C55E', '#1E293B', 2),
    txt({ x: -212, y: -172 }, 200, 30, 'Strengths', 18, '#FFFFFF'),
    rect({ x: 2, y: -182 }, 220, 180, '#EF4444', '#1E293B', 2),
    txt({ x: 12, y: -172 }, 200, 30, 'Weaknesses', 18, '#FFFFFF'),
    rect({ x: -222, y: 2 }, 220, 180, '#3B82F6', '#1E293B', 2),
    txt({ x: -212, y: 12 }, 200, 30, 'Opportunities', 18, '#FFFFFF'),
    rect({ x: 2, y: 2 }, 220, 180, '#F59E0B', '#1E293B', 2),
    txt({ x: 12, y: 12 }, 200, 30, 'Threats', 18, '#FFFFFF'),
  ],
};

const barChart: CanvasTemplate = {
  id: 'bar-chart',
  name: 'Bar Chart',
  description: 'Created bar chart template with 4 quarters, 6 product series, axes, and legend',
  keywords: ['bar chart', 'barchart', 'bar graph'],
  build(center) {
    const chartW = 560, chartH = 360;
    const marginLeft = 60, marginBottom = 70, marginTop = 40;
    const plotW = chartW - marginLeft - 20;
    const plotH = chartH - marginTop - marginBottom;
    const ox = center.x - chartW / 2;
    const oy = center.y - chartH / 2;
    const pL = ox + marginLeft;
    const pB = oy + chartH - marginBottom;
    const pT = oy + marginTop;

    const cats = ['Q1', 'Q2', 'Q3', 'Q4'];
    const series = [
      { label: '875', color: '#4285F4' }, { label: 'Saw', color: '#EA4335' },
      { label: 'L440', color: '#FBBC04' }, { label: 'Hammer', color: '#34A853' },
      { label: 'Grinder', color: '#4FC3F7' }, { label: 'Drill', color: '#FF7043' },
    ];
    const data = [
      [250, 220, 200, 180, 160, 140], [260, 300, 250, 340, 200, 180],
      [240, 310, 280, 350, 220, 200], [270, 280, 240, 300, 260, 220],
    ];
    const maxVal = 500;
    const out: BuiltElement[] = [];
    const r = (t: ShapeType, p: CanvasObjectProps) => out.push({ type: t, props: p });

    r('rect', { left: ox, top: oy, width: chartW, height: chartH, fill: '#F8F9FA', stroke: '#BDBDBD', strokeWidth: 2 });
    r('textbox', { left: ox + chartW / 2 - 80, top: oy + 8, width: 160, height: 24, text: 'Acme Tool Sales', fontSize: 16, textColor: '#333333', ...TXT });
    r('textbox', { left: ox + 2, top: pT + plotH / 2 - 10, width: 50, height: 20, text: 'Units Sold', fontSize: 10, textColor: '#666666', ...TXT });

    for (const tick of [0, 100, 200, 300, 400, 500]) {
      const y = pB - (tick / maxVal) * plotH;
      r('line', { left: pL, top: y, width: plotW, height: 0, fill: 'transparent', stroke: '#E8E8E8', strokeWidth: 1 });
      r('textbox', { left: pL - 32, top: y - 7, width: 28, height: 14, text: String(tick), fontSize: 10, textColor: '#888888', ...TXT });
    }

    r('rect', { left: pL, top: pB, width: plotW, height: 2, fill: '#424242', stroke: 'transparent', strokeWidth: 0 });
    r('rect', { left: pL, top: pT, width: 2, height: plotH, fill: '#424242', stroke: 'transparent', strokeWidth: 0 });

    const groupW = plotW / cats.length;
    const barGap = 2;
    const barW = Math.floor((groupW - 20) / series.length) - barGap;

    for (let gi = 0; gi < cats.length; gi++) {
      const gL = pL + gi * groupW + 10;
      for (let si = 0; si < series.length; si++) {
        const barH = (data[gi][si] / maxVal) * plotH;
        r('rect', { left: gL + si * (barW + barGap), top: pB - barH, width: barW, height: Math.round(barH), fill: series[si].color, stroke: 'transparent', strokeWidth: 0 });
      }
      const lW = groupW - 10;
      r('textbox', { left: gL + (groupW - 20 - lW) / 2, top: pB + 6, width: lW, height: 14, text: cats[gi], fontSize: 10, textColor: '#555555', ...TXT });
    }

    r('textbox', { left: pL + plotW / 2 - 35, top: pB + 22, width: 70, height: 14, text: 'Quarters', fontSize: 10, textColor: '#555555', ...TXT });

    const legY = oy + chartH - 18;
    const legItemW = 70;
    const legStartX = ox + (chartW - series.length * legItemW) / 2;
    for (let i = 0; i < series.length; i++) {
      const x = legStartX + i * legItemW;
      r('rect', { left: x, top: legY, width: 8, height: 8, fill: series[i].color, stroke: 'transparent', strokeWidth: 0 });
      r('textbox', { left: x + 11, top: legY - 2, width: legItemW - 14, height: 12, text: series[i].label, fontSize: 9, textColor: '#666666', ...TXT });
    }

    return out;
  },
};

const flowchart: CanvasTemplate = {
  id: 'flowchart',
  name: 'Flowchart',
  description: 'Created flowchart with start, process, decision, and end nodes',
  keywords: ['flowchart', 'flow chart', 'flow diagram', 'process flow', 'workflow'],
  elements: [
    // Start node
    { type: 'circle', offset: { x: -25, y: -245 }, props: { radius: 25, fill: '#10B981', stroke: '#059669', strokeWidth: 2 } },
    txt({ x: -20, y: -237 }, 40, 16, 'Start', 12, '#FFFFFF'),
    connector({ x: -1, y: -220 }, 2, 30),
    // Process step
    rect({ x: -80, y: -190 }, 160, 45, '#3B82F6', '#2563EB', 2),
    txt({ x: -65, y: -180 }, 130, 16, 'Process Step', 13, '#FFFFFF'),
    connector({ x: -1, y: -145 }, 2, 30),
    // Decision
    rect({ x: -70, y: -115 }, 140, 55, '#F59E0B', '#D97706', 2),
    txt({ x: -55, y: -100 }, 110, 16, 'Decision?', 13, '#FFFFFF'),
    // Yes path
    connector({ x: -1, y: -60 }, 2, 30),
    txt({ x: 5, y: -55 }, 30, 14, 'Yes', 10, '#10B981'),
    rect({ x: -80, y: -30 }, 160, 45, '#3B82F6', '#2563EB', 2),
    txt({ x: -65, y: -20 }, 130, 16, 'Action', 13, '#FFFFFF'),
    connector({ x: -1, y: 15 }, 2, 30),
    // No path (horizontal branch)
    connector({ x: 70, y: -89 }, 50, 2),
    txt({ x: 75, y: -105 }, 25, 14, 'No', 10, '#EF4444'),
    rect({ x: 120, y: -115 }, 120, 55, '#EF4444', '#DC2626', 2),
    txt({ x: 130, y: -100 }, 100, 16, 'Alternate', 13, '#FFFFFF'),
    // End node
    { type: 'circle', offset: { x: -25, y: 45 }, props: { radius: 25, fill: '#EF4444', stroke: '#DC2626', strokeWidth: 2 } },
    txt({ x: -15, y: 53 }, 30, 16, 'End', 12, '#FFFFFF'),
  ],
};

const orgChart: CanvasTemplate = {
  id: 'org-chart',
  name: 'Org Chart',
  description: 'Created org chart with 3-level hierarchy (CEO, VPs, Teams)',
  keywords: ['org chart', 'organization chart', 'hierarchy', 'org structure', 'team structure'],
  elements: [
    // Level 0: CEO
    rect({ x: -65, y: -150 }, 130, 45, '#6366F1', '#4F46E5', 2),
    txt({ x: -55, y: -138 }, 110, 16, 'CEO', 14, '#FFFFFF'),
    // Vertical trunk from CEO
    connector({ x: -1, y: -105 }, 2, 30),
    // Horizontal bar connecting VPs
    connector({ x: -135, y: -76 }, 270, 2),
    // VP drops
    connector({ x: -135, y: -76 }, 2, 16),
    connector({ x: 134, y: -76 }, 2, 16),
    // Level 1: VPs
    rect({ x: -200, y: -60 }, 130, 45, '#3B82F6', '#2563EB', 2),
    txt({ x: -195, y: -48 }, 120, 16, 'VP Marketing', 12, '#FFFFFF'),
    rect({ x: 70, y: -60 }, 130, 45, '#3B82F6', '#2563EB', 2),
    txt({ x: 75, y: -48 }, 120, 16, 'VP Engineering', 12, '#FFFFFF'),
    // VP1 trunk + bar
    connector({ x: -135, y: -15 }, 2, 25),
    connector({ x: -200, y: 9 }, 130, 2),
    connector({ x: -200, y: 9 }, 2, 11),
    connector({ x: -72, y: 9 }, 2, 11),
    // VP2 trunk + bar
    connector({ x: 134, y: -15 }, 2, 25),
    connector({ x: 70, y: 9 }, 130, 2),
    connector({ x: 70, y: 9 }, 2, 11),
    connector({ x: 198, y: 9 }, 2, 11),
    // Level 2: Teams
    rect({ x: -260, y: 20 }, 120, 40, '#10B981', '#059669', 2),
    txt({ x: -255, y: 28 }, 110, 16, 'Branding', 11, '#FFFFFF'),
    rect({ x: -132, y: 20 }, 120, 40, '#10B981', '#059669', 2),
    txt({ x: -127, y: 28 }, 110, 16, 'Growth', 11, '#FFFFFF'),
    rect({ x: 10, y: 20 }, 120, 40, '#10B981', '#059669', 2),
    txt({ x: 15, y: 28 }, 110, 16, 'Frontend', 11, '#FFFFFF'),
    rect({ x: 140, y: 20 }, 120, 40, '#10B981', '#059669', 2),
    txt({ x: 145, y: 28 }, 110, 16, 'Backend', 11, '#FFFFFF'),
  ],
};

const kanbanBoard: CanvasTemplate = {
  id: 'kanban',
  name: 'Kanban Board',
  description: 'Created Kanban board with To Do, In Progress, and Done columns',
  keywords: ['kanban', 'task board', 'scrum board', 'project board', 'sprint board'],
  elements: [
    // Column backgrounds
    rect({ x: -280, y: -200 }, 180, 380, '#F1F5F9', '#E2E8F0', 1),
    rect({ x: -90, y: -200 }, 180, 380, '#F1F5F9', '#E2E8F0', 1),
    rect({ x: 100, y: -200 }, 180, 380, '#F1F5F9', '#E2E8F0', 1),
    // Column headers
    rect({ x: -280, y: -200 }, 180, 40, '#3B82F6'),
    txt({ x: -270, y: -190 }, 160, 20, 'To Do', 14, '#FFFFFF'),
    rect({ x: -90, y: -200 }, 180, 40, '#F59E0B'),
    txt({ x: -80, y: -190 }, 160, 20, 'In Progress', 14, '#FFFFFF'),
    rect({ x: 100, y: -200 }, 180, 40, '#10B981'),
    txt({ x: 110, y: -190 }, 160, 20, 'Done', 14, '#FFFFFF'),
    // To Do cards
    rect({ x: -270, y: -150 }, 160, 50, '#FFFFFF', '#CBD5E1', 1),
    txt({ x: -260, y: -138 }, 140, 16, 'Design mockups', 11, '#334155'),
    rect({ x: -270, y: -90 }, 160, 50, '#FFFFFF', '#CBD5E1', 1),
    txt({ x: -260, y: -78 }, 140, 16, 'Write user stories', 11, '#334155'),
    rect({ x: -270, y: -30 }, 160, 50, '#FFFFFF', '#CBD5E1', 1),
    txt({ x: -260, y: -18 }, 140, 16, 'Plan sprint', 11, '#334155'),
    // In Progress cards
    rect({ x: -80, y: -150 }, 160, 50, '#FFFFFF', '#CBD5E1', 1),
    txt({ x: -70, y: -138 }, 140, 16, 'Build API endpoints', 11, '#334155'),
    rect({ x: -80, y: -90 }, 160, 50, '#FFFFFF', '#CBD5E1', 1),
    txt({ x: -70, y: -78 }, 140, 16, 'Set up CI/CD', 11, '#334155'),
    // Done cards
    rect({ x: 110, y: -150 }, 160, 50, '#FFFFFF', '#CBD5E1', 1),
    txt({ x: 120, y: -138 }, 140, 16, 'Project kickoff', 11, '#334155'),
  ],
};

const mindMap: CanvasTemplate = {
  id: 'mind-map',
  name: 'Mind Map',
  description: 'Created mind map with central topic and 5 branches',
  keywords: ['mind map', 'mindmap', 'brainstorm', 'spider diagram', 'concept map'],
  elements: [
    // Central node
    { type: 'circle', offset: { x: -40, y: -40 }, props: { radius: 40, fill: '#6366F1', stroke: '#4F46E5', strokeWidth: 2 } },
    txt({ x: -32, y: -10 }, 64, 20, 'Main Topic', 12, '#FFFFFF'),
    // Right branch
    connector({ x: 40, y: -1 }, 70, 2, '#6366F1'),
    { type: 'circle', offset: { x: 110, y: -22 }, props: { radius: 22, fill: '#3B82F6', stroke: '#2563EB', strokeWidth: 2 } },
    txt({ x: 115, y: -12 }, 44, 14, 'Idea 1', 10, '#FFFFFF'),
    // Top branch
    connector({ x: -1, y: -40 }, 2, 50, '#6366F1'),
    { type: 'circle', offset: { x: -22, y: -112 }, props: { radius: 22, fill: '#10B981', stroke: '#059669', strokeWidth: 2 } },
    txt({ x: -17, y: -102 }, 44, 14, 'Idea 2', 10, '#FFFFFF'),
    // Bottom branch
    connector({ x: -1, y: 40 }, 2, 50, '#6366F1'),
    { type: 'circle', offset: { x: -22, y: 90 }, props: { radius: 22, fill: '#F59E0B', stroke: '#D97706', strokeWidth: 2 } },
    txt({ x: -17, y: 100 }, 44, 14, 'Idea 3', 10, '#FFFFFF'),
    // Left branch
    connector({ x: -110, y: -1 }, 70, 2, '#6366F1'),
    { type: 'circle', offset: { x: -132, y: -22 }, props: { radius: 22, fill: '#EF4444', stroke: '#DC2626', strokeWidth: 2 } },
    txt({ x: -127, y: -12 }, 44, 14, 'Idea 4', 10, '#FFFFFF'),
    // Top-right branch
    connector({ x: 28, y: -39 }, 52, 2, '#6366F1'),
    connector({ x: 79, y: -90 }, 2, 52, '#6366F1'),
    { type: 'circle', offset: { x: 58, y: -112 }, props: { radius: 22, fill: '#EC4899', stroke: '#DB2777', strokeWidth: 2 } },
    txt({ x: 63, y: -102 }, 44, 14, 'Idea 5', 10, '#FFFFFF'),
  ],
};

const timeline: CanvasTemplate = {
  id: 'timeline',
  name: 'Timeline',
  description: 'Created timeline with 5 milestones',
  keywords: ['timeline', 'roadmap', 'milestones', 'project timeline'],
  elements: (() => {
    const els: TemplateElement[] = [];
    const lineY = 0;
    const spacing = 120;
    const count = 5;
    const totalW = (count - 1) * spacing;
    const startX = -totalW / 2;

    // Main horizontal line
    els.push(connector({ x: startX - 20, y: lineY - 1 }, totalW + 40, 3, '#64748B'));

    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1'];
    const labels = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5'];
    const dates = ['Jan 2025', 'Mar 2025', 'Jun 2025', 'Sep 2025', 'Dec 2025'];

    for (let i = 0; i < count; i++) {
      const cx = startX + i * spacing;
      els.push({ type: 'circle', offset: { x: cx - 10, y: lineY - 10 }, props: { radius: 10, fill: colors[i], stroke: '#FFFFFF', strokeWidth: 2 } });
      els.push(txt({ x: cx - 35, y: lineY - 40 }, 70, 14, labels[i], 11, '#1E293B'));
      els.push(txt({ x: cx - 35, y: lineY + 18 }, 70, 14, dates[i], 9, '#64748B'));
    }

    return els;
  })(),
};

const prosAndCons: CanvasTemplate = {
  id: 'pros-cons',
  name: 'Pros and Cons',
  description: 'Created pros and cons comparison with two columns',
  keywords: ['pros and cons', 'pros cons', 'pros & cons', 'comparison', 'advantages disadvantages'],
  elements: [
    // Headers
    rect({ x: -230, y: -160 }, 220, 40, '#10B981'),
    txt({ x: -220, y: -150 }, 200, 20, 'Pros', 16, '#FFFFFF'),
    rect({ x: 10, y: -160 }, 220, 40, '#EF4444'),
    txt({ x: 20, y: -150 }, 200, 20, 'Cons', 16, '#FFFFFF'),
    // Column bodies
    rect({ x: -230, y: -120 }, 220, 280, '#F0FDF4', '#BBF7D0', 1),
    rect({ x: 10, y: -120 }, 220, 280, '#FEF2F2', '#FECACA', 1),
    // Pro items
    txt({ x: -220, y: -105 }, 200, 16, '+ Easy to implement', 12, '#166534'),
    txt({ x: -220, y: -78 }, 200, 16, '+ Cost effective', 12, '#166534'),
    txt({ x: -220, y: -51 }, 200, 16, '+ Scalable solution', 12, '#166534'),
    txt({ x: -220, y: -24 }, 200, 16, '+ User friendly', 12, '#166534'),
    // Con items
    txt({ x: 20, y: -105 }, 200, 16, '- Steep learning curve', 12, '#991B1B'),
    txt({ x: 20, y: -78 }, 200, 16, '- Limited integration', 12, '#991B1B'),
    txt({ x: 20, y: -51 }, 200, 16, '- Requires training', 12, '#991B1B'),
    txt({ x: 20, y: -24 }, 200, 16, '- Vendor lock-in risk', 12, '#991B1B'),
  ],
};

const matrix2x2: CanvasTemplate = {
  id: '2x2-matrix',
  name: '2x2 Matrix',
  description: 'Created 2x2 matrix with labeled axes',
  keywords: ['2x2 matrix', '2x2', 'quadrant', 'matrix', 'priority matrix', 'eisenhower'],
  elements: [
    // Quadrants
    rect({ x: -202, y: -172 }, 200, 170, '#DBEAFE', '#93C5FD', 1),
    rect({ x: 2, y: -172 }, 200, 170, '#D1FAE5', '#6EE7B7', 1),
    rect({ x: -202, y: 2 }, 200, 170, '#FEF3C7', '#FCD34D', 1),
    rect({ x: 2, y: 2 }, 200, 170, '#FEE2E2', '#FCA5A5', 1),
    // Quadrant labels
    txt({ x: -192, y: -160 }, 180, 16, 'High Impact / Low Effort', 12, '#1E40AF'),
    txt({ x: 12, y: -160 }, 180, 16, 'High Impact / High Effort', 12, '#065F46'),
    txt({ x: -192, y: 12 }, 180, 16, 'Low Impact / Low Effort', 12, '#92400E'),
    txt({ x: 12, y: 12 }, 180, 16, 'Low Impact / High Effort', 12, '#991B1B'),
    // Axis labels
    txt({ x: -50, y: -200 }, 100, 18, 'Impact ↑', 13, '#475569'),
    txt({ x: -50, y: 178 }, 100, 18, 'Effort →', 13, '#475569'),
  ],
};

const wireframeMobile: CanvasTemplate = {
  id: 'wireframe-mobile',
  name: 'Mobile Wireframe',
  description: 'Created mobile wireframe with status bar, header, content area, and bottom nav',
  keywords: ['wireframe', 'mobile wireframe', 'app wireframe', 'mockup', 'mobile mockup', 'phone mockup'],
  elements: [
    // Phone frame
    rect({ x: -100, y: -230 }, 200, 430, '#FFFFFF', '#CBD5E1', 2),
    // Status bar
    rect({ x: -100, y: -230 }, 200, 24, '#F1F5F9'),
    txt({ x: -30, y: -228 }, 60, 14, '9:41 AM', 9, '#64748B'),
    // Header
    rect({ x: -100, y: -206 }, 200, 44, '#3B82F6'),
    txt({ x: -60, y: -195 }, 120, 20, 'App Title', 15, '#FFFFFF'),
    // Search bar placeholder
    rect({ x: -85, y: -150 }, 170, 32, '#F1F5F9', '#CBD5E1', 1),
    txt({ x: -75, y: -142 }, 130, 16, 'Search...', 11, '#94A3B8'),
    // Content cards
    rect({ x: -85, y: -105 }, 170, 70, '#FFFFFF', '#E2E8F0', 1),
    rect({ x: -75, y: -95 }, 50, 50, '#E2E8F0'),
    txt({ x: -15, y: -95 }, 95, 14, 'Card Title', 12, '#1E293B'),
    txt({ x: -15, y: -78 }, 95, 12, 'Description text here', 9, '#64748B'),
    rect({ x: -85, y: -25 }, 170, 70, '#FFFFFF', '#E2E8F0', 1),
    rect({ x: -75, y: -15 }, 50, 50, '#E2E8F0'),
    txt({ x: -15, y: -15 }, 95, 14, 'Card Title', 12, '#1E293B'),
    txt({ x: -15, y: 2 }, 95, 12, 'Description text here', 9, '#64748B'),
    rect({ x: -85, y: 55 }, 170, 70, '#FFFFFF', '#E2E8F0', 1),
    rect({ x: -75, y: 65 }, 50, 50, '#E2E8F0'),
    txt({ x: -15, y: 65 }, 95, 14, 'Card Title', 12, '#1E293B'),
    txt({ x: -15, y: 82 }, 95, 12, 'Description text here', 9, '#64748B'),
    // Bottom nav
    rect({ x: -100, y: 155 }, 200, 45, '#F8FAFC', '#E2E8F0', 1),
    txt({ x: -85, y: 165 }, 50, 14, 'Home', 10, '#3B82F6'),
    txt({ x: -35, y: 165 }, 50, 14, 'Search', 10, '#94A3B8'),
    txt({ x: 15, y: 165 }, 50, 14, 'Profile', 10, '#94A3B8'),
  ],
};

// --- Registry ---

const TEMPLATES: CanvasTemplate[] = [
  swotAnalysis,
  barChart,
  flowchart,
  orgChart,
  kanbanBoard,
  mindMap,
  timeline,
  prosAndCons,
  matrix2x2,
  wireframeMobile,
];

export function findTemplate(command: string): CanvasTemplate | null {
  const lc = command.toLowerCase();
  for (const tpl of TEMPLATES) {
    for (const kw of tpl.keywords) {
      if (lc.includes(kw)) return tpl;
    }
  }
  return null;
}

export function executeTemplate(
  template: CanvasTemplate,
  createObject: (type: ShapeType, props: CanvasObjectProps) => string,
  center: { x: number; y: number },
): string {
  const items: BuiltElement[] = template.build
    ? template.build(center)
    : (template.elements ?? []).map((el) => ({
        type: el.type,
        props: { ...el.props, left: center.x + el.offset.x, top: center.y + el.offset.y } as CanvasObjectProps,
      }));

  for (const item of items) {
    createObject(item.type, item.props);
  }

  return template.description;
}

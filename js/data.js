/* 数据层：localStorage 读写 + 示例数据 */

const STORAGE_KEY = 'our-travels-trips-v1';
const SETTINGS_KEY = 'our-travels-settings-v1';

function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadTrips() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('读取旅行数据失败，使用示例数据', e);
  }
  return SAMPLE_TRIPS.slice();
}

function saveTrips(trips) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  } catch (e) {
    alert('保存失败：照片可能太大了，试试删掉几张或换小一点的图。');
    console.error(e);
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { nameA: '', nameB: '', togetherDate: '' };
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/* 示例数据：封面用渐变色 + emoji 占位，用户替换为自己的照片后会显示照片 */
const SAMPLE_TRIPS = [
  {
    id: 'sample-1',
    title: '京都赏枫之旅',
    destination: '京都',
    startDate: '2024-11-15',
    endDate: '2024-11-20',
    weather: '晴',
    mood: '浪漫',
    rating: 5,
    gradient: 'linear-gradient(135deg, #e07856, #d9a441)',
    emoji: '🍁',
    cover: '',
    description: '第一次一起出国旅行。清水寺的红叶比照片里更艳，傍晚在鸭川边坐了很久，什么都没说，但觉得很安心。',
    moments: [
      { id: 'm1', image: '', emoji: '⛩️', caption: '伏见稻荷的千本鸟居，走到一半就开始下雨', date: '2024-11-16' },
      { id: 'm2', image: '', emoji: '🍵', caption: '在岚山喝了抹茶，她苦得皱眉头', date: '2024-11-17' },
      { id: 'm3', image: '', emoji: '🌉', caption: '渡月桥的黄昏，拍了一百张照片', date: '2024-11-17' }
    ]
  },
  {
    id: 'sample-2',
    title: '大理慢生活',
    destination: '大理',
    startDate: '2025-04-02',
    endDate: '2025-04-06',
    weather: '多云',
    mood: '放松',
    rating: 5,
    gradient: 'linear-gradient(135deg, #5b8dd9, #7ec8a9)',
    emoji: '🌊',
    cover: '',
    description: '租了一辆小电驴环洱海，风很大，她坐在后座唱歌。喜洲的粑粑要趁热吃。',
    moments: [
      { id: 'm4', image: '', emoji: '🛵', caption: '环洱海骑行 60 公里，晒黑了两个度', date: '2025-04-03' },
      { id: 'm5', image: '', emoji: '🌅', caption: '才村码头的日出，五点半起床是值得的', date: '2025-04-04' }
    ]
  },
  {
    id: 'sample-3',
    title: '哈尔滨冰雪之约',
    destination: '哈尔滨',
    startDate: '2025-12-28',
    endDate: '2026-01-01',
    weather: '雪',
    mood: '惊喜',
    rating: 4,
    gradient: 'linear-gradient(135deg, #7f9fd1, #b8c6e8)',
    emoji: '❄️',
    cover: '',
    description: '在零下二十度的街头分一根马迭尔冰棍，在冰雪大世界跨了年。她的手一直很凉，我的口袋一直很暖和。',
    moments: [
      { id: 'm6', image: '', emoji: '🎆', caption: '冰雪大世界的跨年烟花', date: '2025-12-31' },
      { id: 'm7', image: '', emoji: '⛪', caption: '圣索菲亚大教堂前的鸽子', date: '2025-12-29' }
    ]
  }
];

import { style } from '@vanilla-extract/css';

// 20px：Modal 默认 `--mb-padding: 16px`，620px 宽的弹层里标题、输入框、
// 结果行全部贴在这条 16px 的内线上，两侧几乎没有留白。统一到设计系统
// 「卡片内部 20px」，标题、内容区、页脚从此共用同一条左右内线。
export const modalContent = style({
  vars: { '--mb-padding': '20px' },
});
// 弹层标题按 Title 刻度（600 / 16px）显示，默认的 400 与下方正文同重，
// 拉不开层级。
export const modalTitle = style({
  fontSize: 16,
  fontWeight: 600,
});

// 结果区（提醒条 + 列表）与输入框之间 16px（Stack 的 12 + 4）：
// 让列表从「输入框的附属物」变成一个独立的区块。
export const resultsZone = style({
  display: 'grid',
  gap: 12,
  marginTop: 4,
});

export const results = style({
  // Combobox 默认给列表 4px 内边距，结果行会比输入框多缩进 4px；
  // 归零后行与输入框左边缘对齐，hover 底色也正好落在内容区宽度上。
  vars: { '--combobox-padding': '0px' },
  display: 'grid',
  // 行与行之间 4px：行内已有 10px 纵向内边距，靠间距而不是分割线分组。
  gap: 4,
  // 列表高度同时受视口和「固定 chrome」约束：标题 60、说明/输入/页脚约 220，
  // 留 20px 余量后是 300px。只写 55vh 时，720px 高的窗口里最底部那行
  //「仅显示前 30 项」会被弹窗自身的滚动裁掉。
  maxHeight: 'min(55vh, calc(90dvh - 300px))',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
});
export const content = style({
  minWidth: 0,
  flex: 1,
  // 标题 / 路径 / 片段之间 4px，多行信息不再糊成一段。
  display: 'grid',
  gap: 4,
  overflowWrap: 'anywhere',
});
export const icon = style({ flexShrink: 0, marginTop: 3 });
export const option = style({
  // 纵向 12 → 10（原值取 --mantine-spacing-sm），把省下的高度交给行间距，
  // 行的「内容密度」不变，行与行之间多出 8px 的呼吸。
  padding: '10px 12px',
  borderRadius: 'var(--mantine-radius-sm)',
  selectors: {
    // 悬停取设计系统的「冷灰·悬停」（gray-1）；Mantine 默认的 gray-0
    // 正好是纸面色，在白底弹层里几乎看不出来。
    '&:hover:not([data-combobox-disabled])': {
      background: 'var(--mantine-color-gray-1)',
    },
    // 键盘选中不再用 Mantine 默认的实心信纸蓝：整块蓝底会让路径与正文片段
    // （dimmed 灰）掉到约 1.9:1，也违反「蓝色只以水洗形式成片出现」。
    // 改用树行激活态的同一手法：信纸蓝·洗底 + 正文墨色。
    '&[data-combobox-selected]': {
      background: 'var(--mantine-color-blue-0)',
      color: 'var(--mantine-color-text)',
    },
    // 选中行被指针划过时保持水洗底，避免看起来像「选中被取消」。
    '&[data-combobox-selected]:hover': {
      background: 'var(--mantine-color-blue-0)',
    },
  },
});
// 列表 → 说明文字 20px（Stack 的 12 + 8）：这里的说明属于「检索口径」，
// 与列表是两个不同的信息层，间隔要比列表内部大一级。
export const footnote = style({ marginTop: 8 });


import { style } from '@vanilla-extract/css';

// 视口减去弹窗固定 chrome（约 283px）和 20px 余量后，真正能给结果列表的高度。
const listBudget = 'calc(90dvh - 300px)';

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
  // grid 默认 stretch 会把唯一的 auto 行拉到容器高度——有了 min-height 之后，
  // 一行结果会变成 200px 高的可点区域。start 让行保持内容高度。
  alignContent: 'start',
  // 上限保持原来的 55vh，只加一道矮窗口兜底：弹窗总高 = 约 283px 的固定
  // chrome（标题 60 + 说明 21 + 输入 42 + 间隔 48 + 脚注/页脚 92 + 内边距 20）
  // + 列表高度，55vh 在 720px 高的窗口里会让总高超过 Modal 自身的 90dvh，
  // 最底部「仅显示前 30 项」被弹窗滚动裁掉。listBudget 是扣掉 chrome 后
  // 真正可用的高度，两者取小即可。
  maxHeight: `min(55vh, ${listBudget})`,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  selectors: {
    // 有结果时给列表一个 200px（≈3 行）的下限：结果只剩一两条时列表不会
    // 塌成一小块，弹窗形状稳定，中间始终有足够留白。
    // 空状态不托底——那两行说明撑不满 200px，只会变成一个洞。
    '&:has([role="option"])': {
      minHeight: `min(200px, ${listBudget})`,
    },
  },
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


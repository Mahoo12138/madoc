export const documentTemplates = [
  { id: 'blank', label: '空白文档', markdown: '' },
  {
    id: 'technical',
    label: '技术设计',
    markdown:
      '# 技术设计\n\n## 背景\n\n说明需要解决的问题。\n\n## 目标与范围\n\n- 目标：\n- 不包含：\n\n## 方案\n\n描述实现方式与关键取舍。\n\n## 接口与数据\n\n记录输入、输出及数据变化。\n\n## 风险与回退\n\n记录风险、监测方式和回退步骤。\n\n## 验证计划\n\n- [ ] 功能验证\n- [ ] 权限与数据安全\n- [ ] 回归检查\n',
  },
  {
    id: 'meeting',
    label: '会议纪要',
    markdown:
      '# 会议纪要\n\n时间：待补充\n\n参会人：待补充\n\n## 议题\n\n- 议题一\n\n## 讨论记录\n\n记录关键事实与不同意见。\n\n## 决定\n\n记录已确认的结论。\n\n## 行动项\n\n- [ ] 事项 / 负责人 / 截止时间\n\n## 待确认\n\n记录尚未决定的问题。\n',
  },
] as const;

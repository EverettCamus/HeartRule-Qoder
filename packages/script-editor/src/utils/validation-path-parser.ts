/**
 * 验证错误路径解析工具
 */

/**
 * 从错误路径中提取 Phase/Topic/Action 索引
 *
 * @param path 错误路径，例如: "session.phases[0].topics[1].actions[2].config.content"
 * @returns 提取的索引信息
 *
 * @example
 * parseErrorPath("session.phases[0].topics[1].actions[2].config.content")
 * // 返回: { phaseIndex: 0, topicIndex: 1, actionIndex: 2 }
 */
export function parseErrorPath(path: string): {
  phaseIndex: number | null;
  topicIndex: number | null;
  actionIndex: number | null;
} {
  const phaseMatch = path.match(/phases\[(\d+)\]/);
  const topicMatch = path.match(/topics\[(\d+)\]/);
  const actionMatch = path.match(/actions\[(\d+)\]/);

  return {
    phaseIndex: phaseMatch ? parseInt(phaseMatch[1], 10) : null,
    topicIndex: topicMatch ? parseInt(topicMatch[1], 10) : null,
    actionIndex: actionMatch ? parseInt(actionMatch[1], 10) : null,
  };
}

/**
 * 生成 Action 的唯一键
 */
export function generateActionKey(
  phaseIndex: number,
  topicIndex: number,
  actionIndex: number
): string {
  return `${phaseIndex}-${topicIndex}-${actionIndex}`;
}

/**
 * 检查错误路径是否匹配指定的 Action
 */
export function isErrorForAction(
  errorPath: string,
  phaseIndex: number,
  topicIndex: number,
  actionIndex: number
): boolean {
  const parsed = parseErrorPath(errorPath);
  return (
    parsed.phaseIndex === phaseIndex &&
    parsed.topicIndex === topicIndex &&
    parsed.actionIndex === actionIndex
  );
}

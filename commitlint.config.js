/**
 * Commitlint 规范：遵循 Conventional Commits
 * https://www.conventionalcommits.org/
 *
 * 允许的 type：
 *   feat     新功能
 *   fix      缺陷修复
 *   docs     文档变更
 *   style    代码格式（不影响逻辑）
 *   refactor 重构（非新增功能、非修复缺陷）
 *   perf     性能优化
 *   test     测试相关
 *   build    构建系统 / 依赖变更
 *   ci       CI 配置变更
 *   chore    其它杂项
 *   revert   回滚
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "scope-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [1, "always"],
  },
};

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import type { AdvancedConfig, ModelSettings } from "@/lib/types";

export function selectedAdvanced(
  value: AdvancedConfig,
  models: string[],
): AdvancedConfig {
  return {
    models: Object.fromEntries(
      Object.entries(value.models).filter(([id]) => models.includes(id)),
    ),
  };
}

export function validateAdvanced(value: AdvancedConfig, agentId: string) {
  for (const [model, settings] of Object.entries(value.models)) {
    for (const limit of [settings.contextWindow, settings.maxOutputTokens]) {
      if (
        limit != null &&
        (!Number.isInteger(limit) || limit < 1 || limit > 2147483647)
      )
        throw new Error(`${model}：Token 限制必须是 1 至 2147483647 的整数`);
    }
    if (
      settings.thinkingBudget != null &&
      (!Number.isInteger(settings.thinkingBudget) ||
        settings.thinkingBudget < 0 ||
        (settings.thinkingBudget > 0 && settings.thinkingBudget < 1024) ||
        settings.thinkingBudget > 2147483647)
    )
      throw new Error(`${model}：思考预算应为 0（关闭）或至少 1024 Token`);
    if (
      agentId === "opencode" &&
      (settings.contextWindow != null) !== (settings.maxOutputTokens != null)
    )
      throw new Error(`${model}：上下文与输出上限需要一起填写`);
    if (
      settings.contextWindow != null &&
      settings.maxOutputTokens != null &&
      settings.maxOutputTokens > settings.contextWindow
    )
      throw new Error(`${model}：输出上限不能大于上下文窗口`);
    if (
      settings.thinkingBudget != null &&
      settings.maxOutputTokens != null &&
      settings.thinkingBudget >= settings.maxOutputTokens
    )
      throw new Error(`${model}：思考预算必须小于输出上限`);
  }
}

export function ModelAdvancedSettings({
  agentId,
  models,
  defaultModel,
  value,
  onChange,
  onValidityChange,
  expanded = false,
}: {
  agentId: string;
  models: string[];
  defaultModel: string;
  value: AdvancedConfig;
  onChange: (value: AdvancedConfig) => void;
  onValidityChange: (valid: boolean) => void;
  expanded?: boolean;
}) {
  const prefix = useId();
  const [open, setOpen] = useState(expanded);
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const editable =
    agentId === "claude"
      ? [defaultModel].filter(Boolean)
      : [...new Set(models)];
  const errorKeys = Object.keys(jsonErrors).filter((key) =>
    editable.some((id) => key === `${id}:options` || key === `${id}:variants`),
  );
  const validJson = errorKeys.length === 0;
  useEffect(() => onValidityChange(validJson), [validJson, onValidityChange]);
  function update(model: string, patch: Partial<ModelSettings>) {
    onChange({
      models: {
        ...value.models,
        [model]: { ...value.models[model], ...patch },
      },
    });
  }
  const efforts =
    agentId === "claude"
      ? ["low", "medium", "high", "xhigh", "max"]
      : ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
  return (
    <details
      className="model-advanced"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        高级模型配置 <span>可选 · 留空使用工具默认值</span>
      </summary>
      <p className="page-footnote">
        {agentId === "opencode"
          ? "声明模型实际具备的能力与限制；开启图片输入不会让纯文本模型获得识图能力。思考程度须由服务端模型支持。"
          : agentId === "codex"
            ? "思考程度与上下文窗口写入默认配置及各模型 profile。图片能力由模型决定，Codex 没有手动声明开关；思考档位须由模型和客户端支持。"
            : "设置默认模型的思考程度、输出上限与旧式思考预算。图片能力和上下文由模型决定；切换模型后请重新调整。新模型可能使用自适应思考而忽略固定预算。"}
      </p>
      {!editable.length && (
        <p className="page-footnote">先选择一个模型，再设置高级选项。</p>
      )}
      {editable.map((model, index) => {
        const settings = value.models[model] ?? {};
        const selectedEfforts =
          settings.reasoningEfforts ??
          (settings.reasoningEffort ? [settings.reasoningEffort] : []);
        const id = `${prefix}-${index}`;
        return (
          <fieldset className="model-settings" key={model}>
            <legend>
              {model}
              {model === defaultModel ? " · 默认模型" : ""}
            </legend>
            <div className="model-settings-grid">
              {agentId === "opencode" && (
                <>
                  <div className="form-field">
                    <Label htmlFor={`${id}-name`}>显示名称</Label>
                    <Input
                      id={`${id}-name`}
                      placeholder={model}
                      maxLength={256}
                      value={settings.name ?? ""}
                      onChange={(e) =>
                        update(model, { name: e.target.value || null })
                      }
                    />
                  </div>
                  {(
                    [
                      ["imageInput", "图片输入"],
                      ["reasoning", "推理能力"],
                    ] as const
                  ).map(([field, label]) => (
                    <div className="form-field" key={field}>
                      <Label htmlFor={`${id}-${field}`}>{label}</Label>
                      <Select
                        value={
                          settings[field] == null
                            ? "auto"
                            : String(settings[field])
                        }
                        onValueChange={(v) =>
                          update(model, {
                            [field]: v === "auto" ? null : v === "true",
                          })
                        }
                      >
                        <SelectTrigger id={`${id}-${field}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">工具默认</SelectItem>
                          <SelectItem value="true">支持</SelectItem>
                          <SelectItem value="false">不支持</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </>
              )}
              <div className="form-field">
                <Label htmlFor={`${id}-effort`}>思考程度</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      id={`${id}-effort`}
                      type="button"
                      variant="outline"
                      className="effort-multiselect"
                      aria-label="思考程度（可多选）"
                    >
                      <span>
                        {selectedEfforts.length
                          ? efforts
                              .filter((effort) =>
                                selectedEfforts.includes(effort),
                              )
                              .join("、")
                          : "工具默认"}
                      </span>
                      <ChevronDown className="size-4 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
                  >
                    {efforts.map((effort) => (
                      <DropdownMenuCheckboxItem
                        key={effort}
                        checked={selectedEfforts.includes(effort)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={(checked) => {
                          const next = efforts.filter((item) =>
                            item === effort
                              ? checked
                              : selectedEfforts.includes(item),
                          );
                          update(model, {
                            reasoningEfforts: next,
                            reasoningEffort:
                              settings.reasoningEffort &&
                              next.includes(settings.reasoningEffort)
                                ? settings.reasoningEffort
                                : null,
                          });
                        }}
                      >
                        {effort}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="form-field">
                <Label htmlFor={`${id}-default-effort`}>默认思考程度</Label>
                <Select
                  value={settings.reasoningEffort ?? "auto"}
                  onValueChange={(v) =>
                    update(model, { reasoningEffort: v === "auto" ? null : v })
                  }
                >
                  <SelectTrigger id={`${id}-default-effort`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">工具默认</SelectItem>
                    {selectedEfforts.map((effort) => (
                      <SelectItem key={effort} value={effort}>
                        {effort}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(
                [
                  [
                    "contextWindow",
                    "上下文窗口（Token）",
                    agentId !== "claude",
                  ],
                  ["maxOutputTokens", "输出上限（Token）", agentId !== "codex"],
                  [
                    "thinkingBudget",
                    "思考预算（Token，旧模型）",
                    agentId === "claude",
                  ],
                ] as const
              )
                .filter(([, , show]) => show)
                .map(([field, label]) => (
                  <div className="form-field" key={field}>
                    <Label htmlFor={`${id}-${field}`}>{label}</Label>
                    <Input
                      id={`${id}-${field}`}
                      type="number"
                      min={field === "thinkingBudget" ? 0 : 1}
                      max={2147483647}
                      step={1}
                      placeholder="工具默认"
                      value={settings[field] ?? ""}
                      onChange={(e) =>
                        update(model, {
                          [field]: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    />
                  </div>
                ))}
            </div>
            {agentId === "opencode" && (
              <>
                <p className="page-footnote">
                  覆盖 Token 限制时，上下文和输出上限需要一起填写。
                </p>
                <details className="model-json-options">
                  <summary>SDK 选项与思考变体（JSON）</summary>
                  <p className="page-footnote">
                    用于服务商专用参数，例如 options 中的 thinking，或 variants
                    中的多档思考设置。请勿填写密钥。
                  </p>
                  {(
                    [
                      [
                        "options",
                        "模型 SDK 选项",
                        '{"thinking":{"type":"enabled","budgetTokens":8192}}',
                      ],
                      [
                        "variants",
                        "思考变体",
                        '{"high":{"reasoningEffort":"high"}}',
                      ],
                    ] as const
                  ).map(([field, label, placeholder]) => {
                    const key = `${model}:${field}`;
                    return (
                      <div className="form-field" key={field}>
                        <Label htmlFor={`${id}-${field}`}>{label}</Label>
                        <textarea
                          id={`${id}-${field}`}
                          className="model-json-input"
                          rows={4}
                          spellCheck={false}
                          placeholder={placeholder}
                          aria-invalid={!!jsonErrors[key]}
                          value={
                            jsonDrafts[key] ??
                            (settings[field]
                              ? JSON.stringify(settings[field], null, 2)
                              : "")
                          }
                          onChange={(e) => {
                            const text = e.target.value;
                            setJsonDrafts((prev) => ({ ...prev, [key]: text }));
                            try {
                              const parsed: unknown = text.trim()
                                ? JSON.parse(text)
                                : null;
                              if (
                                parsed !== null &&
                                (typeof parsed !== "object" ||
                                  Array.isArray(parsed))
                              )
                                throw new Error("请输入 JSON 对象");
                              if (
                                field === "variants" &&
                                parsed &&
                                Object.values(parsed).some(
                                  (v) =>
                                    v === null ||
                                    typeof v !== "object" ||
                                    Array.isArray(v),
                                )
                              )
                                throw new Error("每个变体必须是 JSON 对象");
                              update(model, { [field]: parsed });
                              setJsonErrors((prev) => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                            } catch {
                              setJsonErrors((prev) => ({
                                ...prev,
                                [key]:
                                  "请输入有效的 JSON 对象；变体的值也必须是对象",
                              }));
                            }
                          }}
                        />
                        {jsonErrors[key] && (
                          <p className="inline-error" role="alert">
                            {jsonErrors[key]}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </details>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                update(model, {
                  name: null,
                  imageInput: null,
                  reasoning: null,
                  contextWindow: null,
                  maxOutputTokens: null,
                  reasoningEffort: null,
                  reasoningEfforts: [],
                  thinkingBudget: null,
                  options: null,
                  variants: null,
                });
                setJsonDrafts((prev) => ({
                  ...prev,
                  [`${model}:options`]: "",
                  [`${model}:variants`]: "",
                }));
                setJsonErrors((prev) => {
                  const next = { ...prev };
                  delete next[`${model}:options`];
                  delete next[`${model}:variants`];
                  return next;
                });
              }}
            >
              恢复工具默认值
            </Button>
          </fieldset>
        );
      })}
    </details>
  );
}

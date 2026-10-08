import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
export function SetupStepper({ step }: { step: number }) {
  const steps = ["连接账户", "选择密钥", "选择模型", "配置预览"];
  return (
    <ol className="setup-stepper" aria-label="配置进度">
      {steps.map((label, index) => (
        <li
          key={label}
          className={cn(index <= step && "active")}
          aria-current={index === step ? "step" : undefined}
        >
          <span>{index < step ? <Check /> : `0${index + 1}`}</span>
          <strong>{label}</strong>
          {index < steps.length - 1 && <i />}
        </li>
      ))}
    </ol>
  );
}

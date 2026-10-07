import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
export function SetupStepper({ step }: { step: number }) {
  return (
    <ol className="setup-stepper" aria-label="配置进度">
      {["连接账户", "选择模型", "配置预览"].map((label, index) => (
        <li
          key={label}
          className={cn(index <= step && "active")}
          aria-current={index === step ? "step" : undefined}
        >
          <span>{index < step ? <Check /> : `0${index + 1}`}</span>
          <strong>{label}</strong>
          {index < 2 && <i />}
        </li>
      ))}
    </ol>
  );
}

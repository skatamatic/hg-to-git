import type { ReactNode } from "react";
import { Button } from "./ui/button";

export type AppDialogAction = {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost" | "destructive";
};

function DialogButton({ action }: { action: AppDialogAction }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={action.variant ?? "default"}
      className="min-w-[5.5rem]"
      onClick={action.onClick}
    >
      {action.label}
    </Button>
  );
}

/** Two actions: secondary left, primary right (macOS-style). */
export function AppDialogFooterPair({
  cancel,
  confirm,
}: {
  cancel: AppDialogAction;
  confirm: AppDialogAction;
}) {
  return (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
      <DialogButton action={{ ...cancel, variant: cancel.variant ?? "ghost" }} />
      <DialogButton action={confirm} />
    </div>
  );
}

/** Three actions: cancel left; secondary + primary grouped on the right. */
export function AppDialogFooterTriple({
  cancel,
  secondary,
  primary,
}: {
  cancel: AppDialogAction;
  secondary: AppDialogAction;
  primary: AppDialogAction;
}) {
  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <DialogButton action={{ ...cancel, variant: cancel.variant ?? "ghost" }} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-2.5">
        <DialogButton
          action={{ ...secondary, variant: secondary.variant ?? "outline" }}
        />
        <DialogButton action={primary} />
      </div>
    </div>
  );
}

export function AppDialogFooter({ children }: { children: ReactNode }) {
  return <div className="w-full">{children}</div>;
}

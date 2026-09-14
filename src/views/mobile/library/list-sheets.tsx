import { useEffect, useState } from "react";
import { MAX_LISTS } from "@/lib/custom-lists";
import { useT } from "@/lib/i18n";
import { PhoneSheet, SheetActions, SheetField } from "./sheet";

// Bottom-sheet counterparts of CreateListModal and the list settings modals.
// Same fields, same limits, same copy; only the chrome is phone-shaped.

export function ListFormSheet({
  open,
  mode,
  initialName = "",
  initialDescription = "",
  atMax = false,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "rename";
  initialName?: string;
  initialDescription?: string;
  atMax?: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);

  // Reseed on every open so a cancelled edit does not leak into the next one.
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setDescription(initialDescription);
  }, [open, initialName, initialDescription]);

  const blocked = mode === "create" && atMax;
  const canSave = !!name.trim() && !blocked;
  const submit = () => {
    if (!canSave) return;
    onSubmit(name.trim(), description);
  };

  return (
    <PhoneSheet
      open={open}
      onClose={onClose}
      keyboard
      title={mode === "create" ? t("New list") : t("Rename list")}
      description={
        mode === "create" ? t("Group the movies and shows you want to keep close.") : undefined
      }
      footer={
        <SheetActions
          onCancel={onClose}
          cancelLabel={t("Cancel")}
          primaryLabel={mode === "create" ? t("Create") : t("Save")}
          onPrimary={submit}
          primaryDisabled={!canSave}
        />
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <SheetField
          label={t("List name")}
          value={name}
          onChange={setName}
          placeholder={t("Weekend watchlist")}
          maxLength={60}
          autoFocus
          onSubmit={submit}
        />
        <SheetField
          label={t("Description")}
          value={description}
          onChange={setDescription}
          placeholder={t("A short note about this list")}
          maxLength={240}
          multiline
        />
        {blocked && (
          <p className="mx-3 rounded-xl bg-danger/12 px-3 py-2 text-[12.5px] text-danger">
            {t("You have reached {max} lists. Remove one to make room.", { max: MAX_LISTS })}
          </p>
        )}
      </div>
    </PhoneSheet>
  );
}

export function ConfirmDeleteListSheet({
  open,
  name,
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <PhoneSheet
      open={open}
      onClose={onClose}
      title={t("Delete this list?")}
      description={t('"{name}" and everything in it will be removed. This cannot be undone.', {
        name,
      })}
      footer={
        <SheetActions
          onCancel={onClose}
          cancelLabel={t("Keep it")}
          primaryLabel={t("Delete")}
          onPrimary={onConfirm}
          danger
        />
      }
    >
      <span className="block h-1" />
    </PhoneSheet>
  );
}

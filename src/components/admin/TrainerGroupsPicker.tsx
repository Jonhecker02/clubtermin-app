"use client";

import type { Group } from "@/types/database";
import { groupLabel } from "@/lib/domain";
import adminStyles from "./AdminList.module.css";

interface TrainerGroupsPickerProps {
  groups: Group[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

// "Trainer von" — a trainer can coach several groups, so this is a checkbox
// list instead of a single-select.
export function TrainerGroupsPicker({ groups, value, onChange, disabled }: TrainerGroupsPickerProps) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((g) => g !== id) : [...value, id]);
  }

  return (
    <div className={adminStyles.checkboxList}>
      {groups.map((g) => (
        <label key={g.id} className={adminStyles.checkboxLabel}>
          <input type="checkbox" checked={value.includes(g.id)} onChange={() => toggle(g.id)} disabled={disabled} />
          {groupLabel(g)}
        </label>
      ))}
      {groups.length === 0 && <span>Noch keine Gruppen angelegt.</span>}
    </div>
  );
}

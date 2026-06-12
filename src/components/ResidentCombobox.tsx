"use client";

import {
  VillageCombobox,
  type VillageComboboxOption,
} from "@/components/VillageCombobox";

export type ResidentComboboxOption = VillageComboboxOption;

type Props = {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: ResidentComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

/** Typable combobox for picking a resident. */
export function ResidentCombobox({
  placeholder = "Search residents…",
  ...props
}: Props) {
  return (
    <VillageCombobox
      {...props}
      placeholder={placeholder}
      emptyMessage="No matching residents."
      clearAriaLabel="Clear resident"
    />
  );
}

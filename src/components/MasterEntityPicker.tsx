"use client";

import { VillageSelect } from "@/components/VillageSelect";
import { useI18n } from "@/lib/i18n/I18nProvider";

export type MasterEntityHomeOption = {
  id: string;
  name: string;
};

export type MasterEntityResidentOption = {
  id: string;
  name: string;
};

type MasterEntityPickerProps = {
  homes: MasterEntityHomeOption[];
  selectedHomeId: string;
  onHomeChange: (homeId: string) => void;
  homeDisabled?: boolean;
  residents?: MasterEntityResidentOption[];
  selectedResidentId?: string;
  onResidentChange?: (residentId: string) => void;
  className?: string;
};

function mergeClassNames(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function MasterEntityPicker({
  homes,
  selectedHomeId,
  onHomeChange,
  homeDisabled = false,
  residents,
  selectedResidentId,
  onResidentChange,
  className,
}: MasterEntityPickerProps) {
  const { t } = useI18n();
  const showResidentPicker =
    residents != null &&
    selectedResidentId != null &&
    onResidentChange != null;

  return (
    <section
      className={mergeClassNames(
        "village-card flex flex-wrap items-end gap-3 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4",
        className,
      )}
      aria-label={t("masterPicker.context")}
    >
      <div className="min-w-[12rem] flex-1 sm:max-w-xs">
        <label
          htmlFor="master-entity-home"
          className="village-field-label mb-1.5 block"
        >
          {t("masterPicker.home")}
        </label>
        <VillageSelect
          id="master-entity-home"
          value={selectedHomeId}
          onChange={onHomeChange}
          disabled={homeDisabled || homes.length <= 1}
          options={homes.map((home) => ({
            value: home.id,
            label: home.name,
          }))}
          ariaLabel={t("masterPicker.home")}
        />
      </div>
      {showResidentPicker ? (
        <div className="min-w-[12rem] flex-1 sm:max-w-xs">
          <label
            htmlFor="master-entity-resident"
            className="village-field-label mb-1.5 block"
          >
            {t("masterPicker.resident")}
          </label>
          <VillageSelect
            id="master-entity-resident"
            value={selectedResidentId}
            onChange={onResidentChange}
            disabled={residents.length <= 1}
            options={residents.map((resident) => ({
              value: resident.id,
              label: resident.name,
            }))}
            placeholder={t("masterPicker.selectResident")}
            ariaLabel={t("masterPicker.resident")}
          />
        </div>
      ) : null}
    </section>
  );
}

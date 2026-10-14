import { useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../common/Button';
import { SearchField } from '../common/SearchField';
import { SelectField } from '../common/SelectField';
import './hospitals.css';

interface HospitalToolbarProps {
  query: string;
  district: string;
  districts: ReadonlyArray<string>;
  onQueryChange: (value: string) => void;
  onDistrictChange: (value: string) => void;
  onClear: () => void;
}

export function HospitalToolbar({
  query,
  district,
  districts,
  onQueryChange,
  onDistrictChange,
  onClear,
}: HospitalToolbarProps) {
  const { t } = useLanguage();

  const options = useMemo(() => {
    const names = new Set(districts.filter(Boolean));

    if (district) names.add(district);

    return [
      { value: '', label: t('hospitals.allDistricts') },
      ...Array.from(names)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    ];
  }, [districts, district, t]);

  const hasFilters = Boolean(query || district);

  return (
    <form
      className="hospital-toolbar"
      role="search"
      aria-label={t('hospitals.searchLabel')}
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="hospital-toolbar__search">
        <SearchField
          label={t('hospitals.searchLabel')}
          value={query}
          onChange={onQueryChange}
          placeholder={t('hospitals.searchPlaceholder')}
          name="q"
        />
      </div>

      <div className="hospital-toolbar__district">
        <SelectField
          label={t('hospitals.districtLabel')}
          value={district}
          onChange={onDistrictChange}
          options={options}
        />
      </div>

      <div className="hospital-toolbar__actions">
        <Button
          type="button"
          variant="ghost"
          onClick={onClear}
          disabled={!hasFilters}
          className="hospital-toolbar__clear"
        >
          {t('common.clearFilters')}
        </Button>
      </div>

      <p className="hospital-toolbar__help">
        {t('hospitals.searchHelp')}
      </p>
    </form>
  );
}
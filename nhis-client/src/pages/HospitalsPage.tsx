import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { HospitalResults } from '../components/hospitals/HospitalResults';
import { HospitalToolbar } from '../components/hospitals/HospitalToolbar';
import { APP_CONFIG } from '../config/app';
import { useLanguage } from '../context/LanguageContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useHospitals } from '../hooks/useHospitals';

function parsePage(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

interface UrlUpdate { q?: string; district?: string; page?: number }

/**
 * Network hospital directory. Search text, district and page live in the URL, so a refresh, a shared link,
 * the back button and a language switch all keep the same results.
 */
export default function HospitalsPage() {
  const { t } = useLanguage();
  useDocumentTitle(t('hospitals.title'));
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const district = params.get('district') ?? '';
  const page = parsePage(params.get('page'));

  const [input, setInput] = useState(urlQuery);
  const debounced = useDebouncedValue(input, APP_CONFIG.searchDebounceMs);
  // The last query value this page wrote to (or read from) the URL; stops typing and URL updates fighting each other.
  const synced = useRef(urlQuery);

  const update = useCallback((next: UrlUpdate, replace = true) => {
    setParams((current) => {
      const merged = new URLSearchParams(current);
      const apply = (key: string, value: string | number | undefined) => {
        if (value === undefined || value === '' || (key === 'page' && value === 1)) merged.delete(key);
        else merged.set(key, String(value));
      };
      if ('q' in next) apply('q', next.q?.trim() ? next.q : '');
      if ('district' in next) apply('district', next.district);
      if ('page' in next) apply('page', next.page);
      return merged;
    }, { replace });
  }, [setParams]);

  // Typing -> URL (debounced). A new search always returns to page 1.
  useEffect(() => {
    if (debounced === synced.current) return;
    synced.current = debounced;
    update({ q: debounced, page: 1 });
  }, [debounced, update]);

  // URL -> input, for changes that did not come from typing (back button, search from the home page).
  useEffect(() => {
    if (urlQuery !== synced.current) {
      synced.current = urlQuery;
      setInput(urlQuery);
    }
  }, [urlQuery]);

  const state = useHospitals({ q: urlQuery, district, page, pageSize: APP_CONFIG.hospitalPageSize });
  const knownDistricts = useRef<string[]>([]);
  if (state.data && state.data.districts.length > 0) knownDistricts.current = state.data.districts;

  const clear = () => {
    synced.current = '';
    setInput('');
    update({ q: '', district: '', page: 1 }, false);
  };
  const changePage = (next: number) => {
    update({ page: next }, false);
    document.getElementById('hospital-results')?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="page container">
      <PageHeader title={t('hospitals.title')} intro={t('hospitals.intro')} />
      <div className="hospital-page-body">
        <HospitalToolbar
          query={input}
          district={district}
          districts={knownDistricts.current}
          onQueryChange={setInput}
          onDistrictChange={(value) => update({ district: value, page: 1 })}
          onClear={clear}
        />
        <div id="hospital-results" className="hospital-results-anchor">
          <HospitalResults state={state} onPageChange={changePage} onClear={clear} hasFilters={Boolean(urlQuery || district)} />
        </div>
      </div>
    </div>
  );
}

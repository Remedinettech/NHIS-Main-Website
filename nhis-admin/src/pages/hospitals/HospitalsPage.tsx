import type { AdminHospital } from '@nhis/shared-types';
import { FilterSelect } from '../../components/common/FilterSelect';
import { LinkButton } from '../../components/common/Button';
import { PageHeader } from '../../components/common/PageHeader';
import { Icon } from '../../components/common/Icon';
import { RecordList } from '../../components/records/RecordList';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useCan } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useRecordList } from '../../hooks/useRecordList';
import { getDistricts } from '../../services/hospital.api';
import { lines, tidy } from '../../utils/text';

export default function HospitalsPage() {
  useDocumentTitle('Network hospitals');
  const canWrite = useCan('content.write');
  const list = useRecordList<AdminHospital>('hospitals', { filterKeys: ['district'] });
  const districts = useAsyncData((signal) => getDistricts(signal), []);
  const options = [{ value: '', label: 'All districts' }, ...(districts.data ?? []).map((d) => ({ value: tidy(d), label: tidy(d) }))];

  return (
    <div className="page">
      <PageHeader title="Network hospitals" intro="Network hospitals shown on the public website, in English and Tamil.">
        {canWrite && (
          <div className="page__actions">
            <LinkButton to="/imports?module=hospitals" variant="secondary">Import from Excel</LinkButton>
            <LinkButton to="/hospitals/new"><Icon name="plus" size={18} /> Add hospital</LinkButton>
          </div>
        )}
      </PageHeader>
      <RecordList<AdminHospital>
        module="hospitals"
        list={list}
        noun={{ singular: 'hospital', plural: 'hospitals' }}
        searchLabel="Search hospitals"
        searchPlaceholder="Name, address, district or specialty (English or Tamil)"
        routeId={(r) => r.id}
        recordName={(r) => tidy(r.values.nameEn) || tidy(r.values.nameTa)}
        editPath={(r) => `/hospitals/${encodeURIComponent(r.id)}`}
        filters={<FilterSelect label="District" value={list.query.filters.district} onChange={(value) => list.setQuery({ filters: { district: value } })} options={options} />}
        columns={[
          {
            header: 'Hospital',
            render: (r) => (
              <div className="cell-stack">
                <span>{tidy(r.values.nameEn)}</span>
                {r.values.nameTa.trim() && <span lang="ta" className="text-muted">{tidy(r.values.nameTa)}</span>}
              </div>
            ),
          },
          { header: 'District', render: (r) => <span>{tidy(r.values.districtEn) || '–'}</span> },
          {
            header: 'Contact',
            render: (r) => {
              const contact = lines(r.values.contact);
              return contact.length === 0 ? <span className="text-muted">–</span> : <ul className="cell-list">{contact.map((line, i) => <li key={i} className="nowrap">{line}</li>)}</ul>;
            },
          },
        ]}
      />
    </div>
  );
}

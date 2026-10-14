import type { AdminHospital, AdminHospitalValues } from '@nhis/shared-types';
import { useParams } from 'react-router-dom';
import { BilingualFields } from '../../components/common/BilingualFields';
import { Card } from '../../components/common/Card';
import { TextAreaField, TextField, UrlField } from '../../components/common/fields';
import { RecordEditor } from '../../components/records/RecordEditor';
import { isGoogleMapsUrl } from '../../utils/validation';

const EMPTY: AdminHospitalValues = {
  nameEn: '', nameTa: '', addressEn: '', addressTa: '', districtEn: '', districtTa: '', stateEn: '', stateTa: '',
  postcode: '', category: '', type: '', specialty: '', contact: '', mapUrl: '',
};

function validate(v: AdminHospitalValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.nameEn.trim()) errors.nameEn = 'Enter the hospital name in English.';
  if (!v.addressEn.trim()) errors.addressEn = 'Enter the address in English.';
  if (!v.districtEn.trim()) errors.districtEn = 'Enter the district in English.';
  if (v.postcode.trim() && !/^[0-9A-Za-z -]{3,12}$/.test(v.postcode.trim())) errors.postcode = 'Use letters, digits, spaces and hyphens only.';
  if (v.mapUrl.trim() && !isGoogleMapsUrl(v.mapUrl.trim())) errors.mapUrl = 'Enter a Google Maps link that starts with https://.';
  return errors;
}

export default function HospitalEditPage() {
  const { id } = useParams();
  return (
    <RecordEditor<AdminHospitalValues, AdminHospital>
      module="hospitals"
      entityType="hospital"
      routeId={id}
      noun="hospital"
      newValues={EMPTY}
      listPath="/hospitals"
      editPath={(r) => `/hospitals/${encodeURIComponent(r.id)}`}
      recordName={(v) => v.nameEn}
      validate={validate}
    >
      {({ values, setField, errors, readOnly }) => (
        <>
          <Card title="Name and address" description="English fields are required. Add the Tamil text where it is available.">
            <div className="editor-section">
              <BilingualFields legend="Hospital name" required requireTamil={false} english={values.nameEn} tamil={values.nameTa} maxLength={200}
                onEnglishChange={(x) => setField('nameEn', x)} onTamilChange={(x) => setField('nameTa', x)} englishError={errors.nameEn} tamilError={errors.nameTa} disabled={readOnly} />
              <BilingualFields legend="Address" required requireTamil={false} multiline rows={3} english={values.addressEn} tamil={values.addressTa} maxLength={600}
                onEnglishChange={(x) => setField('addressEn', x)} onTamilChange={(x) => setField('addressTa', x)} englishError={errors.addressEn} tamilError={errors.addressTa} disabled={readOnly} />
              <BilingualFields legend="District" required requireTamil={false} english={values.districtEn} tamil={values.districtTa} maxLength={100}
                onEnglishChange={(x) => setField('districtEn', x)} onTamilChange={(x) => setField('districtTa', x)} englishError={errors.districtEn} tamilError={errors.districtTa} disabled={readOnly} />
              <BilingualFields legend="State" english={values.stateEn} tamil={values.stateTa} maxLength={100}
                onEnglishChange={(x) => setField('stateEn', x)} onTamilChange={(x) => setField('stateTa', x)} englishError={errors.stateEn} tamilError={errors.stateTa} disabled={readOnly} />
              <div className="editor-grid">
                <TextField label="PIN code" value={values.postcode} onChange={(x) => setField('postcode', x)} maxLength={12} error={errors.postcode} disabled={readOnly} inputMode="numeric" />
                <TextField label="Category" value={values.category} onChange={(x) => setField('category', x)} maxLength={20} error={errors.category} disabled={readOnly} hint="For example A, B or C." />
                <TextField label="Type" value={values.type} onChange={(x) => setField('type', x)} maxLength={60} error={errors.type} disabled={readOnly} hint="For example Private or Government." />
              </div>
            </div>
          </Card>
          <Card title="Services and contact">
            <div className="editor-section">
              <TextAreaField label="Specialties" value={values.specialty} onChange={(x) => setField('specialty', x)} maxLength={2000} rows={3} error={errors.specialty} disabled={readOnly} hint="Comma-separated, as shown on the public website." />
              <TextAreaField label="Contact numbers" value={values.contact} onChange={(x) => setField('contact', x)} maxLength={500} rows={3} error={errors.contact} disabled={readOnly} hint="One number per line." />
              <UrlField label="Map link" value={values.mapUrl} onChange={(x) => setField('mapUrl', x)} maxLength={1000} error={errors.mapUrl} disabled={readOnly} hint="A Google Maps link (https://maps.google.com/…). Leave empty if there is none." />
            </div>
          </Card>
        </>
      )}
    </RecordEditor>
  );
}

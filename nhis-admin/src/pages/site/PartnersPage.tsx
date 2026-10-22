import { DEFAULT_SITE_CONTENT, SITE_CONTENT_LIMITS, type PartnerCategory, type PartnerEntry } from '@nhis/shared-types';
import { useLayoutEffect, useRef, useState } from 'react';
import { LinkButton } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { BilingualInput } from '../../components/site/BilingualInput';
import { ImageField } from '../../components/site/ImageField';
import { OptionalUrlField } from '../../components/site/OptionalUrlField';
import { ReorderableList, type RowContext } from '../../components/site/ReorderableList';
import { SiteContentEditor, type SiteEditorContext } from '../../components/site/SiteContentEditor';
import { useSiteForm } from '../../components/site/SiteFormContext';
import { SiteSelect } from '../../components/site/SiteSelect';
import {
  applyGroupList, groupRemovalBlock, newPartner, newPartnerGroup, partnersInGroup, partnersLeft, partnersWithoutGroup, regroupPartner,
} from '../../components/site/siteEdit';

const L = SITE_CONTENT_LIMITS;
const BUILT_IN_PARTNERS = DEFAULT_SITE_CONTENT.partners.partners;

type PartnersFormProps = Pick<SiteEditorContext<'partners'>, 'values' | 'setField'>;

/** The ID that an Excel workbook uses for this group or partner (the Excel import matches rows by it, and a new row needs a group ID). */
function ExcelId({ label, id }: { label: string; id: string }) {
  return <p className="ff__hint">{label} for Excel imports: <code className="ff__code">{id}</code></p>;
}

/** The cards of the partners editor: heading, groups, and the partners of each group in the order they are shown. */
export function PartnersForm({ values, setField }: PartnersFormProps) {
  const { errors } = useSiteForm();
  const { categories, partners } = values;
  const [announcement, setAnnouncement] = useState('');
  // A partner that moved to another group is drawn again in the list of that group: focus follows it to its group select.
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    const row = Array.from(document.querySelectorAll<HTMLElement>('[data-row-id]')).find((element) => element.dataset.rowId === id);
    (row?.querySelector<HTMLElement>(':scope > .reorder__body select') ?? row?.querySelector<HTMLElement>(':scope > .reorder__head button:not(:disabled)'))?.focus();
  });

  const left = partnersLeft(partners);
  const limitNote = left === 0 ? `The limit of ${L.partners} partners is reached.` : null;
  const groupName = (category: PartnerCategory | undefined, position: number): string => category?.caption.en.trim() || `Group ${position + 1}`;
  const orphans = partnersWithoutGroup(categories, partners);
  const positionOf = (partner: PartnerEntry): string => `partners.${partners.findIndex((entry) => entry.id === partner.id)}`;

  const regroup = (partner: PartnerEntry, categoryId: string) => {
    const target = categories.findIndex((category) => category.id === categoryId);
    if (target === -1) return;
    refocus.current = partner.id;
    setField('partners', regroupPartner(partners, partner.id, categoryId));
    setAnnouncement(`${partner.name.en.trim() || 'The partner'} moved to ${groupName(categories[target], target)}. It is now the last partner of that group.`);
  };

  /** The editing controls of one partner (also used for partners whose group no longer exists). */
  const renderPartner = (partner: PartnerEntry, row: RowContext<PartnerEntry>) => {
    const known = categories.some((category) => category.id === partner.categoryId);
    return (
      <>
        <ExcelId label="Partner ID" id={partner.id} />
        <SiteSelect
          label="Group" required value={known ? partner.categoryId : ''} placeholder={known ? undefined : 'Choose a group'} path={`${row.path}.categoryId`}
          options={categories.map((category, position) => ({ value: category.id, label: groupName(category, position) }))}
          onChange={(categoryId) => regroup(partner, categoryId)} disabled={row.disabled}
          hint="Changing the group moves the partner to the end of the other group."
        />
        <BilingualInput
          label="Name" path={`${row.path}.name`} required limit={L.label} value={partner.name}
          onChange={(name) => row.update((current) => ({ ...current, name }))}
        />
        <ImageField
          label="Logo" path={`${row.path}.logo`} value={partner.logo} builtIn={BUILT_IN_PARTNERS.find((entry) => entry.id === partner.id)?.logo ?? null}
          onChange={(logo) => { if (logo) row.update((current) => ({ ...current, logo })); }}
          altLabel="Alt text of the logo (usually the name of the partner)"
        />
        <OptionalUrlField
          label="Website of the partner (optional)" path={`${row.path}.url`} value={partner.url}
          onChange={(url) => row.update((current) => ({ ...current, url }))}
          hint="Where the logo leads when it is clicked. Must start with https://. Leave empty for no link."
        />
      </>
    );
  };

  const partnerList = (key: string, label: string, list: PartnerEntry[], onChange: (next: PartnerEntry[]) => void, categoryId: string | null) => (
    <ReorderableList<PartnerEntry>
      key={key} label={label} itemNoun="partner" path="partners" items={list} collapsible hideListError
      rowPath={positionOf} getId={(item) => item.id} onChange={onChange} rowTitle={(item) => item.name.en}
      createItem={categoryId === null ? undefined : () => newPartner(categoryId, partners.map((entry) => entry.id))}
      addLabel="Add partner" addBlocked={limitNote} emptyText="No partners in this group yet."
      isVisible={(item) => item.visible} setVisible={(item, visible) => ({ ...item, visible })}
      renderItem={renderPartner}
    />
  );

  return (
    <>
      <Card
        title="Partners heading" actions={<LinkButton to="/imports?module=partners" variant="secondary" size="sm">Import from Excel</LinkButton>}
        description="The heading above the partner logos on the homepage."
      >
        <BilingualInput label="Heading" path="heading" required limit={L.heading} value={values.heading} onChange={(heading) => setField('heading', heading)} />
      </Card>

      <Card title="Groups" description="Partners are shown under the caption of their group, in the order of this list. A group without a visible partner is not shown.">
        <ReorderableList<PartnerCategory>
          label="Groups" itemNoun="group" path="categories" items={categories} max={L.partnerCategories} collapsible
          onChange={(next) => setField('categories', next)} getId={(item) => item.id} addLabel="Add group"
          createItem={() => newPartnerGroup(categories.map((item) => item.id))}
          rowTitle={(item) => item.caption.en} emptyText="No groups yet. Add a group before adding partners."
          isVisible={(item) => item.visible} setVisible={(item, visible) => ({ ...item, visible })}
          removeBlocked={(item) => groupRemovalBlock(partners, item.id)}
          renderItem={(item, row) => (
            <>
              <ExcelId label="Group ID" id={item.id} />
              <BilingualInput
                label="Caption of the group" path={`${row.path}.caption`} required limit={L.label} value={item.caption}
                onChange={(caption) => row.update((current) => ({ ...current, caption }))}
              />
            </>
          )}
        />
        {errors.partners && <p className="ff__error" role="alert">{errors.partners}</p>}
      </Card>

      {categories.map((category, position) => (
        <Card
          key={category.id} title={`Partners in ${groupName(category, position)}`}
          description={`${partners.length} of ${L.partners} partners in total. They are shown in the order of this list.`}
        >
          {partnerList(
            category.id, `Partners in ${groupName(category, position)}`, partnersInGroup(partners, category.id),
            (next) => setField('partners', applyGroupList(partners, category.id, next)), category.id,
          )}
        </Card>
      ))}

      {orphans.length > 0 && (
        <Card title="Partners without a group" description="Their group no longer exists, so the website does not show them. Choose a group for each one, or remove it.">
          {partnerList(
            'orphans', 'Partners without a group', orphans,
            (next) => setField('partners', [...partners.filter((entry) => !orphans.some((orphan) => orphan.id === entry.id)), ...next]), null,
          )}
        </Card>
      )}

      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </>
  );
}

/** Editor of the partners document. */
export default function PartnersPage() {
  return (
    <SiteContentEditor contentKey="partners">
      {({ values, setField }) => <PartnersForm values={values} setField={setField} />}
    </SiteContentEditor>
  );
}

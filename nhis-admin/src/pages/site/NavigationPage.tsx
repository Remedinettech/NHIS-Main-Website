import { SITE_CONTENT_LIMITS } from '@nhis/shared-types';
import { Card } from '../../components/common/Card';
import { BilingualInput } from '../../components/site/BilingualInput';
import { LinkItemEditor } from '../../components/site/LinkItemEditor';
import { ReorderableList } from '../../components/site/ReorderableList';
import { SiteContentEditor, type SiteEditorContext } from '../../components/site/SiteContentEditor';
import {
  navigationIds, navigationWarnings, newNavHeading, newNavLink, newNavMenu, visibleNavigationCount, type NavChild, type NavEntry,
} from '../../components/site/siteEdit';

const L = SITE_CONTENT_LIMITS;

type NavigationFormProps = Pick<SiteEditorContext<'navigation'>, 'values' | 'setField'>;

const TAGS: Record<NavEntry['type'] | NavChild['type'], string> = { link: 'Link', menu: 'Dropdown menu', heading: 'Heading' };

/** The card of the navigation editor: the main menu with its dropdowns, in the order visitors see them. */
export function NavigationForm({ values, setField }: NavigationFormProps) {
  const items = values.items;
  const ids = navigationIds(items);
  const warnings = navigationWarnings(items);
  const note = (path: string) => (warnings[path] ? <p className="reorder__warning">{warnings[path]}</p> : null);
  const shown = visibleNavigationCount(items);

  return (
    <Card
      title="Main menu"
      description="The menu at the top of every page. A dropdown holds links and, optionally, headings that group them. The order here is the order on the website."
    >
      <div className="editor-section">
        <p className="editor-note" role="status" aria-live="polite">
          {shown === 0 ? 'Visitors would see no menu entry.' : `${shown} of ${items.length} ${items.length === 1 ? 'entry is' : 'entries are'} shown to visitors.`}
        </p>
        <ReorderableList<NavEntry>
          label="Menu entries" itemNoun="menu entry" itemNounPlural="menu entries" path="items" items={items} max={L.navItems} collapsible
          onChange={(next) => setField('items', next)} getId={(item) => item.id}
          addOptions={[
            { label: 'Add link', create: () => newNavLink(ids) },
            { label: 'Add dropdown menu', create: () => newNavMenu(ids) },
          ]}
          rowTitle={(item) => item.label.en} rowTag={(item) => TAGS[item.type]} rowNote={(_, index) => note(`items.${index}`)}
          isVisible={(item) => item.visible} setVisible={(item, visible) => ({ ...item, visible })}
          emptyText="The menu is empty. Add a link or a dropdown menu."
          renderItem={(item, row) => (item.type === 'link' ? (
            <LinkItemEditor
              path={row.path} value={item} labelLegend="Menu text"
              onChange={(next) => row.update({ ...item, label: next.label, target: next.target })}
            />
          ) : (
            <>
              <BilingualInput
                label="Menu text" path={`${row.path}.label`} required limit={L.label} value={item.label}
                onChange={(label) => row.update((current) => ({ ...current, label }))}
              />
              <ReorderableList<NavChild>
                label={`Inside ${item.label.en.trim() || `dropdown ${row.index + 1}`}`} itemNoun="dropdown item" path={`${row.path}.children`} items={item.children} max={L.navChildren} collapsible
                hint="Links open pages, documents or web addresses. A heading names a group of the links below it."
                onChange={(children) => row.update((current) => (current.type === 'menu' ? { ...current, children } : current))} getId={(child) => child.id}
                addOptions={[
                  { label: 'Add link', create: () => newNavLink(ids) },
                  { label: 'Add heading', create: () => newNavHeading(ids) },
                ]}
                rowTitle={(child) => child.label.en} rowTag={(child) => TAGS[child.type]} rowNote={(_, index) => note(`${row.path}.children.${index}`)}
                isVisible={(child) => child.visible} setVisible={(child, visible) => ({ ...child, visible })}
                emptyText="This dropdown is empty. A dropdown needs at least one link."
                renderItem={(child, childRow) => (child.type === 'link' ? (
                  <LinkItemEditor
                    path={childRow.path} value={child} labelLegend="Link text"
                    onChange={(next) => childRow.update({ ...child, label: next.label, target: next.target })}
                  />
                ) : (
                  <BilingualInput
                    label="Heading text" path={`${childRow.path}.label`} required limit={L.label} value={child.label}
                    onChange={(label) => childRow.update((current) => ({ ...current, label }))}
                  />
                ))}
              />
            </>
          ))}
        />
      </div>
    </Card>
  );
}

/** Editor of the navigation document. */
export default function NavigationPage() {
  return (
    <SiteContentEditor contentKey="navigation">
      {({ values, setField }) => <NavigationForm values={values} setField={setField} />}
    </SiteContentEditor>
  );
}
